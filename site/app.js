"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const appMode = document.querySelector('meta[name="mdb-app-mode"]')?.content || "public-demo";
const isPublicDemo = appMode === "public-demo";
const publicDemoIdentity = { initials: "DEMO", name: "Demo User", isAdmin: false };
const productionDemoActors = {
  sales: { role: "sales", initials: "SR", name: "Sales Representative", label: "Sales" },
  production_controller: { role: "production_controller", initials: "PC", name: "Production Controller", label: "Production Control" },
  shop: { role: "shop", initials: "SHOP", name: "Assigned Shop Employee", label: "Shop Floor" },
  inventory_controller: { role: "inventory_controller", initials: "INV", name: "Inventory Controller", label: "Inventory Control" },
  service_controller: { role: "service_controller", initials: "SC", name: "Service Controller", label: "Service Control" },
  service_technician: { role: "service_technician", initials: "TECH", name: "Service Technician", label: "Service Execution" },
};
const productionShopAssignments = ["Fabrication Cell A", "Assembly Cell B", "Weld Cell"];
const feedbackAccessKey = "mdb-feedback-access-v1";
const feedbackAccessDuration = 14 * 24 * 60 * 60 * 1000;
const feedbackPinHash = "7328f9713cf2421aed7685680e2b799ea64dedf2e76f82f1017d8bc8f80a992f";

function setFeedbackAccessInert(locked) {
  [...document.body.children].forEach((element) => {
    if (element.id !== "feedbackAccessGate" && element.tagName !== "SCRIPT") element.inert = locked;
  });
}

function hasRememberedFeedbackAccess() {
  try {
    const record = JSON.parse(localStorage.getItem(feedbackAccessKey) || "null");
    return Number(record?.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

function rememberFeedbackAccess() {
  try {
    localStorage.setItem(feedbackAccessKey, JSON.stringify({ expiresAt: Date.now() + feedbackAccessDuration }));
  } catch {
    // The demo still unlocks when private browsing blocks persistent storage.
  }
}

async function hashFeedbackPin(pin) {
  const bytes = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function unlockFeedbackDemo(remember = true) {
  if (remember) rememberFeedbackAccess();
  document.body.classList.remove("is-access-locked");
  setFeedbackAccessInert(false);
  const gate = $("#feedbackAccessGate");
  if (gate) gate.hidden = true;
}

function initializeFeedbackAccess() {
  const gate = $("#feedbackAccessGate");
  const form = $("#feedbackAccessForm");
  const input = $("#feedbackAccessPin");
  const message = $("#feedbackAccessMessage");
  if (!gate || !form || !input || !message || !isPublicDemo || hasRememberedFeedbackAccess()) {
    unlockFeedbackDemo(false);
    return;
  }

  setFeedbackAccessInert(true);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const pin = input.value.replace(/\D/g, "").slice(0, 4);
    if (pin.length !== 4) {
      input.setAttribute("aria-invalid", "true");
      message.textContent = "Enter all four digits.";
      input.focus();
      return;
    }
    try {
      if (await hashFeedbackPin(pin) === feedbackPinHash) {
        unlockFeedbackDemo();
        return;
      }
    } catch {
      message.textContent = "This browser could not verify the PIN.";
      return;
    }
    input.value = "";
    input.setAttribute("aria-invalid", "true");
    message.textContent = "That PIN did not match. Try again.";
    input.focus();
  });
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 4);
    input.removeAttribute("aria-invalid");
    message.textContent = "";
  });
}

function storageKey(key) {
  return isPublicDemo ? `mdb-portfolio-sandbox:${key}` : key;
}

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
  advancedSearchButton: $("#advancedSearchButton"),
  advancedSearchModal: $("#advancedSearchModal"),
  advancedSearchClose: $("#advancedSearchClose"),
  identityButton: $("#identityButton"),
  identityModal: $("#identityModal"),
  identityModalClose: $("#identityModalClose"),
  identityModalTitle: $("#identityModalTitle"),
  identityModalBody: $("#identityModalBody"),
  quoteModal: $("#quoteModal"),
  quoteModalClose: $("#quoteModalClose"),
  quoteModalTitle: $("#quoteModalTitle"),
  quoteModalBody: $("#quoteModalBody"),
  orderModal: $("#orderModal"),
  orderModalClose: $("#orderModalClose"),
  orderModalTitle: $("#orderModalTitle"),
  orderModalBody: $("#orderModalBody"),
  buildModal: $("#buildModal"),
  buildModalClose: $("#buildModalClose"),
  buildModalTitle: $("#buildModalTitle"),
  buildModalBody: $("#buildModalBody"),
  backorderModal: $("#backorderModal"),
  backorderModalBody: $("#backorderModalBody"),
};

