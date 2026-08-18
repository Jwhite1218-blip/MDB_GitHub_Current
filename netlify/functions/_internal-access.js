"use strict";

const crypto = require("node:crypto");

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function internalAccess(event) {
  const expectedToken = process.env.MDB_INTERNAL_API_TOKEN;
  if (!expectedToken) {
    return {
      ok: false,
      response: jsonResponse(403, {
        configured: false,
        publicDemo: true,
        error: "Operational data is disabled on the public portfolio deployment.",
      }),
    };
  }

  const headers = event.headers || {};
  const authorization = headers.authorization || headers.Authorization || "";
  const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const suppliedToken = headers["x-mdb-internal-token"] || bearerToken;

  if (!safeEqual(suppliedToken, expectedToken)) {
    return {
      ok: false,
      response: jsonResponse(401, {
        configured: false,
        error: "Authentication required.",
      }),
    };
  }

  return { ok: true };
}

module.exports = { internalAccess, jsonResponse };
