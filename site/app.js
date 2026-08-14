"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
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
  stock: {},
  tooling: { query: "", family: "All", builder: "", filters: {}, selectedId: "" },
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

const workspaceEntries = [
  ["Customer Profile", "Customer workspace", "customer", "customer client account company"],
  ["Tooling", "Full catalog and CTS search", "tooling", "tooling drive cap split spoon hsa auger hex cor moyno drill rod"],
  ["Quote Builder", "Editable demo quote", "quotes", "quote pricing estimate builder"],
  ["Inventory", "Editable GP-field demo", "inventory", "inventory stock available on hand allocated bin price"],
  ["Rig / BOM View", "B57 and B37X serial BOMs", "bom", "rig bom serial assembly parts bill material b57 b37x"],
].map(([label, detail, action, aliases]) => ({ id: `workspace-${action}`, label, detail, category: "Workspace", action, aliases }));

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

function newQuote() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return {
    number: `DEMO-${stamp}`, customerId: state.selectedCustomerId || "", customerPo: "", salesperson: "",
    terms: "Net 30", shipVia: "Best way", notes: "", freight: 0, taxRate: 0, lines: [], savedAt: "",
  };
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
  state.quote = safeLoad("mdb-demo-quote", null) || newQuote();
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
    style: row.model, sourceType: "Current WS004", status: "Model and pump serial required",
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
  state.searchIndex = [...workspaceEntries, ...customerEntries, ...rigEntries, ...rigPartEntries, ...toolEntries];
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
  else if (result.action === "tooling") openWorkspace("tooling", { query: result.query, toolId: result.toolId });
  else openWorkspace(result.action);
}

function showHome() {
  closeWorkspace();
  state.activeView = "home";
  elements.homeView.hidden = false;
  elements.customerView.hidden = true;
  elements.calibrationMenu.hidden = true;
  elements.globalSearchInput.focus();
}

function openCustomerWorkspace(customerId = "") {
  closeWorkspace();
  state.activeView = "customer";
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
        <section class="info-card"><header class="card-heading"><h2>Tooling DNA <small>Based on history</small></h2><button class="small-button" type="button" data-workspace="tooling">View Tooling</button></header>
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
  elements.overlayEyebrow.textContent = state.selectedCustomerId ? customers.find((item) => item.id === state.selectedCustomerId)?.name || "MDB" : "MDB";
  const titles = { tooling: "Tooling", quotes: "Quote Builder", inventory: "Inventory", bom: "Rig / BOM View" };
  elements.overlayTitle.textContent = titles[type] || "Workspace";
  if (type === "tooling") renderToolingWorkspace(options);
  if (type === "quotes") renderQuoteWorkspace();
  if (type === "inventory") renderInventoryWorkspace(options.query || "");
  if (type === "bom") renderBomWorkspace(options);
}

