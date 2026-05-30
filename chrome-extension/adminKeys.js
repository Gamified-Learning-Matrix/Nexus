/**
 * adminKeys.js — Admin Key Management
 * Handles OWNER_UID / SUPER_ADMIN key write/read against the Firebase
 * Realtime Database under the /admin_keys/ path.
 *
 * Firebase Database rules required:
 *   {
 *     "rules": {
 *       "admin_keys": {
 *         ".write": "auth.uid === '<OWNER_UID>'",
 *         ".read":  "auth.token.role === 'SUPER_ADMIN' || auth.uid === '<OWNER_UID>'"
 *       }
 *     }
 *   }
 */

/* ── Firebase stub ──────────────────────────────────────────────────────────
   Replace FIREBASE_CONFIG with your project's actual config.
   The extension keeps the config in chrome.storage.local so it is not
   hard-coded in the source tree.
─────────────────────────────────────────────────────────────────────────── */

const ADMIN_KEY_STORAGE_KEY   = "gnx_admin_keys";
const FIREBASE_CONFIG_STORAGE = "gnx_firebase_config";

/**
 * Admin role tiers and their numeric privilege levels.
 * Higher numbers indicate greater access:
 *  - OWNER (100)      : Full read/write access to /admin_keys/ and all Firebase paths.
 *  - SUPER_ADMIN (80) : Read access to /admin_keys/; can manage ADMIN and MODERATOR roles.
 *  - ADMIN (50)       : Standard administration; cannot manage higher tiers.
 *  - MODERATOR (20)   : Limited moderation actions only.
 * @readonly
 */
const ADMIN_TIERS = Object.freeze({
  OWNER:       100,
  SUPER_ADMIN:  80,
  ADMIN:        50,
  MODERATOR:    20,
});

/* ── Local admin-key cache (used when Firebase is unavailable) ─────────── */

/**
 * Load the local admin-key cache from chrome.storage.local.
 * @returns {Promise<Object>}
 */
function loadAdminKeysLocal() {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get([ADMIN_KEY_STORAGE_KEY], (r) =>
        resolve(r[ADMIN_KEY_STORAGE_KEY] || {})
      );
    } else {
      try {
        resolve(JSON.parse(localStorage.getItem(ADMIN_KEY_STORAGE_KEY) || "{}"));
      } catch {
        resolve({});
      }
    }
  });
}

/**
 * Save admin keys to the local cache.
 * @param {Object} keys
 * @returns {Promise<void>}
 */
function saveAdminKeysLocal(keys) {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [ADMIN_KEY_STORAGE_KEY]: keys }, resolve);
    } else {
      localStorage.setItem(ADMIN_KEY_STORAGE_KEY, JSON.stringify(keys));
      resolve();
    }
  });
}

/* ── Firebase Realtime Database helpers ─────────────────────────────────── */

/**
 * Attempt to load the saved Firebase config from storage.
 * @returns {Promise<Object|null>}
 */
function loadFirebaseConfig() {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get([FIREBASE_CONFIG_STORAGE], (r) =>
        resolve(r[FIREBASE_CONFIG_STORAGE] || null)
      );
    } else {
      resolve(null);
    }
  });
}

/**
 * Attempt to write an admin key to Firebase RTDB via the REST API.
 * Falls back gracefully to local storage if Firebase is not configured.
 *
 * @param {string} uid       - Target user UID
 * @param {string} tier      - One of ADMIN_TIERS keys
 * @param {string} idToken   - Firebase ID token of the OWNER
 * @returns {Promise<{ok:boolean, message:string}>}
 */
async function writeAdminKeyFirebase(uid, tier, idToken) {
  const config = await loadFirebaseConfig();
  if (!config || !config.databaseURL) {
    return { ok: false, message: "Firebase not configured — saved locally only." };
  }

  const url = `${config.databaseURL}/admin_keys/${uid}.json?auth=${idToken}`;
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier,
        privilege: ADMIN_TIERS[tier] ?? 0,
        updatedAt: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, message: `Firebase error ${res.status}: ${body}` };
    }
    return { ok: true, message: `Key written to Firebase for UID ${uid} (${tier})` };
  } catch (err) {
    return { ok: false, message: `Network error: ${err.message}` };
  }
}

