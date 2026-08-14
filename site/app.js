"use strict";

const searchForm = document.querySelector("#universalSearch");
const searchInput = document.querySelector("#searchInput");
const searchError = document.querySelector("#searchError");
const reasoningPanel = document.querySelector("#reasoningPanel");
const reasoningTitle = document.querySelector("#reasoningTitle");
const reasoningBody = document.querySelector("#reasoningBody");
const routeBadge = document.querySelector("#routeBadge");
const questionStage = document.querySelector("#questionStage");
const questionCount = document.querySelector("#questionCount");
const questionText = document.querySelector("#questionText");
const questionHelp = document.querySelector("#questionHelp");
const answerOptions = document.querySelector("#answerOptions");
const resultStage = document.querySelector("#resultStage");
const resultBody = document.querySelector("#resultBody");
const refineButton = document.querySelector("#refineButton");
const newSearchButton = document.querySelector("#newSearchButton");

const state = {
  query: "",
  route: null,
  questions: [],
  questionIndex: 0,
  answers: [],
  stopReason: "",
};

const routeSelection = {
  tooling: "tooling",
  parts: "parts",
  rigs: "rigs",
  trouble: "troubleshooting",
  calibration: "calibration",
  knowledge: "knowledge",
};

const routes = {
  tooling: {
    id: "tooling",
    workspace: "Tooling 004",
    title: "Tooling intent detected",
    intent: "Identify or configure a tooling item",
    explanation:
      "The wording matches a controlled tooling family, component, or selection path.",
    guardrailTitle: "CTS and WS004 must agree",
    guardrail:
      "A catalog hit is only a possible match until required variables and compatibility are checked.",
    questions: toolingQuestions,
    result: toolingResult,
  },
  parts: {
    id: "parts",
    workspace: "Rig Parts 002/003",
    title: "Rig Parts intent detected",
    intent: "Identify a part inside a rig or assembly context",
    explanation:
      "The entry looks like a part number, serial, assembly, or rig-specific component.",
    guardrailTitle: "Serial before quote-ready part",
    guardrail:
      "A model-only or description-only match cannot be labeled Serial BOM Verified.",
    questions: () => [
      {
        id: "serial-context",
        prompt: "What rig context is available?",
        help: "This decides whether MDB can enter a controlled BOM path or must return a proxy.",
        options: [
          ["I have the rig serial", "serial"],
          ["I know the model only", "model"],
          ["I only have the part or description", "part-only"],
          ["I am not sure", "unknown"],
        ],
      },
      {
        id: "parts-goal",
        prompt: "What do you need from the part path?",
        help: "Related BOM branches stay collapsed until they are useful.",
        options: [
          ["Confirm this exact item", "exact"],
          ["Show the assembly branch", "assembly"],
          ["Find where it is used", "where-used"],
          ["Find a replacement path", "replacement"],
        ],
      },
    ],
    result: partsResult,
  },
  rigs: {
    id: "rigs",
    workspace: "Rig Sales 005",
    title: "Rig Sales intent detected",
    intent: "Look up, compare, or select a rig",
    explanation:
      "The entry names a rig model, specification, or customer application.",
    guardrailTitle: "Reference and selection are different modes",
    guardrail:
      "A model fact can use Reference Mode; a customer recommendation needs Guided Selling context.",
    questions: () => [
      {
        id: "rig-mode",
        prompt: "What are you trying to do with the rig information?",
        help: "MDB will keep a simple model lookup separate from a customer-fit recommendation.",
        options: [
          ["Look up model specs", "reference"],
          ["Compare two models", "compare"],
          ["Select a rig for a customer need", "guided"],
          ["Work from a specific serial", "serial"],
        ],
      },
      {
        id: "rig-context",
        prompt: "Which context can lead the next step?",
        help: "Application details matter when the request moves beyond reference information.",
        options: [
          ["Customer application and depth", "application"],
          ["Model names only", "models"],
          ["Serial and build context", "serial-build"],
          ["I need help gathering details", "gather"],
        ],
      },
    ],
    result: rigsResult,
  },
  troubleshooting: {
    id: "troubleshooting",
    workspace: "Troubleshooting 007",
    title: "Symptom intent detected",
    intent: "Isolate a machine problem before searching for parts",
    explanation:
      "The entry describes behavior or failure, so MDB must not jump directly to a replacement item.",
    guardrailTitle: "Safety and system isolation first",
    guardrail:
      "Troubleshooting starts with a safe machine state and routes to escalation when risk or uncertainty is too high.",
    questions: () => [
      {
        id: "safe-state",
        prompt: "Is the machine stopped and safe to inspect?",
        help: "If the answer is no or uncertain, MDB stops the workflow instead of continuing diagnosis.",
        options: [
          ["Yes - safe to inspect", "safe"],
          ["No - it is still operating", "unsafe"],
          ["I am not sure", "uncertain"],
        ],
        stopValues: ["unsafe", "uncertain"],
      },
      {
        id: "system",
        prompt: "Which system best matches the symptom?",
        help: "This narrows the handoff without pretending the symptom proves a failed part.",
        options: [
          ["Rotary or hydraulic drive", "rotary"],
          ["Feed, pullback, or breakout", "feed"],
          ["Water pump or circulation", "water"],
          ["Hammer or calibration system", "hammer"],
          ["I cannot isolate the system", "unknown"],
        ],
      },
    ],
    result: troubleshootingResult,
  },
  calibration: {
    id: "calibration",
    workspace: "Calibration 006",
    title: "Calibration intent detected",
    intent: "Route an SPT calibration service, training, or data-quality need",
    explanation:
      "The entry matches calibration service, hammer-energy, scheduling, or technician-support language.",
    guardrailTitle: "Support is not final report authority",
    guardrail:
      "MDB can prepare, train, schedule, and troubleshoot data quality without claiming final external certification authority.",
    questions: () => [
      {
        id: "calibration-goal",
        prompt: "Which calibration outcome do you need?",
        help: "The same entry may route to scheduling, training, or data-quality support.",
        options: [
          ["Cost, due date, or scheduling", "schedule"],
          ["Technician training or workflow", "training"],
          ["Low energy or failed data", "data"],
          ["Report or customer communication", "report"],
        ],
      },
      {
        id: "hammer-context",
        prompt: "What hammer context is known?",
        help: "MDB preserves what is known and labels missing configuration instead of guessing.",
        options: [
          ["LP configuration", "lp"],
          ["LE configuration", "le"],
          ["Another known configuration", "other"],
          ["Configuration is not confirmed", "unknown"],
        ],
      },
    ],
    result: calibrationResult,
  },
  knowledge: {
    id: "knowledge",
    workspace: "Reference & Training 008",
    title: "Reference intent detected",
    intent: "Explain a concept or prepare the user for an action",
    explanation:
      "The wording asks for understanding, training, practice, or call preparation.",
    guardrailTitle: "Training examples do not create authority",
    guardrail:
      "When the intent becomes quote, part, rig selection, calibration, or troubleshooting, MDB routes to that controlled workspace.",
    questions: () => [
      {
        id: "learning-mode",
        prompt: "How should MDB help you use this information?",
        help: "Reference stays lightweight unless the request changes into an action workflow.",
        options: [
          ["Explain the concept", "explain"],
          ["Prepare me for a customer call", "call-prep"],
          ["Practice with a scenario or quiz", "practice"],
          ["I actually need to take action", "action"],
        ],
      },
    ],
    result: knowledgeResult,
  },
  customer: {
    id: "customer",
    workspace: "Customer Context 001",
    title: "Customer context detected",
    intent: "Find a customer, fleet, relationship, or purchase-history starting point",
    explanation:
      "The entry points to customer identity or relationship context rather than a technical item alone.",
    guardrailTitle: "Preserve system authority",
    guardrail:
      "GP owns transactional truth, Salesforce owns relationship and pipeline truth, and MDB owns operational context and routing.",
    questions: () => [
      {
        id: "customer-goal",
        prompt: "What should the customer context support?",
        help: "Customer history can guide the next question but cannot prove current tooling or rig configuration.",
        options: [
          ["Find customer or fleet details", "profile"],
          ["Review purchase history", "history"],
          ["Prepare a quote conversation", "quote"],
          ["Build a call or prospecting plan", "prospecting"],
        ],
      },
    ],
    result: customerResult,
  },
  discovery: {
    id: "discovery",
    workspace: "Intent check",
    title: "More than one route is possible",
    intent: "Clarify the kind of help behind the entry",
    explanation:
      "The wording is intentionally preserved, but it does not yet identify one controlled workspace.",
    guardrailTitle: "Ask before assuming",
    guardrail:
      "MDB asks one routing question instead of silently converting ambiguous language into a part or recommendation.",
    questions: () => [
      {
        id: "route-choice",
        prompt: "Which statement is closest to what you need?",
        help: "Choose the intent, not the department name. MDB will take it from there.",
        options: [
          ["Identify or configure tooling", "tooling"],
          ["Find a rig or serial-specific part", "parts"],
          ["Look up or select a rig", "rigs"],
          ["Work through a machine problem", "trouble"],
          ["Handle calibration", "calibration"],
          ["Explain or train me", "knowledge"],
        ],
        reroute: true,
      },
    ],
    result: () => null,
  },
};

