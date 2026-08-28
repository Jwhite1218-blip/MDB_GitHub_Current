# Customer and YTD Sales Dump Comparison

## Outcome

This workflow compares a complete customer export and a year-to-date Tooling /
Parts sales export against the source-derived MDB baseline. It measures identity
and catalog coverage without treating the exports as permission to overwrite
controlled records. The comparison is evidence intake, not a GP write path.

## Boundaries

- Copy exports beneath `private-intake/`; never analyze originals in place.
- Raw exports, working mappings, and detailed reports remain Git-ignored.
- Do not commit customer names, customer numbers, sales history, or prices.
- Exact customer and part identifiers establish comparison coverage.
- Name and description similarity creates a review candidate only.
- CTS / WS004 remains Tooling compatibility authority.
- Serial BOMs remain Rig Part Where Used authority.
- GP remains authority for customer, invoice, quantity, and financial facts.

## Preferred source shape

Use UTF-8 CSV, TSV, or JSON. For an Excel workbook, copy the workbook beneath
`private-intake/`, then export the selected customer and sales worksheets as
separate UTF-8 CSV files in the same private area. Do not flatten report title
rows, subtotals, grand totals, or multiple tables into the data range.

Minimum customer fields:

- customer number;
- customer name.

Minimum sales field:

- part or item number.

Strongly preferred sales fields:

- item description;
- customer number and name;
- invoice/document number;
- invoice/document date;
- quantity sold;
- extended/net sales amount;
- item class or category;
- unit of measure.

Credit and return rows should remain signed rather than being deleted. The
comparison aggregates source values exactly as delivered.

## Delivery-day sequence

1. Create a dated private folder:

   ```powershell
   New-Item -ItemType Directory -Path "private-intake\gp-exports\2026-08-27"
   ```

2. Copy the two exports into that folder. Keep the original filenames.
3. Run metadata inventory before opening content:

   ```powershell
   npm run intake:inventory -- "private-intake\gp-exports\2026-08-27"
   ```

4. Run header and row-count preflight:

   ```powershell
   npm run compare:dumps -- preflight `
     --customers "private-intake\gp-exports\2026-08-27\customers.csv" `
     --sales "private-intake\gp-exports\2026-08-27\tooling-parts-sales.csv"
   ```

5. If required or ambiguous headers are reported, copy
   `config/data-dump-mapping.example.json` into the dated private folder, edit
   only the private copy to match the source headings, and rerun preflight with:

   ```powershell
   --mapping "private-intake\gp-exports\2026-08-27\mapping.json"
   ```

6. Confirm before comparison:

   - customer and sales row counts agree with the source reports;
   - the date field covers January 1, 2026 through the extract date;
   - credits/returns and zero-dollar rows have an understood meaning;
   - net sales and quantity totals agree with source control totals;
   - customer and item identifiers were exported as text, preserving leading
     zeroes.

7. Run the comparison:

   ```powershell
   npm run compare:dumps -- compare `
     --customers "private-intake\gp-exports\2026-08-27\customers.csv" `
     --sales "private-intake\gp-exports\2026-08-27\tooling-parts-sales.csv" `
     --mapping "private-intake\gp-exports\2026-08-27\mapping.json" `
     --year 2026
   ```

8. Review the generated private report in this order:

   - `summary.json` for control totals and coverage;
   - `data-quality.csv` for unusable identities, dates, quantities, or amounts;
   - `customer-reconciliation.csv` for exact identities and possible duplicates;
   - `part-coverage.csv` for exact coverage and sold identifiers absent from MDB.

## Interpretation gates

### Customers

- `exact_number_same_name`: covered identity.
- `exact_number_name_changed`: GP number is covered; review the display name.
- `new_number_existing_name`: possible branch, duplicate, or identifier change.
- `possible_name_match`: human review only.
- `new_customer`: not represented in the current known-customer seed.

### Parts

- `exact_part_number`: represented by Tooling, a controlled supplement, Rig/BOM,
  or more than one source. This does not itself prove compatibility.
- `possible_description_match`: review hint only; never substitute identifiers.
- `not_in_current_catalog`: sold GP identifier is absent from the current
  source-derived catalog and needs classification plus authority review.

## Required closeout

Before any database or catalog promotion, sign off on complete source row counts
and totals, duplicate and credit handling, a versioned column mapping, customer
identity decisions, part classification, CTS / WS004 review for Tooling, serial
/ BOM review for Rig Parts, source lineage, and rollback.

Only aggregated, identifier-free findings may leave `private-intake/` without a
separate authorization decision.
