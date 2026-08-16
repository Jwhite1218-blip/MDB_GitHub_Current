// Looks up a real shipping rate from UPS or FedEx for an order, given its
// weight/dimensions and Ship Via selection. Requires per-carrier env vars:
//   UPS_CLIENT_ID / UPS_CLIENT_SECRET / UPS_SHIPPER_NUMBER
//   FEDEX_CLIENT_ID / FEDEX_CLIENT_SECRET / FEDEX_ACCOUNT_NUMBER
//   SHIP_FROM_ZIP (origin zip both carriers rate from)
// Whichever carrier's vars aren't set returns { configured: false } for
// that carrier specifically -- the other one can still work independently.
//
// IMPORTANT: this was built against UPS's and FedEx's documented REST rating
// APIs, but could not be exercised against a real account (no credentials
// available at build time -- see SAVE_POINT_001.md). Treat the request
// shapes below as a solid starting point, not a verified-working
// integration. First real test with live credentials will likely need
// small adjustments (exact field names/versions do shift between API
// versions).
//
// "Freight" is a negotiated LTL/broker rate in real life, not a parcel rate
// -- this function intentionally does not attempt it and returns a clear
// message instead of guessing at a number.

const UPS_CLIENT_ID = process.env.UPS_CLIENT_ID;
const UPS_CLIENT_SECRET = process.env.UPS_CLIENT_SECRET;
const UPS_SHIPPER_NUMBER = process.env.UPS_SHIPPER_NUMBER;
const FEDEX_CLIENT_ID = process.env.FEDEX_CLIENT_ID;
const FEDEX_CLIENT_SECRET = process.env.FEDEX_CLIENT_SECRET;
const FEDEX_ACCOUNT_NUMBER = process.env.FEDEX_ACCOUNT_NUMBER;
const SHIP_FROM_ZIP = process.env.SHIP_FROM_ZIP || "46227"; // Mobile Drill Intl, Indianapolis

const UPS_SERVICE_CODES = {
  "Best Way": "03", // UPS Ground
  "Next Day Air": "01",
  "NDA Early AM": "14",
  "Second Day Air": "02",
  INTL: "07", // UPS Worldwide Express -- confirm against actual lane once tested
};

const FEDEX_SERVICE_TYPES = {
  "Best Way": "FEDEX_GROUND",
  "Next Day Air": "PRIORITY_OVERNIGHT",
  "NDA Early AM": "FIRST_OVERNIGHT",
  "Second Day Air": "FEDEX_2_DAY",
  INTL: "INTERNATIONAL_PRIORITY",
};

async function getUpsToken() {
  const response = await fetch("https://onlinetools.ups.com/security/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${UPS_CLIENT_ID}:${UPS_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error(`UPS auth failed: ${await response.text()}`);
  const data = await response.json();
  return data.access_token;
}

async function rateUps({ shipVia, destZip, destState, destCountry, weightLbs, lengthIn, widthIn, heightIn }) {
  const serviceCode = UPS_SERVICE_CODES[shipVia];
  if (!serviceCode) return { available: false, reason: `No UPS mapping for "${shipVia}"` };
  const token = await getUpsToken();
  const response = await fetch("https://onlinetools.ups.com/api/rating/v2409/Rate", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      RateRequest: {
        Shipment: {
          Shipper: { ShipperNumber: UPS_SHIPPER_NUMBER, Address: { PostalCode: SHIP_FROM_ZIP, CountryCode: "US" } },
          ShipTo: { Address: { PostalCode: destZip, StateProvinceCode: destState || "", CountryCode: destCountry || "US" } },
          ShipFrom: { Address: { PostalCode: SHIP_FROM_ZIP, CountryCode: "US" } },
          Service: { Code: serviceCode },
          Package: [{
            PackagingType: { Code: "02" },
            Dimensions: { UnitOfMeasurement: { Code: "IN" }, Length: String(lengthIn || 1), Width: String(widthIn || 1), Height: String(heightIn || 1) },
            PackageWeight: { UnitOfMeasurement: { Code: "LBS" }, Weight: String(weightLbs || 1) },
          }],
        },
      },
    }),
  });
  if (!response.ok) return { available: false, reason: await response.text() };
  const data = await response.json();
  const charge = data?.RateResponse?.RatedShipment?.TotalCharges?.MonetaryValue;
  return charge ? { available: true, rate: Number(charge) } : { available: false, reason: "No rate returned" };
}

async function getFedexToken() {
  const response = await fetch("https://apis.fedex.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${FEDEX_CLIENT_ID}&client_secret=${FEDEX_CLIENT_SECRET}`,
  });
  if (!response.ok) throw new Error(`FedEx auth failed: ${await response.text()}`);
  const data = await response.json();
  return data.access_token;
}

async function rateFedex({ shipVia, destZip, destState, destCountry, weightLbs, lengthIn, widthIn, heightIn }) {
  const serviceType = FEDEX_SERVICE_TYPES[shipVia];
  if (!serviceType) return { available: false, reason: `No FedEx mapping for "${shipVia}"` };
  const token = await getFedexToken();
  const response = await fetch("https://apis.fedex.com/rate/v1/rates/quotes", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      accountNumber: { value: FEDEX_ACCOUNT_NUMBER },
      requestedShipment: {
        shipper: { address: { postalCode: SHIP_FROM_ZIP, countryCode: "US" } },
        recipient: { address: { postalCode: destZip, stateOrProvinceCode: destState || "", countryCode: destCountry || "US" } },
        serviceType,
        pickupType: "USE_SCHEDULED_PICKUP",
        requestedPackageLineItems: [{
          weight: { units: "LB", value: weightLbs || 1 },
          dimensions: { length: lengthIn || 1, width: widthIn || 1, height: heightIn || 1, units: "IN" },
        }],
      },
    }),
  });
  if (!response.ok) return { available: false, reason: await response.text() };
  const data = await response.json();
  const charge = data?.output?.rateReplyDetails?.[0]?.ratedShipmentDetails?.[0]?.totalNetCharge;
  return charge ? { available: true, rate: Number(charge) } : { available: false, reason: "No rate returned" };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { carrier, shipVia } = payload;
  if (shipVia === "Freight") {
    return { statusCode: 200, body: JSON.stringify({ configured: true, available: false, reason: "Freight is a negotiated rate, not a parcel API lookup -- enter it manually." }) };
  }

  const upsConfigured = Boolean(UPS_CLIENT_ID && UPS_CLIENT_SECRET && UPS_SHIPPER_NUMBER);
  const fedexConfigured = Boolean(FEDEX_CLIENT_ID && FEDEX_CLIENT_SECRET && FEDEX_ACCOUNT_NUMBER);

  if (carrier === "UPS" && !upsConfigured) return { statusCode: 200, body: JSON.stringify({ configured: false, carrier: "UPS" }) };
  if (carrier === "FEDEX" && !fedexConfigured) return { statusCode: 200, body: JSON.stringify({ configured: false, carrier: "FEDEX" }) };
  if (!upsConfigured && !fedexConfigured) return { statusCode: 200, body: JSON.stringify({ configured: false }) };

  try {
    const result = carrier === "FEDEX" ? await rateFedex(payload) : await rateUps(payload);
    return { statusCode: 200, body: JSON.stringify({ configured: true, ...result }) };
  } catch (error) {
    return { statusCode: 502, body: JSON.stringify({ configured: true, available: false, error: String(error) }) };
  }
};