function toolingQuestions(query) {
  const normalized = query.toLowerCase();

  if (normalized.includes("drive cap")) {
    return [
      {
        id: "tooling-family",
        prompt: "Which tooling family is the drive cap for?",
        help: "Drive-cap wording alone does not identify the required family, size, or connection.",
        options: [
          ["HSA", "hsa"],
          ["HEX-COR or STD Duty", "hex-cor"],
          ["Another tooling family", "other"],
          ["I am not sure", "unknown"],
        ],
      },
      {
        id: "connection-detail",
        prompt: "What connection detail can be confirmed?",
        help: "MDB keeps the result at needs-verification until the required CTS variables are known.",
        options: [
          ["Family, size, and connection are known", "complete"],
          ["I know the family and size", "family-size"],
          ["I have an existing part number", "existing-pn"],
          ["The connection still needs inspection", "inspect"],
        ],
      },
    ];
  }

  if (normalized.includes("split spoon")) {
    return [
      {
        id: "split-spoon-goal",
        prompt: "What are you trying to identify?",
        help: "MDB keeps the complete assembly, shoe, and repair paths separate.",
        options: [
          ["Complete split-spoon assembly", "complete"],
          ["Shoe or repair item", "shoe"],
          ["Compatibility or replacement", "replacement"],
          ["I am not sure", "unknown"],
        ],
      },
      {
        id: "spoon-variables",
        prompt: "Are size and shoe style confirmed?",
        help: "Shoe style is a controlled selection variable; MDB will not silently infer it.",
        options: [
          ["Yes - both are confirmed", "confirmed"],
          ["Size is known; shoe style is not", "size-only"],
          ["I have an existing part number", "existing-pn"],
          ["Neither is confirmed", "unknown"],
        ],
      },
    ];
  }

  if (normalized.includes("moyno") || /\b\d+l\d+\b/i.test(query)) {
    return [
      {
        id: "moyno-scope",
        prompt: "Are you identifying the pump or one component?",
        help: "Moyno requests route by component and model rather than a loose keyword match.",
        options: [
          ["Complete pump", "pump"],
          ["Pump component", "component"],
          ["Replacement by model marking", "model"],
          ["I am not sure", "unknown"],
        ],
      },
      {
        id: "moyno-marking",
        prompt: "What model evidence is available?",
        help: "MDB preserves the marking as evidence and does not promote it to a compatible replacement by itself.",
        options: [
          ["The model marking is readable", "readable"],
          ["I have the old part number", "old-pn"],
          ["I have photos or dimensions", "photos"],
          ["No reliable marking is available", "unknown"],
        ],
      },
    ];
  }

  return [
    {
      id: "tooling-goal",
      prompt: "What are you trying to do with this tooling item?",
      help: "The answer decides whether MDB should identify, configure, or replace it.",
      options: [
        ["Identify an exact item", "identify"],
        ["Build a compatible assembly", "configure"],
        ["Replace existing tooling", "replace"],
        ["I need help narrowing it", "unknown"],
      ],
    },
    {
      id: "tooling-evidence",
      prompt: "Which detail can anchor the search?",
      help: "MDB uses the strongest available detail and labels anything still missing.",
      options: [
        ["Family and size", "family-size"],
        ["Connection", "connection"],
        ["Existing part number", "existing-pn"],
        ["Customer-owned tooling only", "history"],
      ],
    },
  ];
}

