// Sends a Calibration Training result through Resend.
// Requires RESEND_API_KEY and CALIBRATION_RESULTS_EMAIL to be set on the
// protected internal deployment.
// Without it, this returns { sent: false } and the frontend falls back to the
// on-screen Admin Console — the result is never lost, only the email is skipped.
//
// The "from" address uses Resend's shared sandbox sender (onboarding@resend.dev),
// which works without verifying a domain. Swap it for a verified Mobile Drill
// address once a sending domain is set up in Resend.

const { internalAccess } = require("./_internal-access");

exports.handler = async (event) => {
  const access = internalAccess(event);
  if (!access.ok) return access.response;
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.CALIBRATION_RESULTS_EMAIL;
  if (!apiKey || !recipient) {
    return { statusCode: 200, body: JSON.stringify({ sent: false, reason: "Email delivery is not configured" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { repName, repInitials, scenarioTitle, outcome, missed, timestamp } = payload;
  if (!repName || !scenarioTitle || !outcome) {
    return { statusCode: 400, body: "Missing required fields" };
  }

  const missedList = Array.isArray(missed) ? missed : [];
  const missedHtml = missedList.length
    ? `<ul>${missedList.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "<p>None — all required actions checked, no do-not-do items triggered.</p>";

  const html = `
    <h2>MDB Calibration Training Result</h2>
    <p><strong>Rep:</strong> ${escapeHtml(repName)} (${escapeHtml(repInitials || "")})</p>
    <p><strong>Scenario:</strong> ${escapeHtml(scenarioTitle)}</p>
    <p><strong>Automatic outcome:</strong> ${escapeHtml(outcome)}</p>
    <p><strong>Submitted:</strong> ${escapeHtml(timestamp || "")}</p>
    <p><strong>Issues flagged:</strong></p>
    ${missedHtml}
    <p style="color:#667">Demo submission from the MDB Calibration Training workspace. Review and set the final decision in the Admin Console.</p>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "MDB Calibration Training <onboarding@resend.dev>",
        to: [recipient],
        subject: `Calibration Training result — ${repName} — ${scenarioTitle} — ${outcome}`,
        html,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      return { statusCode: 502, body: JSON.stringify({ sent: false, reason: detail }) };
    }
    return { statusCode: 200, body: JSON.stringify({ sent: true }) };
  } catch (error) {
    return { statusCode: 502, body: JSON.stringify({ sent: false, reason: String(error) }) };
  }
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
