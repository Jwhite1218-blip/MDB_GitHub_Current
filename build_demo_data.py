import json
import re
from collections import deque
from pathlib import Path

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "site" / "data"
RIG_BOOK = ROOT / "data" / "Rig parts.xlsx"
TOOLING_BOOK = ROOT / "data" / "MDB_Part_Number_Database_Format_v0.3_Tooling_Flexible.xlsx"
CATALOG_DOC = ROOT / "docs" / "tooling" / "MDB_WS004_Catalog_Build_v3_28_Merged.docx"


def text(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def rows_as_dicts(workbook, sheet_name):
    sheet = workbook[sheet_name]
    iterator = sheet.iter_rows(values_only=True)
    headers = [text(value) for value in next(iterator)]
    result = []
    for values in iterator:
        if not any(value not in (None, "") for value in values):
            continue
        result.append({headers[index]: text(value) for index, value in enumerate(values) if index < len(headers)})
    return result


def clean_dict(source, mapping):
    return {target: source.get(origin, "") for target, origin in mapping.items()}


def write_json(name, payload):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / name
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return path


def build_rig_data():
    workbook = load_workbook(RIG_BOOK, read_only=True, data_only=True)

    source_rows = rows_as_dicts(workbook, "Source_Register")
    section_rows = rows_as_dicts(workbook, "Section_Index")
    assembly_rows = rows_as_dicts(workbook, "Rig_Assemblies")
    relationship_rows = rows_as_dicts(workbook, "BOM_Relationships")
    item_rows = rows_as_dicts(workbook, "Master_Item_Index")
    where_used_rows = rows_as_dicts(workbook, "Where_Used")
    related_rows = rows_as_dicts(workbook, "Related_Repair_Groups")

    rigs = []
    for rig in rows_as_dicts(workbook, "Rig_Model_Index"):
        serial = rig["Serial_Reference"]
        rig_sections = [
            clean_dict(
                row,
                {
                    "letter": "Source_Section_Letter",
                    "name": "Visible_Section_Name",
                    "order": "Section_Order",
                    "topAssembly": "Top_Level_Assembly",
                    "assemblyCount": "Assembly_Count",
                    "relationshipCount": "BOM_Row_Count",
                },
            )
            for row in section_rows
            if row["Serial_Reference"] == serial
        ]
        rigs.append(
            {
                "serial": serial,
                "model": rig["Rig_Model"],
                "type": rig["Rig_Type"],
                "role": rig["Source_Set_Role"],
                "sections": rig_sections,
            }
        )

    assemblies = [
        clean_dict(
            row,
            {
                "id": "Assembly_ID",
                "serial": "Serial_Reference",
                "model": "Rig_Model",
                "sectionLetter": "Source_Section_Letter",
                "section": "Visible_Section_Name",
                "sectionOrder": "Section_Order",
                "part": "Assembly_Part_Number",
                "description": "Assembly_Description",
                "parentParts": "Parent_Assembly_PN_List",
                "level": "Assembly_Level",
                "isTop": "Is_Top_Level_Section_Assembly",
                "page": "Source_Page",
                "confidence": "Source_Confidence",
            },
        )
        for row in assembly_rows
    ]

    relationships = [
        clean_dict(
            row,
            {
                "id": "Relationship_ID",
                "serial": "Serial_Reference",
                "model": "Rig_Model",
                "sectionLetter": "Source_Section_Letter",
                "section": "Visible_Section_Name",
                "sectionOrder": "Section_Order",
                "parentPart": "Parent_Assembly_PN",
                "parentDescription": "Parent_Assembly_Description",
                "position": "Position",
                "part": "Child_Part_Number",
                "description": "Child_Description",
                "quantity": "Quantity",
                "uom": "UoM",
                "level": "BOM_Level",
                "path": "BOM_Path",
                "page": "Source_Page",
                "confidence": "Serial_Verified_Status",
                "quoteReadiness": "Quote_Readiness",
            },
        )
        for row in relationship_rows
    ]

    items = [
        clean_dict(
            row,
            {
                "id": "MDB_Item_ID",
                "part": "Item_Number",
                "description": "Official_Source_Description",
                "cleanDescription": "MDB_Clean_Description",
                "domain": "Domain",
                "type": "Item_Type",
                "models": "Seen_In_Rig_Models",
                "serials": "Seen_In_Serials",
                "whereUsedCount": "Where_Used_Count",
                "sections": "Visible_Section_Names",
                "sourceStatus": "Source_Status",
                "confidence": "Source_Confidence",
                "salesVisibility": "Sales_Visibility",
                "quoteReadiness": "Quote_Readiness",
                "aliases": "Search_Aliases",
                "reviewNotes": "Review_Notes",
            },
        )
        for row in item_rows
    ]

    where_used = [
        clean_dict(
            row,
            {
                "part": "Item_Number",
                "description": "Item_Description",
                "assemblyPart": "Used_In_Assembly_PN",
                "assemblyDescription": "Used_In_Assembly_Description",
                "model": "Rig_Model",
                "serial": "Serial_Reference",
                "section": "Visible_Section_Name",
                "quantity": "Quantity",
                "uom": "UoM",
                "path": "BOM_Path",
                "page": "Source_Page",
                "confidence": "Confidence_Label",
            },
        )
        for row in where_used_rows
    ]

    related = [
        clean_dict(
            row,
            {
                "id": "Group_ID",
                "model": "Rig_Model",
                "serial": "Serial_Reference",
                "section": "Visible_Section_Name",
                "parentPart": "Parent_Assembly_PN",
                "parentDescription": "Parent_Assembly_Description",
                "type": "Group_Type",
                "trigger": "Trigger_Logic",
                "relatedParts": "Related_Item_Numbers",
                "status": "Status",
                "notes": "Notes",
            },
        )
        for row in related_rows
    ]

    payload = {
        "meta": {
            "authority": "Serial-specific B57 2025023 and B37X 2025028 BOM/manual source sets",
            "priceAuthority": "GP/current pricing pending",
            "rigCount": len(rigs),
            "sectionCount": len(section_rows),
            "assemblyCount": len(assemblies),
            "relationshipCount": len(relationships),
            "itemCount": len(items),
            "whereUsedCount": len(where_used),
            "sourceCount": len(source_rows),
        },
        "rigs": rigs,
        "assemblies": assemblies,
        "relationships": relationships,
        "items": items,
        "whereUsed": where_used,
        "relatedGroups": related,
    }
    return write_json("rig-parts.json", payload)


def iter_document_tables(document):
    table_index = 0
    recent = deque(maxlen=30)
    for child in document.element.body.iterchildren():
        if child.tag.endswith("}p"):
            value = " ".join(Paragraph(child, document).text.split())
            if value:
                recent.append(value)
        elif child.tag.endswith("}tbl"):
            table = Table(child, document)
            yield table_index, table, list(recent)
            table_index += 1


def table_rows(table):
    headers = [" ".join(cell.text.split()) for cell in table.rows[0].cells]
    result = []
    for row in table.rows[1:]:
        values = [" ".join(cell.text.split()) for cell in row.cells]
        if not any(values):
            continue
        result.append({headers[index]: value for index, value in enumerate(values)})
    return result


def catalog_supplements():
    document = Document(CATALOG_DOC)
    tables = {index: (table, context) for index, table, context in iter_document_tables(document)}

    drive_caps = []
    for index, hex_shank in [(52, '1-1/8"'), (53, '1-5/8"'), (54, '2"')]:
        table, _ = tables[index]
        for row in table_rows(table):
            outcome = "confirmed"
            part = row["Drive Cap PN"]
            if part.startswith("GAP"):
                outcome = "gap"
            elif part.startswith("CONFIRMED"):
                outcome = "not-offered"
            drive_caps.append(
                {
                    "hex": hex_shank,
                    "connection": row["Connection Family"],
                    "size": row["HSA ID"],
                    "part": part,
                    "outcome": outcome,
                    "variant": "Standard",
                }
            )
    table, _ = tables[57]
    for row in table_rows(table):
        drive_caps.append(
            {
                "hex": row["Hex Shank"],
                "connection": row["Connection Family"],
                "size": row["HSA ID"],
                "part": row["Short/No-Hole PN"],
                "outcome": "confirmed",
                "variant": "Short / No Hole",
            }
        )

    split_map = {
        126: {"style": "Standard", "tpi": "4 TPI", "diameter": '2"', "mud": False},
        127: {"style": "Standard", "tpi": "4 TPI", "diameter": '2-1/2"', "mud": False},
        128: {"style": "Standard", "tpi": "4 TPI", "diameter": '3"', "mud": False},
        130: {"style": "Nordic", "tpi": "4 TPI", "diameter": '2"', "mud": False},
        131: {"style": "Lynac", "tpi": "8 TPI", "diameter": '2"', "mud": False},
        132: {"style": "Tab", "tpi": "4 TPI", "diameter": '2"', "mud": False},
        133: {"style": "Tab", "tpi": "8 TPI", "diameter": '2"', "mud": False},
        135: {"style": "Nordic", "tpi": "4 TPI", "diameter": '2"', "mud": True},
        136: {"style": "Lynac", "tpi": "8 TPI", "diameter": '2"', "mud": True},
        137: {"style": "Tab", "tpi": "4 TPI", "diameter": '2"', "mud": True},
        138: {"style": "Tab", "tpi": "8 TPI", "diameter": '2"', "mud": True},
        149: {"style": "Standard", "tpi": "8 TPI", "mud": False},
        152: {"style": "CA Modified", "tpi": "8 TPI", "mud": False},
        156: {"style": "CA Modified", "tpi": "4 TPI", "mud": False},
    }
    split_spoons = []
    for index, defaults in split_map.items():
        table, _ = tables[index]
        for row in table_rows(table):
            diameter = row.get("O.D.", defaults.get("diameter", ""))
            rod = row.get("Rod Conn.", row.get("Rod Connection", ""))
            split_spoons.append(
                {
                    **defaults,
                    "diameter": diameter,
                    "length": row.get("Length", ""),
                    "rod": rod,
                    "complete": row.get("Complete Assembly", ""),
                    "completeMud": row.get("Complete Assembly w/ Mud Head*", ""),
                    "head": row.get("Head Standard", ""),
                    "mudHead": row.get("Mud Head", ""),
                    "barrel": row.get("Split Barrel", ""),
                    "wasteBarrel": row.get("Waste Barrel", ""),
                    "shoeSharp": row.get("Shoe Sharp", ""),
                    "shoeBlunt": row.get("Shoe Blunt", ""),
                    "outcome": "confirmed" if row.get("Complete Assembly", "") not in ("", "GAP") else "components",
                }
            )

    hex_table_map = {
        96: ("Hex-Cor Auger", "Series 1125"),
        98: ("Hex-Cor Auger", "Series 1500"),
        101: ("Hex-Cor Auger", "Series 2000"),
        104: ("Hex-Cor Auger", "Series 3000"),
        106: ("Hex-Cor Auger", "Meter Length"),
        108: ("STD Duty Auger", "Inertia Welded"),
        110: ("STD Duty Auger", "Forged Hex Socket"),
        111: ("Hex-Cor Cutterhead", "Fish Tail"),
        112: ("Hex-Cor Cutterhead", "Fish Tail"),
        114: ("Hex-Cor Cutterhead", "Bulldog"),
        115: ("Hex-Cor Cutterhead", "2-Prong Mining Bit"),
        117: ("Hex-Cor Cutterhead", "3-Wing Drag Bit"),
        120: ("Hex-Cor Cutterhead", "5T Cutter Head"),
        122: ("Hex-Cor Cutterhead", "DP Cutter Head"),
        125: ("Hex-Cor Cutterhead", "Stinger Bit"),
    }
    hex_cor = []
    for index, (kind, style) in hex_table_map.items():
        table, _ = tables[index]
        for row in table_rows(table):
            part = row.get("Item Number", row.get("Part Number", row.get("Assembly PN", "")))
            description = row.get("Description", "")
            if not description:
                bits = [style, row.get("Hole Size", ""), row.get("Length", row.get("Stock Length", ""))]
                description = " ".join(value for value in bits if value)
            hex_cor.append(
                {
                    "kind": kind,
                    "style": row.get("Style", style) or style,
                    "holeSize": row.get("Hole Size", ""),
                    "hex": row.get("Hex Connection", row.get("Connection", "")),
                    "length": row.get("Length", row.get("Stock Length", "")),
                    "part": part,
                    "description": description,
                    "details": row,
                }
            )

    moyno_parts = [
        ("Water Pump Assembly", "71037-02", "71037-03", "71037-10"),
        ("Suction Housing", "003300", "003328", "003356"),
        ("Packing Washer", "003302", "003330", "003358"),
        ("Packing", "003303", "003331", "003359"),
        ("Packing Gland", "003304", "003332", "003360"),
        ("Bearing Cover Plate", "003305", "003333", "003361"),
        ("Shaft Collar", "003308", "003336", "003364"),
        ("Rotor", "003314", "003342", "003370"),
        ("Drive Shaft", "003315", "003343", "003372"),
        ("Lantern Ring", "003318", "003346", "003375"),
        ("Stator Support", "003325", "003353", "003382"),
        ("Reducer", "003326", "003354", "N/A"),
        ("Pump Support", "003327", "003355", "003384"),
        ("Bearing Housing", "212602", "006007", "006008"),
        ("Boot Seal", "004085", "006817", "212601"),
        ("Stator Frame", "212599", "212597", "212600"),
        ("Connecting Rod Kit", "212603-02", "212603-01", "212603-03"),
        ("Bearing Kit", "212604-02", "212604-01", "212604-03"),
    ]
    moyno = []
    for description, part_3l4, part_3l6, part_3l8 in moyno_parts:
        for model, part in [("3L4", part_3l4), ("3L6", part_3l6), ("3L8", part_3l8)]:
            moyno.append({"model": model, "description": description, "part": part})

    return {
        "driveCaps": drive_caps,
        "splitSpoons": split_spoons,
        "hexCor": hex_cor,
        "moyno": moyno,
    }


def build_tooling_data():
    workbook = load_workbook(TOOLING_BOOK, read_only=True, data_only=True)
    item_rows = rows_as_dicts(workbook, "Master_Item_Index")
    family_rows = rows_as_dicts(workbook, "Tooling_Family_Index")
    compatibility_rows = rows_as_dicts(workbook, "Compatibility_Map")

    item_mapping = {
        "id": "MDB_Item_ID",
        "part": "Item_Number",
        "alternatePart": "Alternate_Item_Number",
        "description": "MDB_Clean_Description",
        "officialDescription": "Official_Source_Description",
        "family": "Tooling_Family",
        "subfamily": "Subfamily_Item_Type",
        "componentRole": "Component_Role",
        "size": "Size_Diameter",
        "length": "Length",
        "rodFamily": "Rod_Family",
        "connection": "Connection_Family_Interface",
        "thread": "Thread_TPI",
        "style": "Style_Variant",
        "hsaId": "HSA_ID",
        "duty": "Duty_Class",
        "boltPattern": "Bolt_Pattern",
        "machineInterface": "Machine_Side_Interface",
        "parentAssembly": "Parent_Assembly",
        "compatibleUses": "Compatible_With_Uses",
        "compatibilityRule": "Compatibility_Rule",
        "compatibleContexts": "Compatible_Contexts",
        "validation": "Validation_Status",
        "sourceAuthority": "Source_Authority_Level",
        "salesVisibility": "Sales_Visibility",
        "autoRecommendation": "Auto_Recommendation",
        "sourceUsage": "Source_Usage_Status",
        "pnStatus": "PN_Status",
        "confidence": "Confidence_Label",
        "reviewStatus": "Review_Status",
        "reviewNotes": "Review_Notes",
        "aliases": "Search_Aliases",
    }
    items = [clean_dict(row, item_mapping) for row in item_rows]

    families = [
        clean_dict(
            row,
            {
                "id": "Family_ID",
                "name": "Display_Family",
                "group": "Parent_Group",
                "status": "Active_Status",
                "required": "Required_Attributes",
                "optional": "Optional_Attributes",
                "quoteMinimum": "Quote_Ready_Minimum",
                "searchBehavior": "Search_Behavior",
                "compatibilityGate": "Compatibility_Gate",
                "authority": "Source_Authority_Notes",
            },
        )
        for row in family_rows
    ]

    compatibility = [
        clean_dict(
            row,
            {
                "key": "Compatibility_Key",
                "system": "System",
                "group": "Component_Group",
                "hsaId": "Required_HSA_ID",
                "connection": "Required_Connection_Family",
                "duty": "Required_Duty_Class",
                "rodFamily": "Required_Rod_Family",
                "machineInterface": "Required_Machine_Interface",
                "part": "Compatible_Part_Number",
                "rule": "Source_Rule",
                "confidence": "Confidence",
                "escalation": "Escalation_Required",
                "notes": "Notes",
            },
        )
        for row in compatibility_rows
    ]

    supplements = catalog_supplements()
    payload = {
        "meta": {
            "authority": "Current CTS documents and WS004 govern execution; workbook supplies the flexible search index",
            "priceAuthority": "GP/current pricing pending",
            "itemCount": len(items),
            "activePartCount": sum(1 for item in items if item["part"]),
            "familyCount": len(families),
            "compatibilityRowCount": len(compatibility),
            "supplementCounts": {key: len(value) for key, value in supplements.items()},
        },
        "items": items,
        "families": families,
        "compatibility": compatibility,
        "supplements": supplements,
        "rules": {
            "global": [
                "Search finds possible matches; compatibility decides what is valid.",
                "Keep unresolved constraints visible and selected.",
                "Terminal states are confirmed PN, pending GAP, confirmed non-offering, or component-level result where allowed.",
                "Suggested items never enter a quote until the rep confirms them.",
            ],
            "driveCap": ["Hex shank", "HSA connection family", "HSA auger ID"],
            "hsaAuger": ["Connection family", "Connection variant where applicable", "HSA auger ID", "Length"],
            "splitSpoon": ["Diameter", "Style family", "Length", "Rod connection", "Shoe style", "Tabbed when applicable"],
            "hexCor": ["Hex connection", "Hole size", "Length", "Cutterhead style when requested"],
            "moyno": ["Pump model", "Pump serial number"],
        },
    }
    return write_json("tooling.json", payload)


if __name__ == "__main__":
    rig_path = build_rig_data()
    tooling_path = build_tooling_data()
    print(rig_path)
    print(tooling_path)
