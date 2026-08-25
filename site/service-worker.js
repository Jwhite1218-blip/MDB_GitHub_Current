"use strict";

const SHELL_CACHE = "mdb-shell-20260825-4";
const DATA_CACHE = "mdb-static-data-20260825-4";
const CACHE_ALLOWLIST = [SHELL_CACHE, DATA_CACHE];
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/styles.css?v=20260825-4",
  "/app-shell.js?v=20260825-4",
  "/tooling-search.js?v=20260825-4",
  "/data/rig-parts.js?v=20260825-4",
  "/data/tooling.js?v=20260825-4",
  "/app.js?v=20260825-4",
  "/manifest.webmanifest?v=20260825-4",
  "/assets/mobile-drill-logo-transparent.png",
  "/assets/mdb-app-icon-192.png",
  "/assets/mdb-app-icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => !CACHE_ALLOWLIST.includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function isOperationalRequest(url) {
  return url.pathname.startsWith("/.netlify/functions/") || url.pathname.startsWith("/api/");
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put("/index.html", response.clone());
    }
    return response;
  } catch {
    return (await caches.match("/index.html")) || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isOperationalRequest(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith("/data/") || url.pathname.startsWith("/assets/")) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }
  event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
});
