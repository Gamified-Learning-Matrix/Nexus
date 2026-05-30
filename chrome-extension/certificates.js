/**
 * certificates.js — Achievement Logic
 * Handles milestone tracking and certificate rendering for the
 * Gulf Nexus Command Center Chrome Extension.
 */

/* ── Constants ──────────────────────────────────────────────────────────── */
const CERT_STORAGE_KEY = "gnx_certificates";
const MILESTONE_STORAGE_KEY = "gnx_milestones";

/** Predefined Star Road milestones (Mario RPG / Gulf Nexus theme) */
const DEFAULT_MILESTONES = [
  { id: "star_001", label: "First Star Piece",      xp: 100,  icon: "⭐", claimed: false },
  { id: "star_002", label: "Geno Beam Calibrated",  xp: 250,  icon: "🌈", claimed: false },
  { id: "star_003", label: "Network Defender",       xp: 500,  icon: "🛡️", claimed: false },
  { id: "star_004", label: "Amazing Grace Optimized",xp: 750,  icon: "✨", claimed: false },
  { id: "star_005", label: "Sovereign Matrix Key",   xp: 1000, icon: "👑", claimed: false },
  { id: "star_006", label: "Seven Stars Complete",   xp: 1500, icon: "🌟", claimed: false },
];

/* ── Certificate store ──────────────────────────────────────────────────── */

/**
 * Load all issued certificates from chrome.storage.local.
 * @returns {Promise<Array>}
 */
function loadCertificates() {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get([CERT_STORAGE_KEY], (result) => {
        resolve(result[CERT_STORAGE_KEY] || []);
      });
    } else {
      try {
        resolve(JSON.parse(localStorage.getItem(CERT_STORAGE_KEY) || "[]"));
      } catch {
        resolve([]);
      }
    }
  });
}

/**
 * Save certificates array to chrome.storage.local.
 * @param {Array} certs
 * @returns {Promise<void>}
 */
function saveCertificates(certs) {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      /* chrome.storage.local is sandboxed to this extension.
         Certificate records are non-secret achievement metadata. */
      chrome.storage.local.set({ [CERT_STORAGE_KEY]: certs }, resolve);
    } else {
      /* Non-extension fallback: store only non-sensitive metadata fields. */
      const safeCerts = certs.map(({ id, title, uid, issuedAt, icon }) => ({ id, title, uid, issuedAt, icon }));
      localStorage.setItem(CERT_STORAGE_KEY, JSON.stringify(safeCerts));
      resolve();
    }
  });
}

/**
 * Issue a new certificate to the given user.
 * @param {string} title  - Certificate title
 * @param {string} uid    - Recipient UID (optional)
 * @returns {Promise<Object>} The new certificate record
 */
async function issueCertificate(title, uid = "guest") {
  const certs = await loadCertificates();
  const cert = {
    id:        crypto.randomUUID(),
    title:     title.trim(),
    uid,
    issuedAt:  new Date().toISOString(),
    icon:      "🎓",
  };
  certs.push(cert);
  await saveCertificates(certs);
  return cert;
}

/**
 * Delete a certificate by id.
 * @param {string} certId
 * @returns {Promise<void>}
 */
async function deleteCertificate(certId) {
  const certs = await loadCertificates();
  await saveCertificates(certs.filter((c) => c.id !== certId));
}

/**
 * Render the certificate list into a DOM container.
 * @param {HTMLElement} container
 * @param {string} currentUid
 */
async function renderCertificates(container, currentUid = "guest") {
  const certs = await loadCertificates();
  container.innerHTML = "";

  if (certs.length === 0) {
    container.innerHTML =
      '<div style="font-size:10px;color:var(--text-muted);padding:6px 0;">No certificates issued yet.</div>';
    return;
  }

  certs.forEach((cert) => {
    const el = document.createElement("div");
    el.className = "card";
    el.style.marginBottom = "6px";
    el.innerHTML = `
      <div class="card-row">
        <div class="card-icon">${cert.icon}</div>
        <div class="card-info">
          <div class="card-title">${sanitize(cert.title)}</div>
          <div class="card-desc">
            Issued: ${new Date(cert.issuedAt).toLocaleDateString()} &nbsp;·&nbsp;
            <span class="badge badge-gold">${sanitize(cert.uid)}</span>
          </div>
        </div>
        <button class="btn btn-danger" data-id="${cert.id}" title="Revoke">✕</button>
      </div>`;
    el.querySelector("[data-id]").addEventListener("click", async (e) => {
      await deleteCertificate(e.target.dataset.id);
      renderCertificates(container, currentUid);
    });
    container.appendChild(el);
  });
}