const state = {
  data: { rig: null, tooling: null },
  ready: false,
  activeView: "home",
  activeWorkspace: null,
  selectedCustomerId: null,
  searchIndex: [],
  toolItems: [],
  items: [],
  itemsByPart: new Map(),
  itemsBackendConfigured: false,
  itemView: { query: "", itemClass: "All", selectedPart: "" },
  quotes: [],
  quotesBackendConfigured: false,
  quoteSaveTimer: null,
  orders: [],
  ordersBackendConfigured: false,
  orderSaveTimer: null,
  inventoryBackendConfigured: false,
  pendingStockParts: new Set(),
  stockSaveTimers: {},
  activeOrderId: "",
  orderListOpen: { open: true, released: true, closed: false },
  orderSearchTerm: "",
  orderSearchTimer: null,
  builds: [],
  buildsBackendConfigured: false,
  buildSaveTimer: null,
  activeBuildId: "",
  buildListOpen: { open: true, released: true, finished: false, cancelled: false },
  buildTargetSearchTerm: "",
  buildTargetSearchTimer: null,
  buildComponentSearchTerm: "",
  buildComponentSearchTimer: null,
  buildRequests: [],
  buildRequestEditorOpen: false,
  buildRequestFormError: "",
  buildWorkspaceRole: "production_controller",
  serviceRequests: [],
  serviceWorkOrders: [],
  operationsJobs: [],
  operationsJobAssignments: [],
  operationsJobCheckpoints: [],
  operationsCheckpointDefinitions: [],
  serviceRequestEvents: [],
  operationsJobEvents: [],
  serviceSignoffs: [],
  operationalUsers: [],
  workCenters: [],
  serviceRequestEditorOpen: false,
  serviceRequestFormError: "",
  operationsBoardRole: "service_controller",
  operationsBackendConfigured: false,
  operationsLoading: false,
  rigQuoteFiles: {},
  stock: {},
  touches: {},
  tooling: { query: "", scope: "All", builder: "", filters: {}, selectedId: "", browseOpen: false },
  customerTooling: { query: "", scope: "All", builder: "", filters: {}, selectedId: "", browseOpen: false },
  prospectResults: [],
  prospectParams: { territory: "Midwest", market: "All", radius: "100", keywords: "drilling geotechnical", visual: true },
  workflowTraining: { scenarioId: "first-call", messages: [], matchedKcs: ["KC001"] },
  activeCalibrationScenario: "",
  identity: null,
  calibAdminUnlocked: false,
  calibView: "scenarios",
  calibResults: [],
  calibLocks: {},
  advancedSearch: { type: "items", field: "description", operator: "contains", value: "" },
  advSearchTimer: null,
  quoteListOpen: { master: true, mine: true },
  activeQuoteId: "",
  quoteSearchTerm: "",
  quoteSearchTimer: null,
  rigSalesEditor: null,
  calibrationCustomerId: "",
  rigSpecModel: "B25",
  bom: { serial: "2025023", section: "", query: "", selectedPart: "" },
  toastTimer: null,
  searchTimer: null,
  reports: null,
  reportsLoading: false,
  knownCustomers: [],
  knownCustomersConfigured: false,
  knownCustomersLoaded: false,
  bootDurationMs: null,
  gpSyncStatus: null,
  gpSyncStatusLoading: false,
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
    code: normalize(name).replace(/\s+/g, "").toUpperCase().slice(0, 15),
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
  { company: "GeoDynamics Inc.", territory: "Midwest", state: "Indiana", market: "Geotechnical", distance: 24, tags: "drilling geotechnical spt soil boring", domain: "geodynamics.example.invalid", equipment: "Truck-mounted drill rig observed", possibleModel: "Mobile Drill B57", confidence: "High", evidence: "Fleet page image with Mobile Drill decal", ownership: "Ownership unconfirmed" },
  { company: "Vertex Geo Services", territory: "Midwest", state: "Indiana", market: "Environmental", distance: 63, tags: "drilling environmental geotechnical sampling", domain: "vertexgeo.example.invalid", equipment: "Drill operation indicated", possibleModel: "Make/model unclear", confidence: "Medium", evidence: "Project gallery image", ownership: "Ownership unconfirmed" },
  { company: "Midwest Subsurface Group", territory: "Midwest", state: "Indiana", market: "Geotechnical", distance: 88, tags: "drilling geotechnical spt subsurface", domain: "midwestsubsurface.example.invalid", equipment: "Two drill rigs observed", possibleModel: "Possible B57 and crawler rig", confidence: "Medium", evidence: "Public equipment gallery", ownership: "Ownership unconfirmed" },
  { company: "Buckeye Soil & Core", territory: "Midwest", state: "Ohio", market: "Geotechnical", distance: 141, tags: "drilling geotechnical soil core", domain: "buckeyesoil.example.invalid", equipment: "Drilling equipment observed", possibleModel: "Brand unknown", confidence: "Low", evidence: "Homepage project image", ownership: "Ownership unconfirmed" },
  { company: "River Valley Environmental", territory: "Southeast", state: "Kentucky", market: "Environmental", distance: 176, tags: "drilling environmental sampling", domain: "rivervalleyenv.example.invalid", equipment: "No equipment visible", possibleModel: "None identified", confidence: "Low", evidence: "No qualifying public image", ownership: "Not established" },
  { company: "Great Lakes Test Borings", territory: "Midwest", state: "Michigan", market: "Geotechnical", distance: 232, tags: "drilling geotechnical test boring spt", domain: "greatlakestest.example.invalid", equipment: "Mobile Drill equipment observed", possibleModel: "Possible B37X", confidence: "Medium", evidence: "Services page image and visible mast decal", ownership: "Ownership unconfirmed" },
  { company: "New England Geo Drilling", territory: "Northeast", state: "Massachusetts", market: "Geotechnical", distance: 72, tags: "drilling geotechnical spt soil boring", domain: "newenglandgeo.example.invalid", equipment: "Truck-mounted drill observed", possibleModel: "Brand unclear", confidence: "Low", evidence: "Public project gallery", ownership: "Ownership unconfirmed" },
  { company: "Carolina Site Testing", territory: "Southeast", state: "North Carolina", market: "Geotechnical", distance: 94, tags: "drilling geotechnical site testing spt", domain: "carolinasite.example.invalid", equipment: "Two geotechnical rigs observed", possibleModel: "Possible Mobile Drill equipment", confidence: "Medium", evidence: "Fleet page images", ownership: "Ownership unconfirmed" },
  { company: "Desert Core Services", territory: "Southwest", state: "Arizona", market: "Environmental", distance: 81, tags: "drilling environmental geotechnical coring", domain: "desertcore.example.invalid", equipment: "Crawler drill observed", possibleModel: "Brand unclear", confidence: "Low", evidence: "Services page image", ownership: "Ownership unconfirmed" },
  { company: "Pacific Geo Borings", territory: "West", state: "California", market: "Geotechnical", distance: 67, tags: "drilling geotechnical test boring spt", domain: "pacificgeo.example.invalid", equipment: "Mobile Drill mast decal observed", possibleModel: "Possible B37X", confidence: "Medium", evidence: "Public project photo", ownership: "Ownership unconfirmed" },
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

// The public portfolio build intentionally carries no employee roster or
// browser-side admin credential. Authenticated staff identities belong in the
// future internal deployment, not in a publicly downloadable JavaScript file.
const calibIdentityGateEnabled = false;

const calibrationAdminPin = "";
const calibrationReps = [publicDemoIdentity];

const calibrationTrainingScenarios = [
  {
    id: "normal-appointment",
    title: "Normal Appointment",
    subtitle: "Baseline field workflow, no complications.",
    prompt: "Customer has one rig ready for calibration. Setup is normal — no refusal, no rapid advancement, and no failed pulse check occur.",
    items: [
      { type: "check", text: "Confirms rig, customer, borehole, driller, and tech information", correct: true },
      { type: "check", text: "Sets up the analyzer kit correctly", correct: true },
      { type: "check", text: "Enters the depth interval correctly", correct: true },
      { type: "check", text: "Measures and enters LP and LE", correct: true },
      { type: "check", text: "Confirms sensor connection", correct: true },
      { type: "check", text: "Runs the pulse check before live collection", correct: true },
      { type: "check", text: "Starts collection only after setup is ready", correct: true },
      { type: "check", text: "Records 6-inch blow counts", correct: true },
      { type: "check", text: "Ends the test properly", correct: true },
      { type: "check", text: "Completes the calibration log", correct: true },
      { type: "check", text: "Hands off data correctly", correct: true },
      { type: "blank", text: "What is the standard SPT hammer drop height, in inches?", accepted: ["30", "30 inches", "thirty inches"], note: "Module 001: standard SPT hammer drop height is 30 inches." },
      { type: "blank", text: "What is the standard slug weight used for calibration, in pounds?", accepted: ["140", "140 lb", "140 lbs", "140 pounds"], note: "Module 001: slug weight is usually 140 lb unless it's a special case." },
      {
        type: "order",
        text: "Put these phases of a normal calibration appointment in the correct order.",
        note: "Module 001 job-flow phases were not in the correct order — review the scheduling-to-handoff sequence.",
        steps: [
          { text: "Save and review each run before moving on", correctPosition: 5 },
          { text: "Confirm rig/hammer setup and site readiness", correctPosition: 1 },
          { text: "Complete the calibration log and hand off the data", correctPosition: 6 },
          { text: "Create the data file and enter LP, LE, drop height, and slug weight", correctPosition: 2 },
          { text: "Collect data at the required depth intervals", correctPosition: 4 },
          { text: "Confirm sensor connection and run the pulse check", correctPosition: 3 },
        ],
      },
    ],
  },
  {
    id: "failed-pulse-check",
    title: "Failed Pulse Check",
    subtitle: "Analyzer hardware trouble before collection starts.",
    prompt: "The pulse check does not produce the expected graph/ping.",
    items: [
      { type: "check", text: "Holds off starting live data collection until the pulse check passes", correct: true },
      { type: "check", text: "Reconnects and checks cables", correct: true },
      { type: "check", text: "Checks sensor and pigtail connections", correct: true },
      { type: "check", text: "Restarts the software completely", correct: true },
      { type: "check", text: "Replaces accelerometers/sensors with backups if needed", correct: true },
      { type: "check", text: "Reruns the pulse check before proceeding", correct: true },
      { type: "check", text: "Escalates to the office if backup sensors also fail the pulse check", correct: true },
      { type: "check", text: "Starts live data collection anyway since the hammer is already running", correct: false, note: "Retrain/retest trigger (Module 010): starting collection after a failed pulse check." },
      { type: "check", text: "Keeps guessing at the cause after backup sensors also fail, without calling the office", correct: false, note: "Retrain/retest trigger (Module 010): continuing to guess instead of escalating once backups also fail the pulse check." },
      {
        type: "order",
        text: "Put the failed pulse-check troubleshooting steps in the correct order.",
        note: "Module 010 troubleshooting order was wrong — cables and connections get checked before a full software restart, and backups come before escalation.",
        steps: [
          { text: "Escalate to the office if backup sensors also fail", correctPosition: 6 },
          { text: "Reconnect and check cables", correctPosition: 1 },
          { text: "Rerun the pulse check", correctPosition: 5 },
          { text: "Check sensor and pigtail connections", correctPosition: 2 },
          { text: "Replace accelerometers/sensors with backups if needed", correctPosition: 4 },
          { text: "Restart the software completely", correctPosition: 3 },
        ],
      },
    ],
  },
  {
    id: "refusal",
    title: "Refusal",
    subtitle: "Sampler will not advance a full interval.",
    prompt: "The sampler does not advance a full 6 inches in 50 blows.",
    items: [
      { type: "check", text: "Recognizes refusal", correct: true },
      { type: "check", text: "Records the blow count", correct: true },
      { type: "check", text: "Records actual advancement", correct: true },
      { type: "check", text: "Documents the depth interval", correct: true },
      { type: "check", text: "Communicates the issue professionally", correct: true },
      { type: "check", text: "Follows the field decision or escalation path", correct: true },
      { type: "check", text: "Treats the run as normal clean calibration data and moves on to the next depth", correct: false, note: "Module 010 pass standard: refusal data must never be treated as normal clean calibration data." },
      { type: "blank", text: "Refusal is the sampler not advancing a full 6 inches in how many blows?", accepted: ["50", "50 blows", "fifty blows"], note: "Module 010: refusal is defined as not advancing a full 6 inches in 50 blows." },
    ],
  },
  {
    id: "rapid-advancement",
    title: "Rapid Advancement / Rod Risk",
    subtitle: "Instrumented rod at risk of entering the borehole.",
    prompt: "During the first few blows, the sampler advances quickly and the instrumented rod is at risk of entering the hollow stem auger or borehole.",
    items: [
      { type: "check", text: "Watches the first 6 blows closely", correct: true },
      { type: "check", text: "Stops hammer operation before the instrumented rod enters the HSA or borehole", correct: true },
      { type: "check", text: "Protects sensors and the instrumented rod", correct: true },
      { type: "check", text: "Communicates clearly with the operator", correct: true },
      { type: "check", text: "Documents the rapid advancement", correct: true },
      { type: "check", text: "Corrects setup or selects another interval if appropriate", correct: true },
      { type: "check", text: "Escalates if damage is suspected", correct: true },
      { type: "check", text: "Lets the driller keep hammering while checking on the instrumented rod", correct: false, note: "Mandatory retrain/retest trigger (Module 010): allowing hammering to continue while the instrumented rod is at risk." },
    ],
  },
  {
    id: "depth-blow-count",
    title: "Wrong Depth Interval / Missing Blow Counts",
    subtitle: "Software interval doesn't match what actually happened.",
    prompt: "The trainee entered a 20.0-22.0 ft interval, but the sampler only advanced to 21.5 ft — or the 6-inch blow counts weren't recorded.",
    items: [
      { type: "check", text: "Recognizes the interval mismatch", correct: true },
      { type: "check", text: "Corrects documentation on site", correct: true },
      { type: "check", text: "Collects another proper data set if needed and possible", correct: true },
      { type: "check", text: "Records 6-inch blow counts", correct: true },
      { type: "check", text: "Documents what happened", correct: true },
      { type: "check", text: "Says the software total is close enough and skips the 6-inch increments", correct: false, note: "Mandatory retrain/retest trigger (Module 010): the software total is not enough by itself without documented 6-inch increments." },
      { type: "blank", text: "Blow counts must be recorded in what increment, in inches?", accepted: ["6", "6 inches", "six inches"], note: "Module 010: blow counts are recorded in 6-inch increments — the software total alone is not enough." },
    ],
  },
  {
    id: "customer-pressure",
    title: "Customer Pressure / Do-Not-Promise",
    subtitle: "Driller wants a same-day pass/fail answer.",
    prompt: "Customer says: “We just need the paperwork. Can you tell us if the hammer is above 60 today and get the report sent over?”",
    approvedLanguage: "We are checking how much hammer energy is actually getting into the drill rods so your SPT blow counts can be corrected to the N60 standard and used with confidence.",
    items: [
      { type: "check", text: "Uses the approved plain-language explanation instead of calling it paperwork", correct: true },
      { type: "check", text: "Explains calibration as energy-transfer measurement", correct: true },
      { type: "check", text: "States the standard report delivery expectation (within 3 days) when appropriate", correct: true },
      { type: "check", text: "Routes the urgency to the qualified report handler", correct: true },
      { type: "check", text: "Protects data quality despite the pressure", correct: true },
      { type: "check", text: "Tells the customer the hammer is already above 60", correct: false, note: "Do-not-promise rule (Module 008): never predict a specific energy percentage before the data is reviewed." },
      { type: "check", text: "Promises the report will go out today", correct: false, note: "Do-not-promise rule (Module 008): standard delivery is 3 days unless the qualified report handler confirms otherwise." },
      { type: "check", text: "Agrees it's basically just paperwork to keep things moving", correct: false, note: "Module 008: calibration is measurement, documentation, compliance, and customer-confidence support — never “just paperwork.”" },
      { type: "blank", text: "In your own words, what are we actually checking during calibration? (mention energy and N60)", keywords: ["energy", "n60"], note: "Module 008 approved explanation: we're checking how much hammer energy is getting into the drill rods so blow counts can be corrected to N60." },
    ],
  },
  {
    id: "report-handoff",
    title: "Report Handoff Problem",
    subtitle: "Field record has a gap the report builder can't fill.",
    prompt: "Data collection is complete, but the calibration log is incomplete and the report builder can't tell what happened at one interval.",
    items: [
      { type: "check", text: "Confirms the analyzer data file exists", correct: true },
      { type: "check", text: "Confirms the calibration log is complete", correct: true },
      { type: "check", text: "Verifies depth interval, LP, LE, and blow counts", correct: true },
      { type: "check", text: "Adds field notes while the details are still fresh", correct: true },
      { type: "check", text: "Provides photos/video if the issue affected calibration data", correct: true },
      { type: "check", text: "Routes clarification to the qualified report handler", correct: true },
      { type: "check", text: "Hands off the incomplete log as-is since the analyzer data file itself is fine", correct: false, note: "Module 001/010: report builders cannot complete the package if the field record is incomplete — gaps get closed before handoff, not guessed at afterward." },
      { type: "blank", text: "Besides the analyzer data file, what should the tech add while the details are still fresh?", keywords: ["field", "notes"], note: "Module 001/007: field notes need to be added while details are still fresh so the report builder isn't left guessing." },
    ],
  },
  {
    id: "equipment-damage",
    title: "Equipment Damage Distinction",
    subtitle: "Accelerometer vs. suspected strain gauge damage.",
    prompt: "An accelerometer appears damaged during a job. Variant: strain gauge damage is suspected.",
    items: [
      { type: "check", text: "Checks for cable or connector damage", correct: true },
      { type: "check", text: "Replaces the accelerometer with a backup if available", correct: true },
      { type: "check", text: "Reruns the pulse check before continuing", correct: true },
      { type: "check", text: "Calls the office and documents the damage", correct: true },
      { type: "check", text: "Treats any suspected strain gauge damage as an immediate stop, not field-repairable", correct: true },
      { type: "check", text: "Routes suspected strain gauge damage through the drill manager / senior authority path", correct: true },
      { type: "check", text: "Continues collecting data on a suspected damaged strain gauge without calling it in", correct: false, note: "Module 010: suspected strain gauge damage must never be treated as field-replaceable — stop and call the office immediately." },
    ],
  },
];

const workspaceEntries = [
  ["Customer Profile", "Customer workspace", "customer", "customer client account company"],
  ["Items", "Part master and operational facts", "items", "item items part number card master revision vendor drawing"],
  ["Tooling", "Full catalog and CTS search", "tooling", "tooling drive cap split spoon hsa auger hex cor moyno drill rod"],
  ["Quote Builder", "Shared team quotes, GP-style layout", "quotes", "quote pricing estimate builder"],
  ["Orders", "Open orders, shipped and backorder tracking", "orders", "order orders open backorder shipped fulfillment"],
  ["Build Requests", "Sales demand sent to Production Control", "buildRequests", "build request production tracking sales demand"],
  ["Service Requests", "Field and office service intake with lifecycle tracking", "serviceRequests", "service request field rig machine down warranty repair"],
  ["Operations Board", "Combined gatekeeper queue, capacity, and exceptions", "operationsBoard", "operations gatekeeper service production schedule bay capacity exception"],
  ["Production Control", "Gatekeeper queue, commitments, and shop direction", "productionControl", "gatekeeper production schedule assign priority release"],
  ["Build Orders", "Controlled shop execution and finished output", "builds", "build manufacturing production order shop components"],
  ["Inventory", "Editable GP-field demo", "inventory", "inventory stock available on hand allocated bin price"],
  ["Rig / BOM View", "B57 and B37X serial BOMs", "bom", "rig bom serial assembly parts bill material b57 b37x"],
  ["Calibration", "Calibration history, schedule, and quote", "calibration", "calibration hammer schedule certificate"],
  ["Rig Sales", "Rig opportunities and follow-up", "rigSales", "rig sales opportunity demonstration pipeline"],
  ["New Prospect Search", "Rule-controlled prospect discovery", "prospects", "prospect search internet company equipment"],
  ["Daily Call List", "90-day customer touch queue", "callList", "dormant overdue follow up call"],
  ["Calibration Training", "Calibration practice workspace", "calibrationTraining", "training calibration practice"],
  ["Workflow Training", "Customer-call practice", "workflowTraining", "training workflow rookie knowledge chapter"],
  ["System & Sync", "App health and read-only GP synchronization", "systemSync", "system sync gp read only health offline installed pwa"],
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
  try { return JSON.parse(localStorage.getItem(storageKey(key))) ?? fallback; } catch { return fallback; }
}

function safeSave(key, value) {
  try { localStorage.setItem(storageKey(key), JSON.stringify(value)); } catch { /* demo still works without persistence */ }
}

function operationsSnapshot() {
  return {
    serviceRequests: state.serviceRequests,
    serviceWorkOrders: state.serviceWorkOrders,
    operationsJobs: state.operationsJobs,
    operationsJobAssignments: state.operationsJobAssignments,
    operationsJobCheckpoints: state.operationsJobCheckpoints,
    operationsCheckpointDefinitions: state.operationsCheckpointDefinitions,
    serviceRequestEvents: state.serviceRequestEvents,
    operationsJobEvents: state.operationsJobEvents,
    serviceSignoffs: state.serviceSignoffs,
    operationalUsers: state.operationalUsers,
    workCenters: state.workCenters,
  };
}

function applyOperationsSnapshot(snapshot = {}) {
  for (const key of Object.keys(operationsSnapshot())) {
    state[key] = Array.isArray(snapshot[key]) ? snapshot[key] : [];
  }
}

function saveOperationsSnapshot() {
  if (isPublicDemo) safeSave("mdb-demo-operations-v2", operationsSnapshot());
}

function operationsDemoTimestamp(daysFromNow = 0, hour = 12) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function ensureOperationsDemo() {
  if (!isPublicDemo || state.serviceRequests.length || state.operationsJobs.length) return;
  state.workCenters = [
    { id: "service-bay-1", code: "SB-01", name: "Service Bay 1", center_type: "service_bay", capacity: 1 },
    { id: "service-bay-2", code: "SB-02", name: "Service Bay 2", center_type: "service_bay", capacity: 1 },
    { id: "field-service-1", code: "FIELD", name: "Field Service", center_type: "field", capacity: 3 },
    { id: "assembly-cell-b", code: "ASM-B", name: "Assembly Cell B", center_type: "build_bay", capacity: 1 },
  ];
  state.operationalUsers = [
    { id: "demo-service-controller", display_name: "Service Controller", initials: "SC", operational_user_roles: [{ role: "service_controller" }] },
    { id: "demo-service-technician", display_name: "Service Technician", initials: "TECH", operational_user_roles: [{ role: "service_technician" }] },
  ];
  state.serviceRequests = [
    {
      id: "demo-service-request-machine-down", request_number: "SRQ001001", source_channel: "Mobile",
      requester_user_id: "demo-field-requester", requester_name: "Field Service Technician", urgency: "Machine Down",
      customer_name_snapshot: "Midwest Geotechnical", service_location: "Fort Wayne, IN",
      customer_contact_snapshot: "Site superintendent", asset_id: "RIG-B57-042", production_serial: "B57-2021-042",
      rig_model: "B57", drill_hours: 2840, complaint: "Rotary head stopped under load; crew is shut down.",
      requested_work: "Diagnose failure, identify required parts, and provide the fastest recovery path.",
      financial_class: "Unknown", service_mode: "Field", status: "Submitted",
      submitted_at: operationsDemoTimestamp(-1, 9), created_at: operationsDemoTimestamp(-1, 9), updated_at: operationsDemoTimestamp(-1, 9),
    },
    {
      id: "demo-service-request-scheduled", request_number: "SRQ001000", source_channel: "Email",
      requester_user_id: "demo-service-requester", requester_name: "Inside Service", urgency: "Priority",
      gatekeeper_user_id: "demo-service-controller", customer_name_snapshot: "Atlas Environmental",
      service_location: "MDB Service Shop", customer_contact_snapshot: "Fleet manager",
      asset_id: "RIG-B37X-018", production_serial: "B37X-2019-018", rig_model: "B37X", drill_hours: 3915,
      complaint: "Feed cylinder drifts after warm-up.", requested_work: "Inspect hydraulic circuit and repair confirmed cause.",
      financial_class: "Billable", service_mode: "In House", status: "Converted",
      submitted_at: operationsDemoTimestamp(-5, 10), triaged_at: operationsDemoTimestamp(-4, 9),
      accepted_at: operationsDemoTimestamp(-4, 11), converted_at: operationsDemoTimestamp(-4, 13),
      created_at: operationsDemoTimestamp(-5, 10), updated_at: operationsDemoTimestamp(-2, 14),
    },
  ];
  state.operationsJobs = [{
    id: "demo-service-job-scheduled", job_number: "OPJ001000", job_type: "service_job", status: "Scheduled",
    title: "B37X-2019-018 · Hydraulic drift diagnosis", controller_user_id: "demo-service-controller",
    assignee_user_id: "demo-service-technician", assignee_name: "Service Technician", priority: 2,
    work_center_id: "service-bay-1", planned_start_at: operationsDemoTimestamp(1, 8),
    committed_due_at: operationsDemoTimestamp(2, 16), gp_link_status: "Pending", exception_code: null,
    exception_detail: "", created_at: operationsDemoTimestamp(-4, 13), updated_at: operationsDemoTimestamp(-2, 14),
  }];
  state.serviceWorkOrders = [{
    id: "demo-service-work-order", work_order_number: "SWRK001000",
    service_request_id: "demo-service-request-scheduled", operations_job_id: "demo-service-job-scheduled",
    scope_version: 1, scope_summary: "Diagnose feed-cylinder drift, document cause, repair, test, and capture customer acceptance.",
    created_at: operationsDemoTimestamp(-4, 13),
  }];
  state.operationsJobAssignments = [{
    id: 1, job_id: "demo-service-job-scheduled", work_center_id: "service-bay-1", slot_number: 1,
    starts_at: operationsDemoTimestamp(1, 8), ends_at: operationsDemoTimestamp(2, 16), revision: 1,
    reason: "Customer delivery and bay availability", created_at: operationsDemoTimestamp(-2, 14), superseded_at: null,
  }];
  state.operationsJobCheckpoints = [
    ["before_photos", "Before photos captured", "service_technician", "Complete", "Arrival condition documented."],
    ["safety_functions", "Safety functions confirmed", "service_technician", "Complete", "Emergency and guarding checks recorded."],
    ["service_inspection", "Inspection complete", "service_technician", "Pending", ""],
    ["after_photos", "Repair evidence captured", "service_technician", "Pending", ""],
    ["final_clean", "Final clean complete", "service_technician", "Pending", ""],
    ["shipping_pickup", "Shipping or pickup ready", "service_controller", "Pending", ""],
  ].map(([checkpoint_key, checkpoint_name, owner_role, status, evidence_note], index) => ({
    job_id: "demo-service-job-scheduled", checkpoint_key, checkpoint_name, checkpoint_version: 1,
    sequence: index + 1, owner_role, status, evidence_note, blocker_detail: "",
  }));
  state.serviceRequestEvents = [
    { event_key: "demo-sre-1", service_request_id: "demo-service-request-machine-down", event_type: "Submitted", summary: "Submitted for service triage", detail: "Machine-down alert sent from mobile.", created_at: operationsDemoTimestamp(-1, 9) },
    { event_key: "demo-sre-2", service_request_id: "demo-service-request-scheduled", event_type: "Converted", summary: "Service Work Order created", detail: "Request accepted and separated into controlled execution records.", created_at: operationsDemoTimestamp(-4, 13) },
  ];
  state.operationsJobEvents = [{
    event_key: "demo-oje-1", job_id: "demo-service-job-scheduled", event_type: "Scheduled",
    summary: "Service Bay 1 committed", detail: "Scheduled against bay capacity.", created_at: operationsDemoTimestamp(-2, 14),
  }];
  saveOperationsSnapshot();
}

async function loadOperations() {
  if (isPublicDemo) {
    applyOperationsSnapshot(safeLoad("mdb-demo-operations-v2", {}));
    ensureOperationsDemo();
    return;
  }
  state.operationsLoading = true;
  try {
    const response = await fetch("/api/operations/jobs", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Operations API returned ${response.status}`);
    const payload = await response.json();
    applyOperationsSnapshot(payload);
    state.operationsBackendConfigured = true;
  } catch {
    state.operationsBackendConfigured = false;
  } finally {
    state.operationsLoading = false;
  }
}

async function postOperationsAction(payload) {
  if (isPublicDemo) return null;
  const response = await fetch("/api/operations/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "The operations change was not accepted.");
  await loadOperations();
  return result;
}

function renderActiveOperationsWorkspace() {
  if (state.activeWorkspace === "serviceRequests") renderServiceRequestsWorkspace();
  if (state.activeWorkspace === "operationsBoard") renderOperationsBoardWorkspace();
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

function saveIdentity() {
  safeSave("mdb-demo-identity", state.identity);
}

function saveCalibResults() {
  safeSave("mdb-demo-calib-results", state.calibResults);
}

function saveCalibLocks() {
  safeSave("mdb-demo-calib-locks", state.calibLocks);
}

function calibLockKey(repInitials, scenarioId) {
  return `${repInitials}::${scenarioId}`;
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

function newQuote(overrides = {}) {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const identity = state.identity;
  const now = new Date().toISOString();
  const customer = customers.find((item) => item.id === state.selectedCustomerId);
  return {
    id: `quote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    number: `DEMO-${stamp}-${String(state.quotes.length + 1).padStart(3, "0")}`,
    masterNo: null,
    customerId: state.selectedCustomerId || "", customerPo: "", salesperson: "",
    workflow: "General", terms: "Net 30", shipVia: "Best Way",
    shipToContact: customer?.contact || "", shipToAddress: customer?.address || "",
    reqShipDate: "", notes: "", misc: 0, freight: 0, tradeDiscount: 0, lines: [],
    status: "Open",
    originatorInitials: identity?.initials || "", originatorName: identity?.name || "",
    lastModifiedByInitials: identity?.initials || "", lastModifiedByName: identity?.name || "",
    createdAt: now, lastModifiedAt: now,
    ...overrides,
  };
}

function newOrder(overrides = {}) {
  const identity = state.identity;
  const now = new Date().toISOString();
  const customer = customers.find((item) => item.id === state.selectedCustomerId);
  const order = {
    id: `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    orderNumber: "",
    masterNo: null,
    convertedFromQuoteId: null,
    customerId: state.selectedCustomerId || "", customerPo: "", salesperson: "",
    terms: "Net 30", shipVia: "Best Way",
    shipToContact: customer?.contact || "", shipToAddress: customer?.address || "",
    reqShipDate: "", notes: "", misc: 0, freight: 0, tradeDiscount: 0, lines: [],
    weightLbs: 0, lengthIn: 0, widthIn: 0, heightIn: 0,
    locationCode: "MAIN",
    status: "Open",
    releasedAt: null, releasedByInitials: "", releasedByName: "", closedAt: null,
    events: [],
    originatorInitials: identity?.initials || "", originatorName: identity?.name || "",
    lastModifiedByInitials: identity?.initials || "", lastModifiedByName: identity?.name || "",
    createdAt: now, lastModifiedAt: now,
    ...overrides,
  };
  if (!order.events.length) recordOrderEvent(order, "Created", "Order created", "Open for entry and review.");
  return normalizeOrder(order);
}

function newDocumentLineKey(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function recordOrderEvent(order, type, summary, detail = "") {
  const identity = state.identity || publicDemoIdentity;
  order.events ||= [];
  order.events.unshift({
    key: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    summary,
    detail,
    actorInitials: identity?.initials || "",
    actorName: identity?.name || "",
    createdAt: new Date().toISOString(),
  });
}

function normalizeOrder(order) {
  order.locationCode ||= "MAIN";
  order.events = Array.isArray(order.events) ? order.events : [];
  order.releasedAt ||= null;
  order.releasedByInitials ||= "";
  order.releasedByName ||= "";
  order.closedAt ||= null;
  order.lines = (Array.isArray(order.lines) ? order.lines : []).map((line) => ({
    ...line,
    lineKey: line.lineKey || newDocumentLineKey("order-line"),
    quantity: Math.max(1, Number(line.quantity) || 1),
    reservedQty: Math.max(0, Number(line.reservedQty) || 0),
    qtyToShip: Math.max(0, Number(line.qtyToShip) || 0),
    shippedQty: Math.max(0, Number(line.shippedQty) || 0),
    qtyToInvoice: Math.max(0, Number(line.qtyToInvoice) || 0),
    invoicedQty: Math.max(0, Number(line.invoicedQty) || 0),
    backorderQty: Math.max(0, Number(line.backorderQty) || 0),
  }));
  return order;
}

async function loadQuotes() {
  if (isPublicDemo) {
    state.quotesBackendConfigured = false;
    loadQuotesFromLocal();
    return;
  }
  try {
    const response = await fetch("/.netlify/functions/quotes-list");
    if (response.ok) {
      const data = await response.json();
      if (data.configured) {
        // Merge rather than replace: a quote created locally in the last
        // few hundred ms may not have finished its debounced save yet, so
        // it won't be in this response -- don't let a slow-arriving refresh
        // wipe out a rep's just-created quote out from under them.
        const serverIds = new Set(data.quotes.map((quote) => quote.id));
        const unsavedLocal = state.quotes.filter((quote) => !serverIds.has(quote.id));
        state.quotes = [...unsavedLocal, ...data.quotes];
        state.quotesBackendConfigured = true;
        saveQuotes();
        return;
      }
    }
  } catch {
    // backend unreachable -- fall through to the local copy
  }
  state.quotesBackendConfigured = false;
  loadQuotesFromLocal();
}

function loadQuotesFromLocal() {
  const saved = safeLoad("mdb-demo-quotes", null);
  if (Array.isArray(saved)) { state.quotes = saved; return; }
  const legacy = safeLoad("mdb-demo-quote", null);
  const now = new Date().toISOString();
  state.quotes = legacy && Array.isArray(legacy.lines) ? [{
    id: `quote-${Date.now()}-legacy`,
    number: legacy.number || "LEGACY-DRAFT",
    customerId: legacy.customerId || "", customerPo: legacy.customerPo || "", salesperson: legacy.salesperson || "",
    workflow: legacy.workflow || "General", terms: legacy.terms || "Net 30", shipVia: legacy.shipVia || "Best way",
    notes: legacy.notes || "", freight: legacy.freight || 0, taxRate: legacy.taxRate || 0, lines: legacy.lines || [],
    status: "Open", originatorInitials: "", originatorName: "Legacy draft", lastModifiedByInitials: "", lastModifiedByName: "",
    createdAt: now, lastModifiedAt: now,
  }] : [];
  saveQuotes();
}

function saveQuotes() {
  safeSave("mdb-demo-quotes", state.quotes);
}

async function pushQuoteToBackend(quote) {
  if (isPublicDemo) return;
  try {
    const response = await fetch("/.netlify/functions/quotes-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(quote),
    });
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    state.quotesBackendConfigured = data.configured !== false;
    if (data.masterNo != null && quote.masterNo == null) {
      quote.masterNo = data.masterNo;
      saveQuotes();
      if (state.activeQuoteId === quote.id && !elements.quoteModal.hidden) renderQuoteModal();
    }
  } catch {
    // offline or backend unreachable -- the local copy already saved via saveQuotes()
  }
}

function requireIdentity(callback) {
  if (isPublicDemo) {
    state.identity = { ...publicDemoIdentity };
    callback();
    return;
  }
  if (state.identity) { callback(); return; }
  openIdentityPicker(callback);
}

async function loadOrders() {
  if (isPublicDemo) {
    state.ordersBackendConfigured = false;
    state.orders = safeLoad("mdb-demo-orders", []).map(normalizeOrder);
    return;
  }
  try {
    const response = await fetch("/.netlify/functions/orders-list");
    if (response.ok) {
      const data = await response.json();
      if (data.configured) {
        // Same merge-not-replace reasoning as loadQuotes() -- don't let a
        // slow-arriving refresh wipe out an order created moments ago whose
        // debounced save hasn't landed yet.
        const serverIds = new Set(data.orders.map((order) => order.id));
        const unsavedLocal = state.orders.filter((order) => !serverIds.has(order.id));
        state.orders = [...unsavedLocal, ...data.orders].map(normalizeOrder);
        state.ordersBackendConfigured = true;
        saveOrders();
        return;
      }
    }
  } catch {
    // backend unreachable -- fall through to the local copy
  }
  state.ordersBackendConfigured = false;
  state.orders = safeLoad("mdb-demo-orders", []).map(normalizeOrder);
}

function saveOrders() {
  safeSave("mdb-demo-orders", state.orders);
}

async function pushOrderToBackend(order) {
  if (isPublicDemo) return;
  try {
    const response = await fetch("/.netlify/functions/orders-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    });
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    state.ordersBackendConfigured = data.configured !== false;
    let changed = false;
    if (data.orderNumber && !order.orderNumber) { order.orderNumber = data.orderNumber; changed = true; }
    if (data.masterNo != null && order.masterNo == null) { order.masterNo = data.masterNo; changed = true; }
    if (changed) {
      saveOrders();
      if (state.activeOrderId === order.id && !elements.orderModal.hidden) renderOrderModal();
    }
  } catch {
    // offline or backend unreachable -- the local copy already saved via saveOrders()
  }
}

function activeOrder() {
  return state.orders.find((order) => order.id === state.activeOrderId) || null;
}

function touchOrder(order) {
  order.lastModifiedAt = new Date().toISOString();
  if (state.identity) { order.lastModifiedByInitials = state.identity.initials; order.lastModifiedByName = state.identity.name; }
  saveOrders();
  clearTimeout(state.orderSaveTimer);
  state.orderSaveTimer = setTimeout(() => pushOrderToBackend(order), 600);
}

function newBuild(overrides = {}) {
  const identity = state.identity;
  const now = new Date().toISOString();
  const build = {
    id: `build-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    buildNumber: "",
    itemId: null, part: "", description: "", uom: "EA",
    quantity: 1, builtQty: 0, dueDate: "", locationCode: "MAIN",
    status: "Open", notes: "",
    releasedAt: null, releasedByInitials: "", releasedByName: "", finishedAt: null,
    buildRequestId: null, controllerName: "", shopAssigneeName: "",
    priority: 3, requestedDueDate: "", committedDueDate: "",
    exceptionCode: null, exceptionDetail: "", revision: 1,
    components: [], events: [],
    originatorInitials: identity?.initials || "", originatorName: identity?.name || "",
    lastModifiedByInitials: identity?.initials || "", lastModifiedByName: identity?.name || "",
    createdAt: now, lastModifiedAt: now,
    ...overrides,
  };
  if (!build.events.length) recordBuildEvent(build, "Created", "Build order created", "Open for entry and review.");
  return normalizeBuild(build);
}

function recordBuildEvent(build, type, summary, detail = "") {
  const identity = state.identity || publicDemoIdentity;
  build.events ||= [];
  build.events.unshift({
    key: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type, summary, detail,
    actorInitials: identity?.initials || "",
    actorName: identity?.name || "",
    createdAt: new Date().toISOString(),
  });
}

function normalizeBuild(build) {
  build.locationCode ||= "MAIN";
  build.events = Array.isArray(build.events) ? build.events : [];
  build.releasedAt ||= null;
  build.releasedByInitials ||= "";
  build.releasedByName ||= "";
  build.finishedAt ||= null;
  build.buildRequestId ||= null;
  build.controllerName ||= "";
  build.shopAssigneeName ||= "";
  build.priority = Math.min(5, Math.max(1, Number(build.priority) || 3));
  build.requestedDueDate ||= "";
  build.committedDueDate ||= build.dueDate || "";
  build.exceptionCode ||= null;
  build.exceptionDetail ||= "";
  build.revision = Math.max(1, Number(build.revision) || 1);
  build.quantity = Math.max(1, Number(build.quantity) || 1);
  build.builtQty = Math.max(0, Math.min(build.quantity, Number(build.builtQty) || 0));
  build.components = (Array.isArray(build.components) ? build.components : []).map((line) => ({
    ...line,
    componentKey: line.componentKey || newDocumentLineKey("build-component"),
    qtyRequired: Math.max(0, Number(line.qtyRequired) || 0),
    qtyReserved: Math.max(0, Number(line.qtyReserved) || 0),
    qtyConsumed: Math.max(0, Number(line.qtyConsumed) || 0),
  }));
  return build;
}

async function loadBuilds() {
  if (isPublicDemo) {
    state.buildsBackendConfigured = false;
    state.builds = safeLoad("mdb-demo-builds", []).map(normalizeBuild);
    return;
  }
  try {
    const response = await fetch("/.netlify/functions/build-orders-list");
    if (response.ok) {
      const data = await response.json();
      if (data.configured) {
        // Merge rather than replace: a build order created locally in the
        // last few hundred ms may not have finished its debounced save yet
        // -- don't let a slow-arriving refresh wipe it out.
        const serverIds = new Set(data.builds.map((build) => build.id));
        const unsavedLocal = state.builds.filter((build) => !serverIds.has(build.id));
        state.builds = [...unsavedLocal, ...data.builds].map(normalizeBuild);
        state.buildsBackendConfigured = true;
        saveBuilds();
        return;
      }
    }
  } catch {
    // backend unreachable -- fall through to the local copy
  }
  state.buildsBackendConfigured = false;
  state.builds = safeLoad("mdb-demo-builds", []).map(normalizeBuild);
}

function saveBuilds() {
  safeSave("mdb-demo-builds", state.builds);
}

async function pushBuildToBackend(build) {
  if (isPublicDemo) return;
  try {
    const response = await fetch("/.netlify/functions/build-orders-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(build),
    });
    if (!response.ok) return;
    const data = await response.json().catch(() => ({}));
    state.buildsBackendConfigured = data.configured !== false;
    if (data.buildNumber && !build.buildNumber) {
      build.buildNumber = data.buildNumber;
      saveBuilds();
      if (state.activeBuildId === build.id && !elements.buildModal.hidden) renderBuildModal();
    }
  } catch {
    // offline or backend unreachable -- the local copy already saved via saveBuilds()
  }
}

function activeBuild() {
  return state.builds.find((build) => build.id === state.activeBuildId) || null;
}

function touchBuild(build) {
  build.lastModifiedAt = new Date().toISOString();
  if (state.identity) { build.lastModifiedByInitials = state.identity.initials; build.lastModifiedByName = state.identity.name; }
  saveBuilds();
  clearTimeout(state.buildSaveTimer);
  state.buildSaveTimer = setTimeout(() => pushBuildToBackend(build), 600);
}

function productionActor(role) {
  return productionDemoActors[role] || productionDemoActors.sales;
}

function productionTimestamp(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

function recordBuildRequestEvent(request, type, summary, detail = "", actorRole = "sales") {
  const actor = productionActor(actorRole);
  request.events ||= [];
  request.events.unshift({
    key: `request-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    summary,
    detail,
    actorRole,
    actorInitials: actor.initials,
    actorName: actor.name,
    createdAt: new Date().toISOString(),
  });
}

function normalizeBuildRequest(request) {
  request.events = Array.isArray(request.events) ? request.events : [];
  request.status ||= "Draft";
  request.originatorName ||= "Sales Representative";
  request.originatorInitials ||= "SR";
  request.gatekeeperName ||= "";
  request.buildOrderId ||= null;
  request.requestedQuantity = Math.max(1, Number(request.requestedQuantity) || 1);
  request.requestedShipDate ||= "";
  request.customerRequirements ||= "";
  request.returnedReason ||= "";
  request.createdAt ||= new Date().toISOString();
  request.updatedAt ||= request.createdAt;
  return request;
}

function saveBuildRequests() {
  safeSave("mdb-demo-build-requests", state.buildRequests);
}

function loadBuildRequests() {
  state.buildRequests = safeLoad("mdb-demo-build-requests", []).map(normalizeBuildRequest);
}

function nextBuildRequestNumber() {
  const highest = state.buildRequests.reduce((max, request) => {
    const value = Number(String(request.requestNumber || "").replace(/\D/g, ""));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 999);
  return `BRQ${String(highest + 1).padStart(6, "0")}`;
}

function buildForRequest(request) {
  return state.builds.find((build) => build.id === request.buildOrderId || build.buildRequestId === request.id) || null;
}

function requestStage(request) {
  if (request.status === "Cancelled") return "Cancelled";
  if (request.status === "Fulfilled") return "Complete";
  if (request.status === "Returned") return "Needs Information";
  if (request.status === "Draft") return "Draft";
  if (request.status === "Submitted") return "Waiting for Production Control";
  const build = buildForRequest(request);
  if (!build) return "Accepted";
  if (build.status === "Cancelled") return "Cancelled";
  if (build.status === "Finished") return "Complete";
  if (build.exceptionCode === "blocked") return "Blocked";
  if (build.exceptionCode === "on_hold") return "On Hold";
  if (build.exceptionCode === "customer_change") return "Change Requested";
  if (build.status === "Released" && Number(build.builtQty) > 0) return "In Production";
  if (build.status === "Released") return "Released to Shop";
  return "Scheduled";
}

function requestStageIndex(request) {
  const stage = requestStage(request);
  if (["Draft", "Needs Information"].includes(stage)) return 0;
  if (stage === "Waiting for Production Control") return 1;
  if (["Accepted", "Scheduled", "Change Requested"].includes(stage)) return 2;
  if (["Released to Shop", "Blocked", "On Hold"].includes(stage)) return 3;
  if (stage === "In Production") return 4;
  if (stage === "Complete") return 5;
  return -1;
}

function requestSourceLines() {
  const requestedByLine = new Map();
  state.buildRequests.filter((request) => request.status !== "Cancelled").forEach((request) => {
    const key = `${request.sourceOrderId}::${request.sourceOrderLineKey}`;
    requestedByLine.set(key, (requestedByLine.get(key) || 0) + Number(request.requestedQuantity || 0));
  });
  return state.orders.flatMap((order) => order.lines.map((line) => {
    const key = `${order.id}::${line.lineKey}`;
    const remaining = Math.max(0, Number(line.quantity || 0) - Number(line.shippedQty || 0) - (requestedByLine.get(key) || 0));
    return { order, line, key, remaining };
  })).filter((entry) => entry.line.part && entry.remaining > 0);
}

function requestSourceLabel(request) {
  const order = state.orders.find((item) => item.id === request.sourceOrderId);
  return `${request.sourceOrderNumber || order?.orderNumber || "Sales Order"} · ${request.part}`;
}

function ensureProductionControlDemo() {
  if (!isPublicDemo || state.buildRequests.length) return;
  const sourceItems = state.items.filter((item) => item.partNumber && item.status !== "Blocked").slice(0, 4);
  if (!sourceItems.length) return;
  while (sourceItems.length < 4) sourceItems.push(sourceItems[sourceItems.length % sourceItems.length]);

  let sourceOrder = state.orders.find((order) => order.lines?.length >= 3);
  if (!sourceOrder) {
    sourceOrder = newOrder({
      id: "demo-production-demand-order",
      orderNumber: "ORD0069246",
      customerId: customers[0]?.id || "",
      salesperson: "Sales Representative",
      reqShipDate: new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10),
      status: "Released",
      releasedAt: productionTimestamp(6),
      releasedByInitials: "SR",
      releasedByName: "Sales Representative",
      lines: sourceItems.slice(0, 3).map((item, index) => ({
        lineKey: `demo-production-line-${index + 1}`,
        itemId: item.id || null,
        sortOrder: index,
        part: item.partNumber,
        description: item.description || "Production demand item",
        category: item.itemClass || "Assembly",
        uom: item.uom || "EA",
        quantity: index === 2 ? 3 : 2,
        reservedQty: 0,
        qtyToShip: 0,
        shippedQty: 0,
        qtyToInvoice: 0,
        invoicedQty: 0,
        backorderQty: 0,
        unitPrice: Number(item.listPrice) || 0,
        discount: 0,
        taxable: false,
        source: "Production Control portfolio seed",
      })),
      events: [{
        key: "demo-production-order-release",
        type: "Released",
        summary: "Order released",
        detail: "Customer demand is ready for production review.",
        actorInitials: "SR",
        actorName: "Sales Representative",
        createdAt: productionTimestamp(6),
      }],
      createdAt: productionTimestamp(7),
      lastModifiedAt: productionTimestamp(6),
    });
    state.orders.unshift(sourceOrder);
    saveOrders();
  }

  const lines = sourceOrder.lines.slice(0, 3);
  if (lines.length < 3) return;
  const requestSeed = (id, number, line, status, daysAgo) => normalizeBuildRequest({
    id,
    requestNumber: number,
    sourceOrderId: sourceOrder.id,
    sourceOrderNumber: sourceOrder.orderNumber,
    sourceOrderLineKey: line.lineKey,
    originatorName: "Sales Representative",
    originatorInitials: "SR",
    gatekeeperName: status === "Submitted" ? "" : "Production Controller",
    itemId: line.itemId || null,
    part: line.part,
    description: line.description,
    uom: line.uom || "EA",
    requestedQuantity: Math.min(2, Number(line.quantity) || 1),
    requestedShipDate: sourceOrder.reqShipDate,
    customerRequirements: "Customer order requires an in-house build before shipment.",
    status,
    createdAt: productionTimestamp(daysAgo),
    updatedAt: productionTimestamp(daysAgo),
    events: [{
      key: `${id}-submitted`,
      type: "Submitted",
      summary: "Submitted to Production Control",
      detail: "Sales demand captured from the exact Sales Order line.",
      actorRole: "sales",
      actorInitials: "SR",
      actorName: "Sales Representative",
      createdAt: productionTimestamp(daysAgo),
    }],
  });

  const waiting = requestSeed("demo-request-waiting", "BRQ001000", lines[0], "Submitted", 1);
  const scheduled = requestSeed("demo-request-scheduled", "BRQ001001", lines[1], "Accepted", 3);
  const inProduction = requestSeed("demo-request-production", "BRQ001002", lines[2], "Accepted", 5);

  const scheduledBuild = newBuild({
    id: "demo-controlled-build-scheduled",
    buildNumber: "BLD001000",
    buildRequestId: scheduled.id,
    itemId: scheduled.itemId,
    part: scheduled.part,
    description: scheduled.description,
    uom: scheduled.uom,
    quantity: scheduled.requestedQuantity,
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    requestedDueDate: scheduled.requestedShipDate,
    committedDueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    priority: 2,
    controllerName: "Production Controller",
    shopAssigneeName: "Fabrication Cell A",
    originatorInitials: "SR",
    originatorName: "Sales Representative",
    notes: scheduled.customerRequirements,
    createdAt: productionTimestamp(3),
    lastModifiedAt: productionTimestamp(2),
  });
  scheduled.buildOrderId = scheduledBuild.id;
  scheduled.events.unshift({
    key: "demo-request-scheduled-accepted",
    type: "Accepted",
    summary: "Accepted and scheduled",
    detail: "Production Control committed the date and assigned Fabrication Cell A.",
    actorRole: "production_controller",
    actorInitials: "PC",
    actorName: "Production Controller",
    createdAt: productionTimestamp(2),
  });

  const component = sourceItems[3];
  const activeBuild = newBuild({
    id: "demo-controlled-build-active",
    buildNumber: "BLD001001",
    buildRequestId: inProduction.id,
    itemId: inProduction.itemId,
    part: inProduction.part,
    description: inProduction.description,
    uom: inProduction.uom,
    quantity: 2,
    builtQty: 1,
    dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    requestedDueDate: inProduction.requestedShipDate,
    committedDueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    priority: 1,
    controllerName: "Production Controller",
    shopAssigneeName: "Assembly Cell B",
    status: "Released",
    releasedAt: productionTimestamp(2),
    releasedByInitials: "PC",
    releasedByName: "Production Controller",
    originatorInitials: "SR",
    originatorName: "Sales Representative",
    notes: inProduction.customerRequirements,
    components: [{
      componentKey: "demo-controlled-component",
      itemId: component.id || null,
      part: component.partNumber,
      description: component.description || "Production component",
      uom: component.uom || "EA",
      qtyRequired: 4,
      qtyReserved: 2,
      qtyConsumed: 2,
      qtyToConsume: 0,
    }],
    events: [
      { key: "demo-build-progress", type: "Posted", summary: "Build progress posted", detail: "1 EA output posted; 1 EA remains.", actorInitials: "SHOP", actorName: "Assigned Shop Employee", createdAt: productionTimestamp(1) },
      { key: "demo-build-released", type: "Released", summary: "Build Order released", detail: "Components reserved; shop execution authorized.", actorInitials: "PC", actorName: "Production Controller", createdAt: productionTimestamp(2) },
    ],
    createdAt: productionTimestamp(4),
    lastModifiedAt: productionTimestamp(1),
  });
  inProduction.buildOrderId = activeBuild.id;
  inProduction.events.unshift({
    key: "demo-request-production-accepted",
    type: "Accepted",
    summary: "Accepted and scheduled",
    detail: "Production Control committed the date and assigned Assembly Cell B.",
    actorRole: "production_controller",
    actorInitials: "PC",
    actorName: "Production Controller",
    createdAt: productionTimestamp(4),
  });

  if (!state.builds.some((build) => build.id === scheduledBuild.id)) state.builds.unshift(scheduledBuild);
  if (!state.builds.some((build) => build.id === activeBuild.id)) state.builds.unshift(activeBuild);
  const componentStock = getStock(component.partNumber);
  componentStock.onHand = Math.max(20, Number(componentStock.onHand) || 0);
  componentStock.allocated = Math.max(2, Number(componentStock.allocated) || 0);
  state.buildRequests = [waiting, scheduled, inProduction];
  saveOrders();
  saveBuilds();
  saveBuildRequests();
  saveStock();
}

function acceptBuildRequest(request, { committedDueDate, priority, shopAssigneeName }) {
  if (request.status !== "Submitted") return;
  if (!committedDueDate || !shopAssigneeName) {
    showToast("Commit a completion date and shop assignment before accepting");
    return;
  }
  const build = newBuild({
    buildNumber: `BLD${String(1000 + state.builds.length).padStart(6, "0")}`,
    buildRequestId: request.id,
    itemId: request.itemId || null,
    part: request.part,
    description: request.description,
    uom: request.uom || "EA",
    quantity: request.requestedQuantity,
    dueDate: committedDueDate,
    requestedDueDate: request.requestedShipDate,
    committedDueDate,
    priority: Math.min(5, Math.max(1, Number(priority) || 3)),
    controllerName: productionDemoActors.production_controller.name,
    shopAssigneeName,
    notes: request.customerRequirements,
    originatorName: request.originatorName,
    originatorInitials: request.originatorInitials,
  });
  recordBuildEvent(build, "Scheduled", "Build Order scheduled", `Created from ${request.requestNumber}; assigned to ${shopAssigneeName}.`);
  state.builds.unshift(build);
  request.status = "Accepted";
  request.acceptedAt = new Date().toISOString();
  request.gatekeeperName = productionDemoActors.production_controller.name;
  request.buildOrderId = build.id;
  request.returnedReason = "";
  request.updatedAt = new Date().toISOString();
  recordBuildRequestEvent(request, "Accepted", "Accepted and scheduled by Production Control", `${shopAssigneeName} · due ${committedDueDate}`, "production_controller");
  saveBuilds();
  saveBuildRequests();
  renderProductionControlWorkspace();
  showToast(`${request.requestNumber} accepted and scheduled`);
}

function returnBuildRequest(request, note) {
  if (request.status !== "Submitted") return;
  const reason = String(note || "").trim();
  if (!reason) { showToast("Add the information Sales needs to supply"); return; }
  request.status = "Returned";
  request.returnedReason = reason;
  request.gatekeeperName = productionDemoActors.production_controller.name;
  request.updatedAt = new Date().toISOString();
  recordBuildRequestEvent(request, "Returned", "Returned for information", reason, "production_controller");
  saveBuildRequests();
  renderProductionControlWorkspace();
  showToast(`${request.requestNumber} returned to Sales`);
}

function resubmitBuildRequest(request) {
  if (!['Draft', 'Returned'].includes(request.status)) return;
  request.status = "Submitted";
  request.returnedReason = "";
  request.updatedAt = new Date().toISOString();
  recordBuildRequestEvent(request, "Submitted", "Resubmitted to Production Control", "Requested information was reviewed by Sales.", "sales");
  saveBuildRequests();
  renderBuildRequestsWorkspace();
  showToast(`${request.requestNumber} resubmitted`);
}

function cancelBuildRequest(request) {
  if (["Fulfilled", "Cancelled"].includes(request.status)) return;
  const build = buildForRequest(request);
  if (build && (build.status === "Released" || Number(build.builtQty) > 0 || build.components.some((line) => Number(line.qtyConsumed) > 0))) {
    showToast("Production Control must cancel released or started work");
    return;
  }
  if (build) {
    build.status = "Cancelled";
    recordBuildEvent(build, "Cancelled", "Build Order cancelled", "Sales demand was withdrawn before release.");
    touchBuild(build);
  }
  request.status = "Cancelled";
  request.cancelledAt = new Date().toISOString();
  request.updatedAt = new Date().toISOString();
  recordBuildRequestEvent(request, "Cancelled", "Build Request cancelled", "Demand withdrawn before production activity.", "sales");
  saveBuildRequests();
  renderBuildRequestsWorkspace();
  showToast(`${request.requestNumber} cancelled`);
}

function requestBuildChange(request) {
  if (request.status !== "Accepted") return;
  const build = buildForRequest(request);
  if (!build || build.status === "Finished") return;
  build.exceptionCode = "customer_change";
  build.exceptionDetail = "Sales reported a customer requirement change; Production Control review is required.";
  build.revision += 1;
  recordBuildEvent(build, "Edited", "Customer change requested", build.exceptionDetail);
  touchBuild(build);
  recordBuildRequestEvent(request, "ChangeRequested", "Change requested", build.exceptionDetail, "sales");
  request.updatedAt = new Date().toISOString();
  saveBuildRequests();
  renderBuildRequestsWorkspace();
  showToast("Production Control was notified without rewriting the Build Order");
}

let backorderResolveCallback = null;

function openBackorderConfirm({ part, description, onYes, onNo }) {
  backorderResolveCallback = { onYes, onNo };
  elements.backorderModalBody.innerHTML = `
    <p>Performing this action will cause a backorder due to inventory levels. Do you want to proceed?</p>
    <div class="backorder-part-callout"><strong>${escapeHTML(part || "This part")}</strong><span>${escapeHTML(description || "")}</span></div>
    <div class="backorder-actions">
      <button type="button" class="secondary-button" data-backorder-no>No — let me change it</button>
      <button type="button" class="primary-button" data-backorder-yes>Yes — proceed with backorder</button>
    </div>`;
  elements.backorderModal.hidden = false;
}

function closeBackorderConfirm() {
  elements.backorderModal.hidden = true;
  backorderResolveCallback = null;
}

function applyLineQuantity(line, requestedQty, onResolved) {
  const stock = getStock(line.part);
  const available = Math.max(0, Number(stock.onHand) - Number(stock.allocated));
  const commit = (projectedBackorder) => {
    line.quantity = requestedQty;
    line.reservedQty = Math.min(Number(line.reservedQty) || 0, requestedQty);
    line.qtyToShip = Math.min(Number(line.qtyToShip) || 0, line.reservedQty);
    line.shippedQty = Math.min(Number(line.shippedQty) || 0, requestedQty);
    line.qtyToInvoice = Math.min(Number(line.qtyToInvoice) || 0, line.shippedQty);
    line.invoicedQty = Math.min(Number(line.invoicedQty) || 0, line.shippedQty);
    line.backorderQty = Math.max(0, projectedBackorder);
    onResolved(true);
  };
  if (requestedQty <= available) { commit(0); return; }
  openBackorderConfirm({
    part: line.part,
    description: line.description,
    onYes: () => { closeBackorderConfirm(); commit(requestedQty - available); },
    onNo: () => { closeBackorderConfirm(); onResolved(false); },
  });
}

function startCalibrationQuote(customer) {
  requireIdentity(() => {
    const quote = newQuote({
      workflow: "Calibration",
      customerId: customer?.id || "",
      notes: `Calibration quote for ${customer?.name || "selected customer"}. Started from the Calibration workspace.`,
      lines: [{
        part: "CAL-SERVICE",
        description: "Automatic hammer calibration service",
        uom: "EA",
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        taxable: false,
        source: "Calibration workspace",
      }],
    });
    quote.number = `CAL-${quote.number}`;
    state.quotes.unshift(quote);
    touchQuote(quote);
    openWorkspace("quotes");
    openQuoteModal(quote.id);
    showToast(`Clean calibration quote started${customer ? ` for ${customer.name}` : ""}`);
  });
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

async function loadInventory() {
  if (isPublicDemo) {
    state.inventoryBackendConfigured = false;
    return;
  }
  try {
    const response = await fetch("/.netlify/functions/inventory-list");
    if (response.ok) {
      const data = await response.json();
      if (data.configured) {
        for (const [part, record] of Object.entries(data.stock)) {
          if (!state.pendingStockParts.has(part)) state.stock[part] = record;
        }
        state.inventoryBackendConfigured = true;
        saveStock();
        return;
      }
    }
  } catch {
    // backend unreachable -- the deterministic seed / local copy still works
  }
  state.inventoryBackendConfigured = false;
}

function touchStock(part) {
  saveStock();
  state.pendingStockParts.add(part);
  clearTimeout(state.stockSaveTimers[part]);
  state.stockSaveTimers[part] = setTimeout(() => pushStockToBackend(part), 600);
}

async function pushStockToBackend(part) {
  if (isPublicDemo) {
    state.pendingStockParts.delete(part);
    return;
  }
  const stock = state.stock[part];
  try {
    const response = await fetch("/.netlify/functions/inventory-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        part,
        itemId: itemIdForPart(part),
        onHand: stock.onHand, allocated: stock.allocated, bin: stock.bin, unitPrice: stock.unitPrice,
        lastModifiedByInitials: state.identity?.initials || "", lastModifiedByName: state.identity?.name || "",
      }),
    });
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      state.inventoryBackendConfigured = data.configured !== false;
    }
  } catch {
    // offline or backend unreachable -- the local copy already saved via saveStock()
  } finally {
    state.pendingStockParts.delete(part);
  }
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
  const startedAt = performance.now();
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
  state.identity = isPublicDemo
    ? { ...publicDemoIdentity }
    : safeLoad("mdb-demo-identity", null) || safeLoad("mdb-demo-calib-identity", null);
  state.calibResults = safeLoad("mdb-demo-calib-results", []);
  state.calibLocks = safeLoad("mdb-demo-calib-locks", {});

  buildToolItems();
  buildItemMaster();
  const rigQuoteFilesPromise = loadRigQuoteFiles().then((files) => { state.rigQuoteFiles = files; });
  await Promise.all([
    loadInventory(),
    loadQuotes(),
    loadOrders(),
    loadBuilds(),
    loadItems(),
    loadOperations(),
    rigQuoteFilesPromise,
  ]);

  loadBuildRequests();
  loadRigSalesOpportunities();
  ensureProductionControlDemo();
  state.ready = true;
  buildSearchIndex();
  state.bootDurationMs = Math.round(performance.now() - startedAt);
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

function canonicalPartNumber(value) {
  return String(value || "").trim().toUpperCase();
}

function itemIdForPart(part) {
  return state.itemsByPart.get(canonicalPartNumber(part))?.id || null;
}

function rebuildItemLookup() {
  state.itemsByPart = new Map(state.items.map((item) => [item.partNumber, item]));
}

function splitItemValues(value) {
  return String(value || "").split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function itemAuthorityRank(value) {
  const clean = normalize(value);
  if (clean.includes("master")) return 60;
  if (clean.includes("current cts") || clean.includes("current ws004")) return 50;
  if (clean.includes("rig bom")) return 40;
  if (clean.includes("tooling index")) return 30;
  return 10;
}

function buildItemMaster() {
  const itemMap = new Map();
  const ensureItem = (part) => {
    const partNumber = canonicalPartNumber(part);
    if (!partNumber) return null;
    if (!itemMap.has(partNumber)) {
      itemMap.set(partNumber, {
        id: null, partNumber, description: "", descriptionRank: -1,
        itemClass: "Other", category: "", family: "", subfamily: "", uom: "EA", status: "Active",
        revision: "", drawingNumber: "", preferredVendor: "", standardCost: 0, listPrice: 0, weightLbs: 0,
        sourceAuthority: "", sourceSystem: "MDB source set", sourceUpdatedAt: null, updatedAt: null,
        attributes: {}, areas: new Set(), families: new Set(), subfamilies: new Set(), authorities: new Set(),
        aliases: new Set(), models: new Set(), sections: new Set(), serials: new Set(), toolIds: new Set(),
        sourceKeys: new Set(), descriptionVariants: new Set(), quoteable: false, blockedSource: false,
      });
    }
    return itemMap.get(partNumber);
  };
  const considerDescription = (item, description, authority) => {
    const cleanDescription = String(description || "").trim();
    if (!cleanDescription) return;
    item.descriptionVariants.add(cleanDescription);
    const rank = itemAuthorityRank(authority);
    if (rank > item.descriptionRank || (rank === item.descriptionRank && cleanDescription.length > item.description.length)) {
      item.description = cleanDescription;
      item.descriptionRank = rank;
    }
  };

  for (const source of state.toolItems) {
    if (!source.part) continue;
    const item = ensureItem(source.part);
    if (!item) continue;
    const authority = source.sourceType || source.sourceAuthority || "Tooling index";
    item.areas.add("Tooling");
    if (source.family) item.families.add(source.family);
    if (source.subfamily) item.subfamilies.add(source.subfamily);
    if (authority) item.authorities.add(authority);
    if (source.rawPart) item.aliases.add(String(source.rawPart));
    if (source.alternatePart) item.aliases.add(String(source.alternatePart));
    if (source.aliases) item.aliases.add(String(source.aliases));
    item.toolIds.add(source.id);
    item.sourceKeys.add(`tooling:${source.id}`);
    item.quoteable ||= Boolean(source.quoteable);
    item.blockedSource ||= normalize(source.status).includes("blocked");
    considerDescription(item, source.description, authority);
  }

  for (const source of state.data.rig.items) {
    if (!source.part) continue;
    const item = ensureItem(source.part);
    if (!item) continue;
    const authority = "Rig BOM source";
    item.areas.add("Rig Part");
    if (source.domain) item.families.add(source.domain);
    splitItemValues(source.models).forEach((value) => item.models.add(value));
    splitItemValues(source.sections).forEach((value) => item.sections.add(value));
    splitItemValues(source.serials).forEach((value) => item.serials.add(value));
    if (source.aliases) item.aliases.add(String(source.aliases));
    item.authorities.add(authority);
    item.sourceKeys.add(`rig:${source.id}`);
    item.quoteable = true;
    considerDescription(item, source.cleanDescription || source.description, authority);
  }

  state.items = [...itemMap.values()].map((item) => {
    const areas = [...item.areas];
    const itemClass = areas.includes("Tooling") && areas.includes("Rig Part") ? "Tooling + Rig Part" : areas[0] || "Other";
    const families = [...item.families].sort();
    const subfamilies = [...item.subfamilies].sort();
    const authorities = [...item.authorities].sort((a, b) => itemAuthorityRank(b) - itemAuthorityRank(a));
    return {
      ...item,
      itemClass,
      category: families[0] || itemClass,
      family: families.join(" / "),
      subfamily: subfamilies.join(" / "),
      sourceAuthority: authorities.join(" + "),
      status: item.blockedSource && item.sourceKeys.size === 1 ? "Blocked" : "Active",
      reviewRequired: item.descriptionVariants.size > 1,
      sourceCount: item.sourceKeys.size,
      areas, families, subfamilies, authorities,
      aliases: [...item.aliases], models: [...item.models].sort(), sections: [...item.sections].sort(),
      serials: [...item.serials].sort(), toolIds: [...item.toolIds], sourceKeys: [...item.sourceKeys],
      descriptionVariants: [...item.descriptionVariants],
    };
  }).sort((a, b) => a.partNumber.localeCompare(b.partNumber, undefined, { numeric: true }));
  rebuildItemLookup();
}

function mergeBackendItems(remoteItems) {
  const map = new Map(state.items.map((item) => [item.partNumber, item]));
  for (const remote of remoteItems) {
    const partNumber = canonicalPartNumber(remote.partNumber);
    if (!partNumber) continue;
    const local = map.get(partNumber) || {
      partNumber, areas: [], families: [], subfamilies: [], authorities: [], aliases: [], models: [], sections: [],
      serials: [], toolIds: [], sourceKeys: [], descriptionVariants: [], sourceCount: 0, quoteable: true,
    };
    map.set(partNumber, {
      ...local,
      ...remote,
      partNumber,
      description: remote.description || local.description || "Item record",
      itemClass: remote.itemClass || local.itemClass || "Other",
      category: remote.category || local.category || "",
      family: remote.family || local.family || "",
      subfamily: remote.subfamily || local.subfamily || "",
      sourceAuthority: remote.sourceAuthority || local.sourceAuthority || "",
      sourceSystem: remote.sourceSystem || local.sourceSystem || "MDB",
    });
  }
  state.items = [...map.values()].sort((a, b) => a.partNumber.localeCompare(b.partNumber, undefined, { numeric: true }));
  rebuildItemLookup();
}

async function loadItems() {
  if (isPublicDemo) {
    state.itemsBackendConfigured = false;
    return;
  }
  try {
    const response = await fetch("/.netlify/functions/items-list");
    if (!response.ok) return;
    const data = await response.json();
    if (data.configured && Array.isArray(data.items)) {
      mergeBackendItems(data.items);
      state.itemsBackendConfigured = true;
    }
  } catch {
    state.itemsBackendConfigured = false;
  }
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
  const itemEntries = state.items.map((item) => ({
    id: `item-${item.partNumber}`, label: item.partNumber, detail: item.description,
    category: "Item", action: "items", part: item.partNumber,
    aliases: `${item.aliases.join(" ")} ${item.family} ${item.subfamily} ${item.models.join(" ")} ${item.sections.join(" ")}`,
  }));
  state.searchIndex = [...workspaceEntries, ...customerEntries, ...rigSpecEntries, ...rigEntries, ...itemEntries, ...rigPartEntries, ...toolEntries];
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
  else if (result.action === "items") openWorkspace("items", { query: result.part, part: result.part });
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
    items: "Items", tooling: "Tooling", customerTooling: "Customer Tooling", quotes: "Quote Builder", orders: "Orders", buildRequests: "Build Requests", serviceRequests: "Service Requests", operationsBoard: "Operations Board", productionControl: "Production Control", builds: "Build Orders", inventory: "Inventory", bom: "Rig / BOM View", rigSpecs: "Rig Specifications",
    calibration: "Calibration", rigSales: "Rig Sales", prospects: "New Prospect Search", callList: "Daily Call List",
    calibrationTraining: "Calibration Training", workflowTraining: "Workflow Training",
    reports: "Sales Reports", systemSync: "System & Sync",
  };
  elements.overlayTitle.textContent = titles[type] || "Workspace";
  setActiveNav(type === "customerTooling" ? "customer" : type);
  if (type === "items") renderItemsWorkspace(options);
  if (type === "tooling") {
    state.tooling = { query: options.query || "", scope: "All", builder: detectBuilder(options.query || ""), filters: {}, selectedId: options.toolId || "", browseOpen: false };
    renderToolingWorkspace(options);
  }
  if (type === "customerTooling") {
    state.customerTooling = { query: "", scope: "All", builder: "", filters: {}, selectedId: "", browseOpen: false };
    renderCustomerToolingWorkspace(customer);
  }
  if (type === "quotes") { renderQuoteWorkspace(); if (state.quotesBackendConfigured) loadQuotes().then(() => { if (state.activeWorkspace === "quotes") renderQuoteWorkspace(); }); }
  if (type === "orders") { renderOrdersWorkspace(); if (state.ordersBackendConfigured) loadOrders().then(() => { if (state.activeWorkspace === "orders") renderOrdersWorkspace(); }); }
  if (type === "buildRequests") renderBuildRequestsWorkspace();
  if (type === "serviceRequests") renderServiceRequestsWorkspace();
  if (type === "operationsBoard") renderOperationsBoardWorkspace();
  if (type === "productionControl") renderProductionControlWorkspace();
  if (type === "builds") { renderBuildsWorkspace(); if (state.buildsBackendConfigured) loadBuilds().then(() => { if (state.activeWorkspace === "builds") renderBuildsWorkspace(); }); }
  if (type === "inventory") { renderInventoryWorkspace(options.query || ""); if (state.inventoryBackendConfigured) loadInventory(); }
  if (type === "bom") renderBomWorkspace(options);
  if (type === "rigSpecs") renderRigSpecsWorkspace(options);
  if (type === "calibration") renderCalibrationWorkspace();
  if (type === "rigSales") renderRigSalesWorkspace();
  if (type === "prospects") { renderProspectWorkspace(); loadKnownCustomers().then(() => { if (state.activeWorkspace === "prospects") renderProspectResults(); }); }
  if (type === "callList") renderCallListWorkspace();
  if (type === "calibrationTraining") renderCalibrationTrainingWorkspace();
  if (type === "workflowTraining") renderWorkflowTrainingWorkspace();
  if (type === "reports") { renderReportsWorkspace(); loadReports().then(() => { if (state.activeWorkspace === "reports") renderReportsWorkspace(); }); }
  if (type === "systemSync") {
    renderSystemSyncWorkspace();
    loadGpSyncStatus().then(() => { if (state.activeWorkspace === "systemSync") renderSystemSyncWorkspace(); });
  }
}

function closeWorkspace() {
  state.activeWorkspace = null;
  elements.workspaceOverlay.hidden = true;
  elements.workspaceOverlay.classList.remove("workspace-overlay--customer-tooling");
  elements.overlayBody.innerHTML = "";
  setActiveNav(state.activeView === "customer" ? "customer" : "home");
}

let identityPickerCallback = null;

function updateIdentityButton() {
  if (isPublicDemo) {
    elements.identityButton.hidden = true;
    elements.identityButton.textContent = "Portfolio Demo";
    elements.identityButton.title = "Public sandbox — no employee account or shared operational data";
    elements.identityButton.setAttribute("aria-label", "Portfolio demo mode");
    $$('[data-admin-only]').forEach((element) => { element.hidden = true; });
    return;
  }
  elements.identityButton.hidden = false;
  elements.identityButton.textContent = state.identity ? `${state.identity.name} (${state.identity.initials})` : "Set your name";
  $$('[data-admin-only]').forEach((element) => { element.hidden = !state.identity?.isAdmin; });
}

function openIdentityPicker(onSelected) {
  if (isPublicDemo) {
    if (typeof onSelected === "function") onSelected();
    else showToast("Public sandbox: no employee identity or shared account is in use");
    return;
  }
  identityPickerCallback = typeof onSelected === "function" ? onSelected : null;
  elements.identityModalTitle.textContent = state.identity ? "Switch user" : "Who are you?";
  elements.identityModalBody.innerHTML = `<div class="calib-roster-grid">${calibrationReps.map((rep) => `<button type="button" data-identity-select-rep="${escapeHTML(rep.initials)}"><strong>${escapeHTML(rep.name)}</strong><span>${escapeHTML(rep.initials)}${rep.isAdmin ? " · Admin" : ""}</span></button>`).join("")}</div>`;
  elements.identityModal.hidden = false;
}

function closeIdentityPicker() {
  elements.identityModal.hidden = true;
  identityPickerCallback = null;
}

function selectIdentity(initials) {
  const rep = calibrationReps.find((item) => item.initials === initials);
  if (!rep) return;
  state.identity = { ...rep };
  state.calibAdminUnlocked = false;
  saveIdentity();
  updateIdentityButton();
  const callback = identityPickerCallback;
  closeIdentityPicker();
  if (callback) callback();
}

function openAdvancedSearch() {
  if (!state.ready) { showToast("MDB data is still loading."); return; }
  elements.advancedSearchModal.hidden = false;
  renderAdvancedSearchResults();
  $("#advSearchValue")?.focus();
}

function closeAdvancedSearch() {
  elements.advancedSearchModal.hidden = true;
}

function matchesOperator(fieldValue, operator, searchValue) {
  const clean = normalize(fieldValue);
  const cleanSearch = normalize(searchValue);
  if (operator === "is") return clean === cleanSearch;
  if (operator === "isNot") return clean !== cleanSearch;
  if (operator === "beginsWith") return clean.startsWith(cleanSearch);
  return clean.includes(cleanSearch);
}

function advancedSearchResults() {
  const { type, field, operator, value } = state.advancedSearch;
  if (!value.trim()) return [];
  const source = type === "items"
    ? state.items.map((item) => ({ part: item.partNumber, description: item.description, family: item.itemClass, kind: "item" }))
    : type === "rig"
      ? state.data.rig.items.map((item) => ({ part: item.part, description: item.cleanDescription || item.description, family: item.domain, kind: "rig" }))
      : state.toolItems.map((item) => ({ part: item.part, description: item.description, family: item.family, kind: "tooling", toolId: item.id }));
  const fieldGetter = field === "part" ? (item) => item.part : (item) => item.description;
  return source.filter((item) => fieldGetter(item) && matchesOperator(fieldGetter(item), operator, value)).slice(0, 60);
}

function renderAdvancedSearchResults() {
  const host = $("#advSearchResults");
  if (!host) return;
  const { value } = state.advancedSearch;
  if (!value.trim()) { host.innerHTML = '<p class="advanced-search-empty">Enter a value to search.</p>'; return; }
  const results = advancedSearchResults();
  if (!results.length) { host.innerHTML = '<p class="advanced-search-empty">No matches.</p>'; return; }
  host.innerHTML = `<div class="advanced-search-count">${results.length} match${results.length === 1 ? "" : "es"}${results.length === 60 ? " (showing first 60)" : ""}</div>${results.map((item) => `<button type="button" class="advanced-search-result" data-adv-result-kind="${item.kind}" data-adv-result-part="${escapeHTML(item.part || "")}" data-adv-result-tool-id="${escapeHTML(item.toolId || "")}"><strong>${escapeHTML(item.part || "No active PN")}</strong><span>${escapeHTML(item.description || "")}</span></button>`).join("")}`;
}

function detectBuilder(query) {
  return globalThis.MDBToolingSearch.detectGuidedBuilder(query);
}

const guidedToolingSelectors = Object.freeze([
  ["driveCap", "Drive Cap"],
  ["hsaAuger", "HSA Auger"],
  ["splitSpoon", "Split Spoon"],
  ["hexCor", "HEX-COR / STD"],
  ["moyno", "Moyno"],
]);

function guidedToolingLabel(builder) {
  return guidedToolingSelectors.find(([id]) => id === builder)?.[1] || "guided tooling";
}

function toolingFamilies() {
  return ["All", ...new Set(state.toolItems.map((item) => item.family).filter(Boolean))].sort((a, b) => a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b));
}

function activeToolingState() {
  return state.activeWorkspace === "customerTooling" ? state.customerTooling : state.tooling;
}

function toolingBrowsePanel() {
  const toolState = activeToolingState();
  return `<section id="toolBrowsePanel" class="tool-browse-panel" ${toolState.browseOpen ? "" : "hidden"}>
    <div><strong>Guided selectors</strong><span>Use compatibility-controlled dropdowns</span><div class="browse-buttons">${guidedToolingSelectors.map(([id, label]) => `<button type="button" data-tool-builder="${id}">${label}</button>`).join("")}</div></div>
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
      <div id="toolBuilderHost" ${toolState.builder ? "" : "hidden"}>${renderToolingBuilderSurface()}</div>
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
  if (toolState.builder) builderHost.innerHTML = renderToolingBuilderSurface();
  else renderToolingResults();
}

function renderToolingBuilderSurface() {
  const toolState = activeToolingState();
  const routeNote = toolState.query.trim()
    ? `<div class="tool-search-route"><span>Search intent recognized</span><strong>${escapeHTML(toolState.query)} → ${escapeHTML(guidedToolingLabel(toolState.builder))}</strong><small>Using the same compatibility-controlled rules as Browse Tooling.</small></div>`
    : "";
  return `${routeNote}${renderToolingBuilder()}`;
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
    items = globalThis.MDBToolingSearch.rankToolingItems(query, items);
  } else {
    items = items.sort((a, b) => Number(Boolean(b.part)) - Number(Boolean(a.part)) || a.description.localeCompare(b.description));
  }
  const visible = items.slice(0, 120);
  $("#toolResultSummary").innerHTML = `<strong>${items.length.toLocaleString()} matches</strong><span>${query ? "Exact part → description → controlled family → aliases" : items.length > visible.length ? `Showing first ${visible.length}` : "Full result set"}</span>`;
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
      <div class="detail-button-stack"><button type="button" class="secondary-button" data-open-item-part="${escapeHTML(item.part)}">Open Item</button>${addPartButton(item.part, item.description, !item.quoteable, "Add to Quote")}</div></div>` : ""}`;
}

function itemClasses() {
  return ["All", ...new Set(state.items.map((item) => item.itemClass).filter(Boolean))];
}

function filteredItems() {
  const query = state.itemView.query.trim();
  let items = state.items.filter((item) => state.itemView.itemClass === "All" || item.itemClass === state.itemView.itemClass);
  if (query) {
    items = items.map((item) => ({
      ...item,
      score: matchScore(query, `${item.partNumber} ${item.description} ${item.itemClass} ${item.category} ${item.family} ${item.subfamily} ${item.aliases.join(" ")} ${item.models.join(" ")} ${item.sections.join(" ")}`),
    })).filter((item) => item.score >= 0.52).sort((a, b) => b.score - a.score || a.partNumber.localeCompare(b.partNumber, undefined, { numeric: true }));
  }
  return items;
}

function renderItemsWorkspace(options = {}) {
  if (Object.hasOwn(options, "query")) state.itemView.query = options.query || "";
  if (options.part) state.itemView.selectedPart = canonicalPartNumber(options.part);
  const classes = itemClasses();
  if (!classes.includes(state.itemView.itemClass)) state.itemView.itemClass = "All";
  elements.overlayBody.innerHTML = `<div class="workbench item-workbench">
    <div class="item-workbench-bar">
      <label class="inline-search"><span class="search-mark"></span><input id="itemSearch" type="search" value="${escapeHTML(state.itemView.query)}" placeholder="Search part number, description, model, or section..."></label>
      <label class="field item-class-filter"><span>Class</span><select id="itemClassFilter">${classes.map((value) => `<option ${value === state.itemView.itemClass ? "selected" : ""}>${escapeHTML(value)}</option>`).join("")}</select></label>
      <span class="demo-data-label">${isPublicDemo ? "Source-derived portfolio records" : state.itemsBackendConfigured ? "Shared Item Master" : "Source-derived records; backend pending"}</span>
    </div>
    <div class="item-layout"><section class="item-list-panel"><div id="itemResultSummary" class="panel-strip"></div><div id="itemResults" class="item-results"></div></section><aside id="itemDetail" class="item-detail"></aside></div>
  </div>`;
  renderItemResults();
}

function renderItemResults() {
  const items = filteredItems();
  const visible = items.slice(0, 240);
  if (!visible.some((item) => item.partNumber === state.itemView.selectedPart)) {
    state.itemView.selectedPart = visible[0]?.partNumber || "";
  }
  $("#itemResultSummary").innerHTML = `<strong>${items.length.toLocaleString()} items</strong><span>${items.length > visible.length ? `Showing first ${visible.length}` : "Full result set"}</span>`;
  $("#itemResults").innerHTML = visible.length ? visible.map((item) => {
    const stock = getStock(item.partNumber);
    const available = Number(stock.onHand) - Number(stock.allocated);
    return `<button type="button" class="item-result ${item.partNumber === state.itemView.selectedPart ? "is-selected" : ""}" data-item-part="${escapeHTML(item.partNumber)}">
      <span><strong>${escapeHTML(item.partNumber)}</strong><small>${escapeHTML(item.description)}</small></span>
      <span><em>${escapeHTML(item.itemClass)}</em><small>${available.toLocaleString()} available</small></span>
      <span class="status-label ${item.reviewRequired ? "status-label--warn" : statusClass(item.status)}">${escapeHTML(item.reviewRequired ? "Source review" : item.status)}</span>
    </button>`;
  }).join("") : '<div class="search-empty">No Item record matches this search.</div>';
  renderItemDetail(state.itemView.selectedPart);
}

function renderItemDetail(partNumber) {
  const item = state.items.find((record) => record.partNumber === partNumber);
  const host = $("#itemDetail");
  if (!host) return;
  if (!item) {
    host.innerHTML = '<div class="profile-empty"><strong>Select an Item</strong></div>';
    return;
  }
  state.itemView.selectedPart = item.partNumber;
  const stock = getStock(item.partNumber);
  const available = Number(stock.onHand) - Number(stock.allocated);
  const values = [
    ["Class", item.itemClass], ["Category", item.category], ["Family", item.family], ["Type", item.subfamily],
    ["UOM", item.uom], ["Revision", item.revision || "Not loaded"], ["Drawing", item.drawingNumber || "Not loaded"],
    ["Vendor", item.preferredVendor || "Not loaded"], ["Source", item.sourceAuthority || item.sourceSystem],
  ];
  const whereUsed = [...new Set([...(item.models || []), ...(item.sections || [])])];
  host.innerHTML = `<header class="detail-heading"><span class="status-label ${statusClass(item.status)}">${escapeHTML(item.status)}</span><h3>${escapeHTML(item.partNumber)}</h3><p>${escapeHTML(item.description)}</p></header>
    <div class="item-stock-strip"><div><span>On hand</span><strong>${Number(stock.onHand).toLocaleString()}</strong></div><div><span>Allocated</span><strong>${Number(stock.allocated).toLocaleString()}</strong></div><div><span>Available</span><strong class="${available < 1 ? "is-low" : ""}">${available.toLocaleString()}</strong></div><div><span>Unit price</span><strong>${formatCurrency(stock.unitPrice)}</strong></div></div>
    <dl class="detail-grid">${values.map(([label, value]) => `<dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value || "—")}</dd>`).join("")}</dl>
    <section class="item-card-section"><h4>Where used</h4>${whereUsed.length ? `<div class="item-chips">${whereUsed.slice(0, 18).map((value) => `<span>${escapeHTML(value)}</span>`).join("")}</div>` : "<p>No rig usage loaded for this Item yet.</p>"}</section>
    <section class="item-card-section"><h4>Record lineage</h4><p>${item.sourceCount || 1} source record${item.sourceCount === 1 ? "" : "s"} combined into this Item.${item.reviewRequired ? ` ${item.descriptionVariants.length} description variants remain visible for review.` : ""}</p>${item.reviewRequired ? `<details><summary>View source descriptions</summary><ul>${item.descriptionVariants.slice(0, 12).map((value) => `<li>${escapeHTML(value)}</li>`).join("")}</ul></details>` : ""}</section>
    <div class="item-card-actions">${item.toolIds?.length ? `<button type="button" class="secondary-button" data-item-open-tooling="${escapeHTML(item.partNumber)}">Tooling</button>` : ""}${item.serials?.length ? `<button type="button" class="secondary-button" data-item-open-bom="${escapeHTML(item.partNumber)}" data-item-serial="${escapeHTML(item.serials[0])}">Rig / BOM</button>` : ""}${addPartButton(item.partNumber, item.description, !item.quoteable, "Add to Quote")}</div>`;
}

function inventorySourceItems() {
  return state.items.map((item) => ({ part: item.partNumber, description: item.description, area: item.itemClass }));
}

function renderInventoryWorkspace(query = "") {
  elements.overlayBody.innerHTML = `<div class="workbench inventory-workbench">
    <div class="workbench-bar"><label class="inline-search"><span class="search-mark"></span><input id="inventorySearch" type="search" value="${escapeHTML(query)}" placeholder="Search part number or description..."></label><span class="demo-data-label">${isPublicDemo ? "Portfolio sandbox — edits stay on this device" : state.inventoryBackendConfigured ? "Edits sync live across the team" : "Browser-local only right now"}</span></div>
    <div id="inventoryResults"></div></div>`;
  renderInventoryResults(query);
}

function renderInventoryResults(query = "") {
  let items = inventorySourceItems();
  if (query) items = items.map((item) => ({ ...item, score: matchScore(query, `${item.part} ${item.description} ${item.area}`) })).filter((item) => item.score >= 0.52).sort((a, b) => b.score - a.score);
  const visible = items.slice(0, 160);
  $("#inventoryResults").innerHTML = `<div class="panel-strip"><strong>${items.length.toLocaleString()} matches</strong><span>${isPublicDemo ? "Demo starting values — edits are temporary and never change operational inventory" : "On-hand, allocated, bin, and price are local demo values"}</span></div>
    <div class="inventory-table-wrap"><table class="data-table inventory-table"><thead><tr><th>Part</th><th>Description</th><th>Area</th><th>On Hand</th><th>Allocated</th><th>Available</th><th>Bin</th><th>Unit Price</th><th>Quote</th></tr></thead><tbody>
    ${visible.map((item) => {
      const stock = getStock(item.part); const available = Number(stock.onHand) - Number(stock.allocated);
      return `<tr><td><button type="button" class="link-button item-part-link" data-open-item-part="${escapeHTML(item.part)}">${escapeHTML(item.part)}</button></td><td>${escapeHTML(item.description)}</td><td>${escapeHTML(item.area)}</td>
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

function activeQuote() {
  return state.quotes.find((quote) => quote.id === state.activeQuoteId) || null;
}

function touchQuote(quote) {
  quote.lastModifiedAt = new Date().toISOString();
  if (state.identity) { quote.lastModifiedByInitials = state.identity.initials; quote.lastModifiedByName = state.identity.name; }
  saveQuotes();
  clearTimeout(state.quoteSaveTimer);
  state.quoteSaveTimer = setTimeout(() => pushQuoteToBackend(quote), 600);
}

function clampQuantity(value) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return 1;
  return Math.min(5000, Math.max(1, number));
}

function addQuoteLine(part, description, price = 0, source = "MDB demo", category = "") {
  const quote = activeQuote();
  if (!quote) { showToast("Open a quote first"); return; }
  quote.lines.push({ itemId: itemIdForPart(part), part: part || "", description: description || "", category, uom: "EA", quantity: 1, unitPrice: Number(price) || 0, discount: 0, taxable: false, source });
  touchQuote(quote);
  showToast(`${part || "Line"} added to quote`);
  if (!elements.quoteModal.hidden) renderQuoteModal();
}

function lineExtended(line) {
  return Number(line.quantity || 0) * Number(line.unitPrice || 0) - Number(line.discount || 0);
}

function quoteTotals(quote) {
  const subtotal = quote.lines.reduce((sum, line) => sum + lineExtended(line), 0);
  const total = subtotal + Number(quote.misc || 0) + Number(quote.freight || 0) - Number(quote.tradeDiscount || 0);
  return { subtotal, total };
}

function quoteCompanyName(quote) {
  const customer = customers.find((item) => item.id === quote.customerId);
  return customer?.name || "No customer selected";
}

function sortedOpenQuotes() {
  return state.quotes.filter((quote) => quote.status === "Open").sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderQuoteListSection(title, quotes, sectionKey) {
  const open = state.quoteListOpen[sectionKey];
  return `<section class="quote-list-section">
    <button type="button" class="quote-list-toggle" data-quote-list-toggle="${sectionKey}">
      <span>${escapeHTML(title)} (${quotes.length})</span><span class="quote-list-caret">${open ? "▾" : "▸"}</span>
    </button>
    ${open ? (quotes.length
      ? `<div class="quote-list-rows">${quotes.map((quote) => `<button type="button" class="quote-list-row" data-quote-open="${quote.id}"><strong>${escapeHTML(quoteCompanyName(quote))}</strong><span>${escapeHTML(quote.number)}</span></button>`).join("")}</div>`
      : '<p class="quote-list-empty">No open quotes yet.</p>') : ""}
  </section>`;
}

function renderQuoteWorkspace() {
  const openQuotes = sortedOpenQuotes();
  const mine = state.identity ? openQuotes.filter((quote) => quote.originatorInitials === state.identity.initials) : [];
  elements.overlayBody.innerHTML = `<div class="workbench quotes-workbench">
    <div class="operations-toolbar"><div><strong>Quotes</strong><span>${isPublicDemo ? "Portfolio sandbox — changes stay on this device and are never sent to GP." : state.quotesBackendConfigured ? "Synced live across the team — not sent to GP." : "Browser-local only right now — not yet synced across devices, not sent to GP."}</span></div><button type="button" class="primary-button" data-quote-new>Start New Quote</button></div>
    ${renderQuoteListSection("All Open Quotes", openQuotes, "master")}
    ${renderQuoteListSection("My Quotes", mine, "mine")}
  </div>`;
}

function openQuoteModal(quoteId) {
  state.activeQuoteId = quoteId;
  state.quoteSearchTerm = "";
  renderQuoteModal();
  elements.quoteModal.hidden = false;
}

function closeQuoteModal() {
  elements.quoteModal.hidden = true;
  state.activeQuoteId = "";
  if (state.activeWorkspace === "quotes") renderQuoteWorkspace();
}

function convertQuoteToOrder(quote) {
  const backorderedParts = [];
  const orderLines = quote.lines.map((line) => {
    if (!line.part) return { ...line, reservedQty: 0, qtyToShip: 0, shippedQty: 0, qtyToInvoice: 0, invoicedQty: 0, backorderQty: 0 };
    const stock = getStock(line.part);
    const available = Math.max(0, Number(stock.onHand) - Number(stock.allocated));
    const backorder = Math.max(0, Number(line.quantity) - available);
    if (backorder > 0) backorderedParts.push(line.part);
    return { ...line, reservedQty: 0, qtyToShip: 0, shippedQty: 0, qtyToInvoice: 0, invoicedQty: 0, backorderQty: backorder };
  });

  const order = newOrder({
    convertedFromQuoteId: quote.id,
    customerId: quote.customerId, customerPo: quote.customerPo, salesperson: quote.salesperson,
    terms: quote.terms, shipVia: quote.shipVia, shipToContact: quote.shipToContact, shipToAddress: quote.shipToAddress,
    reqShipDate: quote.reqShipDate, notes: quote.notes, misc: quote.misc, freight: quote.freight, tradeDiscount: quote.tradeDiscount,
    lines: orderLines,
  });
  state.orders.unshift(order);
  touchOrder(order);

  quote.status = "Won";
  quote.notes = `${quote.notes ? `${quote.notes} ` : ""}Converted to an order.`.trim();
  touchQuote(quote);

  closeQuoteModal();
  openOrderModal(order.id);
  showToast(backorderedParts.length
    ? `Order created — projected shortage on: ${backorderedParts.join(", ")}. Release when ready to reserve stock.`
    : "Order created — release it when ready to reserve stock");
}

function sortedOrdersByStatus(status) {
  return state.orders.filter((order) => order.status === status).sort((a, b) => new Date(b.lastModifiedAt || b.createdAt) - new Date(a.lastModifiedAt || a.createdAt));
}

function orderCompanyName(order) {
  const customer = customers.find((item) => item.id === order.customerId);
  return customer?.name || "No customer selected";
}

function orderTotals(order) {
  if (!order.lines.length) return { subtotal: 0, total: 0 };
  const subtotal = order.lines.reduce((sum, line) => sum + lineExtended(line), 0);
  const total = subtotal + Number(order.misc || 0) + Number(order.freight || 0) - Number(order.tradeDiscount || 0);
  return { subtotal, total };
}

function orderRemainingQty(line) {
  return Math.max(0, Number(line.quantity || 0) - Number(line.shippedQty || 0));
}

function orderReadiness(order) {
  const missing = [];
  if (!order.customerId) missing.push("customer");
  if (!order.lines.length) missing.push("at least one line");
  if (order.lines.some((line) => !String(line.part || line.description || "").trim())) missing.push("part or description on every line");
  return { missing, canRelease: order.status === "Open" && missing.length === 0 };
}

function orderFulfillment(order) {
  const ordered = order.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const reserved = order.lines.reduce((sum, line) => sum + Number(line.reservedQty || 0), 0);
  const shipped = order.lines.reduce((sum, line) => sum + Number(line.shippedQty || 0), 0);
  const invoiced = order.lines.reduce((sum, line) => sum + Number(line.invoicedQty || 0), 0);
  const backordered = order.lines.reduce((sum, line) => sum + Number(line.backorderQty || 0), 0);
  const toShip = order.lines.reduce((sum, line) => sum + Number(line.qtyToShip || 0), 0);
  const toInvoice = order.lines.reduce((sum, line) => sum + Number(line.qtyToInvoice || 0), 0);
  return { ordered, reserved, shipped, invoiced, backordered, toShip, toInvoice };
}

function shippingRateReadiness(order) {
  const missing = [];
  if (!order.lines.length) missing.push("order lines");
  if (!/\b\d{5}(-\d{4})?\b/.test(order.shipToAddress || "")) missing.push("Ship To zip code");
  if (!(Number(order.weightLbs) > 0)) missing.push("weight");
  if (!(Number(order.lengthIn) > 0 && Number(order.widthIn) > 0 && Number(order.heightIn) > 0)) missing.push("package dimensions");
  return { missing, ready: missing.length === 0 };
}

function reserveAvailableForOrder(order, { record = true } = {}) {
  let reservedNow = 0;
  order.lines.forEach((line) => {
    if (!line.part) return;
    const stock = getStock(line.part);
    const available = Math.max(0, Number(stock.onHand) - Number(stock.allocated));
    const remainingUnreserved = Math.max(0, orderRemainingQty(line) - Number(line.reservedQty || 0));
    const reserve = Math.min(available, remainingUnreserved);
    if (reserve > 0) {
      stock.allocated = Number(stock.allocated) + reserve;
      line.reservedQty = Number(line.reservedQty || 0) + reserve;
      line.qtyToShip = Number(line.reservedQty);
      reservedNow += reserve;
    }
    line.backorderQty = Math.max(0, orderRemainingQty(line) - Number(line.reservedQty || 0));
  });
  saveStock();
  if (record && reservedNow > 0) recordOrderEvent(order, "Reserved", "Inventory reserved", `${reservedNow} unit${reservedNow === 1 ? "" : "s"} reserved at ${order.locationCode || "MAIN"}.`);
  return reservedNow;
}

function releaseOrder(order) {
  const readiness = orderReadiness(order);
  if (!readiness.canRelease) { showToast(`Can't release yet — add ${readiness.missing.join(" and ")}.`); return; }
  order.status = "Released";
  order.releasedAt = new Date().toISOString();
  order.releasedByInitials = state.identity?.initials || publicDemoIdentity.initials;
  order.releasedByName = state.identity?.name || publicDemoIdentity.name;
  const reserved = reserveAvailableForOrder(order, { record: false });
  const shortages = order.lines.filter((line) => Number(line.backorderQty) > 0).length;
  recordOrderEvent(order, "Released", "Order released", `${reserved} unit${reserved === 1 ? "" : "s"} reserved${shortages ? `; ${shortages} line${shortages === 1 ? "" : "s"} still short` : "; ready for shipment"}.`);
  touchOrder(order);
  renderOrderModal();
  showToast(shortages ? "Order released with projected shortages" : "Order released and stock reserved");
}

function reopenOrder(order) {
  if (order.status !== "Released") return;
  let releasedReservations = 0;
  order.lines.forEach((line) => {
    const reserved = Number(line.reservedQty || 0);
    if (reserved > 0 && line.part) {
      const stock = getStock(line.part);
      stock.allocated = Math.max(0, Number(stock.allocated) - reserved);
      releasedReservations += reserved;
    }
    line.reservedQty = 0;
    line.qtyToShip = 0;
    line.backorderQty = Math.max(0, orderRemainingQty(line));
  });
  saveStock();
  order.status = "Open";
  order.releasedAt = null;
  order.releasedByInitials = "";
  order.releasedByName = "";
  recordOrderEvent(order, "Reopened", "Order reopened", `${releasedReservations} reserved unit${releasedReservations === 1 ? "" : "s"} returned to available inventory.`);
  touchOrder(order);
  renderOrderModal();
  showToast("Order reopened for editing");
}

function postOrderShipment(order) {
  if (order.status !== "Released") return;
  let shippedNow = 0;
  order.lines.forEach((line) => {
    const ship = Math.min(Number(line.qtyToShip || 0), Number(line.reservedQty || 0), orderRemainingQty(line));
    if (ship > 0 && line.part) {
      const stock = getStock(line.part);
      stock.onHand = Math.max(0, Number(stock.onHand) - ship);
      stock.allocated = Math.max(0, Number(stock.allocated) - ship);
    }
    line.reservedQty = Math.max(0, Number(line.reservedQty || 0) - ship);
    line.shippedQty = Number(line.shippedQty || 0) + ship;
    line.qtyToShip = 0;
    line.qtyToInvoice = Math.min(Number(line.shippedQty) - Number(line.invoicedQty || 0), Number(line.qtyToInvoice || 0) + ship);
    line.backorderQty = Math.max(0, orderRemainingQty(line) - Number(line.reservedQty || 0));
    shippedNow += ship;
  });
  if (!shippedNow) { showToast("Enter a quantity to ship first"); return; }
  saveStock();
  recordOrderEvent(order, "Shipment", "Shipment posted", `${shippedNow} unit${shippedNow === 1 ? "" : "s"} shipped from ${order.locationCode || "MAIN"}.`);
  touchOrder(order);
  renderOrderModal();
  showToast(`${shippedNow} unit${shippedNow === 1 ? "" : "s"} posted as shipped`);
}

function postOrderInvoice(order) {
  if (order.status !== "Released") return;
  let invoicedNow = 0;
  order.lines.forEach((line) => {
    const availableToInvoice = Math.max(0, Number(line.shippedQty || 0) - Number(line.invoicedQty || 0));
    const invoice = Math.min(Number(line.qtyToInvoice || 0), availableToInvoice);
    line.invoicedQty = Number(line.invoicedQty || 0) + invoice;
    line.qtyToInvoice = 0;
    invoicedNow += invoice;
  });
  if (!invoicedNow) { showToast("Only shipped quantity can be invoiced"); return; }
  recordOrderEvent(order, "Invoice", "Invoice posted", `${invoicedNow} unit${invoicedNow === 1 ? "" : "s"} invoiced.`);
  const complete = order.lines.length > 0 && order.lines.every((line) => Number(line.shippedQty) >= Number(line.quantity) && Number(line.invoicedQty) >= Number(line.quantity));
  if (complete) {
    order.status = "Closed";
    order.closedAt = new Date().toISOString();
    recordOrderEvent(order, "Closed", "Order closed", "All ordered quantities shipped and invoiced.");
  }
  touchOrder(order);
  renderOrderModal();
  showToast(complete ? "Order fully shipped, invoiced, and closed" : `${invoicedNow} unit${invoicedNow === 1 ? "" : "s"} posted to invoice`);
}

function buildRemainingQty(build) {
  return Math.max(0, Number(build.quantity || 0) - Number(build.builtQty || 0));
}

function canControlBuild() {
  return state.buildWorkspaceRole === "production_controller";
}

function canPostBuild() {
  return ["shop", "production_controller", "inventory_controller"].includes(state.buildWorkspaceRole);
}

function buildReadiness(build) {
  const missing = [];
  if (!build.part) missing.push("what to build");
  if (!(Number(build.quantity) > 0)) missing.push("a quantity");
  if (!build.committedDueDate) missing.push("a committed completion date");
  if (!build.shopAssigneeName) missing.push("a shop assignment");
  return { missing, canRelease: build.status === "Open" && missing.length === 0 };
}

function releaseBuild(build) {
  if (!canControlBuild()) { showToast("Only Production Control can release work to the shop"); return; }
  const readiness = buildReadiness(build);
  if (!readiness.canRelease) { showToast(`Can't release yet — add ${readiness.missing.join(" and ")}.`); return; }
  const reservations = build.components.map((line) => {
    const needed = Math.max(0, Number(line.qtyRequired) - Number(line.qtyConsumed) - Number(line.qtyReserved));
    const stock = line.part ? getStock(line.part) : null;
    const available = stock ? Math.max(0, Number(stock.onHand) - Number(stock.allocated)) : 0;
    return { line, stock, needed, available };
  });
  const shortage = reservations.find(({ needed, available }) => needed > available);
  if (shortage) {
    showToast(`Can't release — ${shortage.line.part || "a component"} needs ${shortage.needed}, but only ${shortage.available} is available.`);
    return;
  }
  reservations.forEach(({ line, stock, needed }) => {
    if (!needed || !stock) return;
    stock.allocated = Number(stock.allocated) + needed;
    line.qtyReserved = Number(line.qtyReserved) + needed;
  });
  build.status = "Released";
  build.releasedAt = new Date().toISOString();
  build.releasedByInitials = state.identity?.initials || publicDemoIdentity.initials;
  build.releasedByName = state.identity?.name || publicDemoIdentity.name;
  recordBuildEvent(build, "Released", "Build Order released", "Production Control reserved available components and released the assignment to the shop.");
  const request = state.buildRequests.find((entry) => entry.id === build.buildRequestId);
  if (request) recordBuildRequestEvent(request, "Released", "Released to the shop", `${build.shopAssigneeName} can begin execution.`, "production_controller");
  saveStock();
  saveBuildRequests();
  touchBuild(build);
  renderBuildModal();
  showToast("Build order released to the shop");
}

function reopenBuild(build) {
  if (!canControlBuild()) { showToast("Only Production Control can reopen released work"); return; }
  if (build.status !== "Released") return;
  if (Number(build.builtQty) > 0 || build.components.some((line) => Number(line.qtyConsumed) > 0)) {
    showToast("Can't reopen — components have already been consumed against this build.");
    return;
  }
  build.components.forEach((line) => {
    if (!line.part || !(Number(line.qtyReserved) > 0)) return;
    const stock = getStock(line.part);
    stock.allocated = Math.max(0, Number(stock.allocated) - Number(line.qtyReserved));
    line.qtyReserved = 0;
    line.qtyToConsume = 0;
  });
  build.status = "Open";
  build.releasedAt = null;
  build.releasedByInitials = "";
  build.releasedByName = "";
  recordBuildEvent(build, "Reopened", "Build Order reopened", "Unused component reservations were returned to available inventory.");
  const request = state.buildRequests.find((entry) => entry.id === build.buildRequestId);
  if (request) recordBuildRequestEvent(request, "Reopened", "Returned to Production Control", "The release was reversed before production began.", "production_controller");
  saveStock();
  saveBuildRequests();
  touchBuild(build);
  renderBuildModal();
  showToast("Build order reopened for editing");
}

function postBuild(build) {
  if (!canPostBuild()) { showToast("Use the Shop Floor or Production Control view to post build progress"); return; }
  if (build.status !== "Released") return;
  let consumedNow = 0;
  build.components.forEach((line) => {
    const consume = Math.max(0, Math.min(Number(line.qtyToConsume) || 0, Number(line.qtyReserved), line.qtyRequired - line.qtyConsumed));
    if (consume > 0 && line.part) {
      const stock = getStock(line.part);
      stock.onHand = Math.max(0, Number(stock.onHand) - consume);
      stock.allocated = Math.max(0, Number(stock.allocated) - consume);
      line.qtyReserved = Math.max(0, Number(line.qtyReserved) - consume);
      line.qtyConsumed += consume;
      consumedNow += consume;
    }
    line.qtyToConsume = 0;
  });
  const finishNow = Math.max(0, Math.min(Number(build.qtyToFinish) || 0, buildRemainingQty(build)));
  if (finishNow > 0 && build.part) {
    const stock = getStock(build.part);
    stock.onHand = Number(stock.onHand) + finishNow;
    build.builtQty += finishNow;
  }
  build.qtyToFinish = 0;
  if (!consumedNow && !finishNow) { showToast("Enter a quantity to consume or finish first"); return; }
  if (consumedNow) recordBuildEvent(build, "Consumed", "Components consumed", `${consumedNow} unit${consumedNow === 1 ? "" : "s"} pulled from inventory.`);
  if (finishNow) recordBuildEvent(build, "Finished", "Build progress posted", `${finishNow} ${build.uom || "EA"} of ${build.part} completed.`);
  if (build.builtQty >= build.quantity) {
    build.status = "Finished";
    build.finishedAt = new Date().toISOString();
    build.components.forEach((line) => {
      if (!line.part || !(Number(line.qtyReserved) > 0)) return;
      const stock = getStock(line.part);
      stock.allocated = Math.max(0, Number(stock.allocated) - Number(line.qtyReserved));
      line.qtyReserved = 0;
      line.qtyToConsume = 0;
    });
    recordBuildEvent(build, "Finished", "Build Order finished", "Full build quantity completed; unused reservations were released.");
    const request = state.buildRequests.find((entry) => entry.id === build.buildRequestId);
    if (request && request.status === "Accepted") {
      request.status = "Fulfilled";
      request.fulfilledAt = new Date().toISOString();
      request.updatedAt = request.fulfilledAt;
      recordBuildRequestEvent(request, "Fulfilled", "Production completed", `${build.buildNumber || "Build Order"} completed the requested quantity.`, "shop");
      saveBuildRequests();
    }
  }
  saveStock();
  touchBuild(build);
  renderBuildModal();
  showToast(build.status === "Finished" ? "Build order finished" : "Build progress posted");
}

async function fetchShippingRate() {
  const order = activeOrder();
  if (!order) return;
  const readiness = shippingRateReadiness(order);
  if (!readiness.ready) { showToast(`Rate needs ${readiness.missing.join(", ")}`); return; }
  const carrier = $("#orderRateCarrier")?.value || "UPS";
  const statusHost = $("#orderRateStatus");
  if (statusHost) statusHost.textContent = "Looking up rate...";
  const destZip = (order.shipToAddress.match(/\b\d{5}(-\d{4})?\b/) || [""])[0];
  if (!destZip) { if (statusHost) statusHost.textContent = "Add a Ship To Address with a zip code first."; return; }
  try {
    const response = await fetch("/.netlify/functions/shipping-rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        carrier, shipVia: order.shipVia, destZip,
        weightLbs: order.weightLbs, lengthIn: order.lengthIn, widthIn: order.widthIn, heightIn: order.heightIn,
      }),
    });
    const data = await response.json();
    if (!data.configured) { if (statusHost) statusHost.textContent = `${carrier} rates aren't configured yet.`; return; }
    if (!data.available) { if (statusHost) statusHost.textContent = data.reason || "No rate available for this combination."; return; }
    order.freight = data.rate;
    touchOrder(order);
    renderOrderModal();
    showToast(`Rate applied: ${formatCurrency(data.rate)}`);
  } catch {
    if (statusHost) statusHost.textContent = "Rate lookup failed.";
  }
}

