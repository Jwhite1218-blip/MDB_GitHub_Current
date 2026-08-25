"use strict";

((root) => {
  function normalizeValue(value) {
    return String(value || "")
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  }

  function editDistance(a, b) {
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

  function tokenSimilarity(queryToken, targetToken) {
    if (queryToken === targetToken) return 1;
    if (queryToken.length >= 2 && (targetToken.startsWith(queryToken) || queryToken.startsWith(targetToken))) return 0.92;
    if (queryToken.length < 4 || Math.abs(queryToken.length - targetToken.length) > 2) return 0;
    const distance = editDistance(queryToken, targetToken);
    const tolerance = Math.max(1, Math.floor(queryToken.length / 4));
    return distance <= tolerance ? 1 - distance / Math.max(queryToken.length, targetToken.length) : 0;
  }

  function fieldScore(cleanQuery, queryTokens, value, weight) {
    const field = normalizeValue(value);
    if (!field) return 0;
    if (field === cleanQuery) return weight + 120;
    if (field.startsWith(cleanQuery)) return weight + 90;
    if (field.includes(cleanQuery)) return weight + 65;
    const fieldTokens = field.split(" ");
    const similarities = queryTokens.map((queryToken) => Math.max(
      0,
      ...fieldTokens.map((targetToken) => tokenSimilarity(queryToken, targetToken)),
    ));
    const coverage = similarities.reduce((sum, score) => sum + score, 0) / queryTokens.length;
    const minimumCoverage = queryTokens.length === 1 ? 0.72 : 0.64;
    return coverage >= minimumCoverage ? Math.round(weight * coverage) : 0;
  }

  function sourceAuthorityBonus(item) {
    const authority = normalizeValue(`${item.sourceType || ""} ${item.sourceAuthority || ""} ${item.validation || ""}`);
    if (authority.includes("current cts") || authority.includes("current ws004")) return 60;
    if (authority.includes("master")) return 52;
    if (authority.includes("current verified") || authority.includes("sme confirmed")) return 45;
    if (authority.includes("rig bom")) return 35;
    if (authority.includes("tooling index")) return 22;
    return 8;
  }

  function scoreToolingItem(query, item) {
    const cleanQuery = normalizeValue(query);
    if (!cleanQuery) return { matched: true, score: 0, primary: "catalog" };
    const queryTokens = cleanQuery.split(" ");
    const queryPart = cleanQuery.replace(/[^a-z0-9]/g, "");
    const hasNumber = /\d/.test(queryPart);
    const part = normalizeValue(item.part).replace(/[^a-z0-9]/g, "");
    const rawPart = normalizeValue(item.rawPart).replace(/[^a-z0-9]/g, "");
    let primary = 0;
    let primaryField = "";

    if (hasNumber && part) {
      if (part === queryPart) { primary = 1300; primaryField = "exact part"; }
      else if (part.startsWith(queryPart)) { primary = 1130; primaryField = "part prefix"; }
      else if (part.includes(queryPart)) { primary = 990; primaryField = "part contains"; }
    }
    if (hasNumber && rawPart) {
      if (rawPart === queryPart && primary < 1260) { primary = 1260; primaryField = "exact source part"; }
      else if (rawPart.startsWith(queryPart) && primary < 1090) { primary = 1090; primaryField = "source part prefix"; }
      else if (rawPart.includes(queryPart) && primary < 950) { primary = 950; primaryField = "source part contains"; }
    }

    const textFields = [
      ["description", `${item.description || ""} ${item.officialDescription || ""}`, 820],
      ["type", item.subfamily, 740],
      ["family", item.family, 620],
      ["controlled attributes", `${item.size || ""} ${item.length || ""} ${item.connection || ""} ${item.thread || ""} ${item.style || ""} ${item.hsaId || ""} ${item.rodFamily || ""} ${item.machineInterface || ""}`, 500],
      ["alias", item.aliases, 390],
    ];
    for (const [field, value, weight] of textFields) {
      const score = fieldScore(cleanQuery, queryTokens, value, weight);
      if (score > primary) { primary = score; primaryField = field; }
    }

    const exactNumericTokens = queryTokens.filter((token) => /^\d{4,}$/.test(token));
    const searchablePartText = normalizeValue(`${item.part || ""} ${item.rawPart || ""} ${item.aliases || ""}`);
    if (exactNumericTokens.some((token) => !searchablePartText.includes(token))) {
      return { matched: false, score: 0, primary: "" };
    }
    if (!primary) return { matched: false, score: 0, primary: "" };

    const hasActivePart = Boolean(String(item.part || "").trim());
    const status = normalizeValue(item.status);
    const authorityBonus = sourceAuthorityBonus(item);
    const actionBonus = hasActivePart ? 34 : -28;
    const quoteBonus = item.quoteable ? 22 : 0;
    const blockedPenalty = status.includes("blocked") || status.includes("not offered") ? -20 : 0;
    return {
      matched: true,
      score: primary + authorityBonus + actionBonus + quoteBonus + blockedPenalty,
      primary: primaryField,
      authorityBonus,
      hasActivePart,
    };
  }

  function rankToolingItems(query, items) {
    return items.map((item, index) => {
      const ranking = scoreToolingItem(query, item);
      return { ...item, score: ranking.score, searchReason: ranking.primary, _searchOrder: index, _matched: ranking.matched };
    }).filter((item) => item._matched).sort((a, b) =>
      b.score - a.score
      || Number(Boolean(b.part)) - Number(Boolean(a.part))
      || String(a.part || "").localeCompare(String(b.part || ""), undefined, { numeric: true })
      || a._searchOrder - b._searchOrder
    );
  }

  function detectGuidedBuilder(query) {
    const clean = normalizeValue(query);
    if (!clean) return "";
    if (clean.includes("drive cap")) return "driveCap";
    if (clean.includes("split spoon") || clean.includes("split sampler")) return "splitSpoon";
    if (clean.includes("moyno") || /\b3l[468]\b/.test(clean)) return "moyno";
    if (clean.includes("hex cor") || clean.includes("hexcor") || clean.includes("std duty") || clean.includes("solid stem")) return "hexCor";
    if (clean.includes("hsa auger") || clean.includes("hollow stem auger")) return "hsaAuger";
    const augerPartTerms = ["bushing", "cap", "coupling", "head", "shoe", "cutter", "tooth", "key", "adapter", "bolt", "plug", "pilot", "holder", "breaker"];
    const hasAugerIntent = clean.split(" ").some((token) => token === "auger" || token === "augers");
    if (hasAugerIntent
      && !/\b\d{4,}\b/.test(clean)
      && !augerPartTerms.some((term) => clean.includes(term))) return "hsaAuger";
    return "";
  }

  root.MDBToolingSearch = Object.freeze({
    detectGuidedBuilder,
    normalizeValue,
    rankToolingItems,
    scoreToolingItem,
  });
})(globalThis);