/**
 * Generate a plain-text certificate bundle for download.
 * @returns {Promise<string>}
 */
async function exportCertificatesText() {
  const certs = await loadCertificates();
  if (certs.length === 0) return "No certificates on record.";
  const lines = [
    "GULF NEXUS COMMAND CENTER — CERTIFICATE EXPORT",
    `Generated: ${new Date().toISOString()}`,
    "═".repeat(48),
    "",
  ];
  certs.forEach((c, i) => {
    lines.push(`[${i + 1}] ${c.icon}  ${c.title}`);
    lines.push(`     Issued : ${new Date(c.issuedAt).toLocaleString()}`);
    lines.push(`     UID    : ${c.uid}`);
    lines.push("");
  });
  return lines.join("\n");
}

/* ── Milestone store ────────────────────────────────────────────────────── */

/**
 * Load milestones from storage (merges defaults with saved state).
 * @returns {Promise<Array>}
 */
function loadMilestones() {
  return new Promise((resolve) => {
    const load = (saved) => {
      const savedMap = Object.fromEntries((saved || []).map((m) => [m.id, m]));
      const merged = DEFAULT_MILESTONES.map((m) =>
        savedMap[m.id] ? { ...m, ...savedMap[m.id] } : { ...m }
      );
      resolve(merged);
    };

    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get([MILESTONE_STORAGE_KEY], (r) =>
        load(r[MILESTONE_STORAGE_KEY])
      );
    } else {
      try {
        load(JSON.parse(localStorage.getItem(MILESTONE_STORAGE_KEY) || "null"));
      } catch {
        load(null);
      }
    }
  });
}

/**
 * Save milestones to storage.
 * @param {Array} milestones
 * @returns {Promise<void>}
 */
function saveMilestones(milestones) {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [MILESTONE_STORAGE_KEY]: milestones }, resolve);
    } else {
      localStorage.setItem(MILESTONE_STORAGE_KEY, JSON.stringify(milestones));
      resolve();
    }
  });
}

/**
 * Claim the next unclaimed milestone and return it (or null if all claimed).
 * @returns {Promise<Object|null>}
 */
async function claimNextMilestone() {
  const milestones = await loadMilestones();
  const next = milestones.find((m) => !m.claimed);
  if (!next) return null;
  next.claimed = true;
  next.claimedAt = new Date().toISOString();
  await saveMilestones(milestones);
  return next;
}

/**
 * Render milestones into a DOM container.
 * @param {HTMLElement} container
 */
async function renderMilestones(container) {
  const milestones = await loadMilestones();
  container.innerHTML = "";
  milestones.forEach((m) => {
    const el = document.createElement("div");
    el.className = "card";
    el.style.marginBottom = "5px";
    el.style.opacity = m.claimed ? "0.55" : "1";
    el.innerHTML = `
      <div class="card-row">
        <div class="card-icon">${m.icon}</div>
        <div class="card-info">
          <div class="card-title">${sanitize(m.label)}</div>
          <div class="card-desc">+${m.xp} XP${m.claimed ? " · ✅ Claimed" : ""}</div>
        </div>
        <span class="badge ${m.claimed ? "badge-green" : "badge-cyan"}">
          ${m.claimed ? "Done" : "Open"}
        </span>
      </div>`;
    container.appendChild(el);
  });
}

/**
 * Compute total XP earned from claimed milestones.
 * @returns {Promise<number>}
 */
async function computeXP() {
  const milestones = await loadMilestones();
  return milestones.filter((m) => m.claimed).reduce((acc, m) => acc + m.xp, 0);
}

/* ── Utility ────────────────────────────────────────────────────────────── */

/**
 * Sanitize a string for safe HTML insertion.
 * @param {string} str
 * @returns {string}
 */
function sanitize(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}