function closeWorkspace() {
  state.activeWorkspace = null;
  elements.workspaceOverlay.hidden = true;
  elements.overlayBody.innerHTML = "";
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

function renderToolingWorkspace(options = {}) {
  if (Object.hasOwn(options, "query")) state.tooling.query = options.query || "";
  if (options.toolId) state.tooling.selectedId = options.toolId;
  const detected = Object.hasOwn(options, "query") ? detectBuilder(state.tooling.query) : "";
  if (detected) { state.tooling.builder = detected; state.tooling.filters = {}; }
  elements.overlayBody.innerHTML = `
    <div class="workbench tooling-workbench">
      <div class="workbench-bar workbench-bar--tooling">
        <label class="inline-search"><span class="search-mark" aria-hidden="true"></span><input id="toolSearch" type="search" value="${escapeHTML(state.tooling.query)}" placeholder="Search all tooling and part numbers..."></label>
        <select id="toolFamilyFilter" class="compact-select" aria-label="Tooling family">${toolingFamilies().map((family) => `<option ${family === state.tooling.family ? "selected" : ""}>${escapeHTML(family)}</option>`).join("")}</select>
        <span class="record-count">${state.data.tooling.meta.itemCount.toLocaleString()} indexed records</span>
      </div>
      <nav class="builder-tabs" aria-label="Controlled tooling paths">
        ${[["driveCap", "Drive Cap"], ["hsaAuger", "HSA Auger"], ["splitSpoon", "Split Spoon"], ["hexCor", "HEX-COR / STD"], ["moyno", "Moyno"]].map(([id, label]) => `<button type="button" class="${state.tooling.builder === id ? "is-active" : ""}" data-tool-builder="${id}">${label}</button>`).join("")}
      </nav>
      <div id="toolBuilderHost">${renderToolingBuilder()}</div>
      <div class="tooling-layout">
        <section class="tool-results-panel"><div id="toolResultSummary" class="panel-strip"></div><div id="toolResults" class="tool-results"></div></section>
        <aside id="toolDetail" class="tool-detail"></aside>
      </div>
    </div>`;
  renderToolingResults();
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
  const value = state.tooling.filters[field] || "";
  return `<label class="field"><span>${label}</span><select data-builder-field="${field}">${optionHtml(uniqueValues(records, field, state.tooling.filters), value, placeholder)}</select></label>`;
}

function filterRecords(records, ignored = []) {
  return records.filter((record) => Object.entries(state.tooling.filters).every(([key, value]) => !value || ignored.includes(key) || String(record[key]) === String(value)));
}

function renderToolingBuilder() {
  const builder = state.tooling.builder;
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
    const shoe = state.tooling.filters.shoe || "";
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
    const matches = filterRecords(records, ["serial"]);
    return `<section class="compatibility-builder"><header><strong>Moyno Pump Parts</strong><span>Pump model + pump serial required</span></header>
      <div class="builder-fields">${builderField("Pump model", "model", records)}<label class="field"><span>Pump serial</span><input data-builder-field="serial" value="${escapeHTML(state.tooling.filters.serial || "")}" placeholder="Enter nameplate serial"></label></div>
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
  const serial = state.tooling.filters.serial || "";
  if (!state.tooling.filters.model) return '<div class="terminal-state"><strong>Select the pump model</strong><span>3L4, 3L6, and 3L8 parts stay in separate columns.</span></div>';
  const rows = records.map((row) => {
    const part = firstPartNumber(row.part);
    const stock = part ? getStock(part) : { unitPrice: 0 };
    const disabled = !serial || !part || row.part === "N/A";
    return `<tr><td>${escapeHTML(row.model)}</td><td>${escapeHTML(row.description)}</td><td><strong>${escapeHTML(row.part)}</strong></td><td><button type="button" class="table-button" data-add-part="${escapeHTML(part)}" data-description="${escapeHTML(`Moyno ${row.model} ${row.description} - pump serial ${serial}`)}" data-price="${stock.unitPrice}" data-moyno-model="${escapeHTML(row.model)}" data-moyno-component="${escapeHTML(row.description)}" data-moyno-quotable="${row.part !== "N/A" && Boolean(part)}" ${disabled ? "disabled" : ""}>Add</button></td></tr>`;
  });
  return `<div class="terminal-state terminal-state--warn" data-moyno-serial-warning ${serial ? "hidden" : ""}><strong>Pump serial required</strong><span>Enter the nameplate serial before adding a line.</span></div>${compactResultTable(["Model", "Component", "Part", "Quote"], rows)}`;
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
  const query = state.tooling.query;
  let items = state.toolItems.filter((item) => state.tooling.family === "All" || item.family === state.tooling.family);
  if (query) {
    items = items.map((item) => ({ ...item, score: matchScore(query, `${item.part} ${item.rawPart} ${item.description} ${item.family} ${item.subfamily} ${item.aliases}`) }))
      .filter((item) => item.score >= 0.52).sort((a, b) => b.score - a.score);
  } else {
    items = items.sort((a, b) => Number(Boolean(b.part)) - Number(Boolean(a.part)) || a.description.localeCompare(b.description));
  }
  const visible = items.slice(0, 120);
  $("#toolResultSummary").innerHTML = `<strong>${items.length.toLocaleString()} matches</strong><span>${items.length > visible.length ? `Showing first ${visible.length}` : "Full result set"}</span>`;
  $("#toolResults").innerHTML = visible.length ? visible.map((item) => `
    <button type="button" class="tool-result ${item.id === state.tooling.selectedId ? "is-selected" : ""}" data-tool-id="${escapeHTML(item.id)}">
      <span><strong>${escapeHTML(item.part || "No active PN")}</strong><small>${escapeHTML(item.description)}</small></span>
      <span><em>${escapeHTML(item.family || "Tooling")}</em><small class="status-label ${statusClass(item.status)}">${escapeHTML(item.status)}</small></span>
    </button>`).join("") : '<div class="search-empty">No tooling record matches this search.</div>';
  const selected = state.toolItems.find((item) => item.id === state.tooling.selectedId) || visible[0];
  if (selected) { state.tooling.selectedId = selected.id; renderToolDetail(selected); }
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
  elements.overlayBody.innerHTML = `<div class="quote-layout">
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
      <button class="primary-button" type="button" data-quote-save>Save Dummy Quote</button>
      <button class="secondary-button quote-secondary" type="button" data-quote-new>Start New Quote</button>
      <p class="quote-state">${state.quote.savedAt ? `Saved locally ${escapeHTML(state.quote.savedAt)}` : "Not sent to GP"}</p>
    </aside></div>`;
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

function handleOverlayInput(event) {
  const target = event.target;
  if (target.id === "toolSearch") {
    state.tooling.query = target.value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      const detected = detectBuilder(state.tooling.query);
      if (detected && detected !== state.tooling.builder) { state.tooling.builder = detected; state.tooling.filters = {}; $("#toolBuilderHost").innerHTML = renderToolingBuilder(); }
      renderToolingResults();
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
    state.tooling.filters[target.dataset.builderField] = target.type === "checkbox" ? target.checked : target.value;
    if (target.dataset.builderField === "serial" && state.tooling.builder === "moyno") {
      const serial = target.value.trim();
      $("[data-moyno-serial-warning]")?.toggleAttribute("hidden", Boolean(serial));
      document.querySelectorAll("[data-moyno-model]").forEach((button) => {
        button.disabled = !serial || button.dataset.moynoQuotable !== "true";
        button.dataset.description = `Moyno ${button.dataset.moynoModel} ${button.dataset.moynoComponent} - pump serial ${serial}`;
      });
    } else if (target.tagName === "SELECT" || event.type === "change") {
      $("#toolBuilderHost").innerHTML = renderToolingBuilder();
    }
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
elements.overlayBody.addEventListener("change", (event) => {
  handleOverlayInput(event);
  const target = event.target;
  if (target.id === "toolFamilyFilter") { state.tooling.family = target.value; renderToolingResults(); }
  if (target.id === "bomRigSelect") { state.bom.serial = target.value; state.bom.section = ""; state.bom.selectedPart = ""; renderBomWorkspace(); }
});

elements.overlayBody.addEventListener("click", (event) => {
  const builder = event.target.closest("[data-tool-builder]");
  if (builder) { state.tooling.builder = builder.dataset.toolBuilder; state.tooling.filters = {}; renderToolingWorkspace(); return; }
  const result = event.target.closest("[data-tool-id]");
  if (result) { state.tooling.selectedId = result.dataset.toolId; $$(".tool-result").forEach((button) => button.classList.toggle("is-selected", button === result)); renderToolDetail(state.toolItems.find((item) => item.id === state.tooling.selectedId)); return; }
  const add = event.target.closest("[data-add-part]");
  if (add && !add.disabled) { addQuoteLine(add.dataset.addPart, add.dataset.description, Number(getStock(add.dataset.addPart).unitPrice)); return; }
  const section = event.target.closest("[data-bom-section]");
  if (section) { state.bom.section = section.dataset.bomSection; state.bom.query = ""; state.bom.selectedPart = ""; renderBomWorkspace(); return; }
  const part = event.target.closest("[data-bom-part]");
  if (part) { event.preventDefault(); renderBomDetail(part.dataset.bomPart); return; }
  if (event.target.closest("[data-quote-add-line]")) { addQuoteLine("", "", 0); renderQuoteWorkspace(); return; }
  const remove = event.target.closest("[data-line-remove]");
  if (remove) { state.quote.lines.splice(Number(remove.dataset.lineRemove), 1); safeSave("mdb-demo-quote", state.quote); renderQuoteWorkspace(); return; }
  if (event.target.closest("[data-quote-save]")) { state.quote.savedAt = new Date().toLocaleString(); safeSave("mdb-demo-quote", state.quote); renderQuoteWorkspace(); showToast("Dummy quote saved locally"); return; }
  if (event.target.closest("[data-quote-new]")) { state.quote = newQuote(); safeSave("mdb-demo-quote", state.quote); renderQuoteWorkspace(); showToast("New dummy quote started"); }
});

elements.homeButton.addEventListener("click", showHome);
elements.customerBackButton.addEventListener("click", showHome);
elements.overlayBackButton.addEventListener("click", closeWorkspace);
elements.overlayCloseButton.addEventListener("click", closeWorkspace);

$$('[data-open]').forEach((button) => button.addEventListener("click", () => button.dataset.open === "customer" ? openCustomerWorkspace() : openWorkspace(button.dataset.open)));

document.addEventListener("click", (event) => {
  const workspaceButton = event.target.closest("[data-workspace]");
  if (workspaceButton) openWorkspace(workspaceButton.dataset.workspace);
  const bomButton = event.target.closest("[data-open-bom]");
  if (bomButton) openWorkspace("bom", { serial: bomButton.dataset.openBom });
  const customerButton = event.target.closest("[data-customer-id]");
  if (customerButton) selectCustomer(customerButton.dataset.customerId);
  if (event.target.closest("[data-schedule-calibration]")) {
    addQuoteLine("CAL-SERVICE", "Automatic hammer calibration service", 0, "Calibration workspace");
    elements.calibrationMenu.hidden = true;
    openWorkspace("quotes");
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
