# Installable Application Shell

## Outcome

MDB remains a web application and can now be installed by a supporting desktop
or mobile browser as a Progressive Web App. Installed mode opens in a standalone
window with its own app icon and without normal browser chrome.

This is the lowest-risk desktop structure for the current vanilla-JavaScript
application. It does not introduce Electron, a second app codebase, or a native
release pipeline. A native wrapper remains an option later if MDB needs device,
filesystem, printer, scanner, or managed-deployment access that a PWA cannot
provide.

## Components

- `manifest.webmanifest`: identity, standalone display, colors, and 192/512 icons.
- `app-shell.js`: install prompt, network status, service-worker registration,
  and user-controlled update activation.
- `service-worker.js`: versioned shell/static-data caches and offline navigation.
- `System & Sync`: visible application mode, connection, startup timing, GP
  authority boundary, run history, and successful watermarks.

The hard-hat gopher in Mobile Drill colors is used as the provisional installed
app icon. It does not replace the Mobile Drill header logo. Its non-deployed
source is `docs/architecture/assets/mdb-app-icon-source.png`; the generated
192/512 files are in `site/assets/` and can be swapped without changing
application code.

## Cache and truth rules

The service worker may cache:

- the application shell;
- the public logo and app icons;
- browser-ready static catalog/BOM JSON after it is requested.

The service worker never intercepts:

- `/.netlify/functions/*`;
- `/api/*`;
- non-GET requests;
- cross-origin requests.

Therefore cached static data can support navigation while offline, but the UI
cannot present a cached operational API response as current Inventory,
Production Control, or GP status.

## Update behavior

A newly deployed service worker installs in the background. If the current page
is controlled by an older version, MDB shows “A tested MDB update is ready.” The
employee chooses `Update & restart` or `Later`. MDB reloads only after the user
chooses the update, reducing the chance of interrupting active quote/order work.

`service-worker.js` and `index.html` are served with no-cache headers so the
browser can discover a new version. Versioned static assets may remain cached.

## Performance changes included

After the two required catalog files are parsed, independent Inventory, Quote,
Order, Build, Item, and IndexedDB attachment loads now run concurrently. Item
part-number identity also uses a `Map` rather than scanning the full Item list on
each lookup. The System & Sync workspace displays the measured browser startup
duration for observation; it is not a synthetic benchmark.

The large source-derived JSON files and monolithic `app.js` remain known future
optimization targets. They were not split in this pass because an unmeasured
rewrite would add deployment risk across already-working Sales and Production
Control behavior.

## Installation and test conditions

Installability requires HTTPS in deployment or localhost during development.
Serve `site/` over HTTP; direct `file://` use is unsupported.

Validation should include:

1. Browser view and installed standalone view.
2. Desktop and mobile layouts.
3. First load, reload, and update-ready behavior.
4. Offline reload after the shell and catalog data have been cached once.
5. Proof that `/api/*` and `/.netlify/functions/*` requests bypass the cache.
6. Quote/order/build regression tests before each promotion.
