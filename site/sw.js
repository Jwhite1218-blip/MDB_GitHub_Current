"use strict";
const CACHE = "mdb-shell-v1";
const SHELL = ["./","./index.html","./manifest.webmanifest","./shell.js","./shell.css","./assets/app-icon-512.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then(function (r) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put("./index.html", cp); }); return r; }).catch(function () { return caches.match("./index.html").then(function (m) { return m || caches.match("./"); }); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (cached) {
    var network = fetch(req).then(function (r) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, cp); }); return r; }).catch(function () { return cached; });
    return cached || network;
  }));
});