// Computes the V1 admin Reports numbers: YTD vs last year, month-to-date vs
// the same date range last year, and Tooling-specific revenue/quantity
// growth (production scheduling cares about Tooling specifically, per Jon).
// Requires SUPABASE_URL and SUPABASE_SERVICE_KEY -- without them returns
// { configured: false } and the frontend shows an empty state, since these
// numbers only mean anything against the real shared order data, not
// per-browser localStorage demo orders.
//
// Pulls every order (with lines) created since Jan 1 of last year and
// buckets them in memory rather than hand-rolling SQL date-window
// aggregates -- order volume is small enough that this is simpler and safer.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const { internalAccess } = require("./_internal-access");

function lineExtended(line) {
  return Number(line.quantity || 0) * Number(line.unit_price || 0) - Number(line.discount || 0);
}

function orderTotal(order) {
  const subtotal = (order.order_lines || []).reduce((sum, line) => sum + lineExtended(line), 0);
  return subtotal + Number(order.misc || 0) + Number(order.freight || 0) - Number(order.trade_discount || 0);
}

function toolingStats(order) {
  return (order.order_lines || [])
    .filter((line) => line.category === "Tooling")
    .reduce(
      (acc, line) => {
        acc.revenue += lineExtended(line);
        acc.qty += Number(line.quantity || 0);
        return acc;
      },
      { revenue: 0, qty: 0 }
    );
}

function inRange(dateStr, start, end) {
  const t = new Date(dateStr).getTime();
  return t >= start.getTime() && t < end.getTime();
}

function summarize(orders) {
  const tooling = orders.reduce(
    (acc, order) => {
      const stats = toolingStats(order);
      acc.revenue += stats.revenue;
      acc.qty += stats.qty;
      return acc;
    },
    { revenue: 0, qty: 0 }
  );
  return {
    revenue: orders.reduce((sum, order) => sum + orderTotal(order), 0),
    orderCount: orders.length,
    tooling,
  };
}

exports.handler = async (event) => {
  const access = internalAccess(event);
  if (!access.ok) return access.response;
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 200, body: JSON.stringify({ configured: false }) };
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const startOfLastYear = new Date(Date.UTC(year - 1, 0, 1));

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?select=*,order_lines(*)&created_at=gte.${startOfLastYear.toISOString()}`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!response.ok) {
      const detail = await response.text();
      return { statusCode: 502, body: JSON.stringify({ configured: true, error: detail }) };
    }
    const orders = await response.json();

    const nowEnd = new Date(now.getTime() + 1);
    const ytdStart = new Date(Date.UTC(year, 0, 1));
    const ytdLastYearStart = new Date(Date.UTC(year - 1, 0, 1));
    const ytdLastYearEnd = new Date(Date.UTC(year - 1, now.getUTCMonth(), now.getUTCDate() + 1));
    const monthStart = new Date(Date.UTC(year, now.getUTCMonth(), 1));
    const monthLastYearStart = new Date(Date.UTC(year - 1, now.getUTCMonth(), 1));
    const monthLastYearEnd = new Date(Date.UTC(year - 1, now.getUTCMonth(), now.getUTCDate() + 1));

    const bucket = (start, end) => orders.filter((order) => inRange(order.created_at, start, end));

    return {
      statusCode: 200,
      body: JSON.stringify({
        configured: true,
        asOf: now.toISOString(),
        ytd: summarize(bucket(ytdStart, nowEnd)),
        ytdLastYear: summarize(bucket(ytdLastYearStart, ytdLastYearEnd)),
        month: summarize(bucket(monthStart, nowEnd)),
        monthLastYear: summarize(bucket(monthLastYearStart, monthLastYearEnd)),
      }),
    };
  } catch (error) {
    return { statusCode: 502, body: JSON.stringify({ configured: true, error: String(error) }) };
  }
};