function detectRoute(query) {
  const value = query.toLowerCase();

  if (/\b(calibrat(?:e|ed|es|ing|ion)?|spt|hammer energy|energy ratio|lp hammer|le hammer)\b/.test(value)) {
    return routes.calibration;
  }

  if (
    /(won't|will not|doesn't|does not|not turn|not retract|losing pressure|no pressure|leak|stuck|slipping|failed|failure|broken|overheat|problem|won't cycle)/.test(
      value,
    )
  ) {
    return routes.troubleshooting;
  }

  if (
    /\b(serial|bom|assembly|where used|part number|\bpn\b)\b/.test(value) ||
    /^\d{5,}$/.test(value.trim())
  ) {
    return routes.parts;
  }

  if (/\b(b57|b37x|under[- ]?cdl|rig model|rig spec|compare rigs|need a rig)\b/.test(value)) {
    return routes.rigs;
  }

  if (
    /\b(drive cap|split spoon|auger|hsa|hex[- ]?cor|cutterhead|center rod|center plug|drill rod|moyno|tooling)\b/.test(
      value,
    ) || /\b\d+l\d+\b/i.test(query)
  ) {
    return routes.tooling;
  }

  if (/^(what|why|how|explain|teach|train|practice|quiz)\b/.test(value)) {
    return routes.knowledge;
  }

  if (/\b(customer|contact|gp code|fleet|purchase history|prospect)\b/.test(value)) {
    return routes.customer;
  }

  return routes.discovery;
}

