"use strict";

const homeView = document.querySelector("#homeView");
const customerView = document.querySelector("#customerView");
const homeButton = document.querySelector("#homeButton");
const customerBackButton = document.querySelector("#customerBackButton");
const globalSearchForm = document.querySelector("#globalSearchForm");
const globalSearchInput = document.querySelector("#globalSearchInput");
const globalSearchResults = document.querySelector("#globalSearchResults");
const customerSearchForm = document.querySelector("#customerSearchForm");
const customerSearchInput = document.querySelector("#customerSearchInput");
const customerSearchResults = document.querySelector("#customerSearchResults");
const directoryFilter = document.querySelector("#directoryFilter");
const customerList = document.querySelector("#customerList");
const customerProfile = document.querySelector("#customerProfile");
const calibrationButton = document.querySelector("#calibrationButton");
const calibrationMenu = document.querySelector("#calibrationMenu");
const workspaceOverlay = document.querySelector("#workspaceOverlay");
const overlayBackButton = document.querySelector("#overlayBackButton");
const overlayCloseButton = document.querySelector("#overlayCloseButton");
const overlayEyebrow = document.querySelector("#overlayEyebrow");
const overlayTitle = document.querySelector("#overlayTitle");
const overlayBody = document.querySelector("#overlayBody");
const toast = document.querySelector("#toast");

