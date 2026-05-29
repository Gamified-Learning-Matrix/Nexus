/**
 * background.js — Service Worker
 * Gulf Nexus Command Center Chrome Extension
 *
 * Handles:
 *  - Extension install / update events
 *  - Badge counter for network requests intercepted
 *  - Message passing between popup and content scripts
 */

/* ── Install / update hooks ─────────────────────────────────────────────── */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      gnx_installed_at: new Date().toISOString(),
      gnx_version: chrome.runtime.getManifest().version,
    });
    console.log("[GNX] Gulf Nexus Command Center installed.");
  } else if (details.reason === "update") {
    console.log(`[GNX] Updated to v${chrome.runtime.getManifest().version}`);
  }
});

/* ── Message handler ────────────────────────────────────────────────────── */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_VERSION") {
    sendResponse({ version: chrome.runtime.getManifest().version });
    return true;
  }
  if (message.type === "PING") {
    sendResponse({ pong: true, ts: Date.now() });
    return true;
  }
});

/* ── Network request counter (Manifest V3 compatible) ──────────────────── */
let requestCount = 0;
let lastBadgeText = "";

/* Set badge colour once at startup instead of on every request */
chrome.action.setBadgeBackgroundColor({ color: "#00f3ff" });

const monitoredUrls = chrome.runtime.getManifest().host_permissions || [];

chrome.webRequest.onCompleted.addListener(
  (_details) => {
    requestCount++;
    const text = requestCount > 99 ? "99+" : String(requestCount);
    if (text !== lastBadgeText) {
      lastBadgeText = text;
      chrome.action.setBadgeText({ text });
    }
  },
  { urls: monitoredUrls }
);

chrome.webRequest.onErrorOccurred.addListener(
  (_details) => {
    /* Silently track errors — available in popup via storage */
  },
  { urls: monitoredUrls }
);
