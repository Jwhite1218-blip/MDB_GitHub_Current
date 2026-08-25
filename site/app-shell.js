"use strict";

(() => {
  const installButton = document.getElementById("installAppButton");
  const networkStatus = document.getElementById("networkStatus");
  const updateNotice = document.getElementById("appUpdateNotice");
  const applyUpdateButton = document.getElementById("applyAppUpdateButton");
  const dismissUpdateButton = document.getElementById("dismissAppUpdateButton");
  let installPrompt = null;
  let waitingWorker = null;
  let updateWasRequested = false;

  function isInstalled() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function updateNetworkStatus() {
    if (!networkStatus) return;
    networkStatus.textContent = navigator.onLine ? "Online" : "Offline — cached view";
    networkStatus.classList.toggle("is-offline", !navigator.onLine);
  }

  function updateInstallButton() {
    if (!installButton) return;
    installButton.hidden = isInstalled() || !installPrompt;
  }

  function showUpdate(worker) {
    waitingWorker = worker;
    if (updateNotice) updateNotice.hidden = false;
  }

  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    updateInstallButton();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    updateInstallButton();
  });

  installButton?.addEventListener("click", async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    updateInstallButton();
  });

  applyUpdateButton?.addEventListener("click", () => {
    if (!waitingWorker) return;
    updateWasRequested = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  });
  dismissUpdateButton?.addEventListener("click", () => {
    if (updateNotice) updateNotice.hidden = true;
  });

  updateNetworkStatus();
  updateInstallButton();

  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
      if (registration.waiting) showUpdate(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate(worker);
        });
      });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (updateWasRequested) window.location.reload();
      });
    } catch (error) {
      console.warn("MDB app shell could not register offline support.", error);
    }
  });
})();