const state = {
  selectedCustomerId: null,
  activeView: "home",
  activeWorkspace: null,
  globalResults: [],
  customerResults: [],
  toastTimer: null,
  quote: null,
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

const atlasRigs = [
  { model: "Mobile B57", serial: "B57-12145", year: 2021, status: "Active" },
  { model: "Mobile B37X", serial: "B37X-11876", year: 2020, status: "Active" },
  { model: "Mobile B53", serial: "B53-11001", year: 2019, status: "Active" },
];

const customerNames = [
  "Advanced Foundation Testing",
  "Allied Engineering Group",
  "Alpha Testing Services",
  "American Drilling Corp",
  "Apex Geotech Solutions",
  "Atlas Geotechnical LLC",
  "Baker Environmental",
  "Blue Ridge Drilling",
  "Cascade Geotechnical",
  "CME Associates",
  "Delta Foundation Services",
  "EarthTech Drilling",
  "GeoDynamics Inc.",
  "GeoStrata Services",
  "Ground Solutions Group",
  "Horizon Engineering",
  "Metro Soil Services",
  "Premier Drilling Co.",
  "ProGeo Testing",
  "Summit Geotech",
  "TerraFirm Solutions",
  "United Soil Exploration",
  "Vertex Geoscience",
];

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildCustomer(name, index) {
  const id = slugify(name);
  const shortName = name.split(/\s+/)[0].toLowerCase();
  const hasRig = index % 4 !== 0;
  const activeRigs = hasRig
    ? [
        {
          model: index % 2 ? "Mobile B57" : "Mobile B37X",
          serial: `${index % 2 ? "B57" : "B37X"}-${String(10420 + index * 37)}`,
          year: 2016 + (index % 9),
          status: index % 7 === 0 ? "Inactive" : "Active",
        },
      ]
    : [];

  return {
    id,
    name,
    contact: `Demo Contact ${index + 1}`,
    title: index % 3 === 0 ? "Operations Manager" : "Drilling Manager",
    email: `contact@${shortName}.example.invalid`,
    phone: `(317) 555-${String(1100 + index).padStart(4, "0")}`,
    address: `${120 + index * 9} Field Service Rd, Indianapolis, IN 46200`,
    website: `${shortName}.example.invalid`,
    customerSince: String(2010 + (index % 13)),
    creditTerms: index % 5 === 0 ? "Prepay" : "Net 30",
    status: index % 11 === 0 ? "Inactive" : "Active",
    rigs: activeRigs,
    purchases: purchaseTemplates.map((purchase, purchaseIndex) => ({
      date: purchase[0],
      type: purchase[1],
      description: purchase[2],
      quantity: Math.max(1, purchase[3] - (index % 4) * (purchaseIndex + 1)),
      amount: purchase[4] + index * 17,
    })),
    tooling: {
      categories: [
        ["Casing", 43],
        ["Sampling", 28],
        ["SPT", 14],
        ["Drill Rods", 9],
        ["Other", 6],
      ],
      mostUsed: ["3.25 in AW casing", "SPT auto hammer", "AWJ casing shoe", "3.25 in AW rod", "Split spoon sampler"],
    },
    interactions: interactionTemplates.map((item, interactionIndex) => ({
      type: item[0],
      date: item[1],
      text: item[2],
      owner: interactionIndex % 2 ? "J. Tech" : item[3],
    })),
    calibrations: [
      { date: "2026-04-18", service: "Automatic hammer", result: "Complete" },
      { date: "2025-04-22", service: "Automatic hammer", result: "Complete" },
      { date: "2024-05-03", service: "SPT system", result: "Complete" },
    ],
  };
}

const customers = customerNames.map(buildCustomer);
const atlasCustomer = customers.find((customer) => customer.id === "atlas-geotechnical-llc");

Object.assign(atlasCustomer, {
  contact: "Demo Operations Contact",
  title: "Operations Manager",
  email: "operations@atlas.example.invalid",
  phone: "(317) 555-0142",
  address: "5820 W 73rd St, Indianapolis, IN 46278",
  website: "atlas.example.invalid",
  customerSince: "2019",
  creditTerms: "Net 30",
  status: "Active",
  rigs: atlasRigs,
});

const toolingItems = [
  { part: "DEMO-DC-325", description: "3.25 in drive cap candidate", family: "Drive Cap", status: "CTS check required" },
  { part: "DEMO-SP-200", description: "2 in split spoon assembly", family: "Split Spoon", status: "Shoe style required" },
  { part: "DEMO-HSA-425", description: "4.25 in hollow stem auger", family: "HSA", status: "Connection required" },
  { part: "DEMO-AWJ-SHOE", description: "AWJ casing shoe", family: "Casing", status: "Candidate" },
  { part: "DEMO-M3L6-ROT", description: "3L6 pump rotor candidate", family: "Moyno", status: "Model check required" },
  { part: "DEMO-HEX-STD", description: "STD Duty center component", family: "HEX-COR", status: "Family check required" },
  { part: "DEMO-SPT-SHOE", description: "Split spoon shoe candidate", family: "Sampling", status: "Style required" },
];

const inventoryItems = [
  { part: "DEMO-AW-ROD", description: "3.25 in AW rod", onHand: 84, allocated: 20, bin: "T-14" },
  { part: "DEMO-AW-SHOE", description: "AWJ casing shoe", onHand: 22, allocated: 4, bin: "T-08" },
  { part: "DEMO-SPT-SHOE", description: "Split spoon shoe", onHand: 31, allocated: 8, bin: "S-03" },
  { part: "DEMO-HOSE-01", description: "Hydraulic hose assembly", onHand: 6, allocated: 2, bin: "P-19" },
  { part: "DEMO-SEAL-57", description: "Rotary seal kit", onHand: 11, allocated: 1, bin: "P-07" },
];

const workspaceEntries = [
  { id: "workspace-customer", label: "Customer Profile", detail: "Customer workspace", category: "Workspace", action: "customer", aliases: "customer client account profile company" },
  { id: "workspace-tooling", label: "Tooling", detail: "Tooling search", category: "Workspace", action: "tooling", aliases: "tooling drive cap split spoon auger casing moyno drill rod sampler" },
  { id: "workspace-quotes", label: "Quote Builder", detail: "Quotes", category: "Workspace", action: "quotes", aliases: "quote quotes pricing estimate builder" },
  { id: "workspace-inventory", label: "Inventory", detail: "Inventory lookup", category: "Workspace", action: "inventory", aliases: "inventory stock available availability on hand bin" },
  { id: "workspace-bom", label: "Rig / BOM View", detail: "Serial and BOM", category: "Workspace", action: "bom", aliases: "rig rigs bom serial assembly parts bill material" },
];

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
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
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      );
    }
    previous = current;
  }

  return previous[b.length];
}