function renderOrderListSection(title, orders, sectionKey) {
  const open = state.orderListOpen[sectionKey];
  return `<section class="quote-list-section">
    <button type="button" class="quote-list-toggle" data-order-list-toggle="${sectionKey}">
      <span>${escapeHTML(title)} (${orders.length})</span><span class="quote-list-caret">${open ? "▾" : "▸"}</span>
    </button>
    ${open ? (orders.length
      ? `<div class="quote-list-rows">${orders.map((order) => { const f = orderFulfillment(order); return `<button type="button" class="quote-list-row order-list-row" data-order-open="${order.id}"><span><strong>${escapeHTML(orderCompanyName(order))}</strong><small>${escapeHTML(order.orderNumber || "Pending #")} · ${escapeHTML(order.locationCode || "MAIN")}</small></span><span><b class="order-status-pill is-${order.status.toLowerCase()}">${escapeHTML(order.status)}</b><small>${f.shipped}/${f.ordered} shipped${f.backordered ? ` · ${f.backordered} short` : ""}</small></span></button>`; }).join("")}</div>`
      : `<p class="quote-list-empty">No ${escapeHTML(title.toLowerCase())}.</p>`) : ""}
  </section>`;
}

function renderOrdersWorkspace() {
  const openOrders = sortedOrdersByStatus("Open");
  const releasedOrders = sortedOrdersByStatus("Released");
  const closedOrders = sortedOrdersByStatus("Closed");
  const backordered = releasedOrders.filter((order) => orderFulfillment(order).backordered > 0).length;
  const readyToInvoice = releasedOrders.filter((order) => orderFulfillment(order).toInvoice > 0).length;
  elements.overlayBody.innerHTML = `<div class="workbench quotes-workbench">
    <div class="operations-toolbar"><div><strong>Orders</strong><span>${isPublicDemo ? "Portfolio sandbox — changes stay on this device and are never sent to GP." : state.ordersBackendConfigured ? "Synced live across the team — not sent to GP." : "Browser-local only right now — not yet synced across devices, not sent to GP."}</span></div><button type="button" class="primary-button" data-order-new>Start New Order</button></div>
    <div class="order-metric-grid">
      <div><span>Open entry</span><strong>${openOrders.length}</strong></div>
      <div><span>Released</span><strong>${releasedOrders.length}</strong></div>
      <div class="${backordered ? "has-warning" : ""}"><span>Lines short</span><strong>${backordered}</strong></div>
      <div><span>Ready to invoice</span><strong>${readyToInvoice}</strong></div>
    </div>
    ${renderOrderListSection("Open for Entry", openOrders, "open")}
    ${renderOrderListSection("Released to Warehouse", releasedOrders, "released")}
    ${renderOrderListSection("Closed Orders", closedOrders, "closed")}
  </div>`;
}