function startSearch(query) {
  state.query = query;
  state.route = detectRoute(query);
  state.questions = state.route.questions(query);
  state.questionIndex = 0;
  state.answers = [];
  state.stopReason = "";

  searchError.textContent = "";
  reasoningPanel.hidden = false;
  resultStage.hidden = true;
  renderReasoning();
  renderQuestion();

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  reasoningPanel.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start",
  });
}

function renderReasoning() {
  const route = state.route;
  reasoningTitle.textContent = route.title;
  routeBadge.textContent = route.workspace;
  reasoningBody.replaceChildren(
    reasonCard("Entry preserved", state.query, "MDB keeps the user's original language visible."),
    reasonCard("Intent", route.intent, route.explanation),
    reasonCard("Guardrail", route.guardrailTitle, route.guardrail),
  );
}

function reasonCard(label, title, description) {
  const card = document.createElement("article");
  card.className = "reason-card";

  const chip = document.createElement("span");
  chip.className = "reason-chip";
  chip.textContent = label;

  const heading = document.createElement("strong");
  heading.textContent = title;

  const copy = document.createElement("p");
  copy.textContent = description;

  card.append(chip, heading, copy);
  return card;
}

function renderQuestion() {
  const question = state.questions[state.questionIndex];

  if (!question) {
    renderResult();
    return;
  }

  questionStage.hidden = false;
  resultStage.hidden = true;
  questionCount.textContent = `Progressive question ${state.questionIndex + 1} of ${state.questions.length}`;
  questionText.textContent = question.prompt;
  questionHelp.textContent = question.help;
  answerOptions.replaceChildren();

  question.options.forEach(([label, value]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-button";
    button.textContent = label;
    button.dataset.value = value;
    button.addEventListener("click", () => selectAnswer(question, label, value));
    answerOptions.append(button);
  });

  window.requestAnimationFrame(() => {
    const firstAnswer = answerOptions.querySelector("button");
    firstAnswer?.focus({ preventScroll: true });
  });
}

function selectAnswer(question, label, value) {
  if (question.reroute) {
    const nextRouteId = routeSelection[value];
    state.route = routes[nextRouteId];
    state.questions = state.route.questions(state.query);
    state.questionIndex = 0;
    state.answers = [];
    state.stopReason = "";
    renderReasoning();
    renderQuestion();
    return;
  }

  state.answers.push({ id: question.id, label, value });

  if (question.stopValues?.includes(value)) {
    state.stopReason = value;
    renderResult();
    return;
  }

  state.questionIndex += 1;
  renderQuestion();
}

function renderResult() {
  const result = state.route.result(state);
  if (!result) return;

  questionStage.hidden = true;
  resultStage.hidden = false;
  resultBody.replaceChildren();

  if (state.answers.length) {
    const trail = document.createElement("ul");
    trail.className = "context-trail";
    trail.setAttribute("aria-label", "Context gathered");
    state.answers.forEach((answer) => {
      const item = document.createElement("li");
      item.textContent = answer.label;
      trail.append(item);
    });
    resultBody.append(trail);
  }

  const card = document.createElement("div");
  card.className = "result-card";

  const main = document.createElement("div");
  main.className = "result-main";

  const status = document.createElement("span");
  status.className = `result-status result-status--${result.tone}`;
  status.textContent = result.status;

  const heading = document.createElement("h3");
  heading.textContent = result.title;

  const summary = document.createElement("p");
  summary.textContent = result.summary;

  const notes = document.createElement("ul");
  notes.className = "result-notes";
  result.notes.forEach((note) => {
    const item = document.createElement("li");
    item.textContent = note;
    notes.append(item);
  });

  main.append(status, heading, summary, notes);

  const nextAction = document.createElement("aside");
  nextAction.className = "next-action";
  const nextLabel = document.createElement("span");
  nextLabel.textContent = "Next controlled action";
  const nextTitle = document.createElement("strong");
  nextTitle.textContent = result.nextAction;
  const nextCopy = document.createElement("p");
  nextCopy.textContent = result.nextDetail;
  nextAction.append(nextLabel, nextTitle, nextCopy);

  card.append(main, nextAction);
  resultBody.append(card);

  window.requestAnimationFrame(() => {
    refineButton.focus({ preventScroll: true });
  });
}