function tokenScore(query, target) {
  const queryTokens = normalize(query).split(" ").filter(Boolean);
  const targetTokens = normalize(target).split(" ").filter(Boolean);
  if (!queryTokens.length || !targetTokens.length) return 0;

  const scores = queryTokens.map((queryToken) => {
    return Math.max(
      ...targetTokens.map((targetToken) => {
        if (targetToken.startsWith(queryToken) || queryToken.startsWith(targetToken)) return 0.94;
        const distance = levenshtein(queryToken, targetToken);
        return 1 - distance / Math.max(queryToken.length, targetToken.length, 1);
      }),
    );
  });

  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

function fuzzyScore(query, target) {
  const cleanQuery = normalize(query);
  const cleanTarget = normalize(target);
  if (!cleanQuery || !cleanTarget) return 0;
  if (cleanQuery === cleanTarget) return 1;
  if (cleanTarget.startsWith(cleanQuery)) return 0.97;
  if (cleanTarget.includes(cleanQuery)) return 0.93;

  const fullDistance = levenshtein(cleanQuery, cleanTarget);
  const fullScore = 1 - fullDistance / Math.max(cleanQuery.length, cleanTarget.length, 1);
  return Math.max(fullScore, tokenScore(cleanQuery, cleanTarget));
}

function allRigEntries() {
  return customers.flatMap((customer) =>
    customer.rigs.map((rig) => ({
      id: `rig-${rig.serial}`,
      label: rig.serial,
      detail: `${rig.model} - ${customer.name}`,
      category: "Rig",
      action: "bom",
      rig,
      customerId: customer.id,
      aliases: `${rig.serial} ${rig.model} ${customer.name} rig bom serial`,
    })),
  );
}

function allCustomerEntries() {
  return customers.map((customer) => ({
    id: `customer-${customer.id}`,
    label: customer.name,
    detail: customer.contact,
    category: "Customer",
    action: "customer",
    customerId: customer.id,
    aliases: `${customer.name} ${customer.contact} ${customer.phone}`,
  }));
}

function allToolingEntries() {
  return toolingItems.map((item) => ({
    id: `tool-${item.part}`,
    label: item.description,
    detail: `${item.part} - ${item.family}`,
    category: "Tooling",
    action: "tooling",
    query: item.description,
    aliases: `${item.part} ${item.description} ${item.family}`,
  }));
}

function findMatches(query, entries, limit = 7) {
  return entries
    .map((entry) => ({
      ...entry,
      score: fuzzyScore(query, `${entry.label} ${entry.detail || ""} ${entry.aliases || ""}`),
    }))
    .filter((entry) => entry.score >= 0.47)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function showHome() {
  closeWorkspace();
  state.activeView = "home";
  homeView.hidden = false;
  customerView.hidden = true;
  calibrationMenu.hidden = true;
  calibrationButton.setAttribute("aria-expanded", "false");
  globalSearchInput.focus();
}

function openCustomerWorkspace(customerId = null) {
  closeWorkspace();
  state.activeView = "customer";
  homeView.hidden = true;
  customerView.hidden = false;
  renderCustomerList(directoryFilter.value);
  if (customerId) selectCustomer(customerId);
  window.scrollTo({ top: 0, behavior: "auto" });
}

function selectCustomer(customerId) {
  const customer = customers.find((item) => item.id === customerId);
  if (!customer) return;
  state.selectedCustomerId = customer.id;
  renderCustomerList(directoryFilter.value);
  renderCustomerProfile(customer);
  customerSearchInput.value = customer.name;
  hideSearchResults(customerSearchResults, customerSearchInput);
}

function renderCustomerList(filter = "") {
  const matches = filter
    ? findMatches(filter, allCustomerEntries(), customers.length).map((entry) => entry.customerId)
    : customers.map((customer) => customer.id);

  customerList.replaceChildren();
  customers
    .filter((customer) => matches.includes(customer.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((customer) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = customer.name;
      button.className = customer.id === state.selectedCustomerId ? "is-selected" : "";
      button.setAttribute("role", "listitem");
      button.addEventListener("click", () => selectCustomer(customer.id));
      customerList.append(button);
    });
}

function renderCustomerProfile(customer) {
  const activeRigs = customer.rigs.filter((rig) => rig.status === "Active").length;
  const inactiveRigs = customer.rigs.length - activeRigs;
  const rigYears = customer.rigs.map((rig) => rig.year);
  const clientYear = rigYears.length ? Math.min(...rigYears) : customer.customerSince;

  const purchaseRows = customer.purchases
    .map(
      (purchase) => `
        <tr>
          <td>${escapeHTML(formatDate(purchase.date))}</td>
          <td>${escapeHTML(purchase.type)}</td>
          <td>${escapeHTML(purchase.description)}</td>
          <td class="is-number">${escapeHTML(purchase.quantity)}</td>
          <td class="is-number">${escapeHTML(formatCurrency(purchase.amount))}</td>
        </tr>`,
    )
    .join("");

  const rigRows = customer.rigs.length
    ? customer.rigs
        .map(
          (rig) => `
            <tr>
              <td>${escapeHTML(rig.model)}</td>
              <td><button class="table-button bom-link" type="button" data-serial="${escapeHTML(rig.serial)}">${escapeHTML(rig.serial)}</button></td>
              <td>${escapeHTML(rig.year)}</td>
              <td><span class="status-pill${rig.status === "Active" ? "" : " status-pill--inactive"}">${escapeHTML(rig.status)}</span></td>
              <td><button class="table-button bom-link" type="button" data-serial="${escapeHTML(rig.serial)}">View BOM</button></td>
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="5">No confirmed Mobile Drill rigs.</td></tr>`;

  const legendColors = ["#0758a6", "#31a9e0", "#d71920", "#7aa7c5", "#cbd9e2"];
  const dnaLegend = customer.tooling.categories
    .map(
      ([label, percent], index) => `
        <li><span class="legend-dot" style="--dot:${legendColors[index]}"></span>${escapeHTML(label)} (${percent}%)</li>`,
    )
    .join("");

  const toolingRank = customer.tooling.mostUsed.map((item) => `<li>${escapeHTML(item)}</li>`).join("");

  const interactions = customer.interactions
    .map(
      (interaction) => `
        <li class="interaction-item">
          <span class="interaction-icon" aria-hidden="true">${escapeHTML(interaction.type.slice(0, 1))}</span>
          <div>
            <strong>${escapeHTML(interaction.type)} <small>${escapeHTML(formatDate(interaction.date))}</small></strong>
            <span>${escapeHTML(interaction.text)}</span>
          </div>
          <small>${escapeHTML(interaction.owner)}</small>
        </li>`,
    )
    .join("");

  customerProfile.innerHTML = `
    <div class="profile-grid">
      <div class="profile-column">
        <article class="info-card">
          <header class="card-heading">
            <h2>Customer Information</h2>
            <button class="small-button" type="button" data-edit-customer>Edit</button>
          </header>
          <div class="card-body">
            <dl class="customer-facts">
              <dt>Company Name</dt><dd>${escapeHTML(customer.name)}</dd>
              <dt>Primary Contact</dt><dd>${escapeHTML(customer.contact)}</dd>
              <dt>Title</dt><dd>${escapeHTML(customer.title)}</dd>
              <dt>Email</dt><dd><a href="mailto:${escapeHTML(customer.email)}">${escapeHTML(customer.email)}</a></dd>
              <dt>Phone</dt><dd>${escapeHTML(customer.phone)}</dd>
              <dt>Address</dt><dd>${escapeHTML(customer.address)}</dd>
              <dt>Website</dt><dd>${escapeHTML(customer.website)}</dd>
              <dt>Customer Since</dt><dd>${escapeHTML(customer.customerSince)}</dd>
              <dt>Credit Terms</dt><dd>${escapeHTML(customer.creditTerms)}</dd>
              <dt>Customer Status</dt><dd><span class="status-pill${customer.status === "Active" ? "" : " status-pill--inactive"}">${escapeHTML(customer.status)}</span></dd>
            </dl>
          </div>
        </article>

        <article class="info-card">
          <header class="card-heading">
            <h2>Purchase History</h2>
            <small>${customer.purchases.length} records</small>
          </header>
          <div class="table-scroll purchase-table-wrap">
            <table class="data-table">
              <thead><tr><th>Date</th><th>Type</th><th>Item Description</th><th class="is-number">Qty</th><th class="is-number">Amount</th></tr></thead>
              <tbody>${purchaseRows}</tbody>
            </table>
          </div>
        </article>
      </div>

      <div class="profile-column">
        <article class="info-card">
          <header class="card-heading">
            <h2>Rig &amp; Fleet <small>(Confirmed Rigs)</small></h2>
            <button class="small-button" type="button" data-open-all-rigs>View All Rigs</button>
          </header>
          <div class="table-scroll">
            <table class="data-table">
              <thead><tr><th>Rig Model</th><th>Serial Number</th><th>Year</th><th>Status</th><th>BOM</th></tr></thead>
              <tbody>${rigRows}</tbody>
            </table>
          </div>
          <div class="fleet-summary">
            <div class="fleet-stat"><span>Total Rigs</span><strong>${customer.rigs.length}</strong></div>
            <div class="fleet-stat"><span>Active</span><strong>${activeRigs}</strong></div>
            <div class="fleet-stat"><span>Inactive</span><strong>${inactiveRigs}</strong></div>
            <div class="fleet-stat"><span>Client Year</span><strong>${escapeHTML(clientYear)}</strong></div>
          </div>
        </article>

        <article class="info-card">
…1243 tokens truncated…("click", () => {
    calibrationMenu.hidden = true;
    calibrationButton.setAttribute("aria-expanded", "false");
    openWorkspace("quotes", { customerId: customer.id, calibration: true });
  });
}

function closeWorkspace() {
  workspaceOverlay.hidden = true;
  state.activeWorkspace = null;
  overlayBody.replaceChildren();
}

function openWorkspace(type, options = {}) {
  const titles = {
    tooling: "Tooling",
    quotes: "Quote Builder",
    inventory: "Inventory",
    bom: "Rig / BOM View",
  };
  if (!titles[type]) return;

  state.activeWorkspace = type;
  overlayEyebrow.textContent = "MDB";
  overlayTitle.textContent = titles[type];
  workspaceOverlay.hidden = false;
  calibrationMenu.hidden = true;
  calibrationButton.setAttribute("aria-expanded", "false");

  if (type === "tooling") renderToolingWorkspace(options.query || "");
  if (type === "quotes") renderQuoteWorkspace(options);
  if (type === "inventory") renderInventoryWorkspace(options.query || "");
  if (type === "bom") renderBomWorkspace(options.serial || "");
  window.scrollTo({ top: 0, behavior: "auto" });
}

function toolingMatches(query) {
  if (!query.trim()) return toolingItems;
  return findMatches(query, allToolingEntries(), toolingItems.length)
    .map((entry) => toolingItems.find((item) => `tool-${item.part}` === entry.id))
    .filter(Boolean);
}

function renderToolingTable(items) {
  const tableBody = document.querySelector("#toolingTableBody");
  if (!tableBody) return;
  tableBody.innerHTML = items.length
    ? items
        .map(
          (item) => `
            <tr>
              <td>${escapeHTML(item.part)}</td>
              <td>${escapeHTML(item.description)}</td>
              <td>${escapeHTML(item.family)}</td>
              <td>${escapeHTML(item.status)}</td>
              <td><button class="table-button" type="button" data-tool-detail="${escapeHTML(item.part)}">View</button></td>
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="5">No close tooling match.</td></tr>`;

  tableBody.querySelectorAll("[data-tool-detail]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = toolingItems.find((tool) => tool.part === button.dataset.toolDetail);
      if (item) showToast(`${item.description}: ${item.status}`);
    });
  });
}

function renderToolingWorkspace(initialQuery) {
  overlayBody.innerHTML = `
    <div class="workbench">
      <div class="workbench-bar">
        <label class="inline-search">
          <span class="search-mark" aria-hidden="true"></span>
          <input id="toolingSearch" type="search" autocomplete="off" spellcheck="false" placeholder="Search tooling, family, description or part number..." value="${escapeHTML(initialQuery)}">
        </label>
      </div>
      <article class="info-card">
        <header class="card-heading"><h2>Tooling Results</h2><small>Demo records</small></header>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Part Number</th><th>Description</th><th>Family</th><th>Status</th><th></th></tr></thead>
            <tbody id="toolingTableBody"></tbody>
          </table>
        </div>
      </article>
    </div>`;

  const toolingSearch = document.querySelector("#toolingSearch");
  const update = () => renderToolingTable(toolingMatches(toolingSearch.value));
  toolingSearch.addEventListener("input", update);
  update();
  toolingSearch.focus();
}

function renderInventoryTable(query = "") {
  const entries = inventoryItems.map((item) => ({
    ...item,
    id: item.part,
    label: item.description,
    detail: item.part,
    aliases: `${item.part} ${item.description} ${item.bin}`,
  }));
  const results = query.trim()
    ? findMatches(query, entries, entries.length).map((result) => inventoryItems.find((item) => item.part === result.id)).filter(Boolean)
    : inventoryItems;
  const body = document.querySelector("#inventoryTableBody");
  if (!body) return;
  body.innerHTML = results.length
    ? results
        .map(
          (item) => `
            <tr>
              <td>${escapeHTML(item.part)}</td>
              <td>${escapeHTML(item.description)}</td>
              <td class="is-number">${item.onHand}</td>
              <td class="is-number">${item.allocated}</td>
              <td class="is-number"><strong>${item.onHand - item.allocated}</strong></td>
              <td>${escapeHTML(item.bin)}</td>
            </tr>`,
        )
        .join("")
    : `<tr><td colspan="6">No close inventory match.</td></tr>`;
}

function renderInventoryWorkspace(initialQuery) {
  overlayBody.innerHTML = `
    <div class="workbench">
      <div class="workbench-bar">
        <label class="inline-search">
          <span class="search-mark" aria-hidden="true"></span>
          <input id="inventorySearch" type="search" autocomplete="off" spellcheck="false" placeholder="Search inventory..." value="${escapeHTML(initialQuery)}">
        </label>
      </div>
      <article class="info-card">
        <header class="card-heading"><h2>Inventory</h2><small>Demo availability</small></header>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Part Number</th><th>Description</th><th class="is-number">On Hand</th><th class="is-number">Allocated</th><th class="is-number">Available</th><th>Bin</th></tr></thead>
            <tbody id="inventoryTableBody"></tbody>
          </table>
        </div>
      </article>
    </div>`;
  const inventorySearch = document.querySelector("#inventorySearch");
  inventorySearch.addEventListener("input", () => renderInventoryTable(inventorySearch.value));
  renderInventoryTable(initialQuery);
  inventorySearch.focus();
}

function quoteCustomerOptions(selectedId) {
  return `<option value="">Select customer...</option>${customers
    .map(
      (customer) => `<option value="${escapeHTML(customer.id)}"${customer.id === selectedId ? " selected" : ""}>${escapeHTML(customer.name)}</option>`,
    )
    .join("")}`;
}

function freshQuote(options = {}) {
  const lines = options.calibration
    ? [{ part: "CAL-SPT", description: "SPT calibration service", quantity: 1, price: 1450 }]
    : [{ part: "", description: "", quantity: 1, price: 0 }];
  return {
    customerId: options.customerId || state.selectedCustomerId || "",
    contact: "",
    reference: "",
    terms: "Net 30",
    lines,
  };
}

function renderQuoteWorkspace(options = {}) {
  state.quote = freshQuote(options);
  overlayBody.innerHTML = `
    <div class="quote-layout">
      <section class="quote-form">
        <div class="quote-fields">
          <label class="field"><span>Customer</span><select id="quoteCustomer">${quoteCustomerOptions(state.quote.customerId)}</select></label>
          <label class="field"><span>Contact</span><input id="quoteContact" type="text" placeholder="Contact"></label>
          <label class="field"><span>Quote Date</span><input id="quoteDate" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
          <label class="field"><span>Salesperson</span><input id="quoteSalesperson" type="text" value="Demo Rep"></label>
          <label class="field"><span>Customer Reference</span><input id="quoteReference" type="text" placeholder="PO / request / job"></label>
          <label class="field"><span>Terms</span><select id="quoteTerms"><option>Net 30</option><option>Prepay</option><option>Credit card</option></select></label>
        </div>

        <div class="quote-lines">
          <h3>Quote Lines</h3>
          <div id="quoteLineRows"></div>
          <button id="addQuoteLine" class="secondary-button" type="button">Add Line</button>
        </div>
      </section>

      <aside class="quote-summary">
        <h3>Quote Summary</h3>
        <div class="summary-row"><span>Subtotal</span><strong id="quoteSubtotal">$0.00</strong></div>
        <div class="summary-row"><span>Tax</span><strong>$0.00</strong></div>
        <div class="summary-row total"><span>Total</span><strong id="quoteTotal">$0.00</strong></div>
        <button id="saveQuote" class="primary-button" type="button">Save Demo Quote</button>
        <p id="quoteState" class="quote-state"></p>
      </aside>
    </div>`;

  const selectedCustomer = customers.find((customer) => customer.id === state.quote.customerId);
  if (selectedCustomer) document.querySelector("#quoteContact").value = selectedCustomer.contact;
  renderQuoteLines();

  document.querySelector("#quoteCustomer").addEventListener("change", (event) => {
    state.quote.customerId = event.target.value;
    const customer = customers.find((item) => item.id === state.quote.customerId);
    document.querySelector("#quoteContact").value = customer?.contact || "";
  });
  document.querySelector("#addQuoteLine").addEventListener("click", () => {
    state.quote.lines.push({ part: "", description: "", quantity: 1, price: 0 });
    renderQuoteLines();
  });
  document.querySelector("#saveQuote").addEventListener("click", saveDemoQuote);
}

function renderQuoteLines() {
  const rows = document.querySelector("#quoteLineRows");
  if (!rows) return;
  rows.innerHTML = state.quote.lines
    .map(
      (line, index) => `
        <div class="quote-line" data-line-index="${index}">
          <input class="line-input" data-field="part" type="text" aria-label="Part number" placeholder="Part #" value="${escapeHTML(line.part)}">
          <input class="line-input line-description" data-field="description" type="text" aria-label="Description" placeholder="Description" value="${escapeHTML(line.description)}">
          <input class="line-input" data-field="quantity" type="number" min="1" aria-label="Quantity" value="${escapeHTML(line.quantity)}">
          <input class="line-input" data-field="price" type="number" min="0" step="0.01" aria-label="Unit price" value="${escapeHTML(line.price)}">
          <button class="line-remove" type="button" aria-label="Remove line" data-remove-line="${index}">&#215;</button>
        </div>`,
    )
    .join("");

  rows.querySelectorAll(".quote-line").forEach((row) => {
    const index = Number(row.dataset.lineIndex);
    row.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const field = input.dataset.field;
        state.quote.lines[index][field] = ["quantity", "price"].includes(field) ? Number(input.value) : input.value;
        updateQuoteTotals();
      });
    });
  });
  rows.querySelectorAll("[data-remove-line]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.quote.lines.length === 1) {
        state.quote.lines[0] = { part: "", description: "", quantity: 1, price: 0 };
      } else {
        state.quote.lines.splice(Number(button.dataset.removeLine), 1);
      }
      renderQuoteLines();
    });
  });
  updateQuoteTotals();
}

function updateQuoteTotals() {
  const total = state.quote.lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.price) || 0), 0);
  const subtotal = document.querySelector("#quoteSubtotal");
  const totalElement = document.querySelector("#quoteTotal");
  if (subtotal) subtotal.textContent = formatCurrency(total);
  if (totalElement) totalElement.textContent = formatCurrency(total);
}

function saveDemoQuote() {
  if (!state.quote.customerId) {
    showToast("Select a customer before saving the demo quote.");
    document.querySelector("#quoteCustomer")?.focus();
    return;
  }
  if (!state.quote.lines.some((line) => line.description.trim())) {
    showToast("Add at least one quote line.");
    return;
  }

  const saved = JSON.parse(localStorage.getItem("mdbDemoQuotes") || "[]");
  const quoteNumber = `D-${String(saved.length + 1).padStart(4, "0")}`;
  saved.push({ ...state.quote, quoteNumber, savedAt: new Date().toISOString() });
  localStorage.setItem("mdbDemoQuotes", JSON.stringify(saved));
  document.querySelector("#quoteState").textContent = `${quoteNumber} saved for this demo session.`;
  showToast(`Demo quote ${quoteNumber} saved.`);
}

function findRig(serial) {
  return allRigEntries().find((entry) => entry.rig.serial === serial);
}

function renderBomWorkspace(serial = "") {
  const rigEntry = serial ? findRig(serial) : null;
  overlayBody.innerHTML = `
    <div class="workbench">
      <div class="workbench-bar">
        <label class="inline-search">
          <span class="search-mark" aria-hidden="true"></span>
          <input id="bomSearch" type="search" autocomplete="off" spellcheck="false" placeholder="Search rig model or serial..." value="${escapeHTML(serial)}">
        </label>
      </div>
      <div id="bomContent"></div>
    </div>`;

  const bomSearch = document.querySelector("#bomSearch");
  const update = () => renderBomContent(bomSearch.value);
  bomSearch.addEventListener("input", update);
  renderBomContent(rigEntry?.rig.serial || serial);
  if (!rigEntry) bomSearch.focus();
}

function renderBomContent(query) {
  const content = document.querySelector("#bomContent");
  if (!content) return;
  const exact = findRig(query.trim());

  if (exact) {
    const customer = customers.find((item) => item.id === exact.customerId);
    content.innerHTML = `
      <article class="info-card">
        <header class="card-heading">
          <h2>${escapeHTML(exact.rig.model)} - ${escapeHTML(exact.rig.serial)}</h2>
          <small>${escapeHTML(customer?.name || "")}</small>
        </header>
        <div class="card-body bom-tree">
          ${bomBranch("01", "Rotary System", [["DEMO-ROT-01", "Rotary drive assembly"], ["DEMO-SEAL-57", "Rotary seal kit"]])}
          ${bomBranch("02", "Hydraulic System", [["DEMO-HYD-11", "Main hydraulic manifold"], ["DEMO-HOSE-01", "Hydraulic hose assembly"]])}
          ${bomBranch("03", "Feed & Pullback", [["DEMO-FEED-04", "Feed cylinder assembly"], ["DEMO-WEAR-09", "Wear pad set"]])}
          ${bomBranch("04", "Water & Pump", [["DEMO-PUMP-03", "Water pump assembly"], ["DEMO-FILT-12", "Suction filter"]])}
        </div>
      </article>`;
    attachBomBranchEvents();
    return;
  }

  const matches = query.trim() ? findMatches(query, allRigEntries(), 12) : allRigEntries().slice(0, 12);
  content.innerHTML = `
    <article class="info-card">
      <header class="card-heading"><h2>Confirmed Rigs</h2><small>${matches.length} shown</small></header>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Serial</th><th>Model</th><th>Customer</th><th>Year</th><th></th></tr></thead>
          <tbody>
            ${matches.length
              ? matches
                  .map((entry) => {
                    const customer = customers.find((item) => item.id === entry.customerId);
                    return `<tr><td>${escapeHTML(entry.rig.serial)}</td><td>${escapeHTML(entry.rig.model)}</td><td>${escapeHTML(customer?.name || "")}</td><td>${entry.rig.year}</td><td><button class="table-button" type="button" data-select-rig="${escapeHTML(entry.rig.serial)}">View BOM</button></td></tr>`;
                  })
                  .join("")
              : '<tr><td colspan="5">No close rig or serial match.</td></tr>'}
          </tbody>
        </table>
      </div>
    </article>`;
  content.querySelectorAll("[data-select-rig]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector("#bomSearch").value = button.dataset.selectRig;
      renderBomContent(button.dataset.selectRig);
    });
  });
}

function bomBranch(number, title, parts) {
  return `
    <div class="bom-branch">
      <button type="button" aria-expanded="false"><span>${escapeHTML(number)} - ${escapeHTML(title)}</span><span aria-hidden="true">+</span></button>
      <div class="bom-parts" hidden>
        <table class="data-table"><thead><tr><th>Part Number</th><th>Description</th></tr></thead><tbody>
          ${parts.map(([part, description]) => `<tr><td>${escapeHTML(part)}</td><td>${escapeHTML(description)}</td></tr>`).join("")}
        </tbody></table>
      </div>
    </div>`;
}

function attachBomBranchEvents() {
  document.querySelectorAll(".bom-branch > button").forEach((button) => {
    button.addEventListener("click", () => {
      const parts = button.nextElementSibling;
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      button.lastElementChild.textContent = expanded ? "+" : "-";
      parts.hidden = expanded;
    });
  });
}

document.querySelectorAll("[data-open]").forEach((button) => {
  button.addEventListener("click", () => {
    const destination = button.dataset.open;
    if (destination === "customer") openCustomerWorkspace();
    else openWorkspace(destination);
  });
});

document.querySelectorAll("[data-workspace]").forEach((button) => {
  button.addEventListener("click", () => {
    const destination = button.dataset.workspace;
    const options = destination === "quotes" ? { customerId: state.selectedCustomerId } : {};
    openWorkspace(destination, options);
  });
});

homeButton.addEventListener("click", showHome);
customerBackButton.addEventListener("click", showHome);
overlayBackButton.addEventListener("click", closeWorkspace);
overlayCloseButton.addEventListener("click", closeWorkspace);

globalSearchInput.addEventListener("input", handleGlobalSearch);
globalSearchInput.addEventListener("focus", () => {
  if (globalSearchInput.value.trim()) handleGlobalSearch();
});
globalSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    globalSearchForm.requestSubmit();
  }
});
globalSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = globalSearchInput.value.trim();
  if (!query) return;
  state.globalResults = globalMatches(query);
  if (!state.globalResults.length) {
    renderSearchResults(globalSearchResults, globalSearchInput, [], chooseGlobalResult);
    return;
  }

  const numericQuery = /^\d[\d\s-]{3,}$/.test(query);
  const top = state.globalResults[0];
  if (numericQuery && !normalize(`${top.label} ${top.detail}`).includes(normalize(query))) {
    renderSearchResults(globalSearchResults, globalSearchInput, state.globalResults, chooseGlobalResult);
    showToast("Select the intended serial or part-number suggestion.");
    return;
  }
  chooseGlobalResult(top);
});

customerSearchInput.addEventListener("input", handleCustomerSearch);
customerSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    customerSearchForm.requestSubmit();
  }
});
customerSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const results = findMatches(customerSearchInput.value, allCustomerEntries(), 8);
  if (results[0]) selectCustomer(results[0].customerId);
});

directoryFilter.addEventListener("input", () => renderCustomerList(directoryFilter.value));

calibrationButton.addEventListener("click", () => {
  renderCalibrationMenu();
  calibrationMenu.hidden = !calibrationMenu.hidden;
  calibrationButton.setAttribute("aria-expanded", String(!calibrationMenu.hidden));
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".home-search-wrap")) hideSearchResults(globalSearchResults, globalSearchInput);
  if (!event.target.closest(".customer-search-wrap")) hideSearchResults(customerSearchResults, customerSearchInput);
  if (!event.target.closest(".menu-wrap")) {
    calibrationMenu.hidden = true;
    calibrationButton.setAttribute("aria-expanded", "false");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!workspaceOverlay.hidden) closeWorkspace();
    else {
      hideSearchResults(globalSearchResults, globalSearchInput);
      hideSearchResults(customerSearchResults, customerSearchInput);
      calibrationMenu.hidden = true;
      calibrationButton.setAttribute("aria-expanded", "false");
    }
  }
});

renderCustomerList();