function requestLifecycleHtml(request) {
  const activeIndex = requestStageIndex(request);
  const steps = ["Requested", "Gatekeeper", "Scheduled", "Released", "Building", "Complete"];
  return `<div class="request-lifecycle" aria-label="Build Request lifecycle">${steps.map((step, index) => `<div class="${index < activeIndex ? "is-complete" : index === activeIndex ? "is-current" : ""}"><span>${index < activeIndex ? "✓" : index + 1}</span><small>${step}</small></div>`).join("")}</div>`;
}

function requestEventsHtml(request) {
  return request.events.slice(0, 5).map((event) => `<div class="request-event"><span></span><div><strong>${escapeHTML(event.summary)}</strong><small>${new Date(event.createdAt).toLocaleString()} · ${escapeHTML(event.actorName || "MDB")}</small>${event.detail ? `<p>${escapeHTML(event.detail)}</p>` : ""}</div></div>`).join("") || '<p class="quote-list-empty">No request activity yet.</p>';
}

function buildRequestCardHtml(request, mode = "sales") {
  const stage = requestStage(request);
  const build = buildForRequest(request);
  const stageClass = slugify(stage);
  const controllerActions = request.status === "Submitted" ? `<div class="gatekeeper-decision">
      <div class="gatekeeper-fields">
        <label><span>Committed completion</span><input type="date" data-request-due="${request.id}" value="${escapeHTML(request.requestedShipDate || "")}"></label>
        <label><span>Priority</span><select data-request-priority="${request.id}">${[1, 2, 3, 4, 5].map((priority) => `<option value="${priority}" ${priority === 3 ? "selected" : ""}>${priority}${priority === 1 ? " · Rush" : priority === 5 ? " · Lowest" : ""}</option>`).join("")}</select></label>
        <label><span>Shop assignment</span><select data-request-assignee="${request.id}"><option value="">Choose a cell...</option>${productionShopAssignments.map((name) => `<option>${escapeHTML(name)}</option>`).join("")}</select></label>
      </div>
      <label class="gatekeeper-note"><span>Decision note / return reason</span><input data-request-note="${request.id}" placeholder="What Sales or the shop needs to know..."></label>
      <div class="button-row"><button type="button" class="secondary-button" data-request-return="${request.id}">Return to Sales</button><button type="button" class="primary-button" data-request-accept="${request.id}">Accept &amp; Schedule</button></div>
    </div>` : build ? `<div class="request-build-link"><div><span>Controlled Build Order</span><strong>${escapeHTML(build.buildNumber || "Pending number")}</strong><small>${escapeHTML(build.shopAssigneeName || "Shop not assigned")} · ${escapeHTML(build.committedDueDate || build.dueDate || "No committed date")}</small></div><button type="button" class="primary-button" data-request-open-build="${request.id}" data-request-open-build-role="production_controller">Open Build Order</button></div>` : "";
  const salesActions = `<div class="request-actions">
      ${request.status === "Returned" ? `<button type="button" class="primary-button" data-request-resubmit="${request.id}">Resubmit to Production Control</button>` : ""}
      ${request.status === "Submitted" ? `<button type="button" class="secondary-button" data-request-cancel="${request.id}">Cancel Request</button>` : ""}
      ${request.status === "Accepted" && build?.status !== "Finished" ? `<button type="button" class="secondary-button" data-request-change="${request.id}">Request a Change</button>` : ""}
      ${build ? `<button type="button" class="primary-button" data-request-open-build="${request.id}" data-request-open-build-role="sales">Track Production Order</button>` : ""}
    </div>`;
  return `<article class="build-request-card" data-request-card="${request.id}">
    <header><div><span>${escapeHTML(request.requestNumber)}</span><h3>${escapeHTML(request.part)}</h3><p>${escapeHTML(request.description || "Build requested")}</p></div><b class="request-stage is-${stageClass}">${escapeHTML(stage)}</b></header>
    <div class="request-facts">
      <div><span>Sales Order</span><strong>${escapeHTML(requestSourceLabel(request))}</strong></div>
      <div><span>Requested</span><strong>${request.requestedQuantity} ${escapeHTML(request.uom || "EA")}</strong></div>
      <div><span>Need date</span><strong>${escapeHTML(request.requestedShipDate || "Not specified")}</strong></div>
      <div><span>Originator</span><strong>${escapeHTML(request.originatorName)}</strong></div>
    </div>
    ${request.returnedReason ? `<div class="request-exception"><strong>Production Control needs more information</strong><span>${escapeHTML(request.returnedReason)}</span></div>` : ""}
    ${build?.exceptionDetail ? `<div class="request-exception"><strong>${escapeHTML(stage)}</strong><span>${escapeHTML(build.exceptionDetail)}</span></div>` : ""}
    ${requestLifecycleHtml(request)}
    ${mode === "controller" ? controllerActions : salesActions}
    <details class="request-history"><summary>Request activity (${request.events.length})</summary>${requestEventsHtml(request)}</details>
  </article>`;
}

function buildRequestSourceOptions() {
  const entries = requestSourceLines();
  if (!entries.length) return "";
  return entries.map(({ order, line, key, remaining }) => `<option value="${escapeHTML(key)}">${escapeHTML(order.orderNumber || "Pending order")} · ${escapeHTML(line.part)} · ${remaining} ${escapeHTML(line.uom || "EA")} available to request</option>`).join("");
}

function renderBuildRequestEditor() {
  const options = buildRequestSourceOptions();
  if (!state.buildRequestEditorOpen) return "";
  return `<section class="build-request-editor">
    <header><div><span>SALES HANDOFF</span><h3>Request an in-house build</h3><p>The exact Sales Order line remains the source of demand. Production Control decides whether and when work is released.</p></div><button type="button" class="close-button" data-request-editor-close aria-label="Close request form">×</button></header>
    ${options ? `<form id="buildRequestForm">
      <label><span>Sales Order line</span><select name="sourceLine" required>${options}</select></label>
      <label><span>Quantity needed</span><input name="requestedQuantity" type="number" min="1" max="5000" value="1" required></label>
      <label><span>Customer need date</span><input name="requestedShipDate" type="date"></label>
      <label class="is-wide"><span>Customer requirements / production context</span><textarea name="customerRequirements" rows="3" placeholder="What Production Control needs to make a sound commitment..."></textarea></label>
      ${state.buildRequestFormError ? `<p class="form-error is-wide">${escapeHTML(state.buildRequestFormError)}</p>` : ""}
      <div class="button-row is-wide"><button type="button" class="secondary-button" data-request-editor-close>Cancel</button><button type="submit" class="primary-button">Submit to Production Control</button></div>
    </form>` : `<div class="request-empty-state"><strong>No unrequested Sales Order quantity is available.</strong><p>Create or release an Order with a buildable line, then return here.</p><button type="button" class="primary-button" data-request-open-orders>Open Orders</button></div>`}
  </section>`;
}

