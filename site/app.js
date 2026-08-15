"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
  workspaceNav: $("#workspaceNav"),
  homeView: $("#homeView"),
  customerView: $("#customerView"),
  homeButton: $("#homeButton"),
  customerBackButton: $("#customerBackButton"),
  globalSearchForm: $("#globalSearchForm"),
  globalSearchInput: $("#globalSearchInput"),
  globalSearchResults: $("#globalSearchResults"),
  customerSearchForm: $("#customerSearchForm"),
  customerSearchInput: $("#customerSearchInput"),
  customerSearchResults: $("#customerSearchResults"),
  directoryFilter: $("#directoryFilter"),
  customerList: $("#customerList"),
  customerProfile: $("#customerProfile"),
  calibrationButton: $("#calibrationButton"),
  calibrationMenu: $("#calibrationMenu"),
  workspaceOverlay: $("#workspaceOverlay"),
  overlayBackButton: $("#overlayBackButton"),
  overlayCloseButton: $("#overlayCloseButton"),
  overlayEyebrow: $("#overlayEyebrow"),
  overlayTitle: $("#overlayTitle"),
  overlayBody: $("#overlayBody"),
  toast: $("#toast"),
};

const state = {
  data: { rig: null, tooling: null },
  ready: false,
  activeView: "home",
  activeWorkspace: null,
  selectedCustomerId: null,
  searchIndex: [],
  toolItems: [],
  quote: null,
  rigQuoteFiles: {},
  stock: {},
  touches: {},
  tooling: { query: "", scope: "All", builder: "", filters: {}, selectedId: "", browseOpen: false },
  customerTooling: { query: "", scope: "All", builder: "", filters: {}, selectedId: "", browseOpen: false },
  prospectResults: [],
  prospectParams: { territory: "Midwest", market: "All", radius: "100", keywords: "drilling geotechnical", visual: true },
  workflowTraining: { scenarioId: "first-call", messages: [], matchedKcs: ["KC001"] },
  activeCalibrationScenario: "",
  rigSalesEditor: null,
  calibrationCustomerId: "",
  rigSpecModel: "B25",
  bom: { serial: "2025023", section: "", query: "", selectedPart: "" },
  toastTimer: null,
  searchTimer: null,
};

const purchaseTemplates = [
  ["2026-07-29", "Tooling", "3.25 in AW casing", 100, 4250],
  ["2026-06-17", "Tooling", "AWJ casing shoe", 10, 850],
  ["2026-04-24", "Parts", "Hydraulic hose assembly", 2, 320],
  ["2026-03-10", "Tooling", "SPT hammer assembly", 1, 1250],
  ["2026-01-28", "Tooling", "3.25 in AW rod", 50, 2150],
  ["2025-11-12", "Parts", "Rotary seal kit", 2, 476],
  ["2025-09-03", "Tooling", "Split spoon shoe", 12, 936],
  ["2025-05-19", "Service", "SPT calibration service", 1, 1450],
];

const interactionTemplates = [
  ["Call", "2026-08-11", "Discussed rig delivery and operator training", "M. Sales"],
  ["Email", "2026-08-04", "Sent follow-up on tooling availability", "J. Tech"],
  ["Quote", "2026-07-22", "Quote prepared for casing and shoes", "S. Rep"],
  ["Note", "2026-07-09", "On-site demo of new SPT system", "J. Tech"],
  ["Call", "2026-06-28", "Follow-up on maintenance schedule", "M. Sales"],
  ["Email", "2026-06-14", "Serial confirmation received", "S. Rep"],
];

const demoLastTouches = [
  "2026-08-11", "2026-07-29", "2026-06-18", "2026-05-26", "2026-05-14", "2026-04-30",
  "2026-04-12", "2026-03-20", "2026-02-26", "2026-01-09", "2025-11-18", "2025-09-24",
];

const customerNames = [
  "Advanced Foundation Testing", "Allied Engineering Group", "Alpha Testing Services",
  "American Drilling Corp", "Apex Geotech Solutions", "Atlas Geotechnical LLC",
  "Baker Environmental", "Blue Ridge Drilling", "Cascade Geotechnical", "CME Associates",
  "Delta Foundation Services", "EarthTech Drilling", "GeoDynamics Inc.", "GeoStrata Services",
  "Ground Solutions Group", "Horizon Engineering", "Metro Soil Services", "Premier Drilling Co.",
  "ProGeo Testing", "Summit Geotech", "TerraFirm Solutions", "United Soil Exploration",
  "Vertex Geoscience",
];

function slugify(value) {
  return normalize(value).replace(/\s+/g, "-");
}

function buildCustomer(name, index) {
  const model = index % 2 ? "Mobile B57" : "Mobile B37X";
  const serial = index % 2 ? "2025023" : "2025028";
  return {
    id: slugify(name),
    name,
    contact: `Demo Contact ${index + 1}`,
    title: index % 3 ? "Drilling Manager" : "Operations Manager",
    email: `contact@${slugify(name).split("-")[0]}.example.invalid`,
    phone: `(317) 555-${String(1100 + index).padStart(4, "0")}`,
    address: `${120 + index * 9} Field Service Rd, Indianapolis, IN 46200`,
    customerSince: String(2010 + (index % 13)),
    creditTerms: index % 5 ? "Net 30" : "Prepay",
    status: index % 11 ? "Active" : "Inactive",
    lastTouch: demoLastTouches[index % demoLastTouches.length],
    rigs: index % 4 ? [{ model, serial, year: 2018 + (index % 7), status: "Active" }] : [],
    purchases: purchaseTemplates.map((row, rowIndex) => ({
      date: row[0], type: row[1], description: row[2],
      quantity: Math.max(1, row[3] - (index % 4) * (rowIndex + 1)), amount: row[4] + index * 17,
    })),
    tooling: {
      categories: [["Casing", 43], ["Sampling", 28], ["SPT", 14], ["Drill Rods", 9], ["Other", 6]],
      mostUsed: ["3.25 in AW casing", "SPT auto hammer", "AWJ casing shoe", "3.25 in AW rod", "Split spoon sampler"],
    },
    interactions: interactionTemplates.map((row) => ({ type: row[0], date: row[1], text: row[2], owner: row[3] })),
    calibrations: [
      { date: "2026-04-18", service: "Automatic hammer", result: "Complete" },
      { date: "2025-04-22", service: "Automatic hammer", result: "Complete" },
      { date: "2024-05-03", service: "SPT system", result: "Complete" },
    ],
  };
}

const customers = customerNames.map(buildCustomer);
const atlas = customers.find((customer) => customer.name === "Atlas Geotechnical LLC");
Object.assign(atlas, {
  contact: "Demo Operations Contact",
  title: "Operations Manager",
  rigs: [
    { model: "Mobile B57", serial: "2025023", year: 2025, status: "Active" },
    { model: "Mobile B37X", serial: "2025028", year: 2025, status: "Active" },
    { model: "Mobile B53", serial: "B53-DEMO", year: 2019, status: "Active" },
  ],
});

const rigSalesOpportunities = [
  { id: "midwest-subsurface-b57", company: "Midwest Subsurface Group", territory: "Indiana", rig: "B57", stage: "Needs Analysis", value: 285000, next: "Confirm rotary and SPT package" },
  { id: "ohio-geotechnical-b37x", company: "Ohio Geotechnical Partners", territory: "Ohio", rig: "B37X", stage: "Demo Scheduled", value: 342000, next: "Field demonstration · Aug 21" },
  { id: "blue-ridge-b57", company: "Blue Ridge Drilling", territory: "Kentucky", rig: "B57", stage: "Quote", value: 297500, next: "Review trade and delivery" },
  { id: "heartland-b53", company: "Heartland Environmental", territory: "Indiana", rig: "B53", stage: "Follow-Up", value: 248000, next: "Call decision team · Aug 18" },
];

const prospectCandidates = [
  { company: "GeoDynamics Inc.", territory: "Midwest", state: "Indiana", market: "Geotechnical", distance: 24, tags: "drilling geotechnical spt soil boring", domain: "geodynamics.example.invalid", matchCustomerId: "geodynamics-inc", accountCheck: "Exact customer-name and domain match", equipment: "Truck-mounted drill rig observed", possibleModel: "Mobile Drill B57", confidence: "High", evidence: "Fleet page image with Mobile Drill decal", ownership: "Ownership unconfirmed" },
  { company: "Vertex Geo Services", territory: "Midwest", state: "Indiana", market: "Environmental", distance: 63, tags: "drilling environmental geotechnical sampling", domain: "vertexgeo.example.invalid", likelyCustomerId: "vertex-geoscience", accountCheck: "Name, market, and territory overlap — review alias or branch", equipment: "Drill operation indicated", possibleModel: "Make/model unclear", confidence: "Medium", evidence: "Project gallery image", ownership: "Ownership unconfirmed" },
  { company: "Midwest Subsurface Group", territory: "Midwest", state: "Indiana", market: "Geotechnical", distance: 88, tags: "drilling geotechnical spt subsurface", domain: "midwestsubsurface.example.invalid", accountCheck: "No customer, alias, domain, phone, address, or purchase-history match", equipment: "Two drill rigs observed", possibleModel: "Possible B57 and crawler rig", confidence: "Medium", evidence: "Public equipment gallery", ownership: "Ownership unconfirmed" },
  { company: "Buckeye Soil & Core", territory: "Midwest", state: "Ohio", market: "Geotechnical", distance: 141, tags: "drilling geotechnical soil core", domain: "buckeyesoil.example.invalid", accountCheck: "No customer, alias, domain, phone, address, or purchase-history match", equipment: "Drilling equipment observed", possibleModel: "Brand unknown", confidence: "Low", evidence: "Homepage project image", ownership: "Ownership unconfirmed" },
  { company: "River Valley Environmental", territory: "Southeast", state: "Kentucky", market: "Environmental", distance: 176, tags: "drilling environmental sampling", domain: "rivervalleyenv.example.invalid", accountCheck: "No customer, alias, domain, phone, address, or purchase-history match", equipment: "No equipment visible", possibleModel: "None identified", confidence: "Low", evidence: "No qualifying public image", ownership: "Not established" },
  { company: "Great Lakes Test Borings", territory: "Midwest", state: "Michigan", market: "Geotechnical", distance: 232, tags: "drilling geotechnical test boring spt", domain: "greatlakestest.example.invalid", accountCheck: "No customer, alias, domain, phone, address, or purchase-history match", equipment: "Mobile Drill equipment observed", possibleModel: "Possible B37X", confidence: "Medium", evidence: "Services page image and visible mast decal", ownership: "Ownership unconfirmed" },
  { company: "New England Geo Drilling", territory: "Northeast", state: "Massachusetts", market: "Geotechnical", distance: 72, tags: "drilling geotechnical spt soil boring", domain: "newenglandgeo.example.invalid", accountCheck: "No customer, alias, domain, phone, address, or purchase-history match", equipment: "Truck-mounted drill observed", possibleModel: "Brand unclear", confidence: "Low", evidence: "Public project gallery", ownership: "Ownership unconfirmed" },
  { company: "Carolina Site Testing", territory: "Southeast", state: "North Carolina", market: "Geotechnical", distance: 94, tags: "drilling geotechnical site testing spt", domain: "carolinasite.example.invalid", accountCheck: "No customer, alias, domain, phone, address, or purchase-history match", equipment: "Two geotechnical rigs observed", possibleModel: "Possible Mobile Drill equipment", confidence: "Medium", evidence: "Fleet page images", ownership: "Ownership unconfirmed" },
  { company: "Desert Core Services", territory: "Southwest", state: "Arizona", market: "Environmental", distance: 81, tags: "drilling environmental geotechnical coring", domain: "desertcore.example.invalid", accountCheck: "No customer, alias, domain, phone, address, or purchase-history match", equipment: "Crawler drill observed", possibleModel: "Brand unclear", confidence: "Low", evidence: "Services page image", ownership: "Ownership unconfirmed" },
  { company: "Pacific Geo Borings", territory: "West", state: "California", market: "Geotechnical", distance: 67, tags: "drilling geotechnical test boring spt", domain: "pacificgeo.example.invalid", accountCheck: "No customer, alias, domain, phone, address, or purchase-history match", equipment: "Mobile Drill mast decal observed", possibleModel: "Possible B37X", confidence: "Medium", evidence: "Public project photo", ownership: "Ownership unconfirmed" },
];

const kcTrainingKnowledge = [
  { id: "KC001", title: "MDB Philosophy", keywords: "mdb source authority confidence search reasoning history invent verify", guidance: "Start with the customer’s intent, preserve the reasoning, label the source, and never invent a confident answer when the evidence is incomplete.", next: "What does the customer need right now, and what source can prove the answer?" },
  { id: "KC002", title: "Rig Anatomy", keywords: "rig model serial engine hydraulic mechanical rotary feed power torque anatomy energy symptom", guidance: "Follow energy from the engine through the mechanical or hydraulic drive, then through rotary/feed and into the tooling interface. Isolate the failed system before naming parts.", next: "Which function stopped, and what still works normally?" },
  { id: "KC003", title: "Hollow Stem Auger", keywords: "hsa hollow stem auger sampling retrieval borehole plug rod split spoon", guidance: "Treat HSA as one operating system: external augers advance the hole while the hollow center preserves the internal sampling path. Size, connection, rod family, sampling setup, and retrieval all matter.", next: "What HSA size, connection family, and sampling method are they running?" },
  { id: "KC004", title: "Drill Rod", keywords: "drill rod aw awj nw nwj thread joint length sampling rotary", guidance: "Identify the rod family and joint or thread before narrowing components. Diameter alone is not enough, and rod history is not compatibility proof.", next: "Which rod family, joint, length, and drilling method are confirmed?" },
  { id: "KC005", title: "Split Spoon", keywords: "split spoon spt shoe head body sampler thread sample sampling", guidance: "Keep the split spoon body, head, shoe style, and rod connection distinct. SPT use establishes the sampling workflow but does not remove thread and style verification.", next: "What body size, rod thread, and shoe style does the customer need?" },
  { id: "KC006", title: "Center Plug", keywords: "center plug pilot bit hsa protect hollow stem retrieval", guidance: "Center-plug selection depends on the HSA system, rod family, pilot or bit configuration, and retrieval approach. Do not treat the plug as a size-only item.", next: "Which HSA size, rod family, and pilot or retrieval setup are confirmed?" },
  { id: "KC007", title: "Drive Cap", keywords: "drive cap rotary box spindle key bolt hex connection machine tooling interface", guidance: "Verify both sides of the drive cap: the rig or rotary output side and the auger or tooling side. A match on only one side is not quote-ready.", next: "What rig/rotary output and what tooling size/connection must the cap join?" },
  { id: "KC008", title: "Cutter Head", keywords: "cutter head cutterhead teeth carbide formation soil clay rock wear bullet", guidance: "Begin with the drilling application, formation, HSA size, and connection. Keep cutterhead style neutral until the customer’s conditions create a reason to choose one.", next: "What formation are they drilling, and what size and connection are on the auger?" },
  { id: "KC009", title: "HSA Auger Sections", keywords: "auger section flight connection key length repair wear corrosion hsa", guidance: "Keep HSA connection variants distinct. Confirm size, connection, variant, and length, then consider wear and repair economics without mixing families.", next: "What diameter, connection variant, and section length are physically confirmed?" },
  { id: "KC010", title: "HEX-COR", keywords: "hex cor hexcor solid stem auger fish tail stinger dp cutter shank", guidance: "HEX-COR is a solid-stem system with its own hex connection logic. Confirm product, hex family, hole size, length, and cutting tool without borrowing HSA assumptions.", next: "Which HEX-COR product, connection, hole size, length, and cutting condition apply?" },
  { id: "KC011", title: "Air & Mud Rotary", keywords: "air mud rotary tricone drag bit swivel circulation cuttings formation water", guidance: "Identify the circulating medium, rod family, bit family, swivel requirement, formation, and depth. A tricone request is for a complete bit unless the customer clearly asks for a component.", next: "Are they drilling with air or mud, and what rod, bit, formation, and depth are involved?" },
  { id: "KC012", title: "Coring & Casing", keywords: "coring casing nq nq2 hwt core barrel wireline advancement unstable ground", guidance: "Keep core recovery and casing advancement workflows distinct. Support confirmed NQ/NQ2 and HWT paths, and escalate vendor- or engineering-dependent exceptions.", next: "Is the goal core recovery or borehole control, and which system size is confirmed?" },
  { id: "KC013", title: "Rig Selection", keywords: "rig model serial selection b57 b37x b80 carrier mechanical hydraulic rpm torque mast method", guidance: "Start with constraints and drilling method, then carrier and operator workflow, then specifications. Use B57 as the mechanical anchor and B37X as the hydraulic anchor; move to sister rigs only for a clear gap.", next: "What method, depth, torque/RPM need, carrier constraint, and workflow drive the decision?" },
  { id: "KC014", title: "Automatic Hammer", keywords: "automatic hammer autohammer spt energy anvil chain hydraulic stroke bpm symptom", guidance: "Treat the hammer as an integrated SPT energy-delivery system tied to a rig. Confirm configuration and operating conditions, inspect mechanical/hydraulic basics, request video when needed, and escalate unresolved symptoms.", next: "Which rig and hammer setup are involved, what changed, and what does the hammer do now?" },
  { id: "KC015", title: "Hammer Calibration", keywords: "calibration report certificate lp le n60 energy date due dot schedule compliance", guidance: "Confirm hammer configuration, last calibration/report status, due date or project requirement, rod setup, LP/LE context, location, and timing. MDB supports prospecting, scheduling, training, and troubleshooting—not official report execution.", next: "What is the last confirmed calibration date and what deadline or documentation requirement is driving the call?" },
];