function answerValue(id) {
  return state.answers.find((answer) => answer.id === id)?.value;
}

function toolingResult() {
  const evidence =
    answerValue("connection-detail") ||
    answerValue("spoon-variables") ||
    answerValue("moyno-marking") ||
    answerValue("tooling-evidence");
  const strongerEvidence = ["complete", "confirmed", "existing-pn", "readable"].includes(evidence);

  return {
    tone: strongerEvidence ? "route" : "verify",
    status: strongerEvidence ? "Candidate path identified" : "Compatibility inputs required",
    title: `Tooling path for “${state.query}”`,
    summary:
      "MDB has narrowed the request to a controlled tooling path without inventing a part number or flattening related components into the first result.",
    notes: [
      "Current CTS documents and WS004 govern the execution path.",
      "Customer purchase history may suggest tooling DNA, but it does not prove current configuration.",
      "BOM or package expansion remains secondary until the primary item and required variables are confirmed.",
    ],
    nextAction: "Open the Tooling Workspace",
    nextDetail: strongerEvidence
      ? "Carry the gathered variables into the compatibility gate and return labeled candidates."
      : "Collect the missing family, size, connection, style, or model evidence before quote-prep.",
  };
}

function partsResult() {
  const serialContext = answerValue("serial-context");
  const hasSerial = serialContext === "serial";

  return {
    tone: hasSerial ? "safe" : "verify",
    status: hasSerial ? "Serial path available" : "Verification required",
    title: hasSerial ? "Ready to enter the serial/BOM path" : `Possible part path for “${state.query}”`,
    summary: hasSerial
      ? "The serial can anchor the rig portal, BOM hierarchy, and part-detail path."
      : "MDB can preserve this as a candidate, but model-only or description-only context is not serial-BOM authority.",
    notes: [
      "Exact part identity and Where Used remain separate questions.",
      "Related assemblies stay collapsed until the user asks for the branch.",
      "Current pricing, inventory, and ordering truth remain in GP.",
    ],
    nextAction: hasSerial ? "Open Rig Portal" : "Gather serial or BOM evidence",
    nextDetail: hasSerial
      ? "Use the active serial to inspect the relevant assembly branch."
      : "Return a clearly labeled proxy if the serial cannot be obtained.",
  };
}

function rigsResult() {
  const mode = answerValue("rig-mode");
  const guided = mode === "guided";

  return {
    tone: guided ? "verify" : "route",
    status: guided ? "Application context required" : "Mode identified",
    title: guided ? "Guided Selling path ready" : `Rig reference path for “${state.query}”`,
    summary: guided
      ? "MDB identified a customer-fit request and will gather application variables before comparing recommendations."
      : "MDB identified a reference or comparison request without treating model facts as a customer recommendation.",
    notes: [
      "Model/spec lookup can stay in Reference Mode.",
      "Customer selection requires application, depth, tooling, transport, and operating constraints as applicable.",
      "A specific serial routes back through the rig portal for build-level truth.",
    ],
    nextAction: guided ? "Start guided application intake" : "Open controlled rig reference",
    nextDetail: guided
      ? "Ask for the smallest missing application variable first."
      : "Show sourced model facts and label any unresolved comparison gaps.",
  };
}