function createBuildRequestFromForm(form) {
  const values = new FormData(form);
  const sourceKey = String(values.get("sourceLine") || "");
  const source = requestSourceLines().find((entry) => entry.key === sourceKey);
  const quantity = Math.floor(Number(values.get("requestedQuantity")) || 0);
  if (!source || quantity < 1 || quantity > source.remaining) {
    state.buildRequestFormError = source ? `Quantity must be between 1 and ${source.remaining}.` : "Choose an available Sales Order line.";
    renderBuildRequestsWorkspace();
    return;
  }
  const request = normalizeBuildRequest({
    id: `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    requestNumber: nextBuildRequestNumber(),
    sourceOrderId: source.order.id,
    sourceOrderNumber: source.order.orderNumber,
    sourceOrderLineKey: source.line.lineKey,
    originatorName: productionDemoActors.sales.name,
    originatorInitials: productionDemoActors.sales.initials,
    itemId: source.line.itemId || itemIdForPart(source.line.part),
    part: source.line.part,
    description: source.line.description,
    uom: source.line.uom || "EA",
    requestedQuantity: quantity,
    requestedShipDate: String(values.get("requestedShipDate") || source.order.reqShipDate || ""),
    customerRequirements: String(values.get("customerRequirements") || "").trim(),
    status: "Submitted",
    submittedAt: new Date().toISOString(),
    events: [],
  });
  recordBuildRequestEvent(request, "Created", "Build Request created", `Demand captured from ${source.order.orderNumber || "the Sales Order"}.`, "sales");
  recordBuildRequestEvent(request, "Submitted", "Submitted to Production Control", "Waiting for gatekeeper review and a production commitment.", "sales");
  state.buildRequests.unshift(request);
  state.buildRequestEditorOpen = false;
  state.buildRequestFormError = "";
  saveBuildRequests();
  renderBuildRequestsWorkspace();
  showToast(`${request.requestNumber} submitted to Production Control`);
}

function renderBuildRequestsWorkspace() {
  const requests = [...state.buildRequests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const waiting = requests.filter((request) => request.status === "Submitted").length;
  const active = requests.filter((request) => request.status === "Accepted").length;
  const completed = requests.filter((request) => request.status === "Fulfilled").length;
  elements.overlayBody.innerHTML = `<div class="workbench production-workbench">
    <div class="operations-toolbar"><div><strong>Build Requests</strong><span>Sales can request and track production without editing the shop's controlled Build Order.</span></div><button type="button" class="primary-button" data-request-new>New Build Request</button></div>
    <div class="production-boundary"><span>SALES VIEW</span><strong>Demand originates from an exact Sales Order line.</strong><p>Production Control owns acceptance, committed dates, priority, assignment, and release. This public sandbox simulates those permissions; the internal endpoint enforces them server-side.</p></div>
    <div class="order-metric-grid">
      <div><span>Waiting on gatekeeper</span><strong>${waiting}</strong></div>
      <div><span>Active production</span><strong>${active}</strong></div>
      <div><span>Needs information</span><strong>${requests.filter((request) => request.status === "Returned").length}</strong></div>
      <div><span>Completed</span><strong>${completed}</strong></div>
    </div>
    ${renderBuildRequestEditor()}
    <section class="request-card-list">${requests.map((request) => buildRequestCardHtml(request, "sales")).join("") || '<div class="request-empty-state"><strong>No Build Requests yet.</strong><p>Start from a Sales Order line when customer demand requires an in-house build.</p></div>'}</section>
  </div>`;
}

function serviceWorkOrderForRequest(request) {
  return state.serviceWorkOrders.find((workOrder) => workOrder.service_request_id === request.id) || null;
}

function operationsJobForRequest(request) {
  const workOrder = serviceWorkOrderForRequest(request);
  return workOrder ? state.operationsJobs.find((job) => job.id === workOrder.operations_job_id) || null : null;
}

function serviceRequestForJob(job) {
  const workOrder = state.serviceWorkOrders.find((entry) => entry.operations_job_id === job.id);
  return workOrder ? state.serviceRequests.find((request) => request.id === workOrder.service_request_id) || null : null;
}

function operationDateTime(value) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return String(value);
  return date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function serviceRequestStage(request) {
  if (request.status === "Cancelled") return "Cancelled";
  if (request.status === "Resolved") return "Complete";
  if (["Needs Information", "Returned"].includes(request.status)) return "Needs Information";
  if (request.status === "Draft") return "Draft";
  if (request.status === "Submitted") return "Waiting on Gatekeeper";
  if (request.status === "Triaged") return "Triaged";
  if (request.status === "Accepted") return "Accepted";
  const job = operationsJobForRequest(request);
  if (!job) return "Order Setup Pending";
  if (job.exception_code === "blocked") return "Blocked";
  if (job.exception_code === "on_hold") return "On Hold";
  return {
    Planning: "Order Setup Pending", "Order Setup Pending": "Order Setup Pending", Scheduled: "Scheduled",
    Released: "Released", "In Progress": "Work in Progress", "Work Complete": "Work Complete",
    "Signoff Complete": "Signoff Complete", Closed: "Complete", Cancelled: "Cancelled",
  }[job.status] || job.status;
}

function serviceRequestStageIndex(request) {
  const stage = serviceRequestStage(request);
  if (["Draft", "Needs Information"].includes(stage)) return 0;
  if (["Waiting on Gatekeeper", "Triaged"].includes(stage)) return 1;
  if (["Accepted", "Order Setup Pending"].includes(stage)) return 2;
  if (stage === "Scheduled") return 3;
  if (["Released", "Work in Progress", "Blocked", "On Hold", "Work Complete", "Signoff Complete"].includes(stage)) return 4;
  if (stage === "Complete") return 5;
  return -1;
}

function serviceLifecycleHtml(request) {
  const activeIndex = serviceRequestStageIndex(request);
  const steps = ["Requested", "Gatekeeper", "Accepted", "Scheduled", "Service", "Closed"];
  return `<div class="request-lifecycle" aria-label="Service Request lifecycle">${steps.map((step, index) => `<div class="${index < activeIndex ? "is-complete" : index === activeIndex ? "is-current" : ""}"><span>${index < activeIndex ? "✓" : index + 1}</span><small>${step}</small></div>`).join("")}</div>`;
}

function serviceRequestEventsHtml(request) {
  const events = state.serviceRequestEvents.filter((event) => event.service_request_id === request.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return events.slice(0, 8).map((event) => `<div class="request-event"><span></span><div><strong>${escapeHTML(event.summary)}</strong><small>${operationDateTime(event.created_at)} · ${escapeHTML(event.actor_name || "MDB workflow")}</small>${event.detail ? `<p>${escapeHTML(event.detail)}</p>` : ""}</div></div>`).join("") || '<p class="quote-list-empty">No request activity yet.</p>';
}

function serviceGatekeeperDecisionHtml(request) {
  if (request.status === "Submitted") return `<div class="gatekeeper-decision">
    <label class="gatekeeper-note"><span>Triage note / information needed</span><input data-service-note="${request.id}" placeholder="Record the decision context before routing..."></label>
    <div class="button-row"><button type="button" class="secondary-button" data-service-transition="needs_information" data-service-request-id="${request.id}">Needs Information</button><button type="button" class="primary-button" data-service-transition="triage" data-service-request-id="${request.id}">Triage Request</button></div>
  </div>`;
  if (request.status === "Triaged") return `<div class="gatekeeper-decision">
    <div class="gatekeeper-fields">
      <label><span>Financial path</span><select data-service-financial="${request.id}">${["Unknown", "Warranty", "Billable"].map((value) => `<option ${value === request.financial_class ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      <label><span>Service mode</span><select data-service-mode="${request.id}">${["Unknown", "In House", "Field", "Outside"].map((value) => `<option ${value === request.service_mode ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      <label><span>Priority</span><select data-service-priority="${request.id}">${[1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${value === 3 ? "selected" : ""}>${value}${value === 1 ? " · Rush" : ""}</option>`).join("")}</select></label>
    </div>
    <label class="gatekeeper-note"><span>Acceptance note</span><input data-service-note="${request.id}" placeholder="Classification, customer promise, or routing note..."></label>
    <div class="button-row"><button type="button" class="secondary-button" data-service-transition="return" data-service-request-id="${request.id}">Return to Requester</button><button type="button" class="primary-button" data-service-transition="accept" data-service-request-id="${request.id}">Accept Request</button></div>
  </div>`;
  if (request.status === "Accepted") {
    const eligibleAssignees = state.operationalUsers.filter((user) => (user.operational_user_roles || []).some((entry) => ["service_technician", "shop", "service_controller", "production_controller", "admin"].includes(entry.role)));
    return `<div class="gatekeeper-decision"><strong>Acceptance is recorded. Execution does not exist yet.</strong><p>Conversion now creates a separate shared Operations Job and Service Work Order while preserving this request as the requester-facing record.</p><div class="gatekeeper-fields"><label><span>Initial service assignee</span><select data-service-assignee="${request.id}"><option value="">Assign during scheduling</option>${eligibleAssignees.map((user) => `<option value="${user.id}">${escapeHTML(user.display_name)}</option>`).join("")}</select></label></div><div class="button-row"><button type="button" class="primary-button" data-service-transition="convert" data-service-request-id="${request.id}">Create Controlled Work</button></div></div>`;
  }
  const workOrder = serviceWorkOrderForRequest(request);
  const job = operationsJobForRequest(request);
  return workOrder && job ? `<div class="request-build-link"><div><span>Controlled Service Work</span><strong>${escapeHTML(workOrder.work_order_number || workOrder.id)} · ${escapeHTML(job.job_number || job.id)}</strong><small>${escapeHTML(job.status)} · ${escapeHTML(job.assignee_name || "Assignment pending")} · GP link ${escapeHTML(job.gp_link_status || "Pending")}</small></div><button type="button" class="primary-button" data-open-operations-board>Open Operations Job</button></div>` : "";
}

function serviceRequestCardHtml(request, mode = "requester") {
  const stage = serviceRequestStage(request);
  const job = operationsJobForRequest(request);
  const exception = request.returned_reason || job?.exception_detail || "";
  const requesterActions = mode === "requester" ? `<div class="request-actions">
    ${["Needs Information", "Returned"].includes(request.status) ? `<button type="button" class="primary-button" data-service-transition="submit" data-service-request-id="${request.id}">Resubmit to Gatekeeper</button>` : ""}
    ${["Draft", "Submitted", "Needs Information", "Returned"].includes(request.status) ? `<button type="button" class="secondary-button" data-service-transition="cancel" data-service-request-id="${request.id}">Cancel Request</button>` : ""}
  </div>` : "";
  return `<article class="build-request-card service-request-card" data-service-request-card="${request.id}">
    <header><div><span>${escapeHTML(request.request_number || request.id)} · ${escapeHTML(request.source_channel || "Desktop")}</span><h3>${escapeHTML(request.production_serial || request.asset_id || request.rig_model || "Service asset")}</h3><p>${escapeHTML(request.complaint || request.requested_work)}</p></div><b class="request-stage is-${slugify(stage)}">${escapeHTML(stage)}</b></header>
    <div class="request-facts service-request-facts">
      <div><span>Urgency</span><strong>${escapeHTML(request.urgency || "Routine")}</strong></div>
      <div><span>Customer / location</span><strong>${escapeHTML(request.customer_name_snapshot || "Not supplied")} · ${escapeHTML(request.service_location || "Location pending")}</strong></div>
      <div><span>Financial / mode</span><strong>${escapeHTML(request.financial_class || "Unknown")} · ${escapeHTML(request.service_mode || "Unknown")}</strong></div>
      <div><span>Requester</span><strong>${escapeHTML(request.requester_name || "Signed-in employee")}</strong></div>
    </div>
    ${exception ? `<div class="request-exception"><strong>${escapeHTML(stage)}</strong><span>${escapeHTML(exception)}</span></div>` : ""}
    ${serviceLifecycleHtml(request)}
    ${mode === "controller" ? serviceGatekeeperDecisionHtml(request) : job ? `<div class="request-build-link"><div><span>Current commitment</span><strong>${escapeHTML(job.status)}</strong><small>${operationDateTime(job.planned_start_at)} → ${operationDateTime(job.committed_due_at)}</small></div><button type="button" class="primary-button" data-open-operations-board>Track Operations Job</button></div>` : ""}
    ${requesterActions}
    <details class="request-history"><summary>Request activity (${state.serviceRequestEvents.filter((event) => event.service_request_id === request.id).length})</summary>${serviceRequestEventsHtml(request)}</details>
  </article>`;
}

function renderServiceRequestEditor() {
  if (!state.serviceRequestEditorOpen) return "";
  return `<section class="build-request-editor service-request-editor">
    <header><div><span>SERVICE INTAKE</span><h3>Document a rig or field-service need</h3><p>Capture enough context for the office gatekeeper to classify and route the request. Submission does not create or promise work.</p></div><button type="button" class="close-button" data-service-editor-close aria-label="Close service form">×</button></header>
    <form id="serviceRequestForm">
      <label><span>Source</span><select name="sourceChannel"><option>Desktop</option><option>Mobile</option><option>NFC</option><option>Email</option></select></label>
      <label><span>Urgency</span><select name="urgency"><option>Routine</option><option>Priority</option><option>Urgent</option><option>Machine Down</option><option>Safety</option></select></label>
      <label><span>Rig model</span><input name="rigModel" placeholder="B57, B37X..."></label>
      <label><span>Asset ID</span><input name="assetId" placeholder="Fleet or rig identifier"></label>
      <label><span>Production serial</span><input name="productionSerial" placeholder="MDB production serial"></label>
      <label><span>Drill hours</span><input name="drillHours" type="number" min="0" step="0.1"></label>
      <label><span>Customer</span><input name="customerName" placeholder="Customer or internal owner"></label>
      <label><span>Service location</span><input name="serviceLocation" placeholder="Site, city, or MDB shop"></label>
      <label><span>Customer contact</span><input name="customerContact" placeholder="Name, phone, or email"></label>
      <label class="is-wide"><span>Complaint / observed condition</span><textarea name="complaint" rows="3" placeholder="What happened, what is the machine doing, and what has already been checked?"></textarea></label>
      <label class="is-wide"><span>Requested work / office help needed</span><textarea name="requestedWork" rows="3" placeholder="Parts identification, escalation, scheduling, diagnostic help, repair..."></textarea></label>
      ${state.serviceRequestFormError ? `<p class="form-error is-wide">${escapeHTML(state.serviceRequestFormError)}</p>` : ""}
      <div class="button-row is-wide"><button type="button" class="secondary-button" data-service-editor-close>Cancel</button><button type="submit" class="primary-button">Submit to Service Gatekeeper</button></div>
    </form>
  </section>`;
}

async function createServiceRequestFromForm(form) {
  const values = new FormData(form);
  const payload = Object.fromEntries(values.entries());
  if (!String(payload.assetId || "").trim() && !String(payload.productionSerial || "").trim()) {
    state.serviceRequestFormError = "Enter an Asset ID or production serial so the request stays tied to a real rig.";
    renderServiceRequestsWorkspace();
    return;
  }
  if (!String(payload.complaint || "").trim() && !String(payload.requestedWork || "").trim()) {
    state.serviceRequestFormError = "Describe the observed condition or the work/help being requested.";
    renderServiceRequestsWorkspace();
    return;
  }
  try {
    if (!isPublicDemo) {
      await postOperationsAction({ operation: "create_service_request", ...payload, submit: true });
    } else {
      const request = {
        id: `demo-service-${Date.now()}`, request_number: `SRQ${String(1000 + state.serviceRequests.length).padStart(6, "0")}`,
        source_channel: payload.sourceChannel, requester_user_id: "demo-current-requester", requester_name: "Current Employee",
        urgency: payload.urgency, customer_name_snapshot: String(payload.customerName || ""), service_location: String(payload.serviceLocation || ""),
        customer_contact_snapshot: String(payload.customerContact || ""), asset_id: String(payload.assetId || ""),
        production_serial: String(payload.productionSerial || ""), rig_model: String(payload.rigModel || ""),
        drill_hours: payload.drillHours ? Number(payload.drillHours) : null, complaint: String(payload.complaint || ""),
        requested_work: String(payload.requestedWork || ""), financial_class: "Unknown", service_mode: "Unknown",
        status: "Submitted", submitted_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      state.serviceRequests.unshift(request);
      state.serviceRequestEvents.unshift({ event_key: `sre-${Date.now()}`, service_request_id: request.id, event_type: "Submitted", summary: "Submitted for service triage", detail: "No work or customer promise has been created yet.", actor_name: "Current Employee", created_at: new Date().toISOString() });
      saveOperationsSnapshot();
    }
    state.serviceRequestEditorOpen = false;
    state.serviceRequestFormError = "";
    renderServiceRequestsWorkspace();
    showToast("Service Request submitted to the gatekeeper");
  } catch (error) {
    state.serviceRequestFormError = error.message;
    renderServiceRequestsWorkspace();
  }
}

async function transitionServiceRequest(request, action, card) {
  const note = card?.querySelector(`[data-service-note="${CSS.escape(request.id)}"]`)?.value || "";
  const financialClass = card?.querySelector(`[data-service-financial="${CSS.escape(request.id)}"]`)?.value || null;
  const serviceMode = card?.querySelector(`[data-service-mode="${CSS.escape(request.id)}"]`)?.value || null;
  const priority = Number(card?.querySelector(`[data-service-priority="${CSS.escape(request.id)}"]`)?.value || 3);
  const assigneeUserId = card?.querySelector(`[data-service-assignee="${CSS.escape(request.id)}"]`)?.value || null;
  try {
    if (!isPublicDemo) {
      await postOperationsAction({ operation: "transition_service_request", serviceRequestId: request.id, action, note, financialClass, serviceMode, priority, assigneeUserId });
    } else {
      const transition = {
        submit: ["Submitted", "Submitted", "Resubmitted for service triage"],
        needs_information: ["Needs Information", "NeedsInformation", "More information requested"],
        return: ["Returned", "Returned", "Returned to requester"],
        triage: ["Triaged", "Triaged", "Request triaged"],
        accept: ["Accepted", "Accepted", "Service Request accepted"],
        convert: ["Converted", "Converted", "Controlled service work created"],
        cancel: ["Cancelled", "Cancelled", "Service Request cancelled"],
      }[action];
      if (!transition) return;
      [request.status] = transition;
      request.updated_at = new Date().toISOString();
      if (action === "submit") { request.submitted_at = request.updated_at; request.returned_reason = ""; }
      if (action === "cancel") request.cancelled_at = request.updated_at;
      if (["needs_information", "return"].includes(action)) request.returned_reason = note || "Additional service context is required.";
      if (action === "triage") request.triaged_at = request.updated_at;
      if (action === "accept") {
        request.accepted_at = request.updated_at;
        request.financial_class = financialClass || request.financial_class;
        request.service_mode = serviceMode || request.service_mode;
      }
      if (action === "convert") {
        request.converted_at = request.updated_at;
        const jobId = `demo-service-job-${Date.now()}`;
        const workOrderId = `demo-service-work-${Date.now()}`;
        state.operationsJobs.unshift({
          id: jobId, job_number: `OPJ${String(1000 + state.operationsJobs.length).padStart(6, "0")}`, job_type: "service_job",
          status: "Order Setup Pending", title: `${request.production_serial || request.asset_id} · ${request.complaint || request.requested_work}`,
          controller_user_id: "demo-service-controller", assignee_user_id: assigneeUserId || null, assignee_name: state.operationalUsers.find((user) => user.id === assigneeUserId)?.display_name || "Assignment pending",
          priority, work_center_id: null, planned_start_at: null, committed_due_at: null, gp_link_status: "Pending",
          exception_code: null, exception_detail: "", created_at: request.updated_at, updated_at: request.updated_at,
        });
        state.serviceWorkOrders.unshift({ id: workOrderId, work_order_number: `SWRK${String(1000 + state.serviceWorkOrders.length).padStart(6, "0")}`, service_request_id: request.id, operations_job_id: jobId, scope_version: 0, scope_summary: "Scope pending controller review.", created_at: request.updated_at });
        [
          ["before_photos", "Before photos captured", "service_technician"], ["safety_functions", "Safety functions confirmed", "service_technician"],
          ["service_inspection", "Inspection complete", "service_technician"], ["after_photos", "Repair evidence captured", "service_technician"],
          ["final_clean", "Final clean complete", "service_technician"], ["shipping_pickup", "Shipping or pickup ready", "service_controller"],
        ].forEach(([checkpoint_key, checkpoint_name, owner_role], index) => state.operationsJobCheckpoints.push({ job_id: jobId, checkpoint_key, checkpoint_name, checkpoint_version: 1, sequence: index + 1, owner_role, status: "Pending", evidence_note: "", blocker_detail: "" }));
      }
      state.serviceRequestEvents.unshift({ event_key: `sre-${Date.now()}`, service_request_id: request.id, event_type: transition[1], summary: transition[2], detail: note, actor_name: "Service Controller", created_at: new Date().toISOString() });
      saveOperationsSnapshot();
    }
    renderActiveOperationsWorkspace();
    showToast(`${request.request_number || "Service Request"} moved to ${request.status}`);
  } catch (error) {
    showToast(error.message);
  }
}

function renderServiceRequestsWorkspace() {
  const requests = [...state.serviceRequests].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const active = requests.filter((request) => !["Resolved", "Cancelled"].includes(request.status));
  elements.overlayBody.innerHTML = `<div class="workbench production-workbench service-workbench">
    <div class="operations-toolbar"><div><strong>Service Requests</strong><span>Fast intake and transparent tracking for office, field, and future Mobile Lite/NFC entry.</span></div><button type="button" class="primary-button" data-service-new>New Service Request</button></div>
    <div class="production-boundary"><span>REQUESTER VIEW</span><strong>A request documents a need; it does not promise service work.</strong><p>The service gatekeeper owns triage, financial classification, mode, priority, assignment, scheduling, and conversion. Requesters can follow every controlled stage without editing the Service Work Order.</p></div>
    <div class="order-metric-grid">
      <div><span>Waiting on gatekeeper</span><strong>${requests.filter((request) => request.status === "Submitted").length}</strong></div>
      <div><span>Needs information</span><strong>${requests.filter((request) => ["Needs Information", "Returned"].includes(request.status)).length}</strong></div>
      <div><span>Controlled work</span><strong>${requests.filter((request) => request.status === "Converted").length}</strong></div>
      <div><span>Open requests</span><strong>${active.length}</strong></div>
    </div>
    ${renderServiceRequestEditor()}
    <section class="request-card-list">${requests.map((request) => serviceRequestCardHtml(request, "requester")).join("") || '<div class="request-empty-state"><strong>No Service Requests yet.</strong><p>Use one when a rig, field crew, or customer needs office-controlled service action.</p></div>'}</section>
  </div>`;
}

function activeAssignmentForJob(job) {
  return state.operationsJobAssignments.find((assignment) => assignment.job_id === job.id && !assignment.superseded_at) || null;
}

function operationJobCardHtml(job) {
  const request = serviceRequestForJob(job);
  const workOrder = request ? serviceWorkOrderForRequest(request) : null;
  const assignment = activeAssignmentForJob(job);
  const checkpoints = state.operationsJobCheckpoints.filter((checkpoint) => checkpoint.job_id === job.id)
    .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0));
  const completed = checkpoints.filter((checkpoint) => ["Complete", "Waived"].includes(checkpoint.status)).length;
  const centers = state.workCenters.filter((center) => center.center_type === "service_bay" || center.center_type === "field");
  const eligibleAssignees = state.operationalUsers.filter((user) => (user.operational_user_roles || []).some((entry) => ["service_technician", "shop", "service_controller", "production_controller", "admin"].includes(entry.role)));
  const controller = state.operationsBoardRole === "service_controller";
  const technician = state.operationsBoardRole === "service_technician";
  const scopeControls = controller && workOrder && Number(workOrder.scope_version || 0) < 1 ? `<div class="operations-scope-controls"><label><span>Controlled service scope</span><textarea data-job-scope="${job.id}" rows="3">${escapeHTML(request?.requested_work || request?.complaint || "")}</textarea></label><button type="button" class="primary-button" data-job-scope-save="${job.id}">Establish Version 1 Scope</button></div>` : "";
  const scheduleControls = controller && Number(workOrder?.scope_version || 0) >= 1 && ["Planning", "Order Setup Pending"].includes(job.status) ? `<div class="operations-job-controls">
    <label><span>Work center</span><select data-job-center="${job.id}">${centers.map((center) => `<option value="${center.id}">${escapeHTML(center.code)} · ${escapeHTML(center.name)} (${center.capacity} slot${Number(center.capacity) === 1 ? "" : "s"})</option>`).join("")}</select></label>
    <label><span>Start</span><input type="datetime-local" data-job-start="${job.id}" value="${operationsDemoTimestamp(1, 8).slice(0, 16)}"></label>
    <label><span>Committed due</span><input type="datetime-local" data-job-end="${job.id}" value="${operationsDemoTimestamp(2, 16).slice(0, 16)}"></label>
    <label><span>Assignee</span><select data-job-assignee="${job.id}"><option value="">Keep current assignment</option>${eligibleAssignees.map((user) => `<option value="${user.id}" ${user.id === job.assignee_user_id ? "selected" : ""}>${escapeHTML(user.display_name)}</option>`).join("")}</select></label>
    <button type="button" class="primary-button" data-job-action="schedule" data-job-id="${job.id}">Commit Schedule</button>
  </div>` : "";
  const gatekeeperActions = controller ? `<div class="request-actions operations-job-actions">
    ${job.status === "Scheduled" ? `<button type="button" class="primary-button" data-job-action="release" data-job-id="${job.id}">Release to Technician</button>` : ""}
    ${job.status === "Work Complete" && !state.serviceSignoffs.some((signoff) => signoff.service_work_order_id === workOrder?.id && signoff.party_type === "Internal") ? `<button type="button" class="secondary-button" data-job-signoff="Internal" data-job-id="${job.id}">Record Internal Signoff</button>` : ""}
    ${job.status === "Work Complete" && !state.serviceSignoffs.some((signoff) => signoff.service_work_order_id === workOrder?.id && signoff.party_type === "Customer") ? `<button type="button" class="secondary-button" data-job-signoff="Customer" data-job-id="${job.id}">Record Customer Signoff</button>` : ""}
    ${job.status === "Work Complete" && state.serviceSignoffs.filter((signoff) => signoff.service_work_order_id === workOrder?.id).length >= 2 ? `<button type="button" class="primary-button" data-job-action="complete_signoff" data-job-id="${job.id}">Complete Signoff Stage</button>` : ""}
    ${job.status === "Signoff Complete" ? `<button type="button" class="primary-button" data-job-action="close" data-job-id="${job.id}">Close Service Work</button>` : ""}
  </div>` : "";
  const technicianActions = technician ? `<div class="request-actions operations-job-actions">
    ${job.status === "Released" ? `<button type="button" class="primary-button" data-job-action="start" data-job-id="${job.id}">Start Work</button>` : ""}
    ${job.status === "In Progress" && completed === checkpoints.length ? `<button type="button" class="primary-button" data-job-action="complete_work" data-job-id="${job.id}">Mark Work Complete</button>` : ""}
  </div>` : "";
  return `<article class="operations-job-card" data-operations-job-card="${job.id}">
    <header><div><span>${escapeHTML(job.job_number || job.id)} · ${escapeHTML(job.job_type || "operations")}</span><h3>${escapeHTML(job.title)}</h3><p>${request ? `${escapeHTML(request.request_number)} · ${escapeHTML(workOrder?.work_order_number || "Work Order pending")}` : "Linked Build Order"}</p></div><div class="operations-job-status"><b class="request-stage is-${slugify(job.status)}">${escapeHTML(job.status)}</b><small>GP ${escapeHTML(job.gp_link_status || "Pending")}</small></div></header>
    <div class="request-facts"><div><span>Priority</span><strong>${escapeHTML(job.priority)}</strong></div><div><span>Work center</span><strong>${escapeHTML(state.workCenters.find((center) => center.id === job.work_center_id)?.name || "Not assigned")}</strong></div><div><span>Assignee</span><strong>${escapeHTML(job.assignee_name || "Not assigned")}</strong></div><div><span>Commitment</span><strong>${operationDateTime(assignment?.ends_at || job.committed_due_at)}</strong></div></div>
    ${job.exception_detail ? `<div class="request-exception"><strong>${escapeHTML(job.exception_code || "Exception")}</strong><span>${escapeHTML(job.exception_detail)}</span></div>` : ""}
    ${scopeControls}${scheduleControls}
    <div class="checkpoint-list"><header><strong>Controlled checkpoints</strong><span>${completed} of ${checkpoints.length} complete</span></header>${checkpoints.map((checkpoint) => {
      const definition = state.operationsCheckpointDefinitions.find((entry) => entry.checkpoint_key === checkpoint.checkpoint_key && Number(entry.version) === Number(checkpoint.checkpoint_version));
      const ownerRole = checkpoint.owner_role || definition?.owner_role || "Shared";
      const canUpdate = controller || (technician && ["service_technician", "shop"].includes(ownerRole));
      return `<div class="checkpoint-row is-${slugify(checkpoint.status)}"><span>${["Complete", "Waived"].includes(checkpoint.status) ? "✓" : checkpoint.status === "Blocked" ? "!" : "○"}</span><div><strong>${escapeHTML(checkpoint.checkpoint_name || definition?.name || checkpoint.checkpoint_key)}</strong><small>${escapeHTML(ownerRole)} · ${escapeHTML(checkpoint.status)}${checkpoint.evidence_note ? ` · ${escapeHTML(checkpoint.evidence_note)}` : ""}</small></div>${canUpdate && ["Released", "In Progress"].includes(job.status) && !["Complete", "Waived"].includes(checkpoint.status) ? `<button type="button" class="table-button" data-checkpoint-complete="${escapeHTML(checkpoint.checkpoint_key)}" data-job-id="${job.id}">Complete</button>` : ""}</div>`;
    }).join("") || '<p class="quote-list-empty">Checkpoint template pending.</p>'}</div>
    ${gatekeeperActions}${technicianActions}
  </article>`;
}

async function runJobAction(job, action, card) {
  try {
    if (action === "schedule") {
      const workCenterId = card.querySelector(`[data-job-center="${CSS.escape(job.id)}"]`)?.value;
      const startsAt = card.querySelector(`[data-job-start="${CSS.escape(job.id)}"]`)?.value;
      const endsAt = card.querySelector(`[data-job-end="${CSS.escape(job.id)}"]`)?.value;
      const assigneeUserId = card.querySelector(`[data-job-assignee="${CSS.escape(job.id)}"]`)?.value || null;
      if (!workCenterId || !startsAt || !endsAt) throw new Error("Choose a work center and complete schedule window.");
      if (!isPublicDemo) await postOperationsAction({ operation: "schedule_job", operationsJobId: job.id, workCenterId, slotNumber: 1, startsAt, endsAt, reason: "Gatekeeper capacity commitment", assigneeUserId });
      else {
        job.status = "Scheduled"; job.work_center_id = workCenterId; job.planned_start_at = new Date(startsAt).toISOString(); job.committed_due_at = new Date(endsAt).toISOString(); job.updated_at = new Date().toISOString();
        if (assigneeUserId) { job.assignee_user_id = assigneeUserId; job.assignee_name = state.operationalUsers.find((user) => user.id === assigneeUserId)?.display_name || "Assigned employee"; }
        state.operationsJobAssignments.filter((entry) => entry.job_id === job.id && !entry.superseded_at).forEach((entry) => { entry.superseded_at = job.updated_at; });
        state.operationsJobAssignments.unshift({ id: Date.now(), job_id: job.id, work_center_id: workCenterId, slot_number: 1, starts_at: job.planned_start_at, ends_at: job.committed_due_at, revision: 1, reason: "Gatekeeper capacity commitment", created_at: job.updated_at, superseded_at: null });
      }
    } else if (!isPublicDemo) {
      await postOperationsAction({ operation: "transition_service_job", operationsJobId: job.id, action, note: "Recorded from the Operations Board" });
    } else {
      const statuses = { release: "Released", start: "In Progress", complete_work: "Work Complete", complete_signoff: "Signoff Complete", close: "Closed" };
      job.status = statuses[action] || job.status; job.updated_at = new Date().toISOString();
      if (action === "start") job.actual_started_at = job.updated_at;
      if (action === "complete_work") job.work_completed_at = job.updated_at;
      if (action === "complete_signoff") job.signoff_completed_at = job.updated_at;
      if (action === "close") {
        job.closed_at = job.updated_at;
        const request = serviceRequestForJob(job);
        if (request) { request.status = "Resolved"; request.resolved_at = job.updated_at; }
      }
    }
    if (isPublicDemo) {
      state.operationsJobEvents.unshift({ event_key: `oje-${Date.now()}`, job_id: job.id, event_type: action, summary: `Operations action: ${action.replaceAll("_", " ")}`, detail: "Recorded from the portfolio Operations Board.", created_at: new Date().toISOString() });
      saveOperationsSnapshot();
    }
    renderOperationsBoardWorkspace();
    showToast(`${job.job_number || "Operations Job"} moved to ${job.status}`);
  } catch (error) { showToast(error.message); }
}

async function establishServiceScope(job, card) {
  const request = serviceRequestForJob(job);
  const workOrder = request ? serviceWorkOrderForRequest(request) : null;
  const detail = card?.querySelector(`[data-job-scope="${CSS.escape(job.id)}"]`)?.value.trim();
  if (!workOrder || !detail) { showToast("Describe the controlled service scope first"); return; }
  try {
    if (!isPublicDemo) await postOperationsAction({ operation: "replace_service_scope", serviceWorkOrderId: workOrder.id, scopeSummary: detail, scopeItems: [{ section: "Correction", detail, status: "Pending", isRequired: true }] });
    else { workOrder.scope_version = Number(workOrder.scope_version || 0) + 1; workOrder.scope_summary = detail; saveOperationsSnapshot(); }
    renderOperationsBoardWorkspace();
    showToast(`${workOrder.work_order_number || "Service Work Order"} scope version established`);
  } catch (error) { showToast(error.message); }
}

async function completeOperationsCheckpoint(job, checkpointKey) {
  const checkpoint = state.operationsJobCheckpoints.find((entry) => entry.job_id === job.id && entry.checkpoint_key === checkpointKey);
  if (!checkpoint) return;
  try {
    if (!isPublicDemo) await postOperationsAction({ operation: "update_checkpoint", operationsJobId: job.id, checkpointKey, checkpointVersion: checkpoint.checkpoint_version || 1, status: "Complete", evidenceNote: "Completion recorded by assigned technician." });
    else { checkpoint.status = "Complete"; checkpoint.completed_at = new Date().toISOString(); checkpoint.evidence_note = "Completion recorded by assigned technician."; saveOperationsSnapshot(); }
    renderOperationsBoardWorkspace();
  } catch (error) { showToast(error.message); }
}

async function recordOperationsSignoff(job, partyType) {
  const request = serviceRequestForJob(job);
  const workOrder = request ? serviceWorkOrderForRequest(request) : null;
  if (!workOrder) return;
  const signoffKey = `signoff-${workOrder.id}-${partyType.toLowerCase()}`;
  try {
    if (!isPublicDemo) await postOperationsAction({ operation: "record_signoff", serviceWorkOrderId: workOrder.id, signoffKey, partyType, representativeName: partyType === "Internal" ? "MDB Service Controller" : "Customer Representative", decision: "Accepted", notes: "Captured from controlled closeout." });
    else {
      state.serviceSignoffs.push({ signoff_key: signoffKey, service_work_order_id: workOrder.id, scope_version: Math.max(1, Number(workOrder.scope_version) || 1), party_type: partyType, representative_name: partyType === "Internal" ? "MDB Service Controller" : "Customer Representative", decision: "Accepted", signed_at: new Date().toISOString() });
      saveOperationsSnapshot();
    }
    renderOperationsBoardWorkspace();
    showToast(`${partyType} signoff recorded`);
  } catch (error) { showToast(error.message); }
}

function renderOperationsBoardWorkspace() {
  const serviceInbox = state.serviceRequests.filter((request) => ["Submitted", "Triaged", "Accepted"].includes(request.status));
  const buildInbox = state.buildRequests.filter((request) => request.status === "Submitted");
  const activeJobs = state.operationsJobs.filter((job) => !["Closed", "Cancelled"].includes(job.status))
    .sort((a, b) => Number(a.priority || 3) - Number(b.priority || 3));
  const exceptions = activeJobs.filter((job) => job.exception_code);
  const controller = state.operationsBoardRole === "service_controller";
  elements.overlayBody.innerHTML = `<div class="workbench production-workbench operations-board-workbench">
    <div class="operations-toolbar"><div><strong>Operations Board</strong><span>One controlled queue for capacity and exceptions; specialized Build Orders and Service Work Orders stay distinct underneath.</span></div><button type="button" class="secondary-button" data-service-open-requests>Open Requester View</button></div>
    <div class="build-role-switch"><div><span>VIEW AS</span><strong>${controller ? "Gatekeeper / Controller" : "Assigned Service Technician"}</strong></div><div><button type="button" data-operations-role="service_controller" class="${controller ? "is-active" : ""}">Gatekeeper</button><button type="button" data-operations-role="service_technician" class="${!controller ? "is-active" : ""}">Technician</button></div></div>
    <div class="production-boundary ${controller ? "is-controller" : ""}"><span>${controller ? "CONTROL AUTHORITY" : "EXECUTION VIEW"}</span><strong>${controller ? "Every build and service commitment passes through the gatekeeper." : "Technicians execute assigned work and document checkpoint evidence."}</strong><p>${controller ? "The gatekeeper accepts or returns demand, separates request from execution, commits scarce bays, sets priority, releases work, manages exceptions, and closes only after signoff." : "Schedule, priority, customer promise, and closeout authority remain locked. The technician starts released work, records evidence, and marks the work itself complete."}</p></div>
    <div class="order-metric-grid"><div><span>Build decisions</span><strong>${buildInbox.length}</strong></div><div><span>Service decisions</span><strong>${serviceInbox.length}</strong></div><div><span>Active Operations Jobs</span><strong>${activeJobs.length}</strong></div><div><span>Exceptions</span><strong>${exceptions.length}</strong></div></div>
    ${controller ? `<section class="production-queue-section combined-gatekeeper-inbox"><header><div><span>01</span><h3>Combined Gatekeeper Inbox</h3></div><p>Demand is reviewed here before either specialized execution document is released.</p></header>
      <div class="operations-inbox-columns"><div><header><strong>Sales Build Requests</strong><span>${buildInbox.length}</span></header><div class="request-card-list">${buildInbox.map((request) => buildRequestCardHtml(request, "controller")).join("") || '<div class="request-empty-state"><strong>Build inbox clear.</strong></div>'}</div></div><div><header><strong>Service Requests</strong><span>${serviceInbox.length}</span></header><div class="request-card-list">${serviceInbox.map((request) => serviceRequestCardHtml(request, "controller")).join("") || '<div class="request-empty-state"><strong>Service inbox clear.</strong></div>'}</div></div></div>
    </section>` : ""}
    <section class="production-queue-section"><header><div><span>${controller ? "02" : "01"}</span><h3>${controller ? "Committed Operations" : "My Assigned Service Work"}</h3></div><p>Capacity, checkpoints, events, and exceptions live on the shared Operations Job.</p></header><div class="operations-job-list">${activeJobs.map(operationJobCardHtml).join("") || '<div class="request-empty-state"><strong>No active Operations Jobs.</strong></div>'}</div></section>
  </div>`;
}

function renderProductionControlWorkspace() {
  const requests = [...state.buildRequests].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const waiting = requests.filter((request) => request.status === "Submitted");
  const active = requests.filter((request) => request.status === "Accepted");
  const exceptions = active.filter((request) => Boolean(buildForRequest(request)?.exceptionCode));
  const dueSoon = active.filter((request) => {
    const due = buildForRequest(request)?.committedDueDate;
    return due && new Date(due).getTime() - Date.now() <= 5 * 86400000;
  });
  elements.overlayBody.innerHTML = `<div class="workbench production-workbench gatekeeper-workbench">
    <div class="operations-toolbar"><div><strong>Production Control</strong><span>The gatekeeper reviews every request before production work exists or reaches the shop.</span></div><button type="button" class="secondary-button" data-production-open-builds>Open Build Order Board</button></div>
    <div class="production-boundary is-controller"><span>GATEKEEPER VIEW</span><strong>Production Control is the single release authority.</strong><p>Accept or return demand, commit completion dates, assign the shop, set priority, and release only after the build plan is ready.</p></div>
    <div class="order-metric-grid">
      <div><span>Awaiting decision</span><strong>${waiting.length}</strong></div>
      <div><span>Accepted work</span><strong>${active.length}</strong></div>
      <div><span>Due in 5 days</span><strong>${dueSoon.length}</strong></div>
      <div><span>Exceptions</span><strong>${exceptions.length}</strong></div>
    </div>
    <section class="production-queue-section"><header><div><span>01</span><h3>Gatekeeper Inbox</h3></div><p>Nothing becomes shop work until one of these receives a commitment.</p></header><div class="request-card-list">${waiting.map((request) => buildRequestCardHtml(request, "controller")).join("") || '<div class="request-empty-state"><strong>Inbox clear.</strong><p>No Sales requests are waiting for a decision.</p></div>'}</div></section>
    <section class="production-queue-section"><header><div><span>02</span><h3>Committed Work</h3></div><p>Accepted requests remain tied to their controlled Build Orders.</p></header><div class="request-card-list">${active.map((request) => buildRequestCardHtml(request, "controller")).join("") || '<div class="request-empty-state"><strong>No committed work.</strong></div>'}</div></section>
  </div>`;
}

function sortedBuildsByStatus(status) {
  return state.builds.filter((build) => build.status === status).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderBuildListSection(title, builds, sectionKey) {
  const open = state.buildListOpen[sectionKey];
  return `<section class="quote-list-section">
    <button type="button" class="quote-list-toggle" data-build-list-toggle="${sectionKey}">
      <span>${escapeHTML(title)} (${builds.length})</span><span class="quote-list-caret">${open ? "▾" : "▸"}</span>
    </button>
    ${open ? (builds.length
      ? `<div class="quote-list-rows">${builds.map((build) => {
        const request = state.buildRequests.find((entry) => entry.id === build.buildRequestId);
        return `<button type="button" class="quote-list-row order-list-row" data-build-open="${build.id}"><span><strong>${escapeHTML(build.part || "No item selected")}</strong><small>${escapeHTML(build.buildNumber || "Pending #")}${request ? ` · ${escapeHTML(request.requestNumber)}` : " · Internal build"} · ${escapeHTML(build.description || "")}</small></span><span><b class="order-status-pill is-${build.status === "Finished" ? "closed" : build.status.toLowerCase()}">${escapeHTML(build.status)}</b><small>${escapeHTML(build.shopAssigneeName || "Unassigned")} · ${build.builtQty}/${build.quantity} built</small></span></button>`;
      }).join("")}</div>`
      : `<p class="quote-list-empty">No ${escapeHTML(title.toLowerCase())}.</p>`) : ""}
  </section>`;
}

function renderBuildsWorkspace() {
  const openBuilds = sortedBuildsByStatus("Open");
  const releasedBuilds = sortedBuildsByStatus("Released");
  const finishedBuilds = sortedBuildsByStatus("Finished");
  const cancelledBuilds = sortedBuildsByStatus("Cancelled");
  const inProgress = releasedBuilds.filter((build) => Number(build.builtQty) > 0).length;
  const role = productionActor(state.buildWorkspaceRole);
  elements.overlayBody.innerHTML = `<div class="workbench quotes-workbench production-workbench">
    <div class="operations-toolbar"><div><strong>Build Orders</strong><span>${isPublicDemo ? "Portfolio sandbox — changes stay on this device and are never sent to GP." : state.buildsBackendConfigured ? "Synced live across the team — not sent to GP." : "Browser-local only right now — not yet synced across devices, not sent to GP."}</span></div>${canControlBuild() ? '<button type="button" class="primary-button" data-build-new>New Internal Build</button>' : ""}</div>
    <div class="build-role-switch" aria-label="Build Order demonstration role"><div><span>ACTIVE WORK VIEW</span><strong>${escapeHTML(role.name)}</strong></div><div>${[
      ["production_controller", "Production Control"], ["shop", "Shop Floor"], ["sales", "Sales Tracking"],
    ].map(([value, label]) => `<button type="button" data-build-role="${value}" class="${state.buildWorkspaceRole === value ? "is-active" : ""}">${label}</button>`).join("")}</div></div>
    <div class="production-boundary ${canControlBuild() ? "is-controller" : ""}"><span>${canControlBuild() ? "CONTROL AUTHORITY" : state.buildWorkspaceRole === "shop" ? "EXECUTION VIEW" : "READ-ONLY VIEW"}</span><strong>${canControlBuild() ? "Production Control owns the production plan and release." : state.buildWorkspaceRole === "shop" ? "The shop reports consumption and completed quantity." : "Sales can follow the lifecycle without editing controlled work."}</strong><p>${canControlBuild() ? "Commit dates, set priority, assign work, plan components, and release only when inventory is available." : state.buildWorkspaceRole === "shop" ? "Assignment and component demand stay locked; execution posts against reserved inventory." : "Status, commitments, exceptions, and activity remain visible from the originating request."}</p></div>
    <div class="order-metric-grid">
      <div><span>Open entry</span><strong>${openBuilds.length}</strong></div>
      <div><span>Released</span><strong>${releasedBuilds.length}</strong></div>
      <div><span>In progress</span><strong>${inProgress}</strong></div>
      <div><span>Finished</span><strong>${finishedBuilds.length}</strong></div>
    </div>
    ${renderBuildListSection("Open for Entry", openBuilds, "open")}
    ${renderBuildListSection("Released to Shop", releasedBuilds, "released")}
    ${renderBuildListSection("Finished Builds", finishedBuilds, "finished")}
    ${renderBuildListSection("Cancelled Builds", cancelledBuilds, "cancelled")}
  </div>`;
}

function openBuildModal(buildId) {
  state.activeBuildId = buildId;
  state.buildTargetSearchTerm = "";
  state.buildComponentSearchTerm = "";
  renderBuildModal();
  elements.buildModal.hidden = false;
}

function closeBuildModal() {
  elements.buildModal.hidden = true;
  state.activeBuildId = "";
  if (state.activeWorkspace === "builds") renderBuildsWorkspace();
}

function buildableItemMatches(term) {
  return state.items
    .map((item) => ({ ...item, score: matchScore(term, `${item.partNumber} ${item.description}`) }))
    .filter((item) => item.score >= 0.5 && item.partNumber)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function renderBuildTargetSearchResults() {
  const host = $("#buildTargetSearchResults");
  if (!host) return;
  const term = state.buildTargetSearchTerm.trim();
  if (!term) { host.innerHTML = ""; return; }
  const results = buildableItemMatches(term);
  host.innerHTML = results.length
    ? results.map((item) => `<button type="button" class="advanced-search-result" data-build-target-select-part="${escapeHTML(item.partNumber)}" data-build-target-select-description="${escapeHTML(item.description || "")}" data-build-target-select-uom="${escapeHTML(item.uom || "EA")}"><strong>${escapeHTML(item.partNumber)}</strong><span>${escapeHTML(item.description || "")} · ${escapeHTML(item.itemClass || "Item")}</span></button>`).join("")
    : '<p class="advanced-search-empty">No matches in the Item Master.</p>';
}

function renderBuildComponentSearchResults() {
  const host = $("#buildComponentSearchResults");
  if (!host) return;
  const term = state.buildComponentSearchTerm.trim();
  if (!term) { host.innerHTML = ""; return; }
  const results = buildableItemMatches(term);
  host.innerHTML = results.length
    ? results.map((item) => `<button type="button" class="advanced-search-result" data-build-component-add-part="${escapeHTML(item.partNumber)}" data-build-component-add-description="${escapeHTML(item.description || "")}" data-build-component-add-uom="${escapeHTML(item.uom || "EA")}"><strong>${escapeHTML(item.partNumber)}</strong><span>${escapeHTML(item.description || "")} · ${escapeHTML(item.itemClass || "Item")}</span></button>`).join("")
    : '<p class="advanced-search-empty">No matches in the Item Master.</p>';
}

function setBuildTarget(part, description, uom) {
  const build = activeBuild();
  if (!build) return;
  if (!canControlBuild()) { showToast("Only Production Control can change the build plan"); return; }
  if (build.status !== "Open") { showToast("Reopen the build order to change what's being built"); return; }
  build.part = part || "";
  build.description = description || "";
  build.uom = uom || "EA";
  build.itemId = itemIdForPart(part);
  state.buildTargetSearchTerm = "";
  touchBuild(build);
  renderBuildModal();
}

function addBuildComponent(part, description, uom) {
  const build = activeBuild();
  if (!build) return;
  if (!canControlBuild() || build.status !== "Open") { showToast("Only Production Control can edit components before release"); return; }
  build.components.push({ componentKey: newDocumentLineKey("build-component"), itemId: itemIdForPart(part), part: part || "", description: description || "", uom: uom || "EA", qtyRequired: 1, qtyReserved: 0, qtyConsumed: 0, qtyToConsume: 0 });
  touchBuild(build);
  showToast(`${part || "Component"} added`);
  renderBuildModal();
}

function renderBuildComponents(build) {
  if (!build.components.length) return '<div class="quote-empty">No components yet. Search above to add raw stock or sub-parts.</div>';
  const entryLocked = build.status !== "Open" || !canControlBuild() ? "disabled" : "";
  const consumeLocked = build.status !== "Released" || !canPostBuild() ? "disabled" : "";
  return build.components.map((line, index) => `<div class="build-line" data-line-index="${index}">
      <input class="line-input" data-line-field="part" value="${escapeHTML(line.part)}" aria-label="Component part number" ${entryLocked}>
      <input class="line-input line-description" data-line-field="description" value="${escapeHTML(line.description)}" aria-label="Description" ${entryLocked}>
      <input class="line-input line-uom" data-line-field="uom" value="${escapeHTML(line.uom || "EA")}" aria-label="Unit of measure" ${entryLocked}>
      <input class="line-input" type="number" min="0" step="1" data-line-field="qtyRequired" value="${line.qtyRequired}" aria-label="Quantity required" ${entryLocked}>
      <span class="order-line-readout">${line.qtyReserved}</span>
      <span class="order-line-readout">${line.qtyConsumed}</span>
      <input class="line-input" type="number" min="0" max="${line.qtyReserved}" step="1" data-line-field="qtyToConsume" value="${line.qtyToConsume || 0}" aria-label="Quantity to consume" ${consumeLocked}>
      ${build.status === "Open" && canControlBuild() ? `<button class="line-remove" type="button" data-line-remove="${index}" aria-label="Remove component">×</button>` : "<span></span>"}
    </div>`).join("");
}

function renderBuildModal() {
  const build = activeBuild();
  if (!build) return;
  const readiness = buildReadiness(build);
  const editable = build.status === "Open" && canControlBuild();
  const locked = editable ? "" : "disabled";
  const executionEditable = build.status === "Released" && canPostBuild();
  const notesLocked = (canControlBuild() || executionEditable) && build.status !== "Finished" ? "" : "disabled";
  const remaining = buildRemainingQty(build);
  const request = state.buildRequests.find((entry) => entry.id === build.buildRequestId);
  const role = productionActor(state.buildWorkspaceRole);
  const actionButtons = build.status === "Open"
    ? canControlBuild()
      ? `<button type="button" class="primary-button" data-build-release ${readiness.canRelease ? "" : "disabled"}>Reserve Components &amp; Release</button>`
      : `<span class="order-closed-message">Waiting for Production Control to release this work.</span>`
    : build.status === "Released"
      ? canControlBuild()
        ? '<button type="button" class="secondary-button" data-build-reopen>Reopen &amp; Unreserve</button><button type="button" class="primary-button" data-build-post>Post Build Progress</button>'
        : executionEditable
          ? '<button type="button" class="primary-button" data-build-post>Post Build Progress</button>'
          : '<span class="order-closed-message">Tracking released shop work — read only.</span>'
      : build.status === "Finished"
        ? '<span class="order-closed-message">Build quantity fully completed.</span>'
        : '<span class="order-closed-message">This Build Order is cancelled.</span>';
  const timeline = build.events.length ? build.events.map((event) => `<div class="order-event"><span class="order-event-dot"></span><div><strong>${escapeHTML(event.summary)}</strong><span>${escapeHTML(event.detail || "")}</span><small>${new Date(event.createdAt).toLocaleString()}${event.actorName ? ` · ${escapeHTML(event.actorName)}` : ""}</small></div></div>`).join("") : '<p class="quote-list-empty">No activity recorded yet.</p>';
  elements.buildModalTitle.textContent = `${build.buildNumber || "New Build Order"} — ${build.part || "No item selected"}`;
  elements.buildModalBody.innerHTML = `<div class="quote-context"><div><span>Build Order</span><strong>${escapeHTML(build.part || "No item selected")}</strong>${build.description ? `<small>${escapeHTML(build.description)}</small>` : ""}</div>
      <span class="order-status-pill is-${build.status === "Finished" ? "closed" : build.status.toLowerCase()}">${escapeHTML(build.status)}</span>
    </div>
    <div class="build-modal-role"><span>Viewing as</span><strong>${escapeHTML(role.name)}</strong><small>${canControlBuild() ? "Plan and release authority" : state.buildWorkspaceRole === "sales" ? "Lifecycle tracking only" : "Execution reporting"}</small></div>
    <p class="quote-attribution">Originated by ${escapeHTML(build.originatorName || "Unknown")}${build.originatorInitials ? ` (${escapeHTML(build.originatorInitials)})` : ""} · Last edited by ${escapeHTML(build.lastModifiedByName || "Unknown")} ${build.lastModifiedAt ? new Date(build.lastModifiedAt).toLocaleString() : ""}</p>
    ${request ? `<div class="request-build-source"><span>Demand source</span><strong>${escapeHTML(request.requestNumber)} · ${escapeHTML(requestSourceLabel(request))}</strong><small>${escapeHTML(request.originatorName)} requested ${request.requestedQuantity} ${escapeHTML(request.uom || "EA")} for ${escapeHTML(request.requestedShipDate || "an unspecified need date")}.</small></div>` : '<div class="request-build-source"><span>Demand source</span><strong>Internal Production Control build</strong><small>No Sales Build Request is attached.</small></div>'}
    ${build.exceptionDetail ? `<div class="request-exception"><strong>${escapeHTML(build.exceptionCode === "customer_change" ? "Customer change requires review" : "Production exception")}</strong><span>${escapeHTML(build.exceptionDetail)}</span></div>` : ""}
    <div class="order-action-bar">${actionButtons}</div>
    <div class="order-readiness ${readiness.missing.length ? "has-warning" : "is-ready"}"><strong>${readiness.missing.length ? "Before release" : build.status === "Open" ? "Ready to release" : "Build status"}</strong><span>${readiness.missing.length ? `Add ${escapeHTML(readiness.missing.join(", "))}.` : `${build.builtQty}/${build.quantity} ${escapeHTML(build.uom || "EA")} built${remaining ? ` · ${remaining} remaining` : " · complete"}`}</span></div>
    ${editable ? `<div class="quote-search-wrap">
      <label class="field"><span>Search the Item Master for what to build</span><input type="text" id="buildTargetSearchInput" autocomplete="off" spellcheck="false" placeholder="Part number or description..." value="${escapeHTML(state.buildTargetSearchTerm)}"></label>
      <div id="buildTargetSearchResults" class="quote-search-results"></div>
    </div>` : ""}
    <div class="quote-layout">
      <section class="quote-form">
        <div class="quote-fields">
          <label class="field"><span>Quantity to build</span><input type="number" min="1" max="5000" step="1" data-build-meta-field="quantity" value="${build.quantity}" ${locked}></label>
          <label class="field"><span>Committed completion</span><input type="date" data-build-meta-field="committedDueDate" value="${escapeHTML(build.committedDueDate || "")}" ${locked}></label>
          <label class="field"><span>Customer need date</span><input type="date" value="${escapeHTML(build.requestedDueDate || "")}" disabled></label>
          <label class="field"><span>Priority</span><select data-build-meta-field="priority" ${locked}>${[1, 2, 3, 4, 5].map((priority) => `<option value="${priority}" ${Number(build.priority) === priority ? "selected" : ""}>${priority}${priority === 1 ? " · Rush" : priority === 5 ? " · Lowest" : ""}</option>`).join("")}</select></label>
          <label class="field"><span>Shop assignment</span><select data-build-meta-field="shopAssigneeName" ${locked}><option value="">Choose a cell...</option>${productionShopAssignments.map((name) => `<option ${build.shopAssigneeName === name ? "selected" : ""}>${escapeHTML(name)}</option>`).join("")}</select></label>
          <label class="field"><span>Location</span><input data-build-meta-field="locationCode" value="${escapeHTML(build.locationCode || "MAIN")}" ${locked}></label>
        </div>
        <div class="order-lines ${build.components.length ? "" : "is-empty"}">
          <h3>Components</h3>
          ${editable ? `<div class="quote-search-wrap">
            <label class="field"><span>Search the Item Master for raw stock or sub-parts</span><input type="text" id="buildComponentSearchInput" autocomplete="off" spellcheck="false" placeholder="Part number or description..." value="${escapeHTML(state.buildComponentSearchTerm)}"></label>
            <div id="buildComponentSearchResults" class="quote-search-results"></div>
          </div>` : ""}
          ${build.components.length ? '<div class="build-line build-line--header"><span>Part</span><span>Description</span><span>UOM</span><span>Required</span><span>Reserved</span><span>Consumed</span><span>To Consume</span><span></span></div>' : ""}
          <div id="buildComponentRows">${renderBuildComponents(build)}</div>
        </div>
        <label class="field quote-notes"><span>Production / shop notes</span><textarea data-build-meta-field="notes" rows="4" ${notesLocked}>${escapeHTML(build.notes)}</textarea></label>
      </section>
      <aside class="quote-summary"><h3>Progress</h3>
        <div class="summary-row"><span>Target quantity</span><strong>${build.quantity} ${escapeHTML(build.uom || "EA")}</strong></div>
        <div class="summary-row"><span>Built so far</span><strong>${build.builtQty} ${escapeHTML(build.uom || "EA")}</strong></div>
        <div class="summary-row"><span>Assigned shop</span><strong>${escapeHTML(build.shopAssigneeName || "Not assigned")}</strong></div>
        <div class="summary-row"><span>Committed</span><strong>${escapeHTML(build.committedDueDate || "Not committed")}</strong></div>
        ${executionEditable ? `<label class="summary-input"><span>Qty to finish this pass</span><input type="number" min="0" max="${remaining}" step="1" data-build-meta-field="qtyToFinish" value="${build.qtyToFinish || 0}"></label>` : ""}
        <p class="quote-state">${isPublicDemo ? "Portfolio sandbox: edits stay only in this browser." : "Every edit here saves and is visible to the whole team."}</p>
      </aside>
    </div>
    <section class="order-timeline"><h3>Build Activity</h3>${timeline}</section>`;
  if (editable) renderBuildTargetSearchResults();
  if (editable) renderBuildComponentSearchResults();
}

function reportsChangeLabel(current, previous) {
  if (!previous) return current > 0 ? "New activity" : "No prior-year data";
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`;
}

function reportsStatCard(label, current, previous, currentLabel, previousLabel) {
  return `<div class="report-stat-card">
    <span class="report-stat-label">${label}</span>
    <strong class="report-stat-value">${formatCurrency(current)}</strong>
    <span class="report-stat-change ${current >= previous ? "is-up" : "is-down"}">${reportsChangeLabel(current, previous)}</span>
    <div class="report-stat-compare"><span>${currentLabel}: ${formatCurrency(current)}</span><span>${previousLabel}: ${formatCurrency(previous)}</span></div>
  </div>`;
}

async function loadReports() {
  state.reportsLoading = true;
  if (isPublicDemo) {
    state.reports = { configured: false, publicDemo: true };
    state.reportsLoading = false;
    return;
  }
  try {
    const response = await fetch("/.netlify/functions/reports-summary");
    state.reports = response.ok ? await response.json() : { configured: false };
  } catch {
    state.reports = { configured: false };
  } finally {
    state.reportsLoading = false;
  }
}

function renderReportsWorkspace() {
  const data = state.reports;
  if (state.reportsLoading && !data) {
    elements.overlayBody.innerHTML = `<div class="workbench"><p class="report-empty">Loading report data...</p></div>`;
    return;
  }
  if (!data || !data.configured) {
    elements.overlayBody.innerHTML = `<div class="workbench"><p class="report-empty">${isPublicDemo ? "Sales Reports are intentionally disconnected from operational data in the public portfolio demo." : "Reports need the live database connected — once Orders are syncing through Supabase, revenue numbers show up here automatically. Nothing to summarize yet."}</p></div>`;
    return;
  }
  elements.overlayBody.innerHTML = `<div class="workbench reports-workbench">
    <div class="operations-toolbar"><div><strong>Sales Reports</strong><span>V1 — revenue is order total (subtotal + misc + freight − trade discount), as of ${new Date(data.asOf).toLocaleString()}.</span></div></div>
    <div class="report-stat-grid">
      ${reportsStatCard("Year to Date", data.ytd.revenue, data.ytdLastYear.revenue, "This year", "Last year")}
      ${reportsStatCard("This Month", data.month.revenue, data.monthLastYear.revenue, "This month", "Same month last year")}
      ${reportsStatCard("Tooling Revenue (YTD)", data.ytd.tooling.revenue, data.ytdLastYear.tooling.revenue, "This year", "Last year")}
    </div>
    <div class="report-detail-grid">
      <div class="report-detail-card">
        <h3>Order Volume</h3>
        <p>YTD: ${data.ytd.orderCount} orders (${data.ytdLastYear.orderCount} last year)</p>
        <p>This month: ${data.month.orderCount} orders (${data.monthLastYear.orderCount} same month last year)</p>
      </div>
      <div class="report-detail-card">
        <h3>Tooling Quantity Shipped</h3>
        <p>YTD: ${data.ytd.tooling.qty.toLocaleString()} units (${data.ytdLastYear.tooling.qty.toLocaleString()} last year)</p>
        <p>This month: ${data.month.tooling.qty.toLocaleString()} units (${data.monthLastYear.tooling.qty.toLocaleString()} same month last year)</p>
        <p class="quote-tax-note">Tooling growth flags production scheduling — rising Tooling qty means rising in-house build demand.</p>
      </div>
    </div>
  </div>`;
}

async function loadGpSyncStatus() {
  state.gpSyncStatusLoading = true;
  if (isPublicDemo) {
    state.gpSyncStatus = {
      configured: false,
      publicDemo: true,
      readOnly: true,
      runs: [],
      runEntities: [],
      cursors: [],
      issues: [],
    };
    state.gpSyncStatusLoading = false;
    return;
  }
  try {
    const response = await fetch("/api/integrations/gp/status", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    state.gpSyncStatus = response.ok
      ? { configured: true, ...data }
      : { configured: false, readOnly: true, error: data.error || `Status returned ${response.status}` };
  } catch {
    state.gpSyncStatus = { configured: false, readOnly: true, error: "The GP status service is unreachable." };
  } finally {
    state.gpSyncStatusLoading = false;
  }
}

function syncRunRows(runs) {
  if (!runs.length) return '<tr><td colspan="5">No GP snapshot runs have been received.</td></tr>';
  return runs.map((run) => `<tr>
    <td><strong>${escapeHTML(run.company_id)}</strong><br><small>${escapeHTML(run.run_key)}</small></td>
    <td><span class="status-label ${run.status === "Succeeded" ? "status-label--good" : run.status === "Failed" ? "status-label--blocked" : "status-label--warn"}">${escapeHTML(run.status)}</span></td>
    <td>${Number(run.records_seen || 0).toLocaleString()}</td>
    <td>${escapeHTML((run.requested_entities || []).join(", ") || "—")}</td>
    <td>${escapeHTML(run.finished_at ? new Date(run.finished_at).toLocaleString() : new Date(run.started_at).toLocaleString())}</td>
  </tr>`).join("");
}

function syncCursorRows(cursors) {
  if (!cursors.length) return '<tr><td colspan="4">No successful entity watermarks yet.</td></tr>';
  return cursors.map((cursor) => `<tr>
    <td>${escapeHTML(cursor.company_id)}</td>
    <td>${escapeHTML(cursor.entity_type)}</td>
    <td><code>${escapeHTML(cursor.source_watermark)}</code></td>
    <td>${escapeHTML(new Date(cursor.last_successful_at).toLocaleString())}</td>
  </tr>`).join("");
}

function syncEntityRows(entities) {
  if (!entities.length) return '<tr><td colspan="6">No contract v2 entity receipts have been recorded.</td></tr>';
  return entities.map((entity) => {
    const completeCount = entity.expected_record_count == null
      ? `${Number(entity.records_seen || 0).toLocaleString()} / pending`
      : `${Number(entity.records_seen || 0).toLocaleString()} / ${Number(entity.expected_record_count).toLocaleString()}`;
    const batchGap = Number(entity.batches_seen || 0) !== Number(entity.last_batch_sequence || 0);
    const watermark = entity.ending_watermark || entity.starting_watermark || "First sync";
    return `<tr>
      <td><strong>${escapeHTML(entity.entity_type)}</strong><br><small>${escapeHTML(entity.sync_mode)}</small></td>
      <td><span class="status-label ${entity.status === "Succeeded" ? "status-label--good" : entity.status === "Failed" ? "status-label--blocked" : "status-label--warn"}">${escapeHTML(entity.status)}</span></td>
      <td>${escapeHTML(completeCount)}</td>
      <td class="${batchGap ? "text-danger" : ""}">${Number(entity.batches_seen || 0).toLocaleString()}${batchGap ? ` / expected sequence ${Number(entity.last_batch_sequence || 0).toLocaleString()}` : ""}</td>
      <td>${Number(entity.records_inserted || 0).toLocaleString()} / ${Number(entity.records_updated || 0).toLocaleString()} / ${Number(entity.records_unchanged || 0).toLocaleString()}</td>
      <td><code>${escapeHTML(watermark)}</code></td>
    </tr>`;
  }).join("");
}

function renderSystemSyncWorkspace() {
  const sync = state.gpSyncStatus;
  const installed = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const serviceWorkerState = navigator.serviceWorker?.controller ? "Controlling this session" : "Registration pending / browser view";
  const syncState = state.gpSyncStatusLoading
    ? "Checking secure status…"
    : sync?.configured
      ? `${sync.runs.length} recent run${sync.runs.length === 1 ? "" : "s"}`
      : sync?.publicDemo
        ? "Disconnected in public sandbox"
        : sync?.error || "Not connected";
  const runs = sync?.runs || [];
  const runEntities = sync?.runEntities || [];
  const cursors = sync?.cursors || [];
  const issues = sync?.issues || [];

  elements.overlayBody.innerHTML = `<div class="workbench system-sync-workbench">
    <div class="operations-toolbar">
      <div><strong>System &amp; Sync</strong><span>Inspect the installed app shell and the inbound-only GP data catcher.</span></div>
      <span class="status-label status-label--good">GP write-back disabled</span>
    </div>
    <div class="system-health-grid">
      <article><span>Application mode</span><strong>${installed ? "Installed / standalone" : "Browser / installable"}</strong><small>${escapeHTML(serviceWorkerState)}</small></article>
      <article><span>Connection</span><strong>${navigator.onLine ? "Online" : "Offline"}</strong><small>Operational APIs are never served from cache.</small></article>
      <article><span>MDB startup</span><strong>${state.bootDurationMs == null ? "Measuring" : `${state.bootDurationMs.toLocaleString()} ms`}</strong><small>Catalog and operational loads run concurrently.</small></article>
      <article><span>GP read sync</span><strong>${escapeHTML(syncState)}</strong><small>Snapshots stage first; matching and conflicts remain visible.</small></article>
    </div>
    <section class="system-boundary-card">
      <h3>Authority boundary</h3>
      <div class="system-boundary-flow" aria-label="GP integration flow">
        <span>Microsoft GP<br><small>transactional authority</small></span><b aria-hidden="true">→</b>
        <span>Authenticated extractor<br><small>read-only snapshots</small></span><b aria-hidden="true">→</b>
        <span>MDB staging<br><small>idempotent + reconcilable</small></span><b aria-hidden="true">→</b>
        <span>MDB workspaces<br><small>learn and assist</small></span>
      </div>
      ${sync?.publicDemo ? '<p class="system-note">The portfolio sandbox shows the architecture but intentionally has no employee identity, operational database, GP credentials, or company records attached.</p>' : sync?.error ? `<p class="system-note system-note--warning">${escapeHTML(sync.error)}</p>` : ""}
    </section>
    <section class="system-table-card">
      <header><div><h3>Recent GP read runs</h3><p>Counts and status only; raw GP payloads never leave the server-side boundary.</p></div><span>${issues.length} open reconciliation issue${issues.length === 1 ? "" : "s"}</span></header>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>Company / run</th><th>Status</th><th>Seen</th><th>Entities</th><th>Finished / started</th></tr></thead><tbody>${syncRunRows(runs)}</tbody></table></div>
    </section>
    <section class="system-table-card">
      <header><div><h3>Entity completeness</h3><p>Each entity owns its cursor, count reconciliation, and continuous batch sequence.</p></div></header>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>Entity / mode</th><th>Status</th><th>Seen / expected</th><th>Batches</th><th>Inserted / updated / unchanged</th><th>Latest watermark</th></tr></thead><tbody>${syncEntityRows(runEntities)}</tbody></table></div>
    </section>
    <section class="system-table-card">
      <header><div><h3>Successful watermarks</h3><p>Incremental cursors advance only after a run finishes successfully.</p></div></header>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>Company</th><th>Entity</th><th>Watermark</th><th>Last success</th></tr></thead><tbody>${syncCursorRows(cursors)}</tbody></table></div>
    </section>
  </div>`;
}

function openOrderModal(orderId) {
  state.activeOrderId = orderId;
  state.orderSearchTerm = "";
  renderOrderModal();
  elements.orderModal.hidden = false;
}

function closeOrderModal() {
  elements.orderModal.hidden = true;
  state.activeOrderId = "";
  if (state.activeWorkspace === "orders") renderOrdersWorkspace();
}

function renderOrderSearchResults() {
  const host = $("#orderSearchResults");
  if (!host) return;
  const term = state.orderSearchTerm.trim();
  if (!term) { host.innerHTML = ""; return; }
  const toolingMatches = state.toolItems.map((item) => ({ ...item, score: matchScore(term, `${item.part} ${item.description}`), kind: "tooling" }));
  const rigMatches = state.data.rig.items.map((item) => ({ part: item.part, description: item.cleanDescription || item.description, id: item.part, score: matchScore(term, `${item.part} ${item.cleanDescription || item.description}`), kind: "rig" }));
  const results = [...toolingMatches, ...rigMatches].filter((item) => item.score >= 0.5 && item.part).sort((a, b) => b.score - a.score).slice(0, 8);
  host.innerHTML = results.length
    ? results.map((item) => `<button type="button" class="advanced-search-result" data-order-search-add-part="${escapeHTML(item.part)}" data-order-search-add-description="${escapeHTML(item.description || "")}" data-order-search-add-category="${item.kind === "rig" ? "Rig Parts" : "Tooling"}"><strong>${escapeHTML(item.part)}</strong><span>${escapeHTML(item.description || "")} · ${item.kind === "rig" ? "Rig Parts" : "Tooling"}</span></button>`).join("")
    : '<p class="advanced-search-empty">No matches.</p>';
}

function addOrderLine(part, description, price = 0, source = "MDB demo", category = "") {
  const order = activeOrder();
  if (!order) { showToast("Open an order first"); return; }
  if (order.status !== "Open") { showToast("Reopen the order before adding items"); return; }
  const line = { lineKey: newDocumentLineKey("order-line"), itemId: itemIdForPart(part), part: part || "", description: description || "", category, uom: "EA", quantity: 1, reservedQty: 0, qtyToShip: 0, shippedQty: 0, qtyToInvoice: 0, invoicedQty: 0, backorderQty: 0, unitPrice: Number(price) || 0, discount: 0, taxable: false, source };
  order.lines.push(line);
  applyLineQuantity(line, 1, (accepted) => {
    if (!accepted) { order.lines.pop(); return; }
    touchOrder(order);
    showToast(`${part || "Line"} added to order`);
    if (!elements.orderModal.hidden) renderOrderModal();
  });
}

function renderOrderLines(order) {
  if (!order.lines.length) return '<div class="quote-empty">No lines yet. Search above to add Tooling or Rig Parts.</div>';
  const entryLocked = order.status !== "Open" ? "disabled" : "";
  const fulfillmentLocked = order.status !== "Released" ? "disabled" : "";
  return order.lines.map((line, index) => { const available = line.part ? Math.max(0, Number(getStock(line.part).onHand) - Number(getStock(line.part).allocated)) : 0; const maxShip = Math.min(Number(line.reservedQty || 0), orderRemainingQty(line)); const maxInvoice = Math.max(0, Number(line.shippedQty || 0) - Number(line.invoicedQty || 0)); return `<div class="order-line" data-line-index="${index}">
      <input class="line-input" data-line-field="part" value="${escapeHTML(line.part)}" aria-label="Part number" ${entryLocked}>
      <input class="line-input line-description" data-line-field="description" value="${escapeHTML(line.description)}" aria-label="Description" ${entryLocked}>
      <input class="line-input line-uom" data-line-field="uom" value="${escapeHTML(line.uom || "EA")}" aria-label="Unit of measure" ${entryLocked}>
      <input class="line-input" type="number" min="1" max="5000" step="1" data-line-field="quantity" value="${line.quantity}" aria-label="Ordered quantity" ${entryLocked}>
      <span class="order-line-readout">${available}</span>
      <span class="order-line-readout">${line.reservedQty || 0}</span>
      <input class="line-input" type="number" min="0" max="${maxShip}" step="1" data-line-field="qtyToShip" value="${line.qtyToShip || 0}" aria-label="Quantity to ship" ${fulfillmentLocked}>
      <span class="order-line-readout">${line.shippedQty || 0}</span>
      <input class="line-input" type="number" min="0" max="${maxInvoice}" step="1" data-line-field="qtyToInvoice" value="${line.qtyToInvoice || 0}" aria-label="Quantity to invoice" ${fulfillmentLocked}>
      <span class="order-line-readout">${line.invoicedQty || 0}</span>
      <span class="order-line-readout ${line.backorderQty ? "is-backordered" : ""}">${line.backorderQty || 0}</span>
      <input class="line-input" type="number" min="0" step="0.01" data-line-field="unitPrice" value="${line.unitPrice}" aria-label="Unit price" ${entryLocked}>
      <input class="line-input" type="number" min="0" step="0.01" data-line-field="discount" value="${line.discount}" aria-label="Discount amount" ${entryLocked}>
      <input type="checkbox" data-line-field="taxable" ${line.taxable ? "checked" : ""} aria-label="Taxable" ${entryLocked}>
      <strong class="line-extended">${formatCurrency(lineExtended(line))}</strong>
      ${order.status === "Open" ? `<button class="line-remove" type="button" data-line-remove="${index}" aria-label="Remove line">×</button>` : "<span></span>"}
    </div>`; }).join("");
}

function updateOrderNumbers() {
  const order = activeOrder();
  if (!order) return;
  const totals = orderTotals(order);
  $("#orderSubtotal") && ($("#orderSubtotal").textContent = formatCurrency(totals.subtotal));
  $("#orderTotal") && ($("#orderTotal").textContent = formatCurrency(totals.total));
  $$(".order-line[data-line-index]").forEach((row) => {
    const line = order.lines[Number(row.dataset.lineIndex)];
    $(".line-extended", row).textContent = formatCurrency(lineExtended(line));
  });
}

function renderOrderModal() {
  const order = activeOrder();
  if (!order) return;
  const totals = orderTotals(order);
  const fulfillment = orderFulfillment(order);
  const readiness = orderReadiness(order);
  const rateReadiness = shippingRateReadiness(order);
  const editable = order.status === "Open";
  const locked = editable ? "" : "disabled";
  const summaryLocked = editable && order.lines.length ? "" : "disabled";
  const actionButtons = order.status === "Open"
    ? `<button type="button" class="primary-button" data-order-release ${readiness.canRelease ? "" : "disabled"}>Release Order</button>`
    : order.status === "Released"
      ? `<button type="button" class="secondary-button" data-order-reopen>Reopen</button><button type="button" class="secondary-button" data-order-reserve>Reserve Available</button><button type="button" class="primary-button" data-order-post-shipment ${fulfillment.toShip > 0 ? "" : "disabled"}>Post Shipment</button><button type="button" class="primary-button" data-order-post-invoice ${fulfillment.toInvoice > 0 ? "" : "disabled"}>Post Invoice</button>`
      : '<span class="order-closed-message">All ordered quantities are shipped and invoiced.</span>';
  const timeline = order.events.length ? order.events.map((event) => `<div class="order-event"><span class="order-event-dot"></span><div><strong>${escapeHTML(event.summary)}</strong><span>${escapeHTML(event.detail || "")}</span><small>${new Date(event.createdAt).toLocaleString()}${event.actorName ? ` · ${escapeHTML(event.actorName)}` : ""}</small></div></div>`).join("") : '<p class="quote-list-empty">No activity recorded yet.</p>';
  elements.orderModalTitle.textContent = `${order.orderNumber || "New Order"} — ${orderCompanyName(order)}`;
  elements.orderModalBody.innerHTML = `<div class="quote-context"><div><span>Order</span><strong>${escapeHTML(orderCompanyName(order))}</strong>${order.masterNo ? `<small>Master No. ${escapeHTML(String(order.masterNo))}</small>` : ""}${order.convertedFromQuoteId ? `<small>Converted from a quote</small>` : ""}</div>
      <span class="order-status-pill is-${order.status.toLowerCase()}">${escapeHTML(order.status)}</span>
    </div>
    <p class="quote-attribution">Originated by ${escapeHTML(order.originatorName || "Unknown")}${order.originatorInitials ? ` (${escapeHTML(order.originatorInitials)})` : ""} · Last edited by ${escapeHTML(order.lastModifiedByName || "Unknown")} ${order.lastModifiedAt ? new Date(order.lastModifiedAt).toLocaleString() : ""}</p>
    <div class="order-action-bar">${actionButtons}</div>
    <div class="order-readiness ${readiness.missing.length ? "has-warning" : "is-ready"}"><strong>${readiness.missing.length ? "Before release" : order.status === "Open" ? "Ready to release" : "Execution status"}</strong><span>${readiness.missing.length ? `Add ${escapeHTML(readiness.missing.join(", "))}.` : `${fulfillment.reserved} reserved · ${fulfillment.shipped} shipped · ${fulfillment.invoiced} invoiced${fulfillment.backordered ? ` · ${fulfillment.backordered} short` : ""}`}</span></div>
    ${editable ? `<div class="quote-search-wrap">
      <label class="field"><span>Search Tooling &amp; Rig Parts to add</span><input type="text" id="orderSearchInput" autocomplete="off" spellcheck="false" placeholder="Part number or description..." value="${escapeHTML(state.orderSearchTerm)}"></label>
      <div id="orderSearchResults" class="quote-search-results"></div>
    </div>` : ""}
    <div class="quote-layout">
      <section class="quote-form">
        <div class="quote-fields">
          <label class="field"><span>Customer</span><select data-order-meta-field="customerId" ${locked}>${customerOptions(order.customerId)}</select></label>
          <label class="field"><span>Customer PO / Ref</span><input data-order-meta-field="customerPo" value="${escapeHTML(order.customerPo)}" ${locked}></label>
          <label class="field"><span>Salesperson</span><input data-order-meta-field="salesperson" value="${escapeHTML(order.salesperson)}" ${locked}></label>
          <label class="field"><span>Location</span><input data-order-meta-field="locationCode" value="${escapeHTML(order.locationCode || "MAIN")}" ${locked}></label>
          <label class="field"><span>Payment Terms</span><select data-order-meta-field="terms" ${locked}>${paymentTermsOptions.map((option) => `<option ${option === order.terms ? "selected" : ""}>${option}</option>`).join("")}</select></label>
          <label class="field"><span>Shipping Method</span><select data-order-meta-field="shipVia" ${locked}>${shipViaOptions.map((option) => `<option ${option === order.shipVia ? "selected" : ""}>${option}</option>`).join("")}</select></label>
          <label class="field"><span>Req Ship Date</span><input type="date" data-order-meta-field="reqShipDate" value="${escapeHTML(order.reqShipDate || "")}" ${locked}></label>
        </div>
        <div class="quote-fields quote-fields--shipto">
          <label class="field"><span>Ship To Contact</span><input data-order-meta-field="shipToContact" value="${escapeHTML(order.shipToContact || "")}" ${locked}></label>
          <label class="field field--wide"><span>Ship To Address</span><input data-order-meta-field="shipToAddress" value="${escapeHTML(order.shipToAddress || "")}" ${locked}></label>
        </div>
        <div class="quote-fields quote-fields--dims">
          <label class="field"><span>Weight (lbs)</span><input type="number" min="0" step="0.1" data-order-meta-field="weightLbs" value="${order.weightLbs}" ${locked}></label>
          <label class="field"><span>Length (in)</span><input type="number" min="0" step="0.1" data-order-meta-field="lengthIn" value="${order.lengthIn}" ${locked}></label>
          <label class="field"><span>Width (in)</span><input type="number" min="0" step="0.1" data-order-meta-field="widthIn" value="${order.widthIn}" ${locked}></label>
          <label class="field"><span>Height (in)</span><input type="number" min="0" step="0.1" data-order-meta-field="heightIn" value="${order.heightIn}" ${locked}></label>
        </div>
        <div class="order-lines ${order.lines.length ? "" : "is-empty"}">${order.lines.length ? '<div class="order-line order-line--header"><span>Part</span><span>Description</span><span>UOM</span><span>Ordered</span><span>Avail.</span><span>Reserved</span><span>To Ship</span><span>Shipped</span><span>To Inv.</span><span>Invoiced</span><span>B/O</span><span>Unit Price</span><span>Discount</span><span>Tax</span><span>Extended</span><span></span></div>' : ""}
          <div id="orderLineRows">${renderOrderLines(order)}</div>
          ${editable ? '<button class="secondary-button" type="button" data-order-add-line>Add Blank Line</button>' : ""}
        </div>
        <label class="field quote-notes"><span>Internal notes</span><textarea data-order-meta-field="notes" rows="4" ${order.status === "Closed" ? "disabled" : ""}>${escapeHTML(order.notes)}</textarea></label>
      </section>
      <aside class="quote-summary"><h3>Order Summary</h3>
        <div class="summary-row"><span>Subtotal</span><strong id="orderSubtotal">${formatCurrency(totals.subtotal)}</strong></div>
        <label class="summary-input"><span>Misc</span><input type="number" min="0" step="0.01" data-order-meta-field="misc" value="${order.misc}" ${summaryLocked}></label>
        <label class="summary-input"><span>Freight</span><input type="number" min="0" step="0.01" data-order-meta-field="freight" value="${order.freight}" ${summaryLocked}></label>
        <div class="shipping-rate-actions">
          <select id="orderRateCarrier" ${editable ? "" : "disabled"}><option value="UPS">UPS</option><option value="FEDEX">FedEx</option></select>
          <button type="button" class="small-button" data-order-get-rate ${editable && rateReadiness.ready ? "" : "disabled"}>Get Rate</button>
        </div>
        <p id="orderRateStatus" class="shipping-rate-status">${editable && !rateReadiness.ready ? `Rate needs ${escapeHTML(rateReadiness.missing.join(", "))}.` : ""}</p>
        <label class="summary-input"><span>Trade Discount</span><input type="number" min="0" step="0.01" data-order-meta-field="tradeDiscount" value="${order.tradeDiscount}" ${summaryLocked}></label>
        <div class="summary-row"><span>Tax</span><span class="quote-tax-note">Calculated by GP</span></div>
        <div class="summary-row total"><span>Total</span><strong id="orderTotal">${formatCurrency(totals.total)}</strong></div>
        <p class="quote-state">${isPublicDemo ? "Portfolio sandbox: edits stay only in this browser." : "Every edit here saves and is visible to the whole team."}</p>
      </aside>
    </div>
    <section class="order-timeline"><h3>Order Activity</h3>${timeline}</section>`;
  if (editable) renderOrderSearchResults();
}

function renderQuoteSearchResults() {
  const host = $("#quoteSearchResults");
  if (!host) return;
  const term = state.quoteSearchTerm.trim();
  if (!term) { host.innerHTML = ""; return; }
  const toolingMatches = state.toolItems.map((item) => ({ ...item, score: matchScore(term, `${item.part} ${item.description}`), kind: "tooling" }));
  const rigMatches = state.data.rig.items.map((item) => ({ part: item.part, description: item.cleanDescription || item.description, id: item.part, score: matchScore(term, `${item.part} ${item.cleanDescription || item.description}`), kind: "rig" }));
  const results = [...toolingMatches, ...rigMatches].filter((item) => item.score >= 0.5 && item.part).sort((a, b) => b.score - a.score).slice(0, 8);
  host.innerHTML = results.length
    ? results.map((item) => `<button type="button" class="advanced-search-result" data-quote-search-add-part="${escapeHTML(item.part)}" data-quote-search-add-description="${escapeHTML(item.description || "")}" data-quote-search-add-category="${item.kind === "rig" ? "Rig Parts" : "Tooling"}"><strong>${escapeHTML(item.part)}</strong><span>${escapeHTML(item.description || "")} · ${item.kind === "rig" ? "Rig Parts" : "Tooling"}</span></button>`).join("")
    : '<p class="advanced-search-empty">No matches.</p>';
}

const paymentTermsOptions = ["Net 30", "Net 60", "Credit Card", "Prepay", "COD"];
const shipViaOptions = ["Best Way", "Next Day Air", "NDA Early AM", "Second Day Air", "INTL", "Freight"];

function renderQuoteModal() {
  const quote = activeQuote();
  if (!quote) return;
  const totals = quoteTotals(quote);
  elements.quoteModalTitle.textContent = `${quote.number} — ${quoteCompanyName(quote)}`;
  elements.quoteModalBody.innerHTML = `<div class="quote-context"><div><span>${escapeHTML(quote.workflow || "General")} quote</span><strong>${escapeHTML(quoteCompanyName(quote))}</strong>${quote.masterNo ? `<small>Master No. ${escapeHTML(String(quote.masterNo))}</small>` : ""}</div>
      <label class="field quote-status-field"><span>Status</span><select data-quote-meta-field="status">${["Open", "Won", "Lost", "Archived"].map((option) => `<option ${option === quote.status ? "selected" : ""}>${option}</option>`).join("")}</select></label>
      ${quote.status === "Open" ? '<button type="button" class="primary-button" data-quote-convert-to-order>Change To → Order</button>' : ""}
    </div>
    <p class="quote-attribution">Originated by ${escapeHTML(quote.originatorName || "Unknown")}${quote.originatorInitials ? ` (${escapeHTML(quote.originatorInitials)})` : ""} · Last edited by ${escapeHTML(quote.lastModifiedByName || "Unknown")} ${quote.lastModifiedAt ? new Date(quote.lastModifiedAt).toLocaleString() : ""}</p>
    <div class="quote-search-wrap">
      <label class="field"><span>Search Tooling &amp; Rig Parts to add</span><input type="text" id="quoteSearchInput" autocomplete="off" spellcheck="false" placeholder="Part number or description..." value="${escapeHTML(state.quoteSearchTerm)}"></label>
      <div id="quoteSearchResults" class="quote-search-results"></div>
    </div>
    <div class="quote-layout">
      <section class="quote-form">
        <div class="quote-fields">
          <label class="field"><span>Customer</span><select data-quote-meta-field="customerId">${customerOptions(quote.customerId)}</select></label>
          <label class="field"><span>Quote #</span><input data-quote-meta-field="number" value="${escapeHTML(quote.number)}"></label>
          <label class="field"><span>Customer PO / Ref</span><input data-quote-meta-field="customerPo" value="${escapeHTML(quote.customerPo)}"></label>
          <label class="field"><span>Salesperson</span><input data-quote-meta-field="salesperson" value="${escapeHTML(quote.salesperson)}"></label>
          <label class="field"><span>Payment Terms</span><select data-quote-meta-field="terms">${paymentTermsOptions.map((option) => `<option ${option === quote.terms ? "selected" : ""}>${option}</option>`).join("")}</select></label>
          <label class="field"><span>Shipping Method</span><select data-quote-meta-field="shipVia">${shipViaOptions.map((option) => `<option ${option === quote.shipVia ? "selected" : ""}>${option}</option>`).join("")}</select></label>
          <label class="field"><span>Req Ship Date</span><input type="date" data-quote-meta-field="reqShipDate" value="${escapeHTML(quote.reqShipDate || "")}"></label>
        </div>
        <div class="quote-fields quote-fields--shipto">
          <label class="field"><span>Ship To Contact</span><input data-quote-meta-field="shipToContact" value="${escapeHTML(quote.shipToContact || "")}"></label>
          <label class="field field--wide"><span>Ship To Address</span><input data-quote-meta-field="shipToAddress" value="${escapeHTML(quote.shipToAddress || "")}"></label>
        </div>
        <div class="quote-lines"><div class="quote-line quote-line--header"><span>Part</span><span>Description</span><span>UOM</span><span>Qty</span><span>Unit Price</span><span>Discount</span><span>Tax</span><span>Extended</span><span></span></div>
          <div id="quoteLineRows">${renderQuoteLines(quote)}</div>
          <button class="secondary-button" type="button" data-quote-add-line>Add Blank Line</button>
        </div>
        <label class="field quote-notes"><span>Internal demo notes</span><textarea data-quote-meta-field="notes" rows="4">${escapeHTML(quote.notes)}</textarea></label>
      </section>
      <aside class="quote-summary"><h3>Quote Summary</h3>
        <div class="summary-row"><span>Subtotal</span><strong id="quoteSubtotal">${formatCurrency(totals.subtotal)}</strong></div>
        <label class="summary-input"><span>Misc</span><input type="number" min="0" step="0.01" data-quote-meta-field="misc" value="${quote.misc}"></label>
        <label class="summary-input"><span>Freight</span><input type="number" min="0" step="0.01" data-quote-meta-field="freight" value="${quote.freight}"></label>
        <label class="summary-input"><span>Trade Discount</span><input type="number" min="0" step="0.01" data-quote-meta-field="tradeDiscount" value="${quote.tradeDiscount}"></label>
        <div class="summary-row"><span>Tax</span><span class="quote-tax-note">Calculated by GP</span></div>
        <div class="summary-row total"><span>Total</span><strong id="quoteTotal">${formatCurrency(totals.total)}</strong></div>
        <p class="quote-state">${isPublicDemo ? "Portfolio sandbox: edits stay only in this browser." : "Every edit here saves and is visible to the whole team."}</p>
      </aside>
    </div>`;
  renderQuoteSearchResults();
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

function renderQuoteLines(quote) {
  if (!quote.lines.length) return '<div class="quote-empty">No lines yet. Search above to add Tooling or Rig Parts.</div>';
  return quote.lines.map((line, index) => `<div class="quote-line" data-line-index="${index}">
      <input class="line-input" data-line-field="part" value="${escapeHTML(line.part)}" aria-label="Part number">
      <input class="line-input line-description" data-line-field="description" value="${escapeHTML(line.description)}" aria-label="Description">
      <input class="line-input line-uom" data-line-field="uom" value="${escapeHTML(line.uom || "EA")}" aria-label="Unit of measure">
      <input class="line-input" type="number" min="1" max="5000" step="1" data-line-field="quantity" value="${line.quantity}" aria-label="Quantity">
      <input class="line-input" type="number" min="0" step="0.01" data-line-field="unitPrice" value="${line.unitPrice}" aria-label="Unit price">
      <input class="line-input" type="number" min="0" step="0.01" data-line-field="discount" value="${line.discount}" aria-label="Discount amount">
      <input type="checkbox" data-line-field="taxable" ${line.taxable ? "checked" : ""} aria-label="Taxable">
      <strong class="line-extended">${formatCurrency(lineExtended(line))}</strong>
      <button class="line-remove" type="button" data-line-remove="${index}" aria-label="Remove line">×</button>
    </div>`).join("");
}

function updateQuoteNumbers() {
  const quote = activeQuote();
  if (!quote) return;
  const totals = quoteTotals(quote);
  $("#quoteSubtotal") && ($("#quoteSubtotal").textContent = formatCurrency(totals.subtotal));
  $("#quoteTotal") && ($("#quoteTotal").textContent = formatCurrency(totals.total));
  $$(".quote-line[data-line-index]").forEach((row) => {
    const line = quote.lines[Number(row.dataset.lineIndex)];
    $(".line-extended", row).textContent = formatCurrency(lineExtended(line));
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

function renderBomNode(part, description, children, visited, depth, quantity, uom) {
  const rows = children.get(part) || [];
  const qtyLabel = quantity != null ? `<small>${escapeHTML(quantity)} ${escapeHTML(uom || "")}</small>` : "";
  if (visited.has(part) || depth > 8) return `<button type="button" class="bom-leaf" data-bom-part="${escapeHTML(part)}"><strong>${escapeHTML(part)}</strong><span>${escapeHTML(description)}</span>${qtyLabel}</button>`;
  const nextVisited = new Set(visited); nextVisited.add(part);
  return `<details class="bom-node" ${depth === 0 ? "open" : ""}><summary><button type="button" data-bom-part="${escapeHTML(part)}"><strong>${escapeHTML(part)}</strong><span>${escapeHTML(description)}</span>${qtyLabel}</button><small>${rows.length} items</small></summary>
    <div class="bom-children">${rows.map((row) => children.has(row.part)
      ? renderBomNode(row.part, row.description, children, nextVisited, depth + 1, row.quantity, row.uom)
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
    <label class="field"><span>Demo unit price</span><input type="number" min="0" step="0.01" data-stock-part="${escapeHTML(part)}" data-stock-field="unitPrice" value="${stock.unitPrice}"></label><button type="button" class="secondary-button" data-open-item-part="${escapeHTML(part)}">Open Item</button>${addPartButton(part, description, false, "Add to Quote")}</div>`;
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

async function loadKnownCustomers() {
  if (isPublicDemo) {
    state.knownCustomers = customers.map((customer, index) => ({
      number: `DEMO-${String(index + 1).padStart(4, "0")}`,
      name: customer.name,
      source: "Portfolio demo customer list",
    }));
    state.knownCustomersConfigured = true;
    state.knownCustomersLoaded = true;
    return;
  }
  try {
    const response = await fetch("/.netlify/functions/known-customers-list");
    if (response.ok) {
      const data = await response.json();
      state.knownCustomers = data.customers || [];
      state.knownCustomersConfigured = Boolean(data.configured);
      state.knownCustomersLoaded = true;
      return;
    }
  } catch {
    // backend unreachable
  }
  state.knownCustomers = [];
  state.knownCustomersConfigured = false;
  state.knownCustomersLoaded = true;
}

function maskCustomerName(value) {
  return String(value).replace(/\p{L}+/gu, (word) =>
    word.length <= 2 ? word[0] + "•".repeat(word.length - 1) : word[0] + "•".repeat(word.length - 2) + word[word.length - 1]
  );
}

function maskCustomerNumber(value) {
  const str = String(value);
  if (str.length <= 4) return "•".repeat(str.length);
  return `${str.slice(0, 2)}${"•".repeat(str.length - 4)}${str.slice(-2)}`;
}

function prospectDuplicateCheck(candidate) {
  if (!state.knownCustomersLoaded) return { label: "Checking...", statusClass: "", detail: "Duplicate check loading..." };
  if (!state.knownCustomersConfigured || !state.knownCustomers.length) {
    return { label: "New Prospect", statusClass: "", detail: "Duplicate check unavailable — no known-customer data loaded." };
  }
  let best = null;
  for (const known of state.knownCustomers) {
    const score = matchScore(candidate.company, known.name);
    if (!best || score > best.score) best = { score, known };
  }
  if (best && best.score >= 0.85) {
    return { label: "Existing Customer", statusClass: "status-label--good", detail: `Matched a known customer record — ${maskCustomerName(best.known.name)} (${maskCustomerNumber(best.known.number)})`, matched: best.known };
  }
  if (best && best.score >= 0.55) {
    return { label: "Possible Duplicate", statusClass: "status-label--warn", detail: `Similar name to a known customer — ${maskCustomerName(best.known.name)} (${maskCustomerNumber(best.known.number)}) — review before treating as new.`, matched: best.known };
  }
  return {
    label: "New Prospect",
    statusClass: "",
    detail: isPublicDemo
      ? "No match in the portfolio demo customer list."
      : "No match in known customer records (partial data — Auger sales only, Q1 2024).",
  };
}

function renderProspectResults() {
  const host = $("#prospectResults");
  if (!host) return;
  if (!state.prospectResults.length) {
    host.innerHTML = `<div class="prospect-empty"><strong>Set the search parameters and run the prospect search.</strong><span>${isPublicDemo ? "Company discovery and duplicate-checking use safe portfolio demo data." : "Company discovery is still demo data. The customer duplicate-check runs against a real, partial GP export."}</span></div>`;
    return;
  }
  host.innerHTML = `<div class="prospect-summary"><strong>${state.prospectResults.length} companies reviewed</strong><span>${isPublicDemo ? `Portfolio demo comparison: ${state.knownCustomers.length} safe customer records loaded.` : `Company list: demo data. Duplicate check: real, partial (${state.knownCustomers.length} known customers loaded).`}</span></div><div class="prospect-grid">${state.prospectResults.map((candidate) => {
    const check = prospectDuplicateCheck(candidate);
    return `<article class="prospect-card"><header><div><span class="status-label ${check.statusClass}">${check.label}</span><h3>${escapeHTML(candidate.company)}</h3><p>${escapeHTML(candidate.state)} · ${escapeHTML(candidate.territory)} · ${escapeHTML(candidate.market)} · ${escapeHTML(candidate.domain)}</p></div><div class="equipment-thumb" aria-hidden="true"><span></span></div></header>
      <dl><dt>Account check</dt><dd>${escapeHTML(check.detail)}</dd><dt>Distance</dt><dd>${candidate.distance} miles</dd><dt>Equipment evidence</dt><dd>${state.prospectParams.visual ? escapeHTML(candidate.equipment) : "Image review not requested"}</dd><dt>Possible equipment</dt><dd>${state.prospectParams.visual ? escapeHTML(candidate.possibleModel) : "Not reviewed"}</dd><dt>Confidence</dt><dd>${state.prospectParams.visual ? escapeHTML(candidate.confidence) : "—"}</dd><dt>Ownership</dt><dd>${state.prospectParams.visual ? escapeHTML(candidate.ownership) : "Not evaluated"}</dd><dt>Evidence source</dt><dd>${state.prospectParams.visual ? escapeHTML(candidate.evidence) : "—"}</dd></dl>
      <footer>${check.matched ? `<span class="prospect-matched-note">Matches a known customer — no MDB customer profile linked yet</span>` : '<button type="button" class="primary-button" data-start-prospect>Start Prospect</button>'}<button type="button" class="secondary-button" data-review-evidence>Review Evidence</button></footer></article>`;
  }).join("")}</div>`;
}

function renderProspectWorkspace() {
  const params = state.prospectParams;
  elements.overlayBody.innerHTML = `<div class="workbench prospect-workbench">
    <section class="prospect-controls"><header><div><h3>Rule-Controlled Search</h3><p>${isPublicDemo ? "Company discovery and duplicate-checking run entirely on safe portfolio demo data." : "Company discovery is demo data pending a real search source. Customer duplicate-check runs against a real, partial GP export."}</p></div><span class="demo-data-label">${isPublicDemo ? "Portfolio demo data" : "Mixed: demo discovery + real duplicate-check"}</span></header>
      <div class="prospect-fields"><label class="field"><span>Territory</span><select id="prospectTerritory">${["Nationwide", "Northeast", "Southeast", "Midwest", "Southwest", "West"].map((value) => `<option value="${value}" ${value === params.territory ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="field"><span>Market</span><select id="prospectMarket">${["All", "Geotechnical", "Environmental"].map((value) => `<option value="${value}" ${value === params.market ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="field"><span>Search radius</span><select id="prospectRadius">${["50", "100", "250", "Region-wide"].map((value) => `<option value="${value}" ${value === params.radius ? "selected" : ""}>${value}${/^\d+$/.test(value) ? " miles" : ""}</option>`).join("")}</select></label><label class="field field--wide"><span>Required terms</span><input id="prospectKeywords" value="${escapeHTML(params.keywords)}" placeholder="drilling, geotechnical, environmental..."></label></div>
      <div class="prospect-rules"><label><input type="checkbox" checked disabled> ${isPublicDemo ? "Check company name against the demo customer list" : "Check company name against known real GP customer records"}</label><label><input id="prospectVisual" type="checkbox" ${params.visual ? "checked" : ""}> Review public images for equipment evidence</label><span>Observed equipment is evidence only. Ownership stays unconfirmed until supported by records or a rep.</span><button type="button" class="primary-button" data-run-prospect>Run Prospect Search</button></div>
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
  if (calibIdentityGateEnabled && !state.identity) { openIdentityPicker(renderCalibrationTrainingWorkspace); return; }
  state.calibView = "scenarios";
  const identity = calibIdentityGateEnabled ? state.identity : null;
  const adminActive = calibIdentityGateEnabled && identity?.isAdmin && state.calibAdminUnlocked;
  elements.overlayBody.innerHTML = `<div class="workbench training-workbench">
    <div class="training-intro"><span>Practice only</span><h3>Calibration Call Training</h3><p>Run the field scenario without touching a real customer, calibration record, or quote. Scored against Module 010's real pass/retrain rules.</p></div>
    ${identity ? `<div class="calib-identity-bar">
      <span>Signed in as <strong>${escapeHTML(identity.name)} (${escapeHTML(identity.initials)})</strong></span>
      <div class="calib-identity-actions">
        ${identity.isAdmin ? (adminActive ? `<button type="button" class="secondary-button" data-calib-admin-console>Admin Console</button><button type="button" class="secondary-button" data-calib-lock-admin>Lock Admin Mode</button>` : `<button type="button" class="secondary-button" data-calib-unlock-admin>Unlock Admin Mode</button>`) : ""}
        <button type="button" class="secondary-button" data-calib-switch-user>Switch User</button>
      </div>
    </div>` : ""}
    <div class="training-grid training-grid--calibration">${calibrationTrainingScenarios.map((scenario) => {
      const record = identity ? latestCalibResult(identity.initials, scenario.id) : null;
      const locked = identity ? state.calibLocks[calibLockKey(identity.initials, scenario.id)] : false;
      const badge = record ? `<span class="calib-lock-badge ${locked ? "calib-lock-badge--locked" : ""}">${locked ? "Locked" : "Reopened"} · ${record.outcome}</span>` : "";
      return `<button type="button" data-training-scenario="${scenario.id}"><strong>${escapeHTML(scenario.title)}</strong><span>${escapeHTML(scenario.subtitle)}</span>${badge}</button>`;
    }).join("")}</div>
    <section id="trainingStage" class="training-stage"><strong>Select a practice scenario.</strong></section>
  </div>`;
}

function latestCalibResult(repInitials, scenarioId) {
  return state.calibResults.find((record) => record.repInitials === repInitials && record.scenarioId === scenarioId) || null;
}

function renderCalibAdminGate() {
  const stage = $("#trainingStage");
  if (!stage) return;
  stage.innerHTML = `<h3>Admin PIN</h3><p class="calib-instructions">Enter the admin PIN to unlock the Admin Console and reopen failed sections for retest.</p>
    <div class="calib-pin-row"><input type="password" id="calibAdminPinInput" inputmode="numeric" placeholder="PIN" autocomplete="off"><button type="button" class="primary-button" data-calib-admin-pin-submit>Unlock</button></div>`;
  $("#calibAdminPinInput")?.focus();
}

function renderAdminConsole() {
  state.calibView = "admin";
  const rows = state.calibResults;
  elements.overlayBody.innerHTML = `<div class="workbench training-workbench">
    <div class="training-intro"><span>Admin</span><h3>Calibration Training — Admin Console</h3><p>Every submission across every rep. Add notes, set the final decision, and reopen a locked section for retest.</p></div>
    <div class="calib-identity-bar"><span>Signed in as <strong>${escapeHTML(state.identity.name)}</strong> · Admin Mode</span><div class="calib-identity-actions"><button type="button" class="secondary-button" data-calib-back-to-scenarios>Back to Scenarios</button></div></div>
    ${rows.length ? `<div class="table-scroll"><table class="data-table calib-admin-table"><thead><tr><th>Rep</th><th>Scenario</th><th>Submitted</th><th>Auto result</th><th>Missed items</th><th>Emailed</th><th>Admin decision</th><th>Admin notes</th><th>Lock</th></tr></thead><tbody>${rows.map((record) => `<tr>
      <td>${escapeHTML(record.repName)} (${escapeHTML(record.repInitials)})</td>
      <td>${escapeHTML(record.scenarioTitle)}</td>
      <td>${new Date(record.timestamp).toLocaleString()}</td>
      <td><span class="status-label ${record.outcome === "PASS" ? "status-label--good" : "status-label--warn"}">${record.outcome}</span></td>
      <td>${record.missed.length ? `<ul>${record.missed.map((note) => `<li>${escapeHTML(note)}</li>`).join("")}</ul>` : "None"}</td>
      <td>${record.emailed ? "Yes" : "Not sent"}</td>
      <td><select data-calib-admin-decision="${record.id}">${["Not reviewed", "Continue supervised training", "Retrain / retest required", "Approved for solo service appointments"].map((option) => `<option ${option === record.adminDecision ? "selected" : ""}>${option}</option>`).join("")}</select></td>
      <td><textarea rows="2" data-calib-admin-notes="${record.id}" placeholder="Notes...">${escapeHTML(record.adminNotes)}</textarea></td>
      <td>${state.calibLocks[calibLockKey(record.repInitials, record.scenarioId)] ? `<button type="button" class="table-button" data-calib-reopen="${calibLockKey(record.repInitials, record.scenarioId)}">Reopen</button>` : "Open"}</td>
    </tr>`).join("")}</tbody></table></div>` : "<p>No results submitted yet.</p>"}
  </div>`;
}

function renderTrainingScenario(id) {
  const stage = $("#trainingStage");
  if (!stage) return;
  const scenario = calibrationTrainingScenarios.find((item) => item.id === id);
  if (!scenario) { stage.innerHTML = "<strong>Select a practice scenario.</strong>"; return; }
  state.activeCalibrationScenario = id;
  const identity = state.identity;
  const locked = calibIdentityGateEnabled && identity && state.calibLocks[calibLockKey(identity.initials, scenario.id)];
  if (locked) {
    const record = latestCalibResult(identity.initials, scenario.id);
    stage.innerHTML = `<span class="status-label status-label--warn">Locked</span><h3>${escapeHTML(scenario.prompt)}</h3>
      <div class="calib-result ${record?.outcome === "PASS" ? "calib-result--pass" : "calib-result--retrain"}">
        <span class="status-label ${record?.outcome === "PASS" ? "status-label--good" : "status-label--warn"}">${escapeHTML(record?.outcome || "")}</span>
        <p>Submitted ${record ? new Date(record.timestamp).toLocaleString() : ""}. Admin decision: ${escapeHTML(record?.adminDecision || "Not reviewed")}.</p>
        ${record?.missed.length ? `<ul>${record.missed.map((note) => `<li>${escapeHTML(note)}</li>`).join("")}</ul>` : ""}
        <p>Ask an admin to reopen this section for another attempt.</p>
      </div>`;
    return;
  }
  stage.innerHTML = `<span class="status-label">Active practice</span><h3>${escapeHTML(scenario.prompt)}</h3>
    ${scenario.approvedLanguage ? `<div class="calib-approved-language"><strong>Approved field explanation</strong><p>“${escapeHTML(scenario.approvedLanguage)}”</p></div>` : ""}
    <p class="calib-instructions">Check every action the trainee should take, fill in any blanks, and put any workflow steps in order.${calibIdentityGateEnabled ? " This locks after one submission — an admin has to reopen it for a retest." : ""}</p>
    <ol class="calib-checklist">${scenario.items.map((item, index) => renderCalibItem(item, index)).join("")}</ol>
    <button type="button" class="primary-button" data-complete-training>Complete Practice</button>
    <div id="trainingResult"></div>`;
}

function renderCalibItem(item, index) {
  if (item.type === "blank") {
    return `<li class="calib-blank"><label>${escapeHTML(item.text)}<input type="text" data-calib-item="${index}" data-calib-type="blank" autocomplete="off"></label></li>`;
  }
  if (item.type === "order") {
    return `<li class="calib-order"><p>${escapeHTML(item.text)}</p><ol class="calib-order-steps">${item.steps.map((step, stepIndex) => `<li>${escapeHTML(step.text)} <select data-calib-item="${index}" data-calib-step="${stepIndex}"><option value="">#</option>${item.steps.map((_, position) => `<option value="${position + 1}">${position + 1}</option>`).join("")}</select></li>`).join("")}</ol></li>`;
  }
  return `<li><label><input type="checkbox" data-calib-item="${index}"> ${escapeHTML(item.text)}</label></li>`;
}

function renderCalibResultPanel(record, statusNote) {
  const emailLine = isPublicDemo
    ? "Portfolio sandbox: this practice result stays only in this browser."
    : (statusNote || (record.emailed
      ? "Result emailed to the training administrator."
      : "Not emailed yet — email sending isn't configured. Result is saved and visible in the Admin Console."));
  return `<div class="calib-result ${record.outcome === "PASS" ? "calib-result--pass" : "calib-result--retrain"}">
    <span class="status-label ${record.outcome === "PASS" ? "status-label--good" : "status-label--warn"}">${record.outcome === "PASS" ? "Pass" : "Retrain / retest required"}</span>
    ${record.missed.length ? `<ul>${record.missed.map((note) => `<li>${escapeHTML(note)}</li>`).join("")}</ul>` : `<p>Matches Module 010's pass standard for this scenario.</p>`}
    <p class="calib-email-status">${emailLine}</p>
    ${calibIdentityGateEnabled ? "<p>This section is now locked. Ask an admin to reopen it for another attempt.</p>" : ""}
  </div>`;
}

async function sendCalibrationResultEmail(record) {
  if (isPublicDemo) return false;
  try {
    const response = await fetch("/.netlify/functions/send-calibration-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repName: record.repName,
        repInitials: record.repInitials,
        scenarioTitle: record.scenarioTitle,
        outcome: record.outcome,
        missed: record.missed,
        timestamp: record.timestamp,
      }),
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => ({}));
    return Boolean(data.sent);
  } catch {
    return false;
  }
}

function gradeCalibrationScenario() {
  const scenario = calibrationTrainingScenarios.find((item) => item.id === state.activeCalibrationScenario);
  const resultHost = $("#trainingResult");
  if (!scenario || !resultHost) return;
  const incomplete = [];
  const missedNotes = [];
  scenario.items.forEach((item, index) => {
    if (item.type === "blank") {
      const input = $(`[data-calib-item="${index}"][data-calib-type="blank"]`);
      const value = normalize(input?.value || "");
      if (!value) { incomplete.push(item.text); return; }
      const passes = item.keywords
        ? item.keywords.every((word) => value.includes(normalize(word)))
        : (item.accepted || []).some((answer) => value.includes(normalize(answer)));
      if (!passes) missedNotes.push(item.note || `Incorrect answer: “${item.text}”`);
    } else if (item.type === "order") {
      const selects = $$(`[data-calib-item="${index}"][data-calib-step]`).sort((a, b) => Number(a.dataset.calibStep) - Number(b.dataset.calibStep));
      if (selects.some((select) => !select.value)) { incomplete.push(item.text); return; }
      const correct = item.steps.every((step, stepIndex) => Number(selects[stepIndex].value) === step.correctPosition);
      if (!correct) missedNotes.push(item.note || `Steps were not in the correct order: “${item.text}”`);
    } else {
      const checkbox = $(`[data-calib-item="${index}"]`);
      if (item.correct && !checkbox?.checked) { incomplete.push(item.text); return; }
      if (!item.correct && checkbox?.checked) missedNotes.push(item.note || item.text);
    }
  });
  if (incomplete.length) { showToast("Complete every required action, blank, and ordering step before finishing practice"); return; }
  const identity = calibIdentityGateEnabled && state.identity ? state.identity : { initials: "DEMO", name: "Demo Tester" };
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    repInitials: identity.initials,
    repName: identity.name,
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    outcome: missedNotes.length ? "RETRAIN" : "PASS",
    missed: missedNotes,
    timestamp: new Date().toISOString(),
    adminDecision: "Not reviewed",
    adminNotes: "",
    emailed: false,
  };
  state.calibResults.unshift(record);
  saveCalibResults();
  if (calibIdentityGateEnabled) {
    state.calibLocks[calibLockKey(record.repInitials, record.scenarioId)] = true;
    saveCalibLocks();
  }
  resultHost.innerHTML = renderCalibResultPanel(record, isPublicDemo ? "Portfolio sandbox: saving this result on this device." : "Sending result to the training administrator...");
  sendCalibrationResultEmail(record).then((sent) => {
    record.emailed = sent;
    saveCalibResults();
    const host = $("#trainingResult");
    if (host) host.innerHTML = renderCalibResultPanel(record);
  });
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

function handleOverlayInput(event) {
  const target = event.target;
  if (target.id === "toolSearch") {
    const toolState = activeToolingState();
    toolState.query = target.value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      const detected = detectBuilder(toolState.query);
      toolState.selectedId = "";
      if (detected !== toolState.builder) { toolState.builder = detected; toolState.filters = {}; }
      updateToolingModeSurface();
    }, 90);
  }
  if (target.id === "inventorySearch") {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => renderInventoryResults(target.value), 90);
  }
  if (target.id === "itemSearch") {
    state.itemView.query = target.value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(renderItemResults, 90);
  }
  if (target.id === "bomSearch") {
    state.bom.query = target.value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(renderBomTree, 90);
  }
  if (target.matches("[data-builder-field]")) {
    const toolState = activeToolingState();
    toolState.filters[target.dataset.builderField] = target.type === "checkbox" ? target.checked : target.value;
    if (target.tagName === "SELECT" || event.type === "change") $("#toolBuilderHost").innerHTML = renderToolingBuilderSurface();
  }
  if (target.matches("[data-stock-part]")) {
    const part = target.dataset.stockPart;
    const stock = getStock(part);
    stock[target.dataset.stockField] = target.type === "number" ? Number(target.value) : target.value;
    touchStock(part);
    const row = target.closest("tr");
    const available = row?.querySelector(`[data-stock-available="${CSS.escape(part)}"]`);
    if (available) {
      const count = Number(stock.onHand) - Number(stock.allocated);
      available.textContent = count;
      available.classList.toggle("is-low", count < 1);
    }
  }
  if (target.matches("[data-calib-admin-notes]")) {
    const record = state.calibResults.find((item) => item.id === target.dataset.calibAdminNotes);
    if (record) { record.adminNotes = target.value; saveCalibResults(); }
  }
}

elements.overlayBody.addEventListener("input", handleOverlayInput);
elements.overlayBody.addEventListener("change", async (event) => {
  handleOverlayInput(event);
  const target = event.target;
  if (target.id === "itemClassFilter") { state.itemView.itemClass = target.value; state.itemView.selectedPart = ""; renderItemResults(); }
  if (target.id === "bomRigSelect") { state.bom.serial = target.value; state.bom.section = ""; state.bom.selectedPart = ""; renderBomWorkspace(); }
  if (target.id === "calibrationCustomerSelect") { state.calibrationCustomerId = target.value; renderCalibrationWorkspace(); }
  if (target.matches("[data-calib-admin-decision]")) {
    const record = state.calibResults.find((item) => item.id === target.dataset.calibAdminDecision);
    if (record) { record.adminDecision = target.value; saveCalibResults(); }
  }
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
  if (event.target.id === "serviceRequestForm") {
    event.preventDefault();
    createServiceRequestFromForm(event.target);
    return;
  }
  if (event.target.id === "buildRequestForm") {
    event.preventDefault();
    createBuildRequestFromForm(event.target);
    return;
  }
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
  if (event.target.closest("[data-service-new]")) { state.serviceRequestEditorOpen = true; state.serviceRequestFormError = ""; renderServiceRequestsWorkspace(); $("#serviceRequestForm select[name='sourceChannel']")?.focus(); return; }
  if (event.target.closest("[data-service-editor-close]")) { state.serviceRequestEditorOpen = false; state.serviceRequestFormError = ""; renderServiceRequestsWorkspace(); return; }
  if (event.target.closest("[data-service-open-requests]")) { openWorkspace("serviceRequests"); return; }
  if (event.target.closest("[data-open-operations-board]")) { openWorkspace("operationsBoard"); return; }
  const operationsRole = event.target.closest("[data-operations-role]");
  if (operationsRole) { state.operationsBoardRole = operationsRole.dataset.operationsRole; renderOperationsBoardWorkspace(); return; }
  const serviceTransition = event.target.closest("[data-service-transition]");
  if (serviceTransition) {
    const request = state.serviceRequests.find((entry) => entry.id === serviceTransition.dataset.serviceRequestId);
    if (request) transitionServiceRequest(request, serviceTransition.dataset.serviceTransition, serviceTransition.closest("[data-service-request-card]"));
    return;
  }
  const scopeSave = event.target.closest("[data-job-scope-save]");
  if (scopeSave) {
    const job = state.operationsJobs.find((entry) => entry.id === scopeSave.dataset.jobScopeSave);
    if (job) establishServiceScope(job, scopeSave.closest("[data-operations-job-card]"));
    return;
  }
  const jobAction = event.target.closest("[data-job-action]");
  if (jobAction) {
    const job = state.operationsJobs.find((entry) => entry.id === jobAction.dataset.jobId);
    if (job) runJobAction(job, jobAction.dataset.jobAction, jobAction.closest("[data-operations-job-card]"));
    return;
  }
  const checkpointComplete = event.target.closest("[data-checkpoint-complete]");
  if (checkpointComplete) {
    const job = state.operationsJobs.find((entry) => entry.id === checkpointComplete.dataset.jobId);
    if (job) completeOperationsCheckpoint(job, checkpointComplete.dataset.checkpointComplete);
    return;
  }
  const jobSignoff = event.target.closest("[data-job-signoff]");
  if (jobSignoff) {
    const job = state.operationsJobs.find((entry) => entry.id === jobSignoff.dataset.jobId);
    if (job) recordOperationsSignoff(job, jobSignoff.dataset.jobSignoff);
    return;
  }
  if (event.target.closest("[data-request-new]")) { state.buildRequestEditorOpen = true; state.buildRequestFormError = ""; renderBuildRequestsWorkspace(); $("#buildRequestForm select[name='sourceLine']")?.focus(); return; }
  if (event.target.closest("[data-request-editor-close]")) { state.buildRequestEditorOpen = false; state.buildRequestFormError = ""; renderBuildRequestsWorkspace(); return; }
  if (event.target.closest("[data-request-open-orders]")) { openWorkspace("orders"); return; }
  if (event.target.closest("[data-production-open-builds]")) { state.buildWorkspaceRole = "production_controller"; openWorkspace("builds"); return; }
  const requestAccept = event.target.closest("[data-request-accept]");
  if (requestAccept) {
    const request = state.buildRequests.find((entry) => entry.id === requestAccept.dataset.requestAccept);
    const card = requestAccept.closest("[data-request-card]");
    if (request && card) acceptBuildRequest(request, {
      committedDueDate: card.querySelector(`[data-request-due="${request.id}"]`)?.value,
      priority: card.querySelector(`[data-request-priority="${request.id}"]`)?.value,
      shopAssigneeName: card.querySelector(`[data-request-assignee="${request.id}"]`)?.value,
    });
    return;
  }
  const requestReturn = event.target.closest("[data-request-return]");
  if (requestReturn) {
    const request = state.buildRequests.find((entry) => entry.id === requestReturn.dataset.requestReturn);
    const note = requestReturn.closest("[data-request-card]")?.querySelector(`[data-request-note="${request?.id}"]`)?.value;
    if (request) returnBuildRequest(request, note);
    return;
  }
  const requestResubmit = event.target.closest("[data-request-resubmit]");
  if (requestResubmit) { const request = state.buildRequests.find((entry) => entry.id === requestResubmit.dataset.requestResubmit); if (request) resubmitBuildRequest(request); return; }
  const requestCancel = event.target.closest("[data-request-cancel]");
  if (requestCancel) { const request = state.buildRequests.find((entry) => entry.id === requestCancel.dataset.requestCancel); if (request) cancelBuildRequest(request); return; }
  const requestChange = event.target.closest("[data-request-change]");
  if (requestChange) { const request = state.buildRequests.find((entry) => entry.id === requestChange.dataset.requestChange); if (request) requestBuildChange(request); return; }
  const requestOpenBuild = event.target.closest("[data-request-open-build]");
  if (requestOpenBuild) {
    const request = state.buildRequests.find((entry) => entry.id === requestOpenBuild.dataset.requestOpenBuild);
    const build = request ? buildForRequest(request) : null;
    if (build) { state.buildWorkspaceRole = requestOpenBuild.dataset.requestOpenBuildRole || "sales"; openBuildModal(build.id); }
    return;
  }
  const buildRole = event.target.closest("[data-build-role]");
  if (buildRole) { state.buildWorkspaceRole = buildRole.dataset.buildRole; renderBuildsWorkspace(); return; }
  const itemResult = event.target.closest("[data-item-part]");
  if (itemResult) { state.itemView.selectedPart = itemResult.dataset.itemPart; $$(".item-result").forEach((button) => button.classList.toggle("is-selected", button === itemResult)); renderItemDetail(state.itemView.selectedPart); return; }
  const itemTooling = event.target.closest("[data-item-open-tooling]");
  if (itemTooling) { openWorkspace("tooling", { query: itemTooling.dataset.itemOpenTooling }); return; }
  const itemBom = event.target.closest("[data-item-open-bom]");
  if (itemBom) { openWorkspace("bom", { serial: itemBom.dataset.itemSerial, part: itemBom.dataset.itemOpenBom }); return; }
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
    renderProspectResults(); showToast("Prospect search and customer duplicate-check complete"); return;
  }
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
  if (event.target.closest("[data-calib-switch-user]")) { openIdentityPicker(renderCalibrationTrainingWorkspace); return; }
  if (event.target.closest("[data-calib-unlock-admin]")) { renderCalibAdminGate(); return; }
  if (event.target.closest("[data-calib-admin-pin-submit]")) {
    const pinValue = $("#calibAdminPinInput")?.value || "";
    if (pinValue === calibrationAdminPin) { state.calibAdminUnlocked = true; renderCalibrationTrainingWorkspace(); showToast("Admin Mode unlocked"); }
    else showToast("Incorrect PIN");
    return;
  }
  if (event.target.closest("[data-calib-lock-admin]")) { state.calibAdminUnlocked = false; renderCalibrationTrainingWorkspace(); return; }
  if (event.target.closest("[data-calib-admin-console]")) { renderAdminConsole(); return; }
  if (event.target.closest("[data-calib-back-to-scenarios]")) { renderCalibrationTrainingWorkspace(); return; }
  const calibReopen = event.target.closest("[data-calib-reopen]");
  if (calibReopen) { delete state.calibLocks[calibReopen.dataset.calibReopen]; saveCalibLocks(); renderAdminConsole(); showToast("Section reopened for retest"); return; }
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
  if (event.target.closest("[data-quote-new]")) {
    requireIdentity(() => {
      const quote = newQuote();
      state.quotes.unshift(quote);
      touchQuote(quote);
      renderQuoteWorkspace();
      openQuoteModal(quote.id);
    });
    return;
  }
  const quoteListToggle = event.target.closest("[data-quote-list-toggle]");
  if (quoteListToggle) { const key = quoteListToggle.dataset.quoteListToggle; state.quoteListOpen[key] = !state.quoteListOpen[key]; renderQuoteWorkspace(); return; }
  const quoteOpen = event.target.closest("[data-quote-open]");
  if (quoteOpen) { openQuoteModal(quoteOpen.dataset.quoteOpen); return; }
  if (event.target.closest("[data-order-new]")) {
    requireIdentity(() => {
      const order = newOrder();
      state.orders.unshift(order);
      touchOrder(order);
      renderOrdersWorkspace();
      openOrderModal(order.id);
    });
    return;
  }
  const orderListToggle = event.target.closest("[data-order-list-toggle]");
  if (orderListToggle) { const key = orderListToggle.dataset.orderListToggle; state.orderListOpen[key] = !state.orderListOpen[key]; renderOrdersWorkspace(); return; }
  const orderOpen = event.target.closest("[data-order-open]");
  if (orderOpen) { openOrderModal(orderOpen.dataset.orderOpen); return; }
  if (event.target.closest("[data-build-new]")) {
    if (!canControlBuild()) { showToast("Only Production Control can create controlled Build Orders"); return; }
    requireIdentity(() => {
      const build = newBuild();
      state.builds.unshift(build);
      touchBuild(build);
      renderBuildsWorkspace();
      openBuildModal(build.id);
    });
    return;
  }
  const buildListToggle = event.target.closest("[data-build-list-toggle]");
  if (buildListToggle) { const key = buildListToggle.dataset.buildListToggle; state.buildListOpen[key] = !state.buildListOpen[key]; renderBuildsWorkspace(); return; }
  const buildOpen = event.target.closest("[data-build-open]");
  if (buildOpen) { openBuildModal(buildOpen.dataset.buildOpen); }
});

elements.homeButton.addEventListener("click", showHome);
elements.customerBackButton.addEventListener("click", showHome);
elements.overlayBackButton.addEventListener("click", closeWorkspace);
elements.overlayCloseButton.addEventListener("click", closeWorkspace);

elements.identityButton.addEventListener("click", () => openIdentityPicker());
elements.identityModalClose.addEventListener("click", closeIdentityPicker);
elements.identityModal.addEventListener("click", (event) => {
  if (event.target === elements.identityModal) closeIdentityPicker();
});
elements.identityModalBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-identity-select-rep]");
  if (button) selectIdentity(button.dataset.identitySelectRep);
});

elements.backorderModalBody.addEventListener("click", (event) => {
  if (!backorderResolveCallback) return;
  if (event.target.closest("[data-backorder-yes]")) backorderResolveCallback.onYes();
  else if (event.target.closest("[data-backorder-no]")) backorderResolveCallback.onNo();
});

elements.quoteModalClose.addEventListener("click", closeQuoteModal);
elements.quoteModal.addEventListener("click", (event) => {
  if (event.target === elements.quoteModal) closeQuoteModal();
});
elements.quoteModalBody.addEventListener("input", (event) => {
  const target = event.target;
  if (target.id === "quoteSearchInput") {
    state.quoteSearchTerm = target.value;
    clearTimeout(state.quoteSearchTimer);
    state.quoteSearchTimer = setTimeout(renderQuoteSearchResults, 90);
    return;
  }
  const quote = activeQuote();
  if (!quote) return;
  if (target.matches("[data-quote-meta-field]")) {
    const field = target.dataset.quoteMetaField;
    quote[field] = target.type === "number" ? Number(target.value) : target.value;
    touchQuote(quote);
    if (field === "customerId" || field === "number") elements.quoteModalTitle.textContent = `${quote.number} — ${quoteCompanyName(quote)}`;
    updateQuoteNumbers();
  }
  if (target.matches("[data-line-field]")) {
    const row = target.closest("[data-line-index]");
    const line = quote.lines[Number(row.dataset.lineIndex)];
    const field = target.dataset.lineField;
    line[field] = target.type === "checkbox" ? target.checked : field === "quantity" ? clampQuantity(target.value) : target.type === "number" ? Number(target.value) : target.value;
    if (field === "part") line.itemId = itemIdForPart(line.part);
    if (field === "quantity" && String(target.value) !== String(line[field])) target.value = line[field];
    touchQuote(quote);
    updateQuoteNumbers();
  }
});
elements.quoteModalBody.addEventListener("change", (event) => {
  const target = event.target;
  const quote = activeQuote();
  if (!quote) return;
  if (target.matches("[data-quote-meta-field]") && target.tagName === "SELECT") {
    quote[target.dataset.quoteMetaField] = target.value;
    touchQuote(quote);
    if (target.dataset.quoteMetaField === "customerId" || target.dataset.quoteMetaField === "status") elements.quoteModalTitle.textContent = `${quote.number} — ${quoteCompanyName(quote)}`;
    if (target.dataset.quoteMetaField === "status") renderQuoteWorkspace();
  }
  if (target.matches("[data-line-field]") && target.type === "number") {
    const row = target.closest("[data-line-index]");
    const line = quote.lines[Number(row.dataset.lineIndex)];
    if (target.dataset.lineField === "quantity") { line.quantity = clampQuantity(target.value); target.value = line.quantity; touchQuote(quote); updateQuoteNumbers(); }
  }
});
elements.quoteModalBody.addEventListener("click", (event) => {
  if (event.target.closest("[data-quote-add-line]")) { const quote = activeQuote(); if (!quote) return; quote.lines.push({ part: "", description: "", uom: "EA", quantity: 1, unitPrice: 0, discount: 0, taxable: false, source: "Manual" }); touchQuote(quote); renderQuoteModal(); return; }
  const remove = event.target.closest("[data-line-remove]");
  if (remove) { const quote = activeQuote(); if (!quote) return; quote.lines.splice(Number(remove.dataset.lineRemove), 1); touchQuote(quote); renderQuoteModal(); return; }
  const searchAdd = event.target.closest("[data-quote-search-add-part]");
  if (searchAdd) { addQuoteLine(searchAdd.dataset.quoteSearchAddPart, searchAdd.dataset.quoteSearchAddDescription, 0, "MDB demo", searchAdd.dataset.quoteSearchAddCategory); return; }
  if (event.target.closest("[data-quote-convert-to-order]")) {
    const quote = activeQuote();
    if (!quote) return;
    requireIdentity(() => convertQuoteToOrder(quote));
  }
});

elements.orderModalClose.addEventListener("click", closeOrderModal);
elements.orderModal.addEventListener("click", (event) => {
  if (event.target === elements.orderModal) closeOrderModal();
});
elements.orderModalBody.addEventListener("input", (event) => {
  const target = event.target;
  if (target.id === "orderSearchInput") {
    state.orderSearchTerm = target.value;
    clearTimeout(state.orderSearchTimer);
    state.orderSearchTimer = setTimeout(renderOrderSearchResults, 90);
    return;
  }
  const order = activeOrder();
  if (!order) return;
  if (target.matches("[data-order-meta-field]")) {
    const field = target.dataset.orderMetaField;
    if (order.status !== "Open" && field !== "notes") return;
    order[field] = target.type === "number" ? Number(target.value) : target.value;
    touchOrder(order);
    if (field === "customerId") elements.orderModalTitle.textContent = `${order.orderNumber || "New Order"} — ${orderCompanyName(order)}`;
    updateOrderNumbers();
  }
  if (target.matches("[data-line-field]") && target.dataset.lineField !== "quantity") {
    const row = target.closest("[data-line-index]");
    const line = order.lines[Number(row.dataset.lineIndex)];
    const field = target.dataset.lineField;
    if (field === "qtyToShip") {
      if (order.status !== "Released") return;
      line.qtyToShip = Math.min(Math.max(0, Math.floor(Number(target.value) || 0)), Number(line.reservedQty || 0), orderRemainingQty(line));
      target.value = line.qtyToShip;
    } else if (field === "qtyToInvoice") {
      if (order.status !== "Released") return;
      line.qtyToInvoice = Math.min(Math.max(0, Math.floor(Number(target.value) || 0)), Math.max(0, Number(line.shippedQty || 0) - Number(line.invoicedQty || 0)));
      target.value = line.qtyToInvoice;
    } else {
      if (order.status !== "Open") return;
      line[field] = target.type === "checkbox" ? target.checked : target.type === "number" ? Number(target.value) : target.value;
    }
    if (field === "part") line.itemId = itemIdForPart(line.part);
    if (field === "part") {
      const stock = getStock(line.part);
      line.backorderQty = Math.max(0, Number(line.quantity || 0) - Math.max(0, Number(stock.onHand) - Number(stock.allocated)));
    }
    touchOrder(order);
    updateOrderNumbers();
  }
  if (target.matches("[data-line-field]") && target.dataset.lineField === "quantity") {
    if (order.status !== "Open") return;
    const row = target.closest("[data-line-index]");
    const line = order.lines[Number(row.dataset.lineIndex)];
    line.quantity = clampQuantity(target.value);
    const stock = getStock(line.part);
    line.backorderQty = Math.max(0, line.quantity - Math.max(0, Number(stock.onHand) - Number(stock.allocated)));
    touchOrder(order);
    updateOrderNumbers();
  }
});
elements.orderModalBody.addEventListener("change", (event) => {
  const target = event.target;
  const order = activeOrder();
  if (!order) return;
  if (target.matches("[data-order-meta-field]") && target.tagName === "SELECT") {
    if (order.status !== "Open") return;
    order[target.dataset.orderMetaField] = target.value;
    touchOrder(order);
    if (target.dataset.orderMetaField === "customerId") renderOrderModal();
  }
  if (target.matches("[data-line-field]") && target.dataset.lineField === "quantity") {
    if (order.status !== "Open") return;
    const row = target.closest("[data-line-index]");
    const line = order.lines[Number(row.dataset.lineIndex)];
    line.quantity = clampQuantity(target.value);
    const stock = getStock(line.part);
    line.backorderQty = Math.max(0, line.quantity - Math.max(0, Number(stock.onHand) - Number(stock.allocated)));
    touchOrder(order);
    renderOrderModal();
  }
});
elements.orderModalBody.addEventListener("click", (event) => {
  const order = activeOrder();
  if (!order) return;
  if (event.target.closest("[data-order-release]")) { requireIdentity(() => releaseOrder(order)); return; }
  if (event.target.closest("[data-order-reopen]")) { requireIdentity(() => reopenOrder(order)); return; }
  if (event.target.closest("[data-order-reserve]")) {
    requireIdentity(() => {
      const reserved = reserveAvailableForOrder(order);
      touchOrder(order);
      renderOrderModal();
      showToast(reserved ? `${reserved} more unit${reserved === 1 ? "" : "s"} reserved` : "No additional inventory is available yet");
    });
    return;
  }
  if (event.target.closest("[data-order-post-shipment]")) { requireIdentity(() => postOrderShipment(order)); return; }
  if (event.target.closest("[data-order-post-invoice]")) { requireIdentity(() => postOrderInvoice(order)); return; }
  if (event.target.closest("[data-order-add-line]")) {
    if (order.status !== "Open") return;
    order.lines.push({ lineKey: newDocumentLineKey("order-line"), part: "", description: "", uom: "EA", quantity: 1, reservedQty: 0, qtyToShip: 0, shippedQty: 0, qtyToInvoice: 0, invoicedQty: 0, backorderQty: 0, unitPrice: 0, discount: 0, taxable: false, source: "Manual" });
    touchOrder(order);
    renderOrderModal();
    return;
  }
  const remove = event.target.closest("[data-line-remove]");
  if (remove) { if (order.status !== "Open") return; order.lines.splice(Number(remove.dataset.lineRemove), 1); touchOrder(order); renderOrderModal(); return; }
  const searchAdd = event.target.closest("[data-order-search-add-part]");
  if (searchAdd) { addOrderLine(searchAdd.dataset.orderSearchAddPart, searchAdd.dataset.orderSearchAddDescription, 0, "MDB demo", searchAdd.dataset.orderSearchAddCategory); return; }
  if (event.target.closest("[data-order-get-rate]")) { fetchShippingRate(); return; }
});

elements.buildModalClose.addEventListener("click", closeBuildModal);
elements.buildModal.addEventListener("click", (event) => {
  if (event.target === elements.buildModal) closeBuildModal();
});
elements.buildModalBody.addEventListener("input", (event) => {
  const target = event.target;
  if (target.id === "buildTargetSearchInput") {
    state.buildTargetSearchTerm = target.value;
    clearTimeout(state.buildTargetSearchTimer);
    state.buildTargetSearchTimer = setTimeout(renderBuildTargetSearchResults, 90);
    return;
  }
  if (target.id === "buildComponentSearchInput") {
    state.buildComponentSearchTerm = target.value;
    clearTimeout(state.buildComponentSearchTimer);
    state.buildComponentSearchTimer = setTimeout(renderBuildComponentSearchResults, 90);
    return;
  }
  const build = activeBuild();
  if (!build) return;
  if (target.matches("[data-build-meta-field]")) {
    const field = target.dataset.buildMetaField;
    if (field === "qtyToFinish") {
      if (build.status !== "Released" || !canPostBuild()) return;
      build.qtyToFinish = Math.min(Math.max(0, Math.floor(Number(target.value) || 0)), buildRemainingQty(build));
      target.value = build.qtyToFinish;
      touchBuild(build);
      return;
    }
    if (field === "notes") {
      if ((!canControlBuild() && !canPostBuild()) || build.status === "Finished") return;
      build.notes = target.value;
      touchBuild(build);
      return;
    }
    if (build.status !== "Open" || !canControlBuild()) return;
    build[field] = field === "quantity" ? clampQuantity(target.value) : field === "priority" ? Math.min(5, Math.max(1, Number(target.value) || 3)) : target.value;
    if (field === "committedDueDate") build.dueDate = build.committedDueDate;
    if (field === "quantity" && String(target.value) !== String(build.quantity)) target.value = build.quantity;
    touchBuild(build);
    return;
  }
  if (target.matches("[data-line-field]")) {
    const row = target.closest("[data-line-index]");
    const line = build.components[Number(row.dataset.lineIndex)];
    const field = target.dataset.lineField;
    if (field === "qtyToConsume") {
      if (build.status !== "Released" || !canPostBuild()) return;
      line.qtyToConsume = Math.min(Math.max(0, Math.floor(Number(target.value) || 0)), Number(line.qtyReserved), line.qtyRequired - line.qtyConsumed);
      target.value = line.qtyToConsume;
    } else {
      if (build.status !== "Open" || !canControlBuild()) return;
      line[field] = field === "qtyRequired" ? Math.max(0, Number(target.value) || 0) : target.value;
      if (field === "part") line.itemId = itemIdForPart(line.part);
    }
    touchBuild(build);
  }
});
elements.buildModalBody.addEventListener("change", (event) => {
  if (event.target.matches("select[data-build-meta-field]")) event.target.dispatchEvent(new Event("input", { bubbles: true }));
});
elements.buildModalBody.addEventListener("click", (event) => {
  const build = activeBuild();
  if (!build) return;
  if (event.target.closest("[data-build-release]")) { requireIdentity(() => releaseBuild(build)); return; }
  if (event.target.closest("[data-build-reopen]")) { requireIdentity(() => reopenBuild(build)); return; }
  if (event.target.closest("[data-build-post]")) { requireIdentity(() => postBuild(build)); return; }
  const remove = event.target.closest("[data-line-remove]");
  if (remove) { if (build.status !== "Open" || !canControlBuild()) return; build.components.splice(Number(remove.dataset.lineRemove), 1); touchBuild(build); renderBuildModal(); return; }
  const targetSelect = event.target.closest("[data-build-target-select-part]");
  if (targetSelect) { setBuildTarget(targetSelect.dataset.buildTargetSelectPart, targetSelect.dataset.buildTargetSelectDescription, targetSelect.dataset.buildTargetSelectUom); return; }
  const componentAdd = event.target.closest("[data-build-component-add-part]");
  if (componentAdd) { addBuildComponent(componentAdd.dataset.buildComponentAddPart, componentAdd.dataset.buildComponentAddDescription, componentAdd.dataset.buildComponentAddUom); return; }
});

elements.advancedSearchButton.addEventListener("click", openAdvancedSearch);
elements.advancedSearchClose.addEventListener("click", closeAdvancedSearch);
elements.advancedSearchModal.addEventListener("click", (event) => {
  if (event.target === elements.advancedSearchModal) closeAdvancedSearch();
});
$("#advSearchType").addEventListener("change", (event) => { state.advancedSearch.type = event.target.value; renderAdvancedSearchResults(); });
$("#advSearchField").addEventListener("change", (event) => { state.advancedSearch.field = event.target.value; renderAdvancedSearchResults(); });
$("#advSearchOperator").addEventListener("change", (event) => { state.advancedSearch.operator = event.target.value; renderAdvancedSearchResults(); });
$("#advSearchValue").addEventListener("input", (event) => {
  state.advancedSearch.value = event.target.value;
  clearTimeout(state.advSearchTimer);
  state.advSearchTimer = setTimeout(renderAdvancedSearchResults, 90);
});
$("#advSearchResults").addEventListener("click", (event) => {
  const button = event.target.closest("[data-adv-result-kind]");
  if (!button) return;
  closeAdvancedSearch();
  if (button.dataset.advResultKind === "item") openWorkspace("items", { query: button.dataset.advResultPart, part: button.dataset.advResultPart });
  else if (button.dataset.advResultKind === "rig") openWorkspace("bom", { part: button.dataset.advResultPart });
  else openWorkspace("tooling", { toolId: button.dataset.advResultToolId });
});

function navigateWorkspace(type) {
  if (type === "home") showHome();
  else if (type === "customer") openCustomerWorkspace();
  else openWorkspace(type);
}

$$('[data-open]').forEach((button) => button.addEventListener("click", () => navigateWorkspace(button.dataset.open)));

document.addEventListener("click", (event) => {
  const itemButton = event.target.closest("[data-open-item-part]");
  if (itemButton) { openWorkspace("items", { query: itemButton.dataset.openItemPart, part: itemButton.dataset.openItemPart }); return; }
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
    if (!elements.backorderModal.hidden) { backorderResolveCallback?.onNo(); }
    else if (!elements.identityModal.hidden) closeIdentityPicker();
    else if (!elements.orderModal.hidden) closeOrderModal();
    else if (!elements.quoteModal.hidden) closeQuoteModal();
    else if (!elements.advancedSearchModal.hidden) closeAdvancedSearch();
    else if (!elements.workspaceOverlay.hidden) closeWorkspace();
    else { hideSearchResults(elements.globalSearchResults, elements.globalSearchInput); hideSearchResults(elements.customerSearchResults, elements.customerSearchInput); }
  }
});

async function boot() {
  elements.globalSearchInput.placeholder = "Loading MDB data...";
  renderCustomerList();
  updateIdentityButton();
  try {
    await loadData();
    elements.globalSearchInput.disabled = false;
    updateIdentityButton();
  } catch (error) {
    console.error(error);
    elements.globalSearchInput.placeholder = "MDB data did not load";
    elements.globalSearchInput.disabled = true;
    showToast("The MDB data files did not load.");
  }
}

initializeFeedbackAccess();
boot();