const workflowTrainingScenarios = {
  "first-call": {
    title: "First Customer Call",
    subtitle: "Find the customer, rig, method, and immediate need through a natural conversation.",
    opening: "Hey, this is Mike from Atlas. We’re running one of your truck rigs and need the piece that connects the rotary to our hollow-stem augers. Ours is getting pretty beat up.",
    facts: { company: "Atlas Geotechnical", rig: "Mobile Drill B57", serial: "The tag is dirty; I can get the serial after this call.", method: "HSA with SPT sampling", size: "4-1/4 inch", connection: "2-Key heavy-duty", need: "A replacement drive cap; the current cap is rounded and worn.", quantity: "One now, possibly a spare after fit is confirmed." },
  },
  "part-search": {
    title: "Unknown Part Search",
    subtitle: "Work from the customer’s description to the right workspace without guessing a part number.",
    opening: "I need the cutting piece on the bottom of our hollow-stem setup. We’re in hard clay and gravel, and the teeth are about gone. I don’t know what style it is.",
    facts: { company: "Blue Ridge Drilling", rig: "Mobile Drill B37X", serial: "2025028", method: "HSA drilling", size: "6-5/8 inch", connection: "3-Key", need: "Replacement cutterhead and wear components for hard clay and gravel.", quantity: "One assembly plus common wear parts." },
  },
  "quote-run": {
    title: "Full Quote Run",
    subtitle: "Qualify a multi-line tooling request before sending anything into a dummy quote.",
    opening: "Can you quote ten five-foot augers, a drive cap, and whatever center setup we need? It’s for our B57 and we run AWJ inside the augers.",
    facts: { company: "GeoDynamics Inc.", rig: "Mobile Drill B57", serial: "2025023", method: "HSA with AWJ rod and SPT sampling", size: "6-5/8 inch", connection: "3-Key", need: "Ten 5-foot augers, one drive cap, and a compatible center-plug assembly.", quantity: "10 augers, 1 drive cap, 1 center-plug assembly." },
  },
};

const calibrationTrainingScenarios = [
  {
    id: "normal-appointment",
    title: "Normal Appointment",
    subtitle: "Baseline field workflow, no complications.",
    prompt: "Customer has one rig ready for calibration. Setup is normal — no refusal, no rapid advancement, and no failed pulse check occur.",
    items: [
      { text: "Confirms rig, customer, borehole, driller, and tech information", correct: true },
      { text: "Sets up the analyzer kit correctly", correct: true },
      { text: "Enters the depth interval correctly", correct: true },
      { text: "Measures and enters LP and LE", correct: true },
      { text: "Confirms sensor connection", correct: true },
      { text: "Runs the pulse check before live collection", correct: true },
      { text: "Starts collection only after setup is ready", correct: true },
      { text: "Records 6-inch blow counts", correct: true },
      { text: "Ends the test properly", correct: true },
      { text: "Completes the calibration log", correct: true },
      { text: "Hands off data correctly", correct: true },
    ],
  },
  {
    id: "failed-pulse-check",
    title: "Failed Pulse Check",
    subtitle: "Analyzer hardware trouble before collection starts.",
    prompt: "The pulse check does not produce the expected graph/ping.",
    items: [
      { text: "Holds off starting live data collection until the pulse check passes", correct: true },
      { text: "Reconnects and checks cables", correct: true },
      { text: "Checks sensor and pigtail connections", correct: true },
      { text: "Restarts the software completely", correct: true },
      { text: "Replaces accelerometers/sensors with backups if needed", correct: true },
      { text: "Reruns the pulse check before proceeding", correct: true },
      { text: "Escalates to the office if backup sensors also fail the pulse check", correct: true },
      { text: "Starts live data collection anyway since the hammer is already running", correct: false, note: "Retrain/retest trigger (Module 010): starting collection after a failed pulse check." },
      { text: "Keeps guessing at the cause after backup sensors also fail, without calling the office", correct: false, note: "Retrain/retest trigger (Module 010): continuing to guess instead of escalating once backups also fail the pulse check." },
    ],
  },
  {
    id: "refusal",
    title: "Refusal",
    subtitle: "Sampler will not advance a full interval.",
    prompt: "The sampler does not advance a full 6 inches in 50 blows.",
    items: [
      { text: "Recognizes refusal", correct: true },
      { text: "Records the blow count", correct: true },
      { text: "Records actual advancement", correct: true },
      { text: "Documents the depth interval", correct: true },
      { text: "Communicates the issue professionally", correct: true },
      { text: "Follows the field decision or escalation path", correct: true },
      { text: "Treats the run as normal clean calibration data and moves on to the next depth", correct: false, note: "Module 010 pass standard: refusal data must never be treated as normal clean calibration data." },
    ],
  },
  {
    id: "rapid-advancement",
    title: "Rapid Advancement / Rod Risk",
    subtitle: "Instrumented rod at risk of entering the borehole.",
    prompt: "During the first few blows, the sampler advances quickly and the instrumented rod is at risk of entering the hollow stem auger or borehole.",
    items: [
      { text: "Watches the first 6 blows closely", correct: true },
      { text: "Stops hammer operation before the instrumented rod enters the HSA or borehole", correct: true },
      { text: "Protects sensors and the instrumented rod", correct: true },
      { text: "Communicates clearly with the operator", correct: true },
      { text: "Documents the rapid advancement", correct: true },
      { text: "Corrects setup or selects another interval if appropriate", correct: true },
      { text: "Escalates if damage is suspected", correct: true },
      { text: "Lets the driller keep hammering while checking on the instrumented rod", correct: false, note: "Mandatory retrain/retest trigger (Module 010): allowing hammering to continue while the instrumented rod is at risk." },
    ],
  },
  {
    id: "depth-blow-count",
    title: "Wrong Depth Interval / Missing Blow Counts",
    subtitle: "Software interval doesn't match what actually happened.",
    prompt: "The trainee entered a 20.0-22.0 ft interval, but the sampler only advanced to 21.5 ft — or the 6-inch blow counts weren't recorded.",
    items: [
      { text: "Recognizes the interval mismatch", correct: true },
      { text: "Corrects documentation on site", correct: true },
      { text: "Collects another proper data set if needed and possible", correct: true },
      { text: "Records 6-inch blow counts", correct: true },
      { text: "Documents what happened", correct: true },
      { text: "Says the software total is close enough and skips the 6-inch increments", correct: false, note: "Mandatory retrain/retest trigger (Module 010): the software total is not enough by itself without documented 6-inch increments." },
    ],
  },
  {
    id: "customer-pressure",
    title: "Customer Pressure / Do-Not-Promise",
    subtitle: "Driller wants a same-day pass/fail answer.",
    prompt: "Customer says: “We just need the paperwork. Can you tell us if the hammer is above 60 today and get the report sent over?”",
    approvedLanguage: "We are checking how much hammer energy is actually getting into the drill rods so your SPT blow counts can be corrected to the N60 standard and used with confidence.",
    items: [
      { text: "Uses the approved plain-language explanation instead of calling it paperwork", correct: true },
      { text: "Explains calibration as energy-transfer measurement", correct: true },
      { text: "States the standard report delivery expectation (within 3 days) when appropriate", correct: true },
      { text: "Routes the urgency to the qualified report handler", correct: true },
      { text: "Protects data quality despite the pressure", correct: true },
      { text: "Tells the customer the hammer is already above 60", correct: false, note: "Do-not-promise rule (Module 008): never predict a specific energy percentage before the data is reviewed." },
      { text: "Promises the report will go out today", correct: false, note: "Do-not-promise rule (Module 008): standard delivery is 3 days unless the qualified report handler confirms otherwise." },
      { text: "Agrees it's basically just paperwork to keep things moving", correct: false, note: "Module 008: calibration is measurement, documentation, compliance, and customer-confidence support — never “just paperwork.”" },
    ],
  },
  {
    id: "report-handoff",
    title: "Report Handoff Problem",
    subtitle: "Field record has a gap the report builder can't fill.",
    prompt: "Data collection is complete, but the calibration log is incomplete and the report builder can't tell what happened at one interval.",
    items: [
      { text: "Confirms the analyzer data file exists", correct: true },
      { text: "Confirms the calibration log is complete", correct: true },
      { text: "Verifies depth interval, LP, LE, and blow counts", correct: true },
      { text: "Adds field notes while the details are still fresh", correct: true },
      { text: "Provides photos/video if the issue affected calibration data", correct: true },
      { text: "Routes clarification to the qualified report handler", correct: true },
      { text: "Hands off the incomplete log as-is since the analyzer data file itself is fine", correct: false, note: "Module 001/010: report builders cannot complete the package if the field record is incomplete — gaps get closed before handoff, not guessed at afterward." },
    ],
  },
  {
    id: "equipment-damage",
    title: "Equipment Damage Distinction",
    subtitle: "Accelerometer vs. suspected strain gauge damage.",
    prompt: "An accelerometer appears damaged during a job. Variant: strain gauge damage is suspected.",
    items: [
      { text: "Checks for cable or connector damage", correct: true },
      { text: "Replaces the accelerometer with a backup if available", correct: true },
      { text: "Reruns the pulse check before continuing", correct: true },
      { text: "Calls the office and documents the damage", correct: true },
      { text: "Treats any suspected strain gauge damage as an immediate stop, not field-repairable", correct: true },
      { text: "Routes suspected strain gauge damage through the drill manager / senior authority path", correct: true },
      { text: "Continues collecting data on a suspected damaged strain gauge without calling it in", correct: false, note: "Module 010: suspected strain gauge damage must never be treated as field-replaceable — stop and call the office immediately." },
    ],
  },
];

const workspaceEntries = [
  ["Customer Profile", "Customer workspace", "customer", "customer client account company"],
  ["Tooling", "Full catalog and CTS search", "tooling", "tooling drive cap split spoon hsa auger hex cor moyno drill rod"],
  ["Quote Builder", "One browser-saved demo draft", "quotes", "quote pricing estimate builder"],
  ["Inventory", "Editable GP-field demo", "inventory", "inventory stock available on hand allocated bin price"],
  ["Rig / BOM View", "B57 and B37X serial BOMs", "bom", "rig bom serial assembly parts bill material b57 b37x"],
  ["Calibration", "Calibration history, schedule, and quote", "calibration", "calibration hammer schedule certificate"],
  ["Rig Sales", "Rig opportunities and follow-up", "rigSales", "rig sales opportunity demonstration pipeline"],
  ["New Prospect Search", "Rule-controlled prospect discovery", "prospects", "prospect search internet company equipment"],
  ["Daily Call List", "90-day customer touch queue", "callList", "dormant overdue follow up call"],
  ["Calibration Training", "Calibration practice workspace", "calibrationTraining", "training calibration practice"],
  ["Workflow Training", "Customer-call practice", "workflowTraining", "training workflow rookie knowledge chapter"],
].map(([label, detail, action, aliases]) => ({ id: `workspace-${action}`, label, detail, category: "Workspace", action, aliases }));

const rigModelSpecs = [
  {
    id: "b25",
    model: "B25",
    name: "B25 Hydraulic Drill Rig",
    summary: "Compact, under-CDL hydraulic rig for geotechnical and environmental work.",
    aliases: "mobile drill b25 hydraulic under cdl geotechnical environmental automatic hammer",
    source: "Current Mobile Drill B25 product page",
    sourceUrl: "https://mobiledrill.net/product-category/drill-rigs/new-drill-rigs/b25",
    metrics: [
      ["Pulldown", "6,000 lb"],
      ["Retract", "10,800 lb"],
      ["Feed stroke", "6.3 ft"],
      ["Maximum speed", "670 rpm"],
      ["Maximum torque", "3,417 ft-lb"],
      ["Engine", "44 HP @ 3,000 rpm"],
    ],
    details: [
      ["Engine", "Kubota V1505-TE3B Tier 4"],
      ["Rotary head", "4-speed hydraulic"],
      ["Main hoist", "3,000 lb"],
      ["Safe-T / wireline hoist", "900 lb"],
      ["Front winch", "8,000 lb"],
      ["Automatic hammer", "ASTM D-1586"],
      ["Mounting", "Truck, rubber track, or trailer"],
      ["Pump setup", "Multiple pump options"],
    ],
    capacities: [
      ["3-1/4 in HSA", "60 ft"],
      ["6 in CFA", "85 ft"],
      ["2-5/8 in rotary pipe", "200 ft"],
      ["N wireline", "250 ft"],
    ],
  },
];