function troubleshootingResult() {
  if (state.stopReason) {
    return {
      tone: "stop",
      status: "Stop condition",
      title: "Secure the machine before continuing",
      summary:
        "MDB will not continue diagnosis while the machine is operating or the safe state is uncertain.",
      notes: [
        "Follow the applicable company safety and lockout procedures.",
        "Escalate whenever the issue exceeds the user's knowledge, authority, comfort, or risk tolerance.",
        "No replacement part is suggested from the symptom alone.",
      ],
      nextAction: "Stop and escalate",
      nextDetail: "Resume the workflow only after an authorized person confirms a safe inspection state.",
    };
  }

  return {
    tone: "route",
    status: "System route identified",
    title: "Troubleshooting path ready",
    summary:
      "The symptom now has a safe-state confirmation and a system-level route, but it is not yet a diagnosis or part recommendation.",
    notes: [
      "Preserve the exact symptom and operating conditions.",
      "Collect serial/model, photos, pressure state, recent work, and other evidence appropriate to the system.",
      "Escalate instead of forcing certainty when the issue exceeds the user's comfort or authority.",
    ],
    nextAction: "Open system isolation workflow",
    nextDetail: "Use the selected system to ask the next diagnostic question and prepare a qualified handoff.",
  };
}

function calibrationResult() {
  const goal = answerValue("calibration-goal");
  const goalLabels = {
    schedule: "service and scheduling",
    training: "technician training",
    data: "data-quality troubleshooting",
    report: "report and customer communication",
  };

  return {
    tone: answerValue("hammer-context") === "unknown" ? "verify" : "route",
    status: answerValue("hammer-context") === "unknown" ? "Configuration needed" : "Calibration route identified",
    title: `Calibration ${goalLabels[goal] || "support"} path`,
    summary:
      "MDB has separated the requested support outcome from final report, certification, pricing, and scheduling authority.",
    notes: [
      "Preserve hammer configuration and status as explicit context.",
      "Low-energy or failed-data requests route to data-quality troubleshooting and training support.",
      "Formal report generation and external certification remain outside this demo's authority.",
    ],
    nextAction: "Open Calibration Workspace",
    nextDetail: "Carry the selected outcome and known hammer context into the appropriate support lane.",
  };
}

function knowledgeResult() {
  const mode = answerValue("learning-mode");
  const actionRequested = mode === "action";

  return {
    tone: actionRequested ? "verify" : "route",
    status: actionRequested ? "Action route required" : "Reference mode",
    title: actionRequested ? "Move from learning to a controlled workspace" : "Reference and training path ready",
    summary: actionRequested
      ? "The intent has changed from explanation to action, so training content cannot supply quote, part, diagnosis, or scheduling authority."
      : "MDB can explain the topic, prepare the user for a call, or run practice without pretending the example is operational truth.",
    notes: [
      "Training examples never override source authority.",
      "Serial-specific part questions route to Rig Parts.",
      "Quote, rig-selection, calibration, and troubleshooting intent route to their controlled workspaces.",
    ],
    nextAction: actionRequested ? "Choose the action intent" : "Open Reference & Training",
    nextDetail: actionRequested
      ? "Return to universal entry with the action, item, serial, or symptom stated directly."
      : "Use the original language as the topic and keep action boundaries visible.",
  };
}

function customerResult() {
  return {
    tone: "route",
    status: "Customer context route",
    title: "Customer starting point identified",
    summary:
      "MDB can preserve customer and fleet context, then expand into the technical or commercial workspace only when needed.",
    notes: [
      "GP remains transactional authority for billing, purchase history, pricing, orders, invoices, and inventory.",
      "Salesforce remains relationship and pipeline authority.",
      "Purchase history can guide questions but cannot prove current tooling or equipment configuration.",
    ],
    nextAction: "Open Customer Profile",
    nextDetail: "Carry the selected goal forward without merging the three authority types.",
  };
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = searchInput.value.trim().replace(/\s+/g, " ");

  if (!query) {
    searchError.textContent = "Enter something MDB can route.";
    searchInput.focus();
    return;
  }

  startSearch(query.slice(0, 140));
});

document.querySelectorAll(".example-query").forEach((button) => {
  button.addEventListener("click", () => {
    searchInput.value = button.dataset.query || "";
    startSearch(searchInput.value);
  });
});

refineButton.addEventListener("click", () => {
  if (!state.answers.length) {
    searchInput.focus();
    return;
  }

  state.stopReason = "";
  state.answers.pop();
  state.questionIndex = Math.max(0, state.answers.length);
  renderQuestion();
});

newSearchButton.addEventListener("click", () => {
  reasoningPanel.hidden = true;
  resultStage.hidden = true;
  questionStage.hidden = true;
  searchInput.value = "";
  searchError.textContent = "";
  searchInput.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});