/**
 * Attempt to read admin keys from Firebase RTDB via the REST API.
 * Falls back to local cache if Firebase is unavailable.
 *
 * @param {string} idToken - Firebase ID token of OWNER or SUPER_ADMIN
 * @returns {Promise<{ok:boolean, data:Object|null, message:string}>}
 */
async function readAdminKeysFirebase(idToken) {
  const config = await loadFirebaseConfig();
  if (!config || !config.databaseURL) {
    const local = await loadAdminKeysLocal();
    return { ok: true, data: local, message: "Loaded from local cache (Firebase not configured)." };
  }

  const url = `${config.databaseURL}/admin_keys.json?auth=${idToken}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, data: null, message: `Firebase error ${res.status}: ${body}` };
    }
    const data = await res.json();
    return { ok: true, data: data || {}, message: "Loaded from Firebase." };
  } catch (err) {
    const local = await loadAdminKeysLocal();
    return { ok: true, data: local, message: `Firebase unreachable — local cache. (${err.message})` };
  }
}

/* ── High-level API ─────────────────────────────────────────────────────── */

/**
 * Write an admin key (local + Firebase if available).
 *
 * @param {string} uid     - Target UID
 * @param {string} tier    - Admin tier string
 * @param {string} idToken - Auth token (from Firebase Auth)
 * @returns {Promise<string>} Human-readable result message
 */
async function writeAdminKey(uid, tier, idToken = "") {
  if (!uid || !tier) return "❌ UID and tier are required.";
  if (!(tier in ADMIN_TIERS)) return `❌ Unknown tier "${tier}". Valid: ${Object.keys(ADMIN_TIERS).join(", ")}`;

  /* Always persist locally */
  const local = await loadAdminKeysLocal();
  local[uid] = {
    tier,
    privilege: ADMIN_TIERS[tier],
    updatedAt: new Date().toISOString(),
  };
  await saveAdminKeysLocal(local);

  /* Also push to Firebase when a token is provided */
  if (idToken) {
    const fbResult = await writeAdminKeyFirebase(uid, tier, idToken);
    return fbResult.ok
      ? `✅ ${fbResult.message}`
      : `⚠️ Saved locally. ${fbResult.message}`;
  }

  return `✅ Admin key saved locally: ${uid} → ${tier}`;
}

/**
 * Read all admin keys (Firebase if available, else local).
 *
 * @param {string} idToken - Auth token (OWNER or SUPER_ADMIN)
 * @returns {Promise<{lines:string[], raw:Object}>}
 */
async function readAdminKeys(idToken = "") {
  const result = await readAdminKeysFirebase(idToken);
  const data = result.data || {};
  const raw = data;

  const lines = [`[${result.message}]`, ""];
  const entries = Object.entries(data);
  if (entries.length === 0) {
    lines.push("No admin keys found.");
  } else {
    entries.forEach(([uid, info]) => {
      lines.push(`UID : ${uid}`);
      lines.push(`Tier: ${info.tier}  (privilege ${info.privilege})`);
      lines.push(`Date: ${info.updatedAt || "—"}`);
      lines.push("");
    });
  }

  return { lines, raw };
}

/**
 * Format admin key data as printable text lines.
 * @param {Object} raw
 * @returns {string[]}
 */
function formatAdminKeys(raw) {
  const entries = Object.entries(raw || {});
  if (entries.length === 0) return ["No admin keys on record."];
  return entries.flatMap(([uid, info]) => [
    `● ${uid}`,
    `  Tier : ${info.tier}  (lv ${info.privilege})`,
    `  Date : ${info.updatedAt || "—"}`,
    "",
  ]);
}