function normalize(value) {
  return String(value || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
}

function formatFileSize(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

function matchScore(query, target) {
  const cleanQuery = normalize(query);
  const cleanTarget = normalize(target);
  if (!cleanQuery || !cleanTarget) return 0;
  if (cleanTarget === cleanQuery) return 1;
  if (cleanTarget.startsWith(cleanQuery)) return 0.98;
  if (cleanTarget.includes(cleanQuery)) return 0.93;
  const queryTokens = cleanQuery.split(" ");
  const exactNumericTokens = queryTokens.filter((token) => /^\d{4,}$/.test(token));
  if (exactNumericTokens.some((token) => !cleanTarget.includes(token))) return 0;
  const targetTokens = cleanTarget.split(" ");
  let total = 0;
  for (const queryToken of queryTokens) {
    let best = 0;
    for (const targetToken of targetTokens) {
      if (targetToken.startsWith(queryToken) || queryToken.startsWith(targetToken)) best = Math.max(best, 0.94);
      else if (queryToken.length >= 3 && Math.abs(queryToken.length - targetToken.length) <= 2) {
        const distance = levenshtein(queryToken, targetToken);
        if (distance <= Math.max(1, Math.floor(queryToken.length / 3))) {
          best = Math.max(best, 1 - distance / Math.max(queryToken.length, targetToken.length));
        }
      }
    }
    total += best;
  }
  return total / queryTokens.length;
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 2600);
}

function safeLoad(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function safeSave(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* demo still works without persistence */ }
}

function loadRigSalesOpportunities() {
  const saved = safeLoad("mdb-demo-rig-sales-opportunities", null);
  if (!Array.isArray(saved) || !saved.length) return;
  const valid = saved.filter((item) => item && item.id && item.company).map((item) => ({
    id: String(item.id),
    company: String(item.company),
    territory: String(item.territory || "Unassigned"),
    rig: String(item.rig || "TBD"),
    stage: String(item.stage || "New"),
    value: Number(item.value) || 0,
    next: String(item.next || "Complete needs analysis"),
  }));
  if (valid.length) rigSalesOpportunities.splice(0, rigSalesOpportunities.length, ...valid);
}

function saveRigSalesOpportunities() {
  safeSave("mdb-demo-rig-sales-opportunities", rigSalesOpportunities);
}

let rigQuoteDbPromise;

function openRigQuoteDb() {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  if (rigQuoteDbPromise) return rigQuoteDbPromise;
  rigQuoteDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("mdb-demo-files", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("rig-sales-quotes")) {
        request.result.createObjectStore("rig-sales-quotes", { keyPath: "opportunityId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return rigQuoteDbPromise;
}

async function loadRigQuoteFiles() {
  try {
    const db = await openRigQuoteDb();
    if (!db) return {};
    const records = await new Promise((resolve, reject) => {
      const request = db.transaction("rig-sales-quotes", "readonly").objectStore("rig-sales-quotes").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return Object.fromEntries(records.map((record) => [record.opportunityId, record]));
  } catch {
    return {};
  }
}

async function storeRigQuoteFile(opportunityId, file) {
  const record = {
    opportunityId,
    name: file.name,
    type: file.type || "application/pdf",
    size: file.size,
    uploadedAt: new Date().toISOString(),
    blob: file,
  };
  state.rigQuoteFiles[opportunityId] = record;
  try {
    const db = await openRigQuoteDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const request = db.transaction("rig-sales-quotes", "readwrite").objectStore("rig-sales-quotes").put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch { /* the attachment still works for this browser session */ }
}

function viewRigQuoteFile(opportunityId) {
  const record = state.rigQuoteFiles[opportunityId];
  if (!record?.blob) { showToast("That quote file is no longer available on this browser"); return; }
  const url = URL.createObjectURL(record.blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function newQuote() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return {
    number: `DEMO-${stamp}`, customerId: state.selectedCustomerId || "", customerPo: "", salesperson: "",
    workflow: "General", terms: "Net 30", shipVia: "Best way", notes: "", freight: 0, taxRate: 0, lines: [], savedAt: "",
  };
}

function startCalibrationQuote(customer) {
  const quote = newQuote();
  quote.workflow = "Calibration";
  quote.number = `CAL-${quote.number}`;
  quote.customerId = customer?.id || "";
  quote.notes = `Calibration quote for ${customer?.name || "selected customer"}. Started from the Calibration workspace.`;
  quote.lines = [{
    part: "CAL-SERVICE",
    description: "Automatic hammer calibration service",
    quantity: 1,
    unitPrice: 0,
    discount: 0,
    taxable: false,
    source: "Calibration workspace",
  }];
  state.quote = quote;
  safeSave("mdb-demo-quote", state.quote);
  openWorkspace("quotes");
  showToast(`Clean calibration quote started${customer ? ` for ${customer.name}` : ""}`);
}

function stockSeed(part) {
  let hash = 0;
  for (const character of String(part)) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return { onHand: hash % 88, allocated: hash % 13, bin: `${String.fromCharCode(65 + (hash % 8))}-${1 + (hash % 24)}`, unitPrice: 0 };
}

function getStock(part) {
  if (!state.stock[part]) state.stock[part] = stockSeed(part);
  return state.stock[part];
}

function saveStock() {
  safeSave("mdb-demo-stock", state.stock);
}

function firstPartNumber(value) {
  if (!value || /^(N\/A|GAP|CONFIRMED)/i.test(value)) return "";
  const match = String(value).match(/\b(?:[A-Z]{1,5}-?)?\d{3,}(?:-[A-Z0-9]+)*\b/i);
  return match ? match[0] : "";
}

function partNumbers(value) {
  const matches = String(value || "").match(/\b(?:[A-Z]{1,5}-?)?\d{3,}(?:-[A-Z0-9]+)*\b/gi) || [];
  return [...new Set(matches)].filter((part) => !/^2015$|^2017$/.test(part));
}

function statusClass(status) {
  const clean = normalize(status);
  if (clean.includes("blocked") || clean.includes("not offered")) return "status-label--blocked";
  if (clean.includes("confirmed") || clean.includes("serial bom") || clean.includes("cts match")) return "status-label--good";
  if (clean.includes("reference") || clean.includes("gap") || clean.includes("verify")) return "status-label--warn";
  return "";
}

async function loadData() {
  const getJson = async (path) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return response.json();
  };
  [state.data.rig, state.data.tooling] = await Promise.all([
    getJson("data/rig-parts.json"), getJson("data/tooling.json"),
  ]);
  state.stock = safeLoad("mdb-demo-stock", {});
  state.touches = safeLoad("mdb-demo-touches", {});
  state.quote = safeLoad("mdb-demo-quote", null) || newQuote();
  loadRigSalesOpportunities();
  state.rigQuoteFiles = await loadRigQuoteFiles();
  state.ready = true;
  buildToolItems();
  buildSearchIndex();
  elements.globalSearchInput.placeholder = "Search customer, tooling, part number, rig or serial...";
}

function buildToolItems() {
  const base = state.data.tooling.items.filter((item) => item.description && !/^\d*\.?\d+$/.test(item.description)).map((item) => {
    const legacyLead = /lead auger|1\/2[" ]+flight/i.test(`${item.description} ${item.officialDescription}`);
    return {
      ...item,
      id: `tool-${item.id}`,
      sourceType: "Tooling index",
      status: legacyLead ? "Blocked by current HSA CTS" : item.part ? "Catalog match - verify fit" : "Reference only",
      quoteable: Boolean(item.part) && !legacyLead && !/formatting|description only/i.test(item.sourceUsage),
    };
  });
  const supplements = state.data.tooling.supplements;
  const drive = supplements.driveCaps.map((row, index) => ({
    id: `drive-${index}`, part: firstPartNumber(row.part), rawPart: row.part,
    description: `${row.variant} Drive Cap - ${row.hex} hex - ${row.connection} - ${row.size}`,
    family: "HSA", subfamily: "Drive Cap", size: row.size, connection: row.connection,
    machineInterface: row.hex, style: row.variant, sourceType: "Current CTS / WS004",
    status: row.outcome === "confirmed" ? "CTS match - GP verify" : row.outcome === "gap" ? "Pending GAP" : "Confirmed not offered",
    quoteable: row.outcome === "confirmed", raw: row,
  }));
  const split = supplements.splitSpoons.map((row, index) => ({
    id: `split-${index}`, part: firstPartNumber(row.complete), rawPart: row.complete,
    description: `${row.style} ${row.tpi} Split Spoon - ${row.diameter} x ${row.length} - ${row.rod}`,
    family: "Sampling", subfamily: "Split Spoon", size: row.diameter, length: row.length,
    rodFamily: row.rod, thread: row.tpi, style: row.style, sourceType: "Current CTS / WS004",
    status: row.outcome === "confirmed" ? "CTS match - shoe selection required" : "Component-level result",
    quoteable: Boolean(firstPartNumber(row.complete)), raw: row,
  }));
  const hex = supplements.hexCor.map((row, index) => ({
    id: `hex-${index}`, part: firstPartNumber(row.part), rawPart: row.part,
    description: `${row.kind} - ${row.description}`,
    family: row.kind.startsWith("STD") ? "STD Duty" : "HEX-COR", subfamily: row.kind,
    size: row.holeSize, length: row.length, connection: row.hex, style: row.style,
    sourceType: "Current CTS / WS004", status: "CTS catalog match - GP verify",
    quoteable: Boolean(firstPartNumber(row.part)), raw: row,
  }));
  const moyno = supplements.moyno.map((row, index) => ({
    id: `moyno-${index}`, part: firstPartNumber(row.part), rawPart: row.part,
    description: `Moyno ${row.model} - ${row.description}`, family: "Moyno", subfamily: "Pump Part",
    style: row.model, sourceType: "Current WS004", status: "Pump model controlled",
    quoteable: row.part !== "N/A", raw: row,
  }));
  state.toolItems = [...drive, ...split, ...hex, ...moyno, ...base];
}

function buildSearchIndex() {
  const customerEntries = customers.map((customer) => ({
    id: `customer-${customer.id}`, label: customer.name, detail: customer.contact, category: "Customer",
    action: "customer", customerId: customer.id, aliases: `${customer.phone} ${customer.contact}`,
  }));
  const rigEntries = state.data.rig.rigs.map((rig) => ({
    id: `rig-${rig.serial}`, label: `${rig.model} / ${rig.serial}`, detail: `${rig.sections.length} BOM sections`,
    category: "Rig", action: "bom", serial: rig.serial, aliases: `${rig.model} ${rig.serial} rig bom`,
  }));
  const rigSpecEntries = rigModelSpecs.map((rig) => ({
    id: `rig-spec-${rig.id}`, label: rig.model, detail: `${rig.name} / model specifications`,
    category: "Rig Model", action: "rigSpecs", model: rig.model,
    aliases: `${rig.aliases} rig specs specifications capabilities capacity`,
  }));
  const rigPartEntries = state.data.rig.items.map((item) => ({
    id: `rig-part-${item.id}`, label: `${item.part} - ${item.cleanDescription || item.description}`,
    detail: `${item.models} / ${item.sections}`, category: "Rig Part", action: "bom",
    serial: item.serials.split(";")[0].trim(), part: item.part,
    aliases: `${item.aliases} ${item.type} ${item.description}`,
  }));
  const toolEntries = state.toolItems.map((item) => ({
    id: `search-${item.id}`, label: `${item.part || "NO PN"} - ${item.description}`,
    detail: `${item.family} / ${item.subfamily || "Tooling"}`, category: "Tooling", action: "tooling",
    query: item.part || item.description, toolId: item.id,
    aliases: `${item.rawPart || ""} ${item.alternatePart || ""} ${item.aliases || ""} ${item.size || ""} ${item.connection || ""}`,
  }));
  state.searchIndex = [...workspaceEntries, ...customerEntries, ...rigSpecEntries, ...rigEntries, ...rigPartEntries, ...toolEntries];
}

function findMatches(query, entries = state.searchIndex, limit = 10) {
  return entries.map((entry) => ({
    ...entry,
    score: matchScore(query, `${entry.label} ${entry.detail || ""} ${entry.aliases || ""}`),
  })).filter((entry) => entry.score >= 0.53)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, limit);
}

function hideSearchResults(container, input) {
  container.hidden = true;
  container.innerHTML = "";
  input?.setAttribute("aria-expanded", "false");
}

function renderSearchResults(container, input, results) {
  if (!results.length) {
    container.innerHTML = '<div class="search-empty">No close match. Try a part of the name or number.</div>';
  } else {
    container.innerHTML = results.map((result) => `
      <button class="search-result" type="button" role="option" data-search-id="${escapeHTML(result.id)}">
        <span><strong>${escapeHTML(result.label)}</strong><small>${escapeHTML(result.detail)}</small></span>
        <span>${escapeHTML(result.category)}</span>
      </button>`).join("");
  }
  container.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function dispatchSearchResult(result) {
  hideSearchResults(elements.globalSearchResults, elements.globalSearchInput);
  if (result.action === "customer") openCustomerWorkspace(result.customerId);
  else if (result.action === "bom") openWorkspace("bom", { serial: result.serial, part: result.part });
  else if (result.action === "rigSpecs") openWorkspace("rigSpecs", { model: result.model });
  else if (result.action === "tooling") openWorkspace("tooling", { query: result.query, toolId: result.toolId });
  else openWorkspace(result.action);
}

function setActiveNav(action) {
  $$('[data-open]', elements.workspaceNav).forEach((button) => button.classList.toggle("is-active", button.dataset.open === action));
}

function showHome() {
  closeWorkspace();
  state.activeView = "home";
  setActiveNav("home");
  elements.homeView.hidden = false;
  elements.customerView.hidden = true;
  elements.calibrationMenu.hidden = true;
  elements.globalSearchInput.focus();
}

function openCustomerWorkspace(customerId = "") {
  closeWorkspace();
  state.activeView = "customer";
  setActiveNav("customer");
  elements.homeView.hidden = true;
  elements.customerView.hidden = false;
  renderCustomerList(elements.directoryFilter.value);
  if (customerId) selectCustomer(customerId);
}

function renderCustomerList(filter = "") {
  const clean = normalize(filter);
  const matches = customers.filter((customer) => !clean || matchScore(clean, customer.name) >= 0.55);
  elements.customerList.innerHTML = matches.map((customer) => `
    <button type="button" data-customer-id="${customer.id}" class="${customer.id === state.selectedCustomerId ? "is-selected" : ""}">
      ${escapeHTML(customer.name)}
    </button>`).join("");
}

function selectCustomer(customerId) {
  const customer = customers.find((item) => item.id === customerId);
  if (!customer) return;
  state.selectedCustomerId = customerId;
  state.quote.customerId = customerId;
  safeSave("mdb-demo-quote", state.quote);
  elements.customerSearchInput.value = customer.name;
  renderCustomerList(elements.directoryFilter.value);
  renderCustomerProfile(customer);
  hideSearchResults(elements.customerSearchResults, elements.customerSearchInput);
}

function renderCustomerProfile(customer) {
  const rigRows = customer.rigs.length ? customer.rigs.map((rig) => `
    <tr><td>${escapeHTML(rig.model)}</td><td>${escapeHTML(rig.serial)}</td><td>${rig.year}</td>
    <td><span class="status-pill">${escapeHTML(rig.status)}</span></td>
    <td><button class="table-button" type="button" data-open-bom="${escapeHTML(rig.serial)}">View BOM</button></td></tr>`).join("")
    : '<tr><td colspan="5">No confirmed rigs in this demo profile.</td></tr>';
  const purchases = customer.purchases.map((purchase) => `
    <tr><td>${formatDate(purchase.date)}</td><td>${escapeHTML(purchase.type)}</td><td>${escapeHTML(purchase.description)}</td>
    <td class="is-number">${purchase.quantity}</td><td class="is-number">${formatCurrency(purchase.amount)}</td></tr>`).join("");
  const interactions = customer.interactions.map((interaction) => `
    <li class="interaction-item"><span class="interaction-icon">${escapeHTML(interaction.type.slice(0, 1))}</span>
    <div><strong>${formatDate(interaction.date)}</strong><span>${escapeHTML(interaction.text)}</span></div><small>${escapeHTML(interaction.owner)}</small></li>`).join("");
  elements.customerProfile.innerHTML = `
    <div class="profile-grid">
      <div class="profile-column">
        <section class="info-card"><header class="card-heading"><h2>Customer Information</h2><button class="small-button" type="button" data-edit-customer>Edit</button></header>
          <div class="card-body"><dl class="customer-facts">
            <dt>Company</dt><dd>${escapeHTML(customer.name)}</dd><dt>Primary Contact</dt><dd>${escapeHTML(customer.contact)}</dd>
            <dt>Title</dt><dd>${escapeHTML(customer.title)}</dd><dt>Email</dt><dd>${escapeHTML(customer.email)}</dd>
            <dt>Phone</dt><dd>${escapeHTML(customer.phone)}</dd><dt>Address</dt><dd>${escapeHTML(customer.address)}</dd>
            <dt>Customer Since</dt><dd>${escapeHTML(customer.customerSince)}</dd><dt>Credit Terms</dt><dd>${escapeHTML(customer.creditTerms)}</dd>
            <dt>Status</dt><dd><span class="status-pill ${customer.status === "Active" ? "" : "status-pill--inactive"}">${escapeHTML(customer.status)}</span></dd>
          </dl></div></section>
        <section class="info-card"><header class="card-heading"><h2>Purchase History</h2><button class="small-button" type="button">View All</button></header>
          <div class="purchase-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th class="is-number">Qty</th><th class="is-number">Amount</th></tr></thead><tbody>${purchases}</tbody></table></div></section>
      </div>
      <div class="profile-column">
        <section class="info-card"><header class="card-heading"><h2>Rig & Fleet <small>Confirmed rigs</small></h2><button class="small-button" type="button" data-workspace="bom">View All Rigs</button></header>
          <div class="table-scroll"><table class="data-table"><thead><tr><th>Rig</th><th>Serial</th><th>Year</th><th>Status</th><th>BOM</th></tr></thead><tbody>${rigRows}</tbody></table></div>
          <div class="fleet-summary"><div class="fleet-stat"><span>Total Rigs</span><strong>${customer.rigs.length}</strong></div><div class="fleet-stat"><span>Active</span><strong>${customer.rigs.filter((rig) => rig.status === "Active").length}</strong></div><div class="fleet-stat"><span>Inactive</span><strong>${customer.rigs.filter((rig) => rig.status !== "Active").length}</strong></div><div class="fleet-stat"><span>Profile</span><strong>Demo</strong></div></div>
        </section>
        <section class="info-card"><header class="card-heading"><h2>Tooling DNA <small>Based on the last 10 tooling purchases</small></h2><button class="small-button" type="button" data-customer-tooling>Customer Tooling</button></header>
          <div class="card-body tooling-dna"><div class="dna-overview"><div class="dna-chart" aria-label="Tooling category chart"></div><ul class="dna-legend">${customer.tooling.categories.map(([name, value], index) => `<li><span class="legend-dot" style="--dot:${["#0067a6", "#45a9df", "#e1262f", "#7aa7c5", "#cbd9e2"][index]}"></span>${name} (${value}%)</li>`).join("")}</ul></div>
          <ol class="tooling-rank">${customer.tooling.mostUsed.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ol></div></section>
        <section class="info-card"><header class="card-heading"><h2>Recent Interactions</h2><button class="small-button" type="button">View All</button></header><div class="card-body interactions-wrap"><ul class="interaction-list">${interactions}</ul></div></section>
      </div>
    </div>`;
}

function renderCalibrationMenu() {
  const customer = customers.find((item) => item.id === state.selectedCustomerId);
  if (!customer) {
    elements.calibrationMenu.innerHTML = '<div class="search-empty">Select a customer first.</div>';
    return;
  }
  elements.calibrationMenu.innerHTML = `<h3>${escapeHTML(customer.name)} calibrations</h3>
    <div class="calibration-records">${customer.calibrations.map((item) => `<div class="calibration-record"><span>${formatDate(item.date)}</span><strong>${escapeHTML(item.service)}</strong><span>${escapeHTML(item.result)}</span></div>`).join("")}</div>
    <button class="primary-button" type="button" data-schedule-calibration>Schedule Calibration</button>`;
}

function openWorkspace(type, options = {}) {
  if (!state.ready) { showToast("MDB data is still loading."); return; }
  state.activeWorkspace = type;
  elements.workspaceOverlay.hidden = false;
  elements.overlayBody.scrollTop = 0;
  elements.overlayBody.scrollLeft = 0;
  elements.workspaceOverlay.classList.toggle("workspace-overlay--customer-tooling", type === "customerTooling");
  const customer = customers.find((item) => item.id === state.selectedCustomerId);
  elements.overlayEyebrow.textContent = type === "customerTooling" ? customer?.name || "Customer" : "MDB";
  const titles = {
    tooling: "Tooling", customerTooling: "Customer Tooling", quotes: "Quote Builder", inventory: "Inventory", bom: "Rig / BOM View", rigSpecs: "Rig Specifications",
    calibration: "Calibration", rigSales: "Rig Sales", prospects: "New Prospect Search", callList: "Daily Call List",
    calibrationTraining: "Calibration Training", workflowTraining: "Workflow Training",
  };
  elements.overlayTitle.textContent = titles[type] || "Workspace";
  setActiveNav(type === "customerTooling" ? "customer" : type);
  if (type === "tooling") {
    state.tooling = { query: options.query || "", scope: "All", builder: detectBuilder(options.query || ""), filters: {}, selectedId: options.toolId || "", browseOpen: false };
    renderToolingWorkspace(options);
  }
  if (type === "customerTooling") {
    state.customerTooling = { query: "", scope: "All", builder: "", filters: {}, selectedId: "", browseOpen: false };
    renderCustomerToolingWorkspace(customer);
  }
  if (type === "quotes") renderQuoteWorkspace();
  if (type === "inventory") renderInventoryWorkspace(options.query || "");
  if (type === "bom") renderBomWorkspace(options);
  if (type === "rigSpecs") renderRigSpecsWorkspace(options);
  if (type === "calibration") renderCalibrationWorkspace();
  if (type === "rigSales") renderRigSalesWorkspace();
  if (type === "prospects") renderProspectWorkspace();
  if (type === "callList") renderCallListWorkspace();
  if (type === "calibrationTraining") renderCalibrationTrainingWorkspace();
  if (type === "workflowTraining") renderWorkflowTrainingWorkspace();
}

function closeWorkspace() {
  state.activeWorkspace = null;
  elements.workspaceOverlay.hidden = true;
  elements.workspaceOverlay.classList.remove("workspace-overlay--customer-tooling");
  elements.overlayBody.innerHTML = "";
  setActiveNav(state.activeView === "customer" ? "customer" : "home");
}

function detectBuilder(query) {
  const clean = normalize(query);
  if (clean.includes("drive cap")) return "driveCap";
  if (clean.includes("split spoon") || clean.includes("split sampler")) return "splitSpoon";
  if (clean.includes("moyno") || /\b3l[468]\b/.test(clean)) return "moyno";
  if (clean.includes("hex cor") || clean.includes("std duty") || clean.includes("solid stem")) return "hexCor";
  if (clean.includes("hsa auger") || clean.includes("hollow stem auger")) return "hsaAuger";
  return "";
}

function toolingFamilies() {
  return ["All", ...new Set(state.toolItems.map((item) => item.family).filter(Boolean))].sort((a, b) => a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b));
}

function activeToolingState() {
  return state.activeWorkspace === "customerTooling" ? state.customerTooling : state.tooling;
}

function toolingBrowsePanel() {
  const toolState = activeToolingState();
  const guided = [["driveCap", "Drive Cap"], ["hsaAuger", "HSA Auger"], ["splitSpoon", "Split Spoon"], ["hexCor", "HEX-COR / STD"], ["moyno", "Moyno"]];
  return `<section id="toolBrowsePanel" class="tool-browse-panel" ${toolState.browseOpen ? "" : "hidden"}>
    <div><strong>Guided selectors</strong><span>Use compatibility-controlled dropdowns</span><div class="browse-buttons">${guided.map(([id, label]) => `<button type="button" data-tool-builder="${id}">${label}</button>`).join("")}</div></div>
    <div><strong>Catalog families</strong><span>Browse the complete tooling index</span><div class="browse-buttons">${toolingFamilies().map((family) => `<button type="button" class="${toolState.scope === family ? "is-active" : ""}" data-tool-scope="${escapeHTML(family)}">${escapeHTML(family === "All" ? "All Tooling" : family)}</button>`).join("")}</div></div>
  </section>`;
}

function toolingCoreHtml(customer = null) {
  const toolState = activeToolingState();
  const customerHistory = customer ? customer.purchases.filter((item) => item.type === "Tooling").slice(0, 10) : [];
  return `<div class="workbench tooling-workbench ${customer ? "tooling-workbench--customer" : ""}">
      ${customer ? `<section class="customer-tooling-context"><header><strong>Based on the last 10 tooling purchases</strong><span>Customer history is isolated from the main Tooling workspace</span></header><div>${customerHistory.map((purchase) => `<button type="button" data-customer-history-search="${escapeHTML(purchase.description)}"><strong>${escapeHTML(purchase.description)}</strong><span>${formatDate(purchase.date)} · Qty ${purchase.quantity}</span></button>`).join("") || "<span>No tooling purchases recorded.</span>"}</div></section>` : ""}
      <div class="workbench-bar workbench-bar--tooling">
        <label class="inline-search"><span class="search-mark" aria-hidden="true"></span><input id="toolSearch" type="search" value="${escapeHTML(toolState.query)}" placeholder="Search all tooling and part numbers..."></label>
        <button type="button" id="browseToolingButton" class="secondary-button" aria-expanded="${toolState.browseOpen}">Browse Tooling</button>
        <span class="record-count">${state.toolItems.length.toLocaleString()} searchable records</span>
      </div>
      ${toolingBrowsePanel()}
      <div class="tool-mode-bar"><strong id="toolModeLabel">${toolState.builder ? "Guided selection" : toolState.scope === "All" ? "All Tooling" : `Browsing ${escapeHTML(toolState.scope)}`}</strong>${toolState.builder || toolState.scope !== "All" ? '<button type="button" class="small-button" data-tool-reset>Back to All Tooling</button>' : ""}</div>
      <div id="toolBuilderHost" ${toolState.builder ? "" : "hidden"}>${renderToolingBuilder()}</div>
      <div id="toolCatalogSurface" ${toolState.builder ? "hidden" : ""}>
        <div class="tooling-layout">
          <section class="tool-results-panel"><div id="toolResultSummary" class="panel-strip"></div><div id="toolResults" class="tool-results"></div></section>
          <aside id="toolDetail" class="tool-detail"></aside>
        </div>
      </div>
    </div>`;
}

function renderToolingWorkspace() {
  elements.overlayBody.innerHTML = `
    ${toolingCoreHtml()}`;
  if (!state.tooling.builder) renderToolingResults();
}

function renderCustomerToolingWorkspace(customer) {
  if (!customer) { elements.overlayBody.innerHTML = '<div class="profile-empty"><strong>Select a customer first</strong></div>'; return; }
  elements.overlayBody.innerHTML = toolingCoreHtml(customer);
  if (!state.customerTooling.builder) renderToolingResults();
}

function renderActiveToolingWorkspace() {
  if (state.activeWorkspace === "customerTooling") renderCustomerToolingWorkspace(customers.find((item) => item.id === state.selectedCustomerId));
  else renderToolingWorkspace();
}

function updateToolingModeSurface() {
  const toolState = activeToolingState();
  const builderHost = $("#toolBuilderHost");
  const catalogSurface = $("#toolCatalogSurface");
  const modeBar = $(".tool-mode-bar");
  if (!builderHost || !catalogSurface || !modeBar) return;
  modeBar.innerHTML = `<strong id="toolModeLabel">${toolState.builder ? "Guided selection" : toolState.scope === "All" ? "All Tooling" : `Browsing ${escapeHTML(toolState.scope)}`}</strong>${toolState.builder || toolState.scope !== "All" ? '<button type="button" class="small-button" data-tool-reset>Back to All Tooling</button>' : ""}`;
  builderHost.hidden = !toolState.builder;
  catalogSurface.hidden = Boolean(toolState.builder);
  if (toolState.builder) builderHost.innerHTML = renderToolingBuilder();
  else renderToolingResults();
}

function optionHtml(values, current, placeholder = "Any") {
  return `<option value="">${placeholder}</option>${values.map((value) => `<option value="${escapeHTML(value)}" ${value === current ? "selected" : ""}>${escapeHTML(value)}</option>`).join("")}`;
}

function uniqueValues(records, field, selections = {}) {
  const filtered = records.filter((record) => Object.entries(selections).every(([key, value]) => key === field || !value || String(record[key]) === String(value)));
  const values = [...new Set(filtered.map((record) => String(record[field] ?? "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const current = selections[field];
  if (current && !values.includes(current)) values.unshift(current);
  return values;
}

function builderField(label, field, records, placeholder = "Select...") {
  const toolState = activeToolingState();
  const value = toolState.filters[field] || "";
  return `<label class="field"><span>${label}</span><select data-builder-field="${field}">${optionHtml(uniqueValues(records, field, toolState.filters), value, placeholder)}</select></label>`;
}

function filterRecords(records, ignored = []) {
  return records.filter((record) => Object.entries(activeToolingState().filters).every(([key, value]) => !value || ignored.includes(key) || String(record[key]) === String(value)));
}

function renderToolingBuilder() {
  const toolState = activeToolingState();
  const builder = toolState.builder;
  if (!builder) return "";
  if (builder === "driveCap") {
    const records = state.data.tooling.supplements.driveCaps;
    const matches = filterRecords(records);
    return `<section class="compatibility-builder"><header><strong>Drive Cap</strong><span>Hex + connection + HSA ID</span></header>
      <div class="builder-fields">${builderField("Hex shank", "hex", records)}${builderField("Connection", "connection", records)}${builderField("HSA ID", "size", records)}${builderField("Variant", "variant", records)}</div>
      ${renderDriveCapMatches(matches)}</section>`;
  }
  if (builder === "splitSpoon") {
    const records = state.data.tooling.supplements.splitSpoons;
    const matches = filterRecords(records, ["shoe"]);
    const shoe = toolState.filters.shoe || "";
    return `<section class="compatibility-builder"><header><strong>Split Spoon</strong><span>Diameter first; shoe style is required</span></header>
      <div class="builder-fields">${builderField("Diameter", "diameter", records)}${builderField("Style", "style", records)}${builderField("Thread", "tpi", records)}${builderField("Length", "length", records)}${builderField("Rod", "rod", records)}
      <label class="field"><span>Shoe</span><select data-builder-field="shoe">${optionHtml(["Sharp", "Blunt"], shoe, "Select...")}</select></label></div>
      ${renderSplitMatches(matches, shoe)}</section>`;
  }
  if (builder === "hexCor") {
    const records = state.data.tooling.supplements.hexCor;
    const matches = filterRecords(records);
    return `<section class="compatibility-builder"><header><strong>HEX-COR / STD Duty</strong><span>Separate product lines</span></header>
      <div class="builder-fields">${builderField("Product", "kind", records)}${builderField("Hex / connection", "hex", records)}${builderField("Hole size", "holeSize", records)}${builderField("Length", "length", records)}${builderField("Cutterhead style", "style", records)}</div>
      ${renderHexMatches(matches)}</section>`;
  }
  if (builder === "moyno") {
    const records = state.data.tooling.supplements.moyno;
    const matches = filterRecords(records);
    return `<section class="compatibility-builder"><header><strong>Moyno Pump Parts</strong><span>Pump model determines the component list</span></header>
      <div class="builder-fields">${builderField("Pump model", "model", records)}</div>
      ${renderMoynoMatches(matches)}</section>`;
  }
  if (builder === "hsaAuger") {
    const records = hsaAugerRecords();
    const matches = filterRecords(records);
    return `<section class="compatibility-builder"><header><strong>HSA Auger</strong><span>Connection variants stay distinct</span></header>
      <div class="builder-fields">${builderField("Connection", "connection", records)}${builderField("Variant", "variant", records)}${builderField("HSA ID", "hsaSize", records)}${builderField("Length", "length", records)}</div>
      ${renderHsaMatches(matches)}</section>`;
  }
  return "";
}

function compactResultTable(headers, rows) {
  return `<div class="builder-results"><table class="data-table"><thead><tr>${headers.map((header) => `<th>${escapeHTML(header)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function addPartButton(part, description, disabled = false, label = "Add") {
  const stock = part ? getStock(part) : { unitPrice: 0 };
  return `<button type="button" class="table-button" data-add-part="${escapeHTML(part)}" data-description="${escapeHTML(description)}" data-price="${stock.unitPrice}" ${disabled || !part ? "disabled" : ""}>${label}</button>`;
}

function renderDriveCapMatches(records) {
  if (!records.length) return '<div class="terminal-state terminal-state--warn"><strong>Pending GAP</strong><span>Keep the selections in place and try another value or verify in GP.</span></div>';
  const rows = records.slice(0, 24).map((row) => {
    const part = firstPartNumber(row.part);
    const label = row.outcome === "confirmed" ? "CTS match" : row.outcome === "gap" ? "Pending GAP" : "Not offered";
    return `<tr><td>${escapeHTML(row.hex)}</td><td>${escapeHTML(row.connection)}</td><td>${escapeHTML(row.size)}</td><td>${escapeHTML(row.variant)}</td><td><strong>${escapeHTML(row.part)}</strong></td><td><span class="status-label ${statusClass(label)}">${label}</span></td><td>${addPartButton(part, `${row.variant} Drive Cap ${row.size} ${row.connection} ${row.hex}`, row.outcome !== "confirmed")}</td></tr>`;
  });
  return compactResultTable(["Hex", "Connection", "HSA ID", "Variant", "Part", "Status", "Quote"], rows);
}

function renderSplitMatches(records, shoe) {
  if (!records.length) return '<div class="terminal-state terminal-state--warn"><strong>Pending GAP</strong><span>No recorded row matches the selected combination.</span></div>';
  const rows = records.slice(0, 30).map((row) => {
    const shoeValue = shoe === "Sharp" ? row.shoeSharp : shoe === "Blunt" ? row.shoeBlunt : "Select shoe";
    const completeParts = partNumbers(row.complete);
    const quoteButtons = completeParts.map((part) => addPartButton(part, `${row.style} ${row.tpi} Split Spoon ${row.diameter} x ${row.length} ${row.rod}`, !shoe, `Add ${part}`)).join(" ");
    return `<tr><td>${escapeHTML(row.diameter)}</td><td>${escapeHTML(row.style)} / ${escapeHTML(row.tpi)}</td><td>${escapeHTML(row.length)}</td><td>${escapeHTML(row.rod)}</td><td>${escapeHTML(row.complete || "Components")}</td><td>${escapeHTML(shoeValue)}</td><td>${quoteButtons || '<span class="status-label status-label--warn">Components</span>'}</td></tr>`;
  });
  return compactResultTable(["Diameter", "Style", "Length", "Rod", "Complete", "Shoe", "Quote"], rows);
}

function renderHexMatches(records) {
  if (!records.length) return '<div class="terminal-state terminal-state--warn"><strong>Pending GAP</strong><span>No recorded match. HEX-COR and STD Duty remain separated.</span></div>';
  const rows = records.slice(0, 40).map((row) => `<tr><td>${escapeHTML(row.kind)}</td><td>${escapeHTML(row.style)}</td><td>${escapeHTML(row.holeSize)}</td><td>${escapeHTML(row.hex)}</td><td>${escapeHTML(row.length)}</td><td><strong>${escapeHTML(row.part)}</strong></td><td>${addPartButton(firstPartNumber(row.part), `${row.kind} ${row.style} ${row.holeSize} ${row.hex}`)}</td></tr>`);
  return compactResultTable(["Product", "Style", "Hole", "Connection", "Length", "Part", "Quote"], rows);
}

function renderMoynoMatches(records) {
  const toolState = activeToolingState();
  if (!toolState.filters.model) return '<div class="terminal-state"><strong>Select the pump model</strong><span>3L4, 3L6, and 3L8 parts stay in separate columns.</span></div>';
  const rows = records.map((row) => {
    const part = firstPartNumber(row.part);
    return `<tr><td>${escapeHTML(row.model)}</td><td>${escapeHTML(row.description)}</td><td><strong>${escapeHTML(row.part)}</strong></td><td>${addPartButton(part, `Moyno ${row.model} ${row.description}`, !part || row.part === "N/A")}</td></tr>`;
  });
  return compactResultTable(["Model", "Component", "Part", "Quote"], rows);
}

function hsaAugerRecords() {
  return state.data.tooling.items.filter((item) => item.family === "HSA" && item.subfamily === "Auger Section").map((item) => {
    const context = item.compatibleContexts.split("|").map((value) => value.trim());
    const legacy = /lead auger|1\/2[" ]+flight/i.test(item.description);
    const combined = `${item.description} ${item.compatibleContexts}`;
    return {
      ...item,
      connection: context[1] || item.connection,
      variant: /\bDB\b|double.?bolt/i.test(combined) ? "DB / Double-Bolt" : "Single-Bolt / Standard",
      hsaSize: context[0] || item.hsaId || item.size,
      length: item.length || (item.description.match(/\d+(?:\.\d+)?\s*(?:ft|')/i)?.[0] || ""),
      legacy,
    };
  });
}

function renderHsaMatches(records) {
  if (!records.length) return '<div class="terminal-state terminal-state--warn"><strong>Pending GAP</strong><span>No recorded HSA auger row matches those constraints.</span></div>';
  const rows = records.slice(0, 40).map((row) => `<tr><td>${escapeHTML(row.connection)}</td><td>${escapeHTML(row.variant)}</td><td>${escapeHTML(row.hsaSize)}</td><td>${escapeHTML(row.length)}</td><td><strong>${escapeHTML(row.part)}</strong></td><td><span class="status-label ${row.legacy ? "status-label--blocked" : "status-label--good"}">${row.legacy ? "Legacy lead PN blocked" : "Catalog match"}</span></td><td>${addPartButton(row.part, `HSA Auger ${row.hsaSize} ${row.connection} ${row.length}`, row.legacy)}</td></tr>`);
  return compactResultTable(["Connection", "Variant", "HSA ID", "Length", "Part", "Status", "Quote"], rows);
}

function renderToolingResults() {
  const toolState = activeToolingState();
  const query = toolState.query;
  let items = state.toolItems.filter((item) => toolState.scope === "All" || item.family === toolState.scope);
  if (query) {
    items = items.map((item) => ({ ...item, score: matchScore(query, `${item.part} ${item.rawPart} ${item.description} ${item.family} ${item.subfamily} ${item.aliases}`) }))
      .filter((item) => item.score >= 0.52).sort((a, b) => b.score - a.score);
  } else {
    items = items.sort((a, b) => Number(Boolean(b.part)) - Number(Boolean(a.part)) || a.description.localeCompare(b.description));
  }
  const visible = items.slice(0, 120);
  $("#toolResultSummary").innerHTML = `<strong>${items.length.toLocaleString()} matches</strong><span>${items.length > visible.length ? `Showing first ${visible.length}` : "Full result set"}</span>`;
  $("#toolResults").innerHTML = visible.length ? visible.map((item) => `
    <button type="button" class="tool-result ${item.id === toolState.selectedId ? "is-selected" : ""}" data-tool-id="${escapeHTML(item.id)}">
      <span><strong>${escapeHTML(item.part || "No active PN")}</strong><small>${escapeHTML(item.description)}</small></span>
      <span><em>${escapeHTML(item.family || "Tooling")}</em><small class="status-label ${statusClass(item.status)}">${escapeHTML(item.status)}</small></span>
    </button>`).join("") : '<div class="search-empty">No tooling record matches this search.</div>';
  const selected = state.toolItems.find((item) => item.id === toolState.selectedId) || visible[0];
  if (selected) { toolState.selectedId = selected.id; renderToolDetail(selected); }
  else $("#toolDetail").innerHTML = '<div class="profile-empty"><strong>Select a tooling result</strong></div>';
}

function renderToolDetail(item) {
  const fields = [
    ["Family", item.family], ["Type", item.subfamily], ["Size", item.size || item.hsaId], ["Length", item.length],
    ["Connection", item.connection], ["Rod", item.rodFamily], ["Thread", item.thread], ["Style", item.style],
    ["Duty", item.duty], ["Machine side", item.machineInterface], ["Validation", item.validation], ["Authority", item.sourceType || item.sourceAuthority],
  ].filter(([, value]) => value);
  const stock = item.part ? getStock(item.part) : null;
  $("#toolDetail").innerHTML = `
    <header class="detail-heading"><span class="status-label ${statusClass(item.status)}">${escapeHTML(item.status)}</span><h3>${escapeHTML(item.part || "Reference record")}</h3><p>${escapeHTML(item.description)}</p></header>
    <dl class="detail-grid">${fields.map(([label, value]) => `<dt>${label}</dt><dd>${escapeHTML(value)}</dd>`).join("")}</dl>
    ${item.reviewNotes ? `<div class="detail-note"><strong>Review note</strong><span>${escapeHTML(item.reviewNotes)}</span></div>` : ""}
    ${stock ? `<div class="detail-actions"><label class="field"><span>Demo unit price</span><input type="number" min="0" step="0.01" data-stock-part="${escapeHTML(item.part)}" data-stock-field="unitPrice" value="${stock.unitPrice}"></label>
      ${addPartButton(item.part, item.description, !item.quoteable, "Add to Quote")}</div>` : ""}`;
}

function inventorySourceItems() {
  const map = new Map();
  for (const item of state.toolItems) if (item.part && !map.has(item.part)) map.set(item.part, { part: item.part, description: item.description, area: "Tooling" });
  for (const item of state.data.rig.items) if (item.part && !map.has(item.part)) map.set(item.part, { part: item.part, description: item.cleanDescription || item.description, area: "Rig Parts" });
  return [...map.values()];
}

function renderInventoryWorkspace(query = "") {
  elements.overlayBody.innerHTML = `<div class="workbench inventory-workbench">
    <div class="workbench-bar"><label class="inline-search"><span class="search-mark"></span><input id="inventorySearch" type="search" value="${escapeHTML(query)}" placeholder="Search part number or description..."></label><span class="demo-data-label">Editable demo GP fields</span></div>
    <div id="inventoryResults"></div></div>`;
  renderInventoryResults(query);
}

function renderInventoryResults(query = "") {
  let items = inventorySourceItems();
  if (query) items = items.map((item) => ({ ...item, score: matchScore(query, `${item.part} ${item.description} ${item.area}`) })).filter((item) => item.score >= 0.52).sort((a, b) => b.score - a.score);
  const visible = items.slice(0, 160);
  $("#inventoryResults").innerHTML = `<div class="panel-strip"><strong>${items.length.toLocaleString()} matches</strong><span>On-hand, allocated, bin, and price are local demo values</span></div>
    <div class="inventory-table-wrap"><table class="data-table inventory-table"><thead><tr><th>Part</th><th>Description</th><th>Area</th><th>On Hand</th><th>Allocated</th><th>Available</th><th>Bin</th><th>Unit Price</th><th>Quote</th></tr></thead><tbody>
    ${visible.map((item) => {
      const stock = getStock(item.part); const available = Number(stock.onHand) - Number(stock.allocated);
      return `<tr><td><strong>${escapeHTML(item.part)}</strong></td><td>${escapeHTML(item.description)}</td><td>${escapeHTML(item.area)}</td>
      <td><input class="cell-input" type="number" min="0" data-stock-part="${escapeHTML(item.part)}" data-stock-field="onHand" value="${stock.onHand}"></td>
      <td><input class="cell-input" type="number" min="0" data-stock-part="${escapeHTML(item.part)}" data-stock-field="allocated" value="${stock.allocated}"></td>
      <td><strong data-stock-available="${escapeHTML(item.part)}" class="${available < 1 ? "is-low" : ""}">${available}</strong></td>
      <td><input class="cell-input cell-input--bin" data-stock-part="${escapeHTML(item.part)}" data-stock-field="bin" value="${escapeHTML(stock.bin)}"></td>
      <td><input class="cell-input cell-input--price" type="number" min="0" step="0.01" data-stock-part="${escapeHTML(item.part)}" data-stock-field="unitPrice" value="${stock.unitPrice}"></td>
      <td>${addPartButton(item.part, item.description)}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}

function customerOptions(selected) {
  return `<option value="">No customer selected</option>${customers.map((customer) => `<option value="${customer.id}" ${customer.id === selected ? "selected" : ""}>${escapeHTML(customer.name)}</option>`).join("")}`;
}

function addQuoteLine(part, description, price = 0, source = "MDB demo") {
  if (!state.quote) state.quote = newQuote();
  state.quote.lines.push({ part: part || "", description: description || "", quantity: 1, unitPrice: Number(price) || 0, discount: 0, taxable: false, source });
  safeSave("mdb-demo-quote", state.quote);
  showToast(`${part || "Line"} added to quote`);
}

function quoteTotals() {
  const subtotal = state.quote.lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0), 0);
  const discount = state.quote.lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitPrice || 0) * Number(line.discount || 0) / 100, 0);
  const taxable = state.quote.lines.reduce((sum, line) => sum + (line.taxable ? Number(line.quantity || 0) * Number(line.unitPrice || 0) * (1 - Number(line.discount || 0) / 100) : 0), 0);
  const tax = taxable * Number(state.quote.taxRate || 0) / 100;
  const total = subtotal - discount + Number(state.quote.freight || 0) + tax;
  return { subtotal, discount, taxable, tax, total };
}

function renderQuoteWorkspace() {
  if (!state.quote) state.quote = newQuote();
  const totals = quoteTotals();
  const workflow = state.quote.workflow || "General";
  const customer = customers.find((item) => item.id === state.quote.customerId);
  elements.overlayBody.innerHTML = `<div class="quote-context"><div><span>${escapeHTML(workflow)} quote</span><strong>${escapeHTML(customer?.name || "No customer selected")}</strong></div><small>This is a clean, browser-local working draft.</small></div><div class="quote-layout">
    <section class="quote-form">
      <div class="quote-fields">
        <label class="field"><span>Customer</span><select data-quote-field="customerId">${customerOptions(state.quote.customerId)}</select></label>
        <label class="field"><span>Quote #</span><input data-quote-field="number" value="${escapeHTML(state.quote.number)}"></label>
        <label class="field"><span>Customer PO / Ref</span><input data-quote-field="customerPo" value="${escapeHTML(state.quote.customerPo)}"></label>
        <label class="field"><span>Salesperson</span><input data-quote-field="salesperson" value="${escapeHTML(state.quote.salesperson)}"></label>
        <label class="field"><span>Terms</span><input data-quote-field="terms" value="${escapeHTML(state.quote.terms)}"></label>
        <label class="field"><span>Ship Via</span><input data-quote-field="shipVia" value="${escapeHTML(state.quote.shipVia)}"></label>
      </div>
      <div class="quote-lines"><div class="quote-line quote-line--header"><span>Part</span><span>Description</span><span>Qty</span><span>Unit Price</span><span>Disc %</span><span>Tax</span><span>Extended</span><span></span></div>
        <div id="quoteLineRows">${renderQuoteLines()}</div>
        <button class="secondary-button" type="button" data-quote-add-line>Add Blank Line</button>
      </div>
      <label class="field quote-notes"><span>Internal demo notes</span><textarea data-quote-field="notes" rows="4">${escapeHTML(state.quote.notes)}</textarea></label>
    </section>
    <aside class="quote-summary"><h3>Quote Summary</h3>
      <div class="summary-row"><span>Subtotal</span><strong id="quoteSubtotal">${formatCurrency(totals.subtotal)}</strong></div>
      <div class="summary-row"><span>Line discounts</span><strong id="quoteDiscount">-${formatCurrency(totals.discount)}</strong></div>
      <label class="summary-input"><span>Freight</span><input type="number" min="0" step="0.01" data-quote-field="freight" value="${state.quote.freight}"></label>
      <label class="summary-input"><span>Tax rate %</span><input type="number" min="0" step="0.01" data-quote-field="taxRate" value="${state.quote.taxRate}"></label>
      <div class="summary-row"><span>Tax</span><strong id="quoteTax">${formatCurrency(totals.tax)}</strong></div>
      <div class="summary-row total"><span>Total</span><strong id="quoteTotal">${formatCurrency(totals.total)}</strong></div>
      <button class="primary-button" type="button" data-quote-save>Save Browser Draft</button>
      <button class="secondary-button quote-secondary" type="button" data-quote-new>Start New Quote</button>
      <p class="quote-state">${state.quote.savedAt ? `Saved in this browser ${escapeHTML(state.quote.savedAt)}` : "Not saved yet"}</p>
      <p class="quote-state">One working draft only · not shared · not sent to GP</p>
    </aside></div>`;
}

function renderRigSpecsWorkspace(options = {}) {
  if (options.model && rigModelSpecs.some((rig) => rig.model === options.model)) state.rigSpecModel = options.model;
  const rig = rigModelSpecs.find((item) => item.model === state.rigSpecModel) || rigModelSpecs[0];
  state.rigSpecModel = rig.model;
  elements.overlayBody.innerHTML = `<div class="workbench operations-workbench rig-spec-workbench">
    <div class="operations-toolbar rig-spec-toolbar"><div><span class="status-label status-label--good">Model specs loaded</span><strong>${escapeHTML(rig.name)}</strong><span>${escapeHTML(rig.summary)}</span></div><a class="secondary-button" href="${escapeHTML(rig.sourceUrl)}" target="_blank" rel="noopener noreferrer">Official product page</a></div>
    <div class="metric-grid rig-spec-metrics">${rig.metrics.map(([label, value]) => `<div><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`).join("")}</div>
    <div class="rig-spec-layout">
      <section class="operations-panel rig-spec-panel"><header><div><h3>Model Specifications</h3><p>${escapeHTML(rig.source)}</p></div></header><dl class="rig-spec-details">${rig.details.map(([label, value]) => `<dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd>`).join("")}</dl></section>
      <section class="operations-panel rig-spec-panel"><header><div><h3>Estimated Drilling Capacities</h3><p>Published guidance; conditions and configuration affect actual capacity.</p></div></header><table class="data-table"><thead><tr><th>Method</th><th>Estimated capacity</th></tr></thead><tbody>${rig.capacities.map(([method, value]) => `<tr><td>${escapeHTML(method)}</td><td><strong>${escapeHTML(value)}</strong></td></tr>`).join("")}</tbody></table></section>
    </div>
    <div class="rig-spec-bom-note"><div><span class="status-label status-label--warn">No serial BOM loaded</span><strong>${escapeHTML(rig.model)} specifications are available, but this demo does not contain a complete ${escapeHTML(rig.model)} serial BOM.</strong><p>Rig / BOM remains limited to the loaded B57 and B37X serial builds. MDB will not substitute parts from another rig.</p></div><button type="button" class="primary-button" data-rig-opportunity-model="${escapeHTML(rig.model)}">Start Rig Opportunity</button></div>
  </div>`;
}

function renderQuoteLines() {
  if (!state.quote.lines.length) return '<div class="quote-empty">No lines yet. Add from Tooling, Rig/BOM, or Inventory.</div>';
  return state.quote.lines.map((line, index) => {
    const extended = Number(line.quantity || 0) * Number(line.unitPrice || 0) * (1 - Number(line.discount || 0) / 100);
    return `<div class="quote-line" data-line-index="${index}">
      <input class="line-input" data-line-field="part" value="${escapeHTML(line.part)}" aria-label="Part number">
      <input class="line-input line-description" data-line-field="description" value="${escapeHTML(line.description)}" aria-label="Description">
      <input class="line-input" type="number" min="0" step="1" data-line-field="quantity" value="${line.quantity}" aria-label="Quantity">
      <input class="line-input" type="number" min="0" step="0.01" data-line-field="unitPrice" value="${line.unitPrice}" aria-label="Unit price">
      <input class="line-input" type="number" min="0" max="100" step="0.1" data-line-field="discount" value="${line.discount}" aria-label="Discount percent">
      <input type="checkbox" data-line-field="taxable" ${line.taxable ? "checked" : ""} aria-label="Taxable">
      <strong class="line-extended">${formatCurrency(extended)}</strong>
      <button class="line-remove" type="button" data-line-remove="${index}" aria-label="Remove line">×</button>
    </div>`;
  }).join("");
}

function updateQuoteNumbers() {
  const totals = quoteTotals();
  $("#quoteSubtotal") && ($("#quoteSubtotal").textContent = formatCurrency(totals.subtotal));
  $("#quoteDiscount") && ($("#quoteDiscount").textContent = `-${formatCurrency(totals.discount)}`);
  $("#quoteTax") && ($("#quoteTax").textContent = formatCurrency(totals.tax));
  $("#quoteTotal") && ($("#quoteTotal").textContent = formatCurrency(totals.total));
  $$(".quote-line[data-line-index]").forEach((row) => {
    const line = state.quote.lines[Number(row.dataset.lineIndex)];
    $(".line-extended", row).textContent = formatCurrency(Number(line.quantity || 0) * Number(line.unitPrice || 0) * (1 - Number(line.discount || 0) / 100));
  });
}

function renderBomWorkspace(options = {}) {
  if (options.serial && state.data.rig.rigs.some((rig) => rig.serial === options.serial)) state.bom.serial = options.serial;
  if (options.part) state.bom.selectedPart = options.part;
  const rig = state.data.rig.rigs.find((item) => item.serial === state.bom.serial) || state.data.rig.rigs[0];
  state.bom.serial = rig.serial;
  if (!rig.sections.some((section) => section.name === state.bom.section)) state.bom.section = rig.sections[0]?.name || "";
  elements.overlayBody.innerHTML = `<div class="bom-workbench">
    <div class="bom-toolbar"><label class="field"><span>Serial / model</span><select id="bomRigSelect">${state.data.rig.rigs.map((item) => `<option value="${item.serial}" ${item.serial === rig.serial ? "selected" : ""}>${escapeHTML(item.model)} / ${escapeHTML(item.serial)}</option>`).join("")}</select></label>
      <label class="inline-search"><span class="search-mark"></span><input id="bomSearch" type="search" value="${escapeHTML(state.bom.query)}" placeholder="Search this serial BOM..."></label>
      <span class="status-label status-label--good">Serial BOM verified</span></div>
    <div class="bom-layout"><aside class="bom-sections"><strong>Sections</strong>${rig.sections.map((section) => `<button type="button" class="${section.name === state.bom.section ? "is-selected" : ""}" data-bom-section="${escapeHTML(section.name)}"><span>${escapeHTML(section.name)}</span><small>${section.relationshipCount}</small></button>`).join("")}</aside>
      <section id="bomTreePanel" class="bom-tree-panel"></section><aside id="bomDetailPanel" class="bom-detail-panel"></aside></div></div>`;
  renderBomTree();
  if (state.bom.selectedPart) renderBomDetail(state.bom.selectedPart);
}

function renderBomTree() {
  const panel = $("#bomTreePanel");
  const serial = state.bom.serial;
  const query = state.bom.query;
  if (query) {
    const relationships = state.data.rig.relationships.filter((row) => row.serial === serial)
      .map((row) => ({ ...row, score: matchScore(query, `${row.part} ${row.description} ${row.parentPart} ${row.parentDescription} ${row.path}`) }))
      .filter((row) => row.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 140);
    panel.innerHTML = `<div class="panel-strip"><strong>${relationships.length} BOM matches</strong><span>${escapeHTML(query)}</span></div>
      <div class="bom-search-list">${relationships.map((row) => `<button type="button" data-bom-part="${escapeHTML(row.part)}"><strong>${escapeHTML(row.part)}</strong><span>${escapeHTML(row.description)}</span><small>${escapeHTML(row.section)} · ${escapeHTML(row.parentPart)}</small></button>`).join("") || '<div class="search-empty">No close match in this serial BOM.</div>'}</div>`;
    return;
  }
  const assemblies = state.data.rig.assemblies.filter((row) => row.serial === serial && row.section === state.bom.section);
  const relationships = state.data.rig.relationships.filter((row) => row.serial === serial && row.section === state.bom.section);
  const children = new Map();
  for (const row of relationships) {
    if (!children.has(row.parentPart)) children.set(row.parentPart, []);
    children.get(row.parentPart).push(row);
  }
  const childAssemblyParts = new Set(relationships.map((row) => row.part).filter((part) => children.has(part)));
  let roots = assemblies.filter((assembly) => normalize(assembly.isTop) === "yes" || !childAssemblyParts.has(assembly.part));
  if (!roots.length) roots = assemblies.slice(0, 4);
  panel.innerHTML = `<div class="panel-strip"><strong>${escapeHTML(state.bom.section)}</strong><span>${assemblies.length} assemblies · ${relationships.length} relationships</span></div>
    <div class="bom-tree">${roots.map((assembly) => renderBomNode(assembly.part, assembly.description, children, new Set(), 0)).join("")}</div>`;
}

function renderBomNode(part, description, children, visited, depth) {
  const rows = children.get(part) || [];
  if (visited.has(part) || depth > 8) return `<button type="button" class="bom-leaf" data-bom-part="${escapeHTML(part)}"><strong>${escapeHTML(part)}</strong><span>${escapeHTML(description)}</span></button>`;
  const nextVisited = new Set(visited); nextVisited.add(part);
  return `<details class="bom-node" ${depth === 0 ? "open" : ""}><summary><button type="button" data-bom-part="${escapeHTML(part)}"><strong>${escapeHTML(part)}</strong><span>${escapeHTML(description)}</span></button><small>${rows.length} items</small></summary>
    <div class="bom-children">${rows.map((row) => children.has(row.part)
      ? renderBomNode(row.part, row.description, children, nextVisited, depth + 1)
      : `<button type="button" class="bom-leaf" data-bom-part="${escapeHTML(row.part)}"><strong>${escapeHTML(row.part)}</strong><span>${escapeHTML(row.description)}</span><small>${escapeHTML(row.quantity)} ${escapeHTML(row.uom)}</small></button>`).join("")}</div></details>`;
}

function renderBomDetail(part) {
  state.bom.selectedPart = part;
  const serial = state.bom.serial;
  const relation = state.data.rig.relationships.find((row) => row.serial === serial && row.part === part);
  const item = state.data.rig.items.find((row) => row.part === part);
  const assembly = state.data.rig.assemblies.find((row) => row.serial === serial && row.part === part);
  const description = relation?.description || item?.cleanDescription || item?.description || assembly?.description || "Assembly / part";
  const whereUsed = state.data.rig.whereUsed.filter((row) => row.serial === serial && row.part === part);
  const stock = getStock(part);
  $("#bomDetailPanel").innerHTML = `<header class="detail-heading"><span class="status-label status-label--good">Serial BOM verified</span><h3>${escapeHTML(part)}</h3><p>${escapeHTML(description)}</p></header>
    <dl class="detail-grid"><dt>Serial</dt><dd>${escapeHTML(serial)}</dd><dt>Section</dt><dd>${escapeHTML(relation?.section || assembly?.section || item?.sections || "")}</dd><dt>Quantity</dt><dd>${escapeHTML(relation?.quantity || "Assembly")}</dd><dt>UoM</dt><dd>${escapeHTML(relation?.uom || "")}</dd><dt>BOM path</dt><dd>${escapeHTML(relation?.path || "Top-level assembly")}</dd><dt>Source page</dt><dd>${escapeHTML(relation?.page || assembly?.page || "")}</dd></dl>
    <section class="where-used"><h4>Where Used (${whereUsed.length})</h4>${whereUsed.slice(0, 20).map((row) => `<div><strong>${escapeHTML(row.assemblyPart)}</strong><span>${escapeHTML(row.assemblyDescription)}</span><small>${escapeHTML(row.section)} · Qty ${escapeHTML(row.quantity)}</small></div>`).join("") || '<p>No child relationship rows recorded.</p>'}</section>
    <div class="detail-actions detail-actions--stack"><div class="stock-mini"><label class="field"><span>Demo on hand</span><input type="number" min="0" data-stock-part="${escapeHTML(part)}" data-stock-field="onHand" value="${stock.onHand}"></label><label class="field"><span>Demo allocated</span><input type="number" min="0" data-stock-part="${escapeHTML(part)}" data-stock-field="allocated" value="${stock.allocated}"></label></div>
    <label class="field"><span>Demo unit price</span><input type="number" min="0" step="0.01" data-stock-part="${escapeHTML(part)}" data-stock-field="unitPrice" value="${stock.unitPrice}"></label>${addPartButton(part, description, false, "Add to Quote")}</div>`;
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function customerLastTouch(customer) {
  return state.touches[customer.id] || customer.lastTouch;
}

function renderCalibrationWorkspace() {
  const customerId = state.calibrationCustomerId || state.selectedCustomerId || atlas.id;
  const customer = customers.find((item) => item.id === customerId) || atlas;
  state.calibrationCustomerId = customer.id;
  const latest = customer.calibrations[0];
  const nextDue = addDays(latest.date, 365);
  elements.overlayBody.innerHTML = `<div class="workbench operations-workbench">
    <div class="operations-toolbar"><label class="field"><span>Customer</span><select id="calibrationCustomerSelect">${customerOptions(customer.id)}</select></label><button type="button" class="primary-button" data-schedule-calibration-workspace>Schedule Calibration</button></div>
    <div class="metric-grid"><div><span>Last calibration</span><strong>${formatDate(latest.date)}</strong></div><div><span>Next recommended date</span><strong>${formatDate(nextDue)}</strong></div><div><span>Completed records</span><strong>${customer.calibrations.length}</strong></div><div><span>Confirmed rigs</span><strong>${customer.rigs.length}</strong></div></div>
    <section class="operations-panel"><header><div><h3>Calibration History</h3><p>${escapeHTML(customer.name)}</p></div><span class="status-label status-label--good">Current records</span></header>
      <table class="data-table"><thead><tr><th>Date</th><th>Service</th><th>Result</th><th>Certificate</th></tr></thead><tbody>${customer.calibrations.map((item, index) => `<tr><td>${formatDate(item.date)}</td><td>${escapeHTML(item.service)}</td><td><span class="status-label status-label--good">${escapeHTML(item.result)}</span></td><td><button type="button" class="table-button" data-demo-certificate="${index}">View</button></td></tr>`).join("")}</tbody></table>
    </section></div>`;
}

function renderRigSalesWorkspace() {
  const pipeline = rigSalesOpportunities.reduce((sum, item) => sum + item.value, 0);
  elements.overlayBody.innerHTML = `<div class="workbench operations-workbench">
    <div class="operations-toolbar"><div><strong>Active rig opportunities</strong><span>Requirements, demonstrations, attached quote files, and next actions</span></div><button type="button" class="primary-button" data-rig-new>New Opportunity</button></div>
    ${renderRigSalesEditor()}
    <div class="metric-grid"><div><span>Open opportunities</span><strong>${rigSalesOpportunities.length}</strong></div><div><span>Pipeline value</span><strong>${formatCurrency(pipeline)}</strong></div><div><span>Demos scheduled</span><strong>${rigSalesOpportunities.filter((item) => item.stage === "Demo Scheduled").length}</strong></div><div><span>Quotes active</span><strong>${rigSalesOpportunities.filter((item) => item.stage === "Quote").length}</strong></div></div>
    <section class="operations-panel"><header><div><h3>Rig Sales Pipeline</h3><p>Quote PDFs are attached by the rep and stay view-only inside this workspace.</p></div></header>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>Company</th><th>Territory</th><th>Rig</th><th>Stage</th><th>Estimated value</th><th>Next action</th><th>Quote file</th></tr></thead><tbody>${rigSalesOpportunities.map((item, index) => `<tr><td><div class="opportunity-company"><strong>${escapeHTML(item.company)}</strong><button type="button" class="link-button" data-rig-edit="${escapeHTML(item.id)}">Edit</button></div></td><td>${escapeHTML(item.territory)}</td><td>${escapeHTML(item.rig)}</td><td><select class="cell-select" data-rig-stage="${index}">${["New", "Needs Analysis", "Demo Scheduled", "Quote", "Follow-Up", "Won", "Lost"].map((stage) => `<option ${stage === item.stage ? "selected" : ""}>${stage}</option>`).join("")}</select></td><td>${formatCurrency(item.value)}</td><td>${escapeHTML(item.next)}</td><td>${renderRigQuoteFileCell(item)}</td></tr>`).join("")}</tbody></table></div>
    </section></div>`;
}

function renderRigSalesEditor() {
  const item = state.rigSalesEditor;
  if (!item) return "";
  const stages = ["New", "Needs Analysis", "Demo Scheduled", "Quote", "Follow-Up", "Won", "Lost"];
  const territories = ["Unassigned", "Northeast", "Southeast", "Midwest", "Southwest", "West"];
  if (item.territory && !territories.includes(item.territory)) territories.unshift(item.territory);
  return `<section class="rig-opportunity-editor"><header><div><strong>${item.id ? "Edit Opportunity" : "New Opportunity"}</strong><span>Saved to this browser as its own pipeline record</span></div><button type="button" class="close-button" data-rig-editor-cancel aria-label="Cancel opportunity editor">×</button></header>
    <form id="rigSalesOpportunityForm">
      <label class="field field--wide"><span>Company</span><input name="company" required value="${escapeHTML(item.company)}" placeholder="Company name"></label>
      <label class="field"><span>Territory</span><select name="territory">${territories.map((territory) => `<option ${territory === item.territory ? "selected" : ""}>${territory}</option>`).join("")}</select></label>
      <label class="field"><span>Rig</span><input name="rig" value="${escapeHTML(item.rig)}" placeholder="B57, B37X, TBD..."></label>
      <label class="field"><span>Stage</span><select name="stage">${stages.map((stage) => `<option ${stage === item.stage ? "selected" : ""}>${stage}</option>`).join("")}</select></label>
      <label class="field"><span>Estimated value</span><input name="value" type="number" min="0" step="0.01" value="${Number(item.value) || 0}"></label>
      <label class="field field--wide"><span>Next action</span><input name="next" value="${escapeHTML(item.next)}" placeholder="Next required action"></label>
      <div class="rig-opportunity-editor__actions"><button type="submit" class="primary-button">Save Opportunity</button><button type="button" class="secondary-button" data-rig-editor-cancel>Cancel</button></div>
    </form>
  </section>`;
}

function renderRigQuoteFileCell(opportunity) {
  const attachment = state.rigQuoteFiles[opportunity.id];
  const upload = `<label class="quote-file-upload"><input type="file" accept="application/pdf,.pdf" data-rig-quote-upload="${escapeHTML(opportunity.id)}"><span>${attachment ? "Replace" : "Upload PDF"}</span></label>`;
  if (!attachment) return `<div class="quote-file-cell">${upload}<small>View-only</small></div>`;
  return `<div class="quote-file-cell quote-file-cell--attached"><div><button type="button" class="table-button" data-rig-quote-view="${escapeHTML(opportunity.id)}">View</button>${upload}</div><small title="${escapeHTML(attachment.name)}">${escapeHTML(attachment.name)} · ${formatFileSize(attachment.size)}</small></div>`;
}

function prospectStatus(candidate) {
  if (candidate.matchCustomerId) return ["Existing Customer", "status-label--good"];
  if (candidate.likelyCustomerId) return ["Likely Duplicate", "status-label--warn"];
  return ["New Prospect", ""];
}

function renderProspectResults() {
  const host = $("#prospectResults");
  if (!host) return;
  if (!state.prospectResults.length) {
    host.innerHTML = '<div class="prospect-empty"><strong>Set the search parameters and run the prospect search.</strong><span>Company discovery, customer comparison, and equipment evidence return together.</span></div>';
    return;
  }
  host.innerHTML = `<div class="prospect-summary"><strong>${state.prospectResults.length} companies reviewed</strong><span>Company search + account comparison + public evidence review</span></div><div class="prospect-grid">${state.prospectResults.map((candidate) => {
    const [label, statusClassName] = prospectStatus(candidate);
    const customerId = candidate.matchCustomerId || candidate.likelyCustomerId || "";
    return `<article class="prospect-card"><header><div><span class="status-label ${statusClassName}">${label}</span><h3>${escapeHTML(candidate.company)}</h3><p>${escapeHTML(candidate.state)} · ${escapeHTML(candidate.territory)} · ${escapeHTML(candidate.market)} · ${escapeHTML(candidate.domain)}</p></div><div class="equipment-thumb" aria-hidden="true"><span></span></div></header>
      <dl><dt>Account check</dt><dd>${escapeHTML(candidate.accountCheck)}</dd><dt>Distance</dt><dd>${candidate.distance} miles</dd><dt>Equipment evidence</dt><dd>${state.prospectParams.visual ? escapeHTML(candidate.equipment) : "Image review not requested"}</dd><dt>Possible equipment</dt><dd>${state.prospectParams.visual ? escapeHTML(candidate.possibleModel) : "Not reviewed"}</dd><dt>Confidence</dt><dd>${state.prospectParams.visual ? escapeHTML(candidate.confidence) : "—"}</dd><dt>Ownership</dt><dd>${state.prospectParams.visual ? escapeHTML(candidate.ownership) : "Not evaluated"}</dd><dt>Evidence source</dt><dd>${state.prospectParams.visual ? escapeHTML(candidate.evidence) : "—"}</dd></dl>
      <footer>${customerId ? `<button type="button" class="secondary-button" data-prospect-customer="${escapeHTML(customerId)}">Open Customer</button>` : '<button type="button" class="primary-button" data-start-prospect>Start Prospect</button>'}<button type="button" class="secondary-button" data-review-evidence>Review Evidence</button></footer></article>`;
  }).join("")}</div>`;
}

function renderProspectWorkspace() {
  const params = state.prospectParams;
  elements.overlayBody.innerHTML = `<div class="workbench prospect-workbench">
    <section class="prospect-controls"><header><div><h3>Rule-Controlled Search</h3><p>One run searches companies, checks every internal identity signal, and reviews available public equipment evidence.</p></div><span class="demo-data-label">Controlled demo results</span></header>
      <div class="prospect-fields"><label class="field"><span>Territory</span><select id="prospectTerritory">${["Nationwide", "Northeast", "Southeast", "Midwest", "Southwest", "West"].map((value) => `<option value="${value}" ${value === params.territory ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="field"><span>Market</span><select id="prospectMarket">${["All", "Geotechnical", "Environmental"].map((value) => `<option value="${value}" ${value === params.market ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="field"><span>Search radius</span><select id="prospectRadius">${["50", "100", "250", "Region-wide"].map((value) => `<option value="${value}" ${value === params.radius ? "selected" : ""}>${value}${/^\d+$/.test(value) ? " miles" : ""}</option>`).join("")}</select></label><label class="field field--wide"><span>Required terms</span><input id="prospectKeywords" value="${escapeHTML(params.keywords)}" placeholder="drilling, geotechnical, environmental..."></label></div>
      <div class="prospect-rules"><label><input type="checkbox" checked disabled> Check customers, aliases, branches, domains, phones, addresses, and purchase history</label><label><input id="prospectVisual" type="checkbox" ${params.visual ? "checked" : ""}> Review public images for equipment evidence</label><span>Observed equipment is evidence only. Ownership stays unconfirmed until supported by records or a rep.</span><button type="button" class="primary-button" data-run-prospect>Run Prospect Search</button></div>
    </section><section id="prospectResults" class="prospect-results"></section></div>`;
  renderProspectResults();
}

function renderCallListWorkspace() {
  const today = new Date();
  const queue = customers.map((customer) => {
    const lastTouch = customerLastTouch(customer);
    const days = Math.max(0, Math.floor((today - new Date(`${lastTouch}T00:00:00`)) / 86400000));
    return { customer, lastTouch, days, dueDate: addDays(lastTouch, 90) };
  }).filter((item) => item.days >= 75).sort((a, b) => b.days - a.days);
  elements.overlayBody.innerHTML = `<div class="workbench operations-workbench">
    <div class="operations-toolbar"><div><strong>Every customer touched within 90 days</strong><span>Dormant customers first, then customers approaching their review date. The rep decides who to call.</span></div><span class="record-count">Updated ${new Date().toLocaleDateString()}</span></div>
    <div class="metric-grid"><div><span>Overdue</span><strong>${queue.filter((item) => item.days >= 90).length}</strong></div><div><span>Due within 15 days</span><strong>${queue.filter((item) => item.days >= 75 && item.days < 90).length}</strong></div><div><span>Queue total</span><strong>${queue.length}</strong></div><div><span>Goal</span><strong>90 days</strong></div></div>
    <section class="operations-panel"><header><div><h3>Today’s Call List</h3><p>Logging a call immediately recalculates the queue.</p></div></header><div class="table-scroll"><table class="data-table"><thead><tr><th>Priority</th><th>Customer</th><th>Last touch</th><th>Days</th><th>Due date</th><th>Contact</th><th>Action</th></tr></thead><tbody>${queue.map(({ customer, lastTouch, days, dueDate }) => `<tr><td><span class="status-label ${days >= 90 ? "status-label--blocked" : "status-label--warn"}">${days >= 90 ? "Dormant / overdue" : "Due soon"}</span></td><td><button type="button" class="link-button" data-call-profile="${customer.id}">${escapeHTML(customer.name)}</button></td><td>${formatDate(lastTouch)}</td><td><strong>${days}</strong></td><td>${formatDate(dueDate)}</td><td>${escapeHTML(customer.contact)}<br><small>${escapeHTML(customer.phone)}</small></td><td><button type="button" class="table-button" data-log-call="${customer.id}">Log Call</button></td></tr>`).join("") || '<tr><td colspan="7">Every customer is currently inside the 90-day goal.</td></tr>'}</tbody></table></div></section></div>`;
}

function renderCalibrationTrainingWorkspace() {
  elements.overlayBody.innerHTML = `<div class="workbench training-workbench"><div class="training-intro"><span>Practice only</span><h3>Calibration Call Training</h3><p>Run the field scenario without touching a real customer, calibration record, or quote. Scored against Module 010's real pass/retrain rules.</p></div><div class="training-grid training-grid--calibration">${calibrationTrainingScenarios.map((scenario) => `<button type="button" data-training-scenario="${scenario.id}"><strong>${escapeHTML(scenario.title)}</strong><span>${escapeHTML(scenario.subtitle)}</span></button>`).join("")}</div><section id="trainingStage" class="training-stage"><strong>Select a practice scenario.</strong></section></div>`;
}

function renderWorkflowTrainingWorkspace() {
  ensureWorkflowConversation();
  const trainingState = state.workflowTraining;
  const scenario = workflowTrainingScenarios[trainingState.scenarioId];
  elements.overlayBody.innerHTML = `<div class="workbench training-workbench training-workbench--chat">
    <div class="training-intro"><span>Practice only</span><h3>Customer Workflow Training</h3><p>Talk through the call naturally. MDB plays the customer and coaches the rep from KC001-KC015 without changing operational data.</p></div>
    <div class="workflow-training-layout">
      <aside class="training-scenario-rail"><header><strong>Choose the call</strong><span>Restart anytime</span></header>${Object.entries(workflowTrainingScenarios).map(([id, item]) => `<button type="button" class="${id === trainingState.scenarioId ? "is-active" : ""}" data-workflow-scenario="${id}"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.subtitle)}</span></button>`).join("")}
        <section class="kc-coverage"><header><strong>KC coverage</strong><span>${trainingState.matchedKcs.length} used this call</span></header><div>${kcTrainingKnowledge.map((item) => `<button type="button" class="${trainingState.matchedKcs.includes(item.id) ? "is-used" : ""}" data-training-kc="${item.id}" title="${escapeHTML(item.title)}">${item.id.replace("KC", "")}</button>`).join("")}</div></section>
      </aside>
      <section class="training-chat-panel">
        <header class="training-chat-header"><div><span>Active conversation</span><h3>${escapeHTML(scenario.title)}</h3><p>${escapeHTML(scenario.subtitle)}</p></div><button type="button" class="secondary-button" data-training-restart>Restart</button></header>
        <div id="workflowChatLog" class="training-chat-log" aria-live="polite">${trainingState.messages.map((message) => `<article class="chat-message chat-message--${message.role}"><span>${message.role === "rep" ? "You · Rep" : message.role === "coach" ? `MDB Coach${message.kcs?.length ? ` · ${message.kcs.join(" + ")}` : ""}` : "Practice Customer"}</span><p>${escapeHTML(message.text)}</p></article>`).join("")}</div>
        <div class="training-quick-prompts"><span>Quick reply</span><button type="button" data-chat-prompt="Which company are you with?">Company</button><button type="button" data-chat-prompt="Which rig model and serial are you running?">Rig & serial</button><button type="button" data-chat-prompt="What drilling method, tooling size, and connection are you running?">Method & tooling</button><button type="button" data-chat-prompt="What exactly is worn, broken, or needed?">Immediate need</button></div>
        <form id="workflowChatForm" class="training-chat-composer"><label for="workflowChatInput" class="sr-only">Reply as the sales representative</label><textarea id="workflowChatInput" rows="2" placeholder="Reply as the rep, ask the customer a question, or ask MDB to explain a KC topic..."></textarea><button type="submit" class="primary-button">Send</button></form>
      </section>
    </div>
  </div>`;
  elements.overlayBody.scrollTop = 0;
  const chatLog = $("#workflowChatLog");
  if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;
}

function ensureWorkflowConversation(reset = false) {
  const trainingState = state.workflowTraining;
  const scenario = workflowTrainingScenarios[trainingState.scenarioId] || workflowTrainingScenarios["first-call"];
  if (reset || !trainingState.messages.length) {
    trainingState.messages = [{ role: "customer", text: scenario.opening }];
    trainingState.matchedKcs = ["KC001"];
  }
}

function tokenMatchesCue(token, cue) {
  if (token === cue || token.startsWith(cue) || cue.startsWith(token)) return true;
  return token[0] === cue[0] && token.length >= 4 && cue.length >= 4 && Math.abs(token.length - cue.length) <= 2 && levenshtein(token, cue) <= Math.max(1, Math.floor(cue.length / 4));
}

function mentionsAny(value, cues) {
  const tokens = normalize(value).split(" ").filter(Boolean);
  return cues.some((cue) => tokens.some((token) => tokenMatchesCue(token, cue)));
}

function findTrainingKcs(value) {
  const clean = normalize(value);
  const exactKc = kcTrainingKnowledge.find((item) => clean.includes(normalize(item.id)));
  if (exactKc) return [exactKc];
  const ignored = new Set(["which", "what", "where", "when", "why", "how", "are", "you", "your", "the", "and", "with", "from", "this", "that", "running", "need", "please", "tell", "about"]);
  const tokens = clean.split(" ").filter((token) => token.length >= 3 && !ignored.has(token));
  const cueBoosts = [
    [["company", "customer", "business", "source"], ["KC001"]],
    [["rig", "model", "serial", "machine"], ["KC002", "KC013"]],
    [["hsa", "hollow", "auger"], ["KC003", "KC009"]],
    [["rod", "awj", "nwj"], ["KC004"]],
    [["spoon", "spt", "sampler"], ["KC005"]],
    [["plug", "pilot"], ["KC006"]],
    [["cap", "rotary"], ["KC007"]],
    [["cutter", "cutterhead", "teeth"], ["KC008"]],
    [["hexcor", "hex"], ["KC010"]],
    [["air", "mud", "tricone", "swivel"], ["KC011"]],
    [["coring", "casing", "nq", "hwt"], ["KC012"]],
    [["hammer", "autohammer", "anvil"], ["KC014"]],
    [["calibration", "certificate", "n60"], ["KC015"]],
  ];
  const scored = kcTrainingKnowledge.map((item) => {
    const knowledgeTokens = normalize(`${item.id} ${item.title} ${item.keywords}`).split(" ");
    let score = 0;
    tokens.forEach((token) => { if (knowledgeTokens.some((candidate) => candidate === token || candidate.startsWith(token) || token.startsWith(candidate))) score += 2; else if (knowledgeTokens.some((candidate) => tokenMatchesCue(token, candidate))) score += 1; });
    cueBoosts.forEach(([cues, ids]) => { if (ids.includes(item.id) && mentionsAny(value, cues)) score += 3; });
    return { item, score };
  }).filter((result) => result.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return [kcTrainingKnowledge[0]];
  const best = scored[0].score;
  return scored.filter((result) => result.score >= best - 1).slice(0, 2).map((result) => result.item);
}

function customerTrainingReply(value, scenario) {
  const factCues = [
    ["company", ["company", "customer", "business", "name"]],
    ["rig", ["rig", "model", "machine"]],
    ["serial", ["serial", "tag"]],
    ["method", ["method", "drilling", "work", "application", "sampling"]],
    ["size", ["size", "diameter", "inch"]],
    ["connection", ["connection", "key", "thread", "joint", "hex"]],
    ["need", ["need", "problem", "issue", "broken", "worn", "wrong", "happening"]],
    ["quantity", ["quantity", "qty", "many", "amount"]],
  ];
  const answers = factCues.filter(([, cues]) => mentionsAny(value, cues)).map(([field]) => scenario.facts[field]).filter(Boolean);
  if (answers.length) return answers.join(" ");
  if (mentionsAny(value, ["hello", "hi", "thanks", "thank"])) return "Sure. Tell me what you need from me and I’ll give you what I know.";
  return "I’m not sure how to answer that yet. Ask me about the company, rig, serial, drilling method, tooling size/connection, quantity, or what is failing.";
}

function runWorkflowTrainingTurn(value) {
  const textValue = String(value || "").trim();
  if (!textValue) return;
  const trainingState = state.workflowTraining;
  const scenario = workflowTrainingScenarios[trainingState.scenarioId];
  const matches = findTrainingKcs(textValue);
  trainingState.messages.push({ role: "rep", text: textValue });
  const coachOnly = mentionsAny(textValue, ["teach", "explain", "learn", "coach", "kc001", "kc002", "kc003", "kc004", "kc005", "kc006", "kc007", "kc008", "kc009", "kc010", "kc011", "kc012", "kc013", "kc014", "kc015"]);
  if (!coachOnly) trainingState.messages.push({ role: "customer", text: customerTrainingReply(textValue, scenario) });
  trainingState.messages.push({ role: "coach", kcs: matches.map((item) => item.id), text: `${matches.map((item) => `${item.id} ${item.title}`).join(" + ")}: ${matches.map((item) => item.guidance).join(" ")} Next move: ${matches[0].next}` });
  trainingState.matchedKcs = [...new Set([...trainingState.matchedKcs, ...matches.map((item) => item.id)])];
  renderWorkflowTrainingWorkspace();
  $("#workflowChatInput")?.focus({ preventScroll: true });
}

function renderTrainingScenario(id) {
  const stage = $("#trainingStage");
  if (!stage) return;
  const scenario = calibrationTrainingScenarios.find((item) => item.id === id);
  if (!scenario) { stage.innerHTML = "<strong>Select a practice scenario.</strong>"; return; }
  state.activeCalibrationScenario = id;
  stage.innerHTML = `<span class="status-label">Active practice</span><h3>${escapeHTML(scenario.prompt)}</h3>
    ${scenario.approvedLanguage ? `<div class="calib-approved-language"><strong>Approved field explanation</strong><p>“${escapeHTML(scenario.approvedLanguage)}”</p></div>` : ""}
    <p class="calib-instructions">Check every action the trainee should take. Leave anything the trainee should not do unchecked.</p>
    <ol class="calib-checklist">${scenario.items.map((item, index) => `<li><label><input type="checkbox" data-calib-item="${index}"> ${escapeHTML(item.text)}</label></li>`).join("")}</ol>
    <button type="button" class="primary-button" data-complete-training>Complete Practice</button>
    <div id="trainingResult"></div>`;
}

function gradeCalibrationScenario() {
  const scenario = calibrationTrainingScenarios.find((item) => item.id === state.activeCalibrationScenario);
  const resultHost = $("#trainingResult");
  if (!scenario || !resultHost) return;
  const checkedIndexes = new Set($$("#trainingStage [data-calib-item]").filter((input) => input.checked).map((input) => Number(input.dataset.calibItem)));
  const missedRequired = scenario.items.filter((item, index) => item.correct && !checkedIndexes.has(index));
  if (missedRequired.length) { showToast("Check every required action before completing practice"); return; }
  const trippedTraps = scenario.items.filter((item, index) => !item.correct && checkedIndexes.has(index));
  if (trippedTraps.length) {
    resultHost.innerHTML = `<div class="calib-result calib-result--retrain"><span class="status-label status-label--warn">Retrain / retest required</span><ul>${trippedTraps.map((item) => `<li>${escapeHTML(item.note || item.text)}</li>`).join("")}</ul></div>`;
  } else {
    resultHost.innerHTML = `<div class="calib-result calib-result--pass"><span class="status-label status-label--good">Pass</span><p>Matches Module 010's pass standard for this scenario. No operational records changed.</p></div>`;
  }
}

function handleOverlayInput(event) {
  const target = event.target;
  if (target.id === "toolSearch") {
    const toolState = activeToolingState();
    toolState.query = target.value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      const detected = detectBuilder(toolState.query);
      toolState.scope = "All";
      toolState.selectedId = "";
      if (detected !== toolState.builder) { toolState.builder = detected; toolState.filters = {}; }
      updateToolingModeSurface();
    }, 90);
  }
  if (target.id === "inventorySearch") {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => renderInventoryResults(target.value), 90);
  }
  if (target.id === "bomSearch") {
    state.bom.query = target.value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(renderBomTree, 90);
  }
  if (target.matches("[data-builder-field]")) {
    const toolState = activeToolingState();
    toolState.filters[target.dataset.builderField] = target.type === "checkbox" ? target.checked : target.value;
    if (target.tagName === "SELECT" || event.type === "change") $("#toolBuilderHost").innerHTML = renderToolingBuilder();
  }
  if (target.matches("[data-stock-part]")) {
    const stock = getStock(target.dataset.stockPart);
    stock[target.dataset.stockField] = target.type === "number" ? Number(target.value) : target.value;
    saveStock();
    const row = target.closest("tr");
    const available = row?.querySelector(`[data-stock-available="${CSS.escape(target.dataset.stockPart)}"]`);
    if (available) {
      const count = Number(stock.onHand) - Number(stock.allocated);
      available.textContent = count;
      available.classList.toggle("is-low", count < 1);
    }
  }
  if (target.matches("[data-quote-field]")) {
    const field = target.dataset.quoteField;
    state.quote[field] = target.type === "number" ? Number(target.value) : target.value;
    safeSave("mdb-demo-quote", state.quote);
    updateQuoteNumbers();
  }
  if (target.matches("[data-line-field]")) {
    const row = target.closest("[data-line-index]");
    const line = state.quote.lines[Number(row.dataset.lineIndex)];
    const field = target.dataset.lineField;
    line[field] = target.type === "checkbox" ? target.checked : target.type === "number" ? Number(target.value) : target.value;
    safeSave("mdb-demo-quote", state.quote);
    updateQuoteNumbers();
  }
}

elements.overlayBody.addEventListener("input", handleOverlayInput);
elements.overlayBody.addEventListener("change", async (event) => {
  handleOverlayInput(event);
  const target = event.target;
  if (target.id === "bomRigSelect") { state.bom.serial = target.value; state.bom.section = ""; state.bom.selectedPart = ""; renderBomWorkspace(); }
  if (target.id === "calibrationCustomerSelect") { state.calibrationCustomerId = target.value; renderCalibrationWorkspace(); }
  if (target.matches("[data-rig-stage]")) { rigSalesOpportunities[Number(target.dataset.rigStage)].stage = target.value; saveRigSalesOpportunities(); renderRigSalesWorkspace(); }
  if (target.matches("[data-rig-quote-upload]")) {
    const file = target.files?.[0];
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { showToast("Please attach the quote as a PDF"); target.value = ""; return; }
    if (file.size > 20 * 1024 * 1024) { showToast("Quote PDFs must be 20 MB or smaller"); target.value = ""; return; }
    await storeRigQuoteFile(target.dataset.rigQuoteUpload, file);
    renderRigSalesWorkspace();
    showToast("Quote PDF attached for view-only use");
  }
});

elements.overlayBody.addEventListener("submit", (event) => {
  if (event.target.id === "rigSalesOpportunityForm") {
    event.preventDefault();
    const values = new FormData(event.target);
    const opportunity = {
      id: state.rigSalesEditor.id || `opportunity-${Date.now()}`,
      company: String(values.get("company") || "").trim(),
      territory: String(values.get("territory") || "Unassigned"),
      rig: String(values.get("rig") || "TBD").trim() || "TBD",
      stage: String(values.get("stage") || "New"),
      value: Number(values.get("value")) || 0,
      next: String(values.get("next") || "").trim() || "Complete needs analysis",
    };
    const existingIndex = rigSalesOpportunities.findIndex((item) => item.id === opportunity.id);
    if (existingIndex >= 0) rigSalesOpportunities[existingIndex] = opportunity;
    else rigSalesOpportunities.unshift(opportunity);
    saveRigSalesOpportunities();
    state.rigSalesEditor = null;
    renderRigSalesWorkspace();
    showToast(`${opportunity.company} saved as its own opportunity`);
    return;
  }
  if (event.target.id !== "workflowChatForm") return;
  event.preventDefault();
  runWorkflowTrainingTurn($("#workflowChatInput")?.value);
});

elements.overlayBody.addEventListener("keydown", (event) => {
  if (event.target.id === "workflowChatInput" && event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    runWorkflowTrainingTurn(event.target.value);
  }
});

elements.overlayBody.addEventListener("click", (event) => {
  if (event.target.closest("[data-schedule-calibration-workspace]")) { const customer = customers.find((item) => item.id === state.calibrationCustomerId); startCalibrationQuote(customer); return; }
  if (event.target.closest("[data-demo-certificate]")) { showToast("Calibration certificate opened in demo mode"); return; }
  if (event.target.closest("[data-rig-new]")) { state.rigSalesEditor = { id: "", company: "", territory: "Unassigned", rig: "TBD", stage: "New", value: 0, next: "" }; renderRigSalesWorkspace(); $("#rigSalesOpportunityForm input[name='company']")?.focus(); return; }
  const rigOpportunityModel = event.target.closest("[data-rig-opportunity-model]");
  if (rigOpportunityModel) { state.rigSalesEditor = { id: "", company: "", territory: "Unassigned", rig: rigOpportunityModel.dataset.rigOpportunityModel, stage: "New", value: 0, next: "Complete needs analysis" }; openWorkspace("rigSales"); $("#rigSalesOpportunityForm input[name='company']")?.focus(); return; }
  const rigEdit = event.target.closest("[data-rig-edit]");
  if (rigEdit) { const opportunity = rigSalesOpportunities.find((item) => item.id === rigEdit.dataset.rigEdit); state.rigSalesEditor = opportunity ? { ...opportunity } : null; renderRigSalesWorkspace(); return; }
  if (event.target.closest("[data-rig-editor-cancel]")) { state.rigSalesEditor = null; renderRigSalesWorkspace(); return; }
  const rigQuoteView = event.target.closest("[data-rig-quote-view]");
  if (rigQuoteView) { viewRigQuoteFile(rigQuoteView.dataset.rigQuoteView); return; }
  if (event.target.closest("[data-run-prospect]")) {
    state.prospectParams = { territory: $("#prospectTerritory").value, market: $("#prospectMarket").value, radius: $("#prospectRadius").value, keywords: $("#prospectKeywords").value, visual: $("#prospectVisual").checked };
    const keywordTerms = normalize(state.prospectParams.keywords).split(" ").filter(Boolean);
    const radiusLimit = /^\d+$/.test(state.prospectParams.radius) ? Number(state.prospectParams.radius) : Infinity;
    state.prospectResults = prospectCandidates.filter((candidate) => {
      const searchable = normalize(`${candidate.company} ${candidate.market} ${candidate.tags}`);
      return (state.prospectParams.territory === "Nationwide" || candidate.territory === state.prospectParams.territory)
        && (state.prospectParams.market === "All" || candidate.market === state.prospectParams.market)
        && candidate.distance <= radiusLimit
        && keywordTerms.every((term) => searchable.includes(term));
    });
    renderProspectResults(); showToast("Prospect search, customer comparison, and equipment review complete"); return;
  }
  const prospectCustomer = event.target.closest("[data-prospect-customer]");
  if (prospectCustomer) { closeWorkspace(); openCustomerWorkspace(prospectCustomer.dataset.prospectCustomer); return; }
  if (event.target.closest("[data-start-prospect]")) { showToast("Prospect record started in demo mode"); return; }
  if (event.target.closest("[data-review-evidence]")) { showToast("Evidence source opened in demo mode"); return; }
  const logCall = event.target.closest("[data-log-call]");
  if (logCall) { const customer = customers.find((item) => item.id === logCall.dataset.logCall); const today = new Date().toISOString().slice(0, 10); state.touches[customer.id] = today; customer.interactions.unshift({ type: "Call", date: today, text: "Customer touch logged from Daily Call List", owner: "Current rep" }); safeSave("mdb-demo-touches", state.touches); renderCallListWorkspace(); showToast(`${customer.name} moved out of the 90-day queue`); return; }
  const callProfile = event.target.closest("[data-call-profile]");
  if (callProfile) { closeWorkspace(); openCustomerWorkspace(callProfile.dataset.callProfile); return; }
  const workflowScenario = event.target.closest("[data-workflow-scenario]");
  if (workflowScenario) { state.workflowTraining.scenarioId = workflowScenario.dataset.workflowScenario; ensureWorkflowConversation(true); renderWorkflowTrainingWorkspace(); return; }
  const trainingKc = event.target.closest("[data-training-kc]");
  if (trainingKc) { const entry = kcTrainingKnowledge.find((item) => item.id === trainingKc.dataset.trainingKc); runWorkflowTrainingTurn(`Explain ${entry.id} ${entry.title}`); return; }
  const chatPrompt = event.target.closest("[data-chat-prompt]");
  if (chatPrompt) { runWorkflowTrainingTurn(chatPrompt.dataset.chatPrompt); return; }
  if (event.target.closest("[data-training-restart]")) { ensureWorkflowConversation(true); renderWorkflowTrainingWorkspace(); return; }
  const trainingScenario = event.target.closest("[data-training-scenario]");
  if (trainingScenario) { renderTrainingScenario(trainingScenario.dataset.trainingScenario); return; }
  if (event.target.closest("[data-complete-training]")) { gradeCalibrationScenario(); return; }
  if (event.target.closest("#browseToolingButton")) {
    const toolState = activeToolingState();
    toolState.browseOpen = !toolState.browseOpen;
    $("#toolBrowsePanel").hidden = !toolState.browseOpen;
    $("#browseToolingButton").setAttribute("aria-expanded", String(toolState.browseOpen));
    return;
  }
  const builder = event.target.closest("[data-tool-builder]");
  if (builder) { const toolState = activeToolingState(); toolState.builder = builder.dataset.toolBuilder; toolState.filters = {}; toolState.query = ""; toolState.scope = "All"; toolState.selectedId = ""; toolState.browseOpen = false; renderActiveToolingWorkspace(); return; }
  const scope = event.target.closest("[data-tool-scope]");
  if (scope) { const toolState = activeToolingState(); toolState.scope = scope.dataset.toolScope; toolState.builder = ""; toolState.filters = {}; toolState.query = ""; toolState.selectedId = ""; toolState.browseOpen = false; renderActiveToolingWorkspace(); return; }
  if (event.target.closest("[data-tool-reset]")) { const toolState = activeToolingState(); Object.assign(toolState, { query: "", scope: "All", builder: "", filters: {}, selectedId: "", browseOpen: false }); renderActiveToolingWorkspace(); return; }
  const historySearch = event.target.closest("[data-customer-history-search]");
  if (historySearch) { const toolState = activeToolingState(); toolState.query = historySearch.dataset.customerHistorySearch; toolState.scope = "All"; toolState.builder = detectBuilder(toolState.query); toolState.filters = {}; toolState.selectedId = ""; toolState.browseOpen = false; renderActiveToolingWorkspace(); $("#toolSearch")?.focus(); return; }
  const result = event.target.closest("[data-tool-id]");
  if (result) { const toolState = activeToolingState(); toolState.selectedId = result.dataset.toolId; $$(".tool-result").forEach((button) => button.classList.toggle("is-selected", button === result)); renderToolDetail(state.toolItems.find((item) => item.id === toolState.selectedId)); return; }
  const add = event.target.closest("[data-add-part]");
  if (add && !add.disabled) { addQuoteLine(add.dataset.addPart, add.dataset.description, Number(getStock(add.dataset.addPart).unitPrice)); return; }
  const section = event.target.closest("[data-bom-section]");
  if (section) { state.bom.section = section.dataset.bomSection; state.bom.query = ""; state.bom.selectedPart = ""; renderBomWorkspace(); return; }
  const part = event.target.closest("[data-bom-part]");
  if (part) { event.preventDefault(); renderBomDetail(part.dataset.bomPart); return; }
  if (event.target.closest("[data-quote-add-line]")) { addQuoteLine("", "", 0); renderQuoteWorkspace(); return; }
  const remove = event.target.closest("[data-line-remove]");
  if (remove) { state.quote.lines.splice(Number(remove.dataset.lineRemove), 1); safeSave("mdb-demo-quote", state.quote); renderQuoteWorkspace(); return; }
  if (event.target.closest("[data-quote-save]")) { state.quote.savedAt = new Date().toLocaleString(); safeSave("mdb-demo-quote", state.quote); renderQuoteWorkspace(); showToast("Quote draft saved in this browser"); return; }
  if (event.target.closest("[data-quote-new]")) { state.quote = newQuote(); safeSave("mdb-demo-quote", state.quote); renderQuoteWorkspace(); showToast("New dummy quote started"); }
});

elements.homeButton.addEventListener("click", showHome);
elements.customerBackButton.addEventListener("click", showHome);
elements.overlayBackButton.addEventListener("click", closeWorkspace);
elements.overlayCloseButton.addEventListener("click", closeWorkspace);

function navigateWorkspace(type) {
  if (type === "home") showHome();
  else if (type === "customer") openCustomerWorkspace();
  else openWorkspace(type);
}

$$('[data-open]').forEach((button) => button.addEventListener("click", () => navigateWorkspace(button.dataset.open)));

document.addEventListener("click", (event) => {
  const workspaceButton = event.target.closest("[data-workspace]");
  if (workspaceButton) openWorkspace(workspaceButton.dataset.workspace);
  const bomButton = event.target.closest("[data-open-bom]");
  if (bomButton) openWorkspace("bom", { serial: bomButton.dataset.openBom });
  const customerButton = event.target.closest("[data-customer-id]");
  if (customerButton) selectCustomer(customerButton.dataset.customerId);
  if (event.target.closest("[data-customer-tooling]")) openWorkspace("customerTooling");
  if (event.target.closest("[data-schedule-calibration]")) {
    const customer = customers.find((item) => item.id === state.selectedCustomerId);
    elements.calibrationMenu.hidden = true;
    startCalibrationQuote(customer);
  }
  if (!event.target.closest(".home-search-wrap")) hideSearchResults(elements.globalSearchResults, elements.globalSearchInput);
  if (!event.target.closest(".customer-search-wrap")) hideSearchResults(elements.customerSearchResults, elements.customerSearchInput);
});

elements.globalSearchInput.addEventListener("input", () => {
  clearTimeout(state.searchTimer);
  const query = elements.globalSearchInput.value;
  if (!query.trim()) { hideSearchResults(elements.globalSearchResults, elements.globalSearchInput); return; }
  state.searchTimer = setTimeout(() => renderSearchResults(elements.globalSearchResults, elements.globalSearchInput, findMatches(query)), 90);
});

elements.globalSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const result = findMatches(elements.globalSearchInput.value, state.searchIndex, 1)[0];
  if (result) dispatchSearchResult(result); else showToast("No close match yet.");
});

elements.globalSearchResults.addEventListener("click", (event) => {
  const button = event.target.closest("[data-search-id]");
  if (!button) return;
  const result = state.searchIndex.find((entry) => entry.id === button.dataset.searchId);
  if (result) dispatchSearchResult(result);
});

elements.directoryFilter.addEventListener("input", () => renderCustomerList(elements.directoryFilter.value));
elements.customerSearchInput.addEventListener("input", () => {
  const query = elements.customerSearchInput.value;
  if (!query.trim()) { hideSearchResults(elements.customerSearchResults, elements.customerSearchInput); return; }
  const entries = customers.map((customer) => ({ id: customer.id, label: customer.name, detail: customer.contact, category: "Customer" }));
  renderSearchResults(elements.customerSearchResults, elements.customerSearchInput, findMatches(query, entries, 7));
});
elements.customerSearchResults.addEventListener("click", (event) => {
  const button = event.target.closest("[data-search-id]");
  if (button) selectCustomer(button.dataset.searchId);
});
elements.customerSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const match = customers.map((customer) => ({ customer, score: matchScore(elements.customerSearchInput.value, customer.name) })).sort((a, b) => b.score - a.score)[0];
  if (match?.score >= 0.5) selectCustomer(match.customer.id);
});

elements.calibrationButton.addEventListener("click", () => {
  const opening = elements.calibrationMenu.hidden;
  elements.calibrationMenu.hidden = !opening;
  elements.calibrationButton.setAttribute("aria-expanded", String(opening));
  if (opening) renderCalibrationMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!elements.workspaceOverlay.hidden) closeWorkspace();
    else { hideSearchResults(elements.globalSearchResults, elements.globalSearchInput); hideSearchResults(elements.customerSearchResults, elements.customerSearchInput); }
  }
});

async function boot() {
  elements.globalSearchInput.placeholder = "Loading MDB data...";
  renderCustomerList();
  try {
    await loadData();
    elements.globalSearchInput.disabled = false;
  } catch (error) {
    console.error(error);
    elements.globalSearchInput.placeholder = "MDB data did not load";
    elements.globalSearchInput.disabled = true;
    showToast("The MDB data files did not load.");
  }
}

boot();
