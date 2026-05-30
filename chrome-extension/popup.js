/**
 * popup.js — Logic Hub
 * Gulf Nexus Command Center Chrome Extension
 *
 * Integrates: adminKeys.js · certificates.js · Firebase Auth (stub) ·
 *             GitHub API · Job-board search · Network scanner ·
 *             Password manager · DNS lookup
 */

/* ── DOM helpers ────────────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

/* ── App state ──────────────────────────────────────────────────────────── */
let currentUser   = null;   // Firebase user object (or null)
let currentUid    = "";
let currentToken  = "";
let arcadeScore   = 0;
let arcadeLevel   = 1;
let arcadeHealth  = 100;
let arcadeExp     = 0;

/* ── Tab navigation ─────────────────────────────────────────────────────── */
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(`panel-${btn.dataset.tab}`).classList.add("active");
  });
});

/* ── Online status ──────────────────────────────────────────────────────── */
function updateOnlineStatus() {
  const online = navigator.onLine;
  const dot    = $("onlineDot");
  const label  = $("onlineLabel");
  dot.style.background   = online ? "var(--cyan)"    : "#ff5555";
  dot.style.boxShadow    = online ? "var(--glow-cyan)": "0 0 8px rgba(255,85,85,0.55)";
  label.textContent      = online ? "Online"         : "Offline";
  label.style.color      = online ? "var(--cyan-dim)" : "#ff5555";
}
window.addEventListener("online",  updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
updateOnlineStatus();

/* ══════════════════════════════════════════════════════════════════════════
   CAREER TAB
   ══════════════════════════════════════════════════════════════════════ */

/* ── Arcade stats ───────────────────────────────────────────────────────── */
async function refreshArcadeStats() {
  const xp    = await computeXP();
  arcadeExp   = xp;
  arcadeLevel = Math.floor(xp / 1000) + 1;
  arcadeScore = xp * 10;

  $("statScore").textContent  = arcadeScore.toLocaleString();
  $("statLevel").textContent  = arcadeLevel;
  $("statHealth").textContent = arcadeHealth + "%";
  $("statExp").textContent    = arcadeExp;

  const cap = arcadeLevel * 1000;
  const pct = Math.min(100, ((xp % 1000) / 1000) * 100).toFixed(1);
  $("xpLabel").textContent    = `${xp % 1000} / 1000`;
  $("xpBar").style.width      = pct + "%";
}

/* ── Milestones ─────────────────────────────────────────────────────────── */
async function refreshMilestones() {
  await renderMilestones($("milestoneList"));
  await refreshArcadeStats();
}

$("btnClaimMilestone").addEventListener("click", async () => {
  const milestone = await claimNextMilestone();
  if (!milestone) {
    showToast("All milestones claimed! 🌟", "gold");
  } else {
    await issueCertificate(`Star Milestone: ${milestone.label}`, currentUid || "guest");
    showToast(`⭐ Claimed: ${milestone.label} (+${milestone.xp} XP)`, "cyan");
    await refreshMilestones();
    await renderCertificates($("certList"), currentUid || "guest");
  }
});

/* ── GitHub ─────────────────────────────────────────────────────────────── */
$("btnFetchRepos").addEventListener("click", async () => {
  const username = $("ghUsername").value.trim();
  if (!username) { $("repoOutput").textContent = "❌ Enter a GitHub username."; return; }

  $("repoOutput").textContent = "⏳ Fetching repositories…";
  try {
    const res  = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=10`);
    if (!res.ok) throw new Error(`GitHub API: ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (!data.length) { $("repoOutput").textContent = "No public repositories found."; return; }
    $("repoOutput").textContent = data.map(
      (r, i) => `${i + 1}. [${r.stargazers_count}⭐] ${r.full_name}\n   ${r.description || "—"}`
    ).join("\n\n");
  } catch (err) {
    $("repoOutput").textContent = `❌ ${err.message}`;
  }
});

$("btnOpenGitHub").addEventListener("click", () => {
  const username = $("ghUsername").value.trim();
  const url = username
    ? `https://github.com/${encodeURIComponent(username)}`
    : "https://github.com/Gamified-Learning-Matrix";
  openTab(url);
});

/* ── Job boards ─────────────────────────────────────────────────────────── */
function buildJobSearchUrl(board, keywords) {
  const q = encodeURIComponent(keywords || "");
  const urls = {
    linkedin:  `https://www.linkedin.com/jobs/search/?keywords=${q}`,
    indeed:    `https://www.indeed.com/jobs?q=${q}`,
    glassdoor: `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${q}`,
  };
  return urls[board];
}

$("btnLinkedIn").addEventListener("click", () =>
  openTab(buildJobSearchUrl("linkedin", $("jobKeywords").value.trim())));
$("btnIndeed").addEventListener("click", () =>
  openTab(buildJobSearchUrl("indeed", $("jobKeywords").value.trim())));
$("btnGlassdoor").addEventListener("click", () =>
  openTab(buildJobSearchUrl("glassdoor", $("jobKeywords").value.trim())));

/* ══════════════════════════════════════════════════════════════════════════
   DEFENSE TAB
   ══════════════════════════════════════════════════════════════════════ */

/* ── Network scanner ────────────────────────────────────────────────────── */
let requestCount = 0;
let blockedCount = 0;

$("btnScanPage").addEventListener("click", async () => {
  $("netOutput").textContent = "⏳ Scanning current tab…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url   = new URL(tab.url);
    requestCount++;
    $("netReqs").textContent    = requestCount;
    $("netOutput").textContent  =
      `✅ Active Tab:\n  Title : ${tab.title}\n  Host  : ${url.hostname}\n  Proto : ${url.protocol}\n  Path  : ${url.pathname}\n\nStatus: Reachable — no anomalies detected.`;
  } catch (err) {
    $("netOutput").textContent = `❌ ${err.message}`;
  }
});

$("btnClearNet").addEventListener("click", () => {
  requestCount = 0;
  blockedCount = 0;
  $("netReqs").textContent   = 0;
  $("netBlocked").textContent = 0;
  $("netOutput").textContent  = "— log cleared —";
});

/* ── DNS lookup ─────────────────────────────────────────────────────────── */
$("btnDnsLookup").addEventListener("click", async () => {
  const host = $("dnsHost").value.trim();
  if (!host) { $("dnsOutput").textContent = "❌ Enter a hostname."; return; }
  $("dnsOutput").textContent = `⏳ Resolving ${host}…`;
  try {
    /* Use Google's DoH JSON API — available in extension context */
    const res  = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`);
    if (!res.ok) throw new Error(`DNS API ${res.status}`);
    const data = await res.json();
    const answers = (data.Answer || []).map((a) => `  ${a.type === 1 ? "A  " : "   "} ${a.data}`);
    $("dnsOutput").textContent = answers.length
      ? `Hostname : ${host}\n\nRecords:\n${answers.join("\n")}\n\nStatus   : ${data.Status === 0 ? "NOERROR" : data.Status}`
      : `No A records found for ${host}`;
  } catch (err) {
    $("dnsOutput").textContent = `❌ ${err.message}`;
  }
});

/* ── Authentication (Firebase stub) ────────────────────────────────────── */
$("btnSignIn").addEventListener("click", async () => {
  const email    = $("authEmail").value.trim();
  const password = $("authPassword").value;
  if (!email || !password) {
    showAuthStatus("❌ Email and password are required.", "red");
    return;
  }

  showAuthStatus("⏳ Signing in…", "cyan");

  /* --- Firebase REST Auth sign-in --- */
  const config = await loadFirebaseConfig();
  if (!config || !config.apiKey) {
    /* Demo mode — store credentials locally only */
    currentUser  = { email, uid: `local_${crypto.randomUUID().slice(0, 8)}` };
    currentUid   = currentUser.uid;
    currentToken = "";
    onSignedIn(email);
    showAuthStatus(`✅ Signed in (demo mode): ${email}`, "green");
    return;
  }

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      showAuthStatus(`❌ ${data.error?.message || "Authentication failed."}`, "red");
      return;
    }
    currentUser  = data;
    currentUid   = data.localId;
    currentToken = data.idToken;
    onSignedIn(email);
    showAuthStatus(`✅ Signed in as ${email}`, "green");
  } catch (err) {
    showAuthStatus(`❌ ${err.message}`, "red");
  }
});

$("btnPasskey").addEventListener("click", async () => {
  if (!window.PublicKeyCredential) {
    showAuthStatus("❌ WebAuthn not supported in this context.", "red");
    return;
  }
  showAuthStatus("🪪 Passkey authentication initiated (stub).", "cyan");
  /* Full WebAuthn implementation requires a registered credential and
     a relying-party server. Wire up your RP server URL here. */
});

$("btnSignOut").addEventListener("click", () => {
  currentUser  = null;
  currentUid   = "";
  currentToken = "";
  onSignedOut();
  showAuthStatus("⏏ Signed out.", "cyan");
});

function onSignedIn(email) {
  $("footerUser").textContent     = email;
  $("sovereignIdentity").textContent = `✅ Authenticated: ${email}`;
  $("sovereignIdentity").className   = "alert alert-green";
  refreshCertificatesPanel();
}

function onSignedOut() {
  $("footerUser").textContent     = "— Guest —";
  $("sovereignIdentity").textContent = "⚠️ Not authenticated. Sign in via Defense tab.";
  $("sovereignIdentity").className   = "alert alert-gold";
}

function showAuthStatus(msg, type = "cyan") {
  const el = $("authStatus");
  el.style.display = "block";
  el.className     = `alert alert-${type} mt8`;
  el.textContent   = msg;
}

/* ── Password manager ───────────────────────────────────────────────────── */
const PW_STORE_KEY = "gnx_passwords";

function loadPasswords() {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get([PW_STORE_KEY], (r) => resolve(r[PW_STORE_KEY] || {}));
    } else {
      try { resolve(JSON.parse(localStorage.getItem(PW_STORE_KEY) || "{}")); }
      catch { resolve({}); }
    }
  });
}

function savePasswords(data) {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      /* chrome.storage.local is sandboxed to this extension.
         Passwords are stored here as a local credential vault only;
         they are never transmitted externally. For production deployments,
         consider encrypting secrets with the Web Crypto API before storage. */
      chrome.storage.local.set({ [PW_STORE_KEY]: data }, resolve);
    } else {
      /* Non-extension fallback: store only labels/metadata, not the secrets. */
      const safeData = Object.fromEntries(
        Object.entries(data).map(([label, { savedAt }]) => [label, { savedAt }])
      );
      localStorage.setItem(PW_STORE_KEY, JSON.stringify(safeData));
      resolve();
    }
  });
}

$("btnSavePassword").addEventListener("click", async () => {
  const label  = $("pwLabel").value.trim();
  const secret = $("pwSecret").value;
  if (!label) { $("pwOutput").textContent = "❌ Enter a site label."; return; }
  const store = await loadPasswords();
  store[label] = { secret, savedAt: new Date().toISOString() };
  await savePasswords(store);
  $("pwOutput").textContent = `✅ Saved: ${label}`;
  $("pwLabel").value  = "";
  $("pwSecret").value = "";
});

$("btnLoadPasswords").addEventListener("click", async () => {
  const store   = await loadPasswords();
  const entries = Object.entries(store);
  $("pwOutput").textContent = entries.length
    ? entries.map(([label, d]) =>
        `● ${label}\n  Saved: ${new Date(d.savedAt).toLocaleDateString()}`
      ).join("\n\n")
    : "No passwords stored.";
});

/* ══════════════════════════════════════════════════════════════════════════
   SOVEREIGN TAB
   ══════════════════════════════════════════════════════════════════════ */

/* ── Admin keys ─────────────────────────────────────────────────────────── */
$("btnWriteAdminKey").addEventListener("click", async () => {
  const uid  = $("ownerUid").value.trim();
  const tier = $("adminTier").value;
  $("adminKeyOutput").textContent = "⏳ Writing admin key…";
  const msg = await writeAdminKey(uid, tier, currentToken);
  $("adminKeyOutput").textContent = msg;
});

$("btnReadAdminKeys").addEventListener("click", async () => {
  $("adminKeyOutput").textContent = "⏳ Loading admin keys…";
  const { lines } = await readAdminKeys(currentToken);
  $("adminKeyOutput").textContent = lines.join("\n");
});

/* ── Certificates panel ─────────────────────────────────────────────────── */
async function refreshCertificatesPanel() {
  await renderCertificates($("certList"), currentUid || "guest");
}

$("btnIssueCert").addEventListener("click", async () => {
  const title = $("certTitle").value.trim();
  if (!title) return;
  await issueCertificate(title, currentUid || "guest");
  $("certTitle").value = "";
  await refreshCertificatesPanel();
  showToast(`🎓 Certificate issued: ${title}`, "gold");
});

$("btnDownloadCerts").addEventListener("click", async () => {
  const text = await exportCertificatesText();
  const blob = new Blob([text], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `gnx-certificates-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

/* ── Repo optimization ──────────────────────────────────────────────────── */
$("btnAnalyzeRepo").addEventListener("click", async () => {
  const repo = $("repoTarget").value.trim();
  if (!repo) { $("repoAnalyzeOutput").textContent = "❌ Enter a repo (owner/name)."; return; }
  $("repoAnalyzeOutput").textContent = `⏳ Analyzing ${repo}…`;
  try {
    const res  = await fetch(`https://api.github.com/repos/${repo.split("/").map(encodeURIComponent).join("/")}`);
    if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
    const r = await res.json();
    $("repoAnalyzeOutput").textContent =
      `Repository  : ${r.full_name}\n` +
      `Description : ${r.description || "—"}\n` +
      `Stars       : ${r.stargazers_count}\n` +
      `Forks       : ${r.forks_count}\n` +
      `Open Issues : ${r.open_issues_count}\n` +
      `Language    : ${r.language || "—"}\n` +
      `License     : ${r.license?.spdx_id || "—"}\n` +
      `Last Push   : ${new Date(r.pushed_at).toLocaleDateString()}\n\n` +
      `✨ Amazing Grace Optimization Score: ${computeRepoScore(r)}/100`;
  } catch (err) {
    $("repoAnalyzeOutput").textContent = `❌ ${err.message}`;
  }
});

$("btnOpenRepo").addEventListener("click", () => {
  const repo = $("repoTarget").value.trim();
  openTab(repo ? `https://github.com/${repo}` : "https://github.com/GulfNexus");
});

/**
 * Compute a simple "Amazing Grace" optimization score for a repo.
 * @param {Object} repo - GitHub API repo object
 * @returns {number} 0–100
 */
function computeRepoScore(repo) {
  let score = 0;
  if (repo.description)          score += 15;
  if (repo.license)              score += 15;
  if (repo.has_wiki)             score += 5;
  if (repo.has_issues)           score += 10;
  if (repo.open_issues_count < 5) score += 10;
  if (repo.stargazers_count > 0) score += 10;
  if (repo.forks_count > 0)      score += 10;
  if (repo.topics?.length > 0)   score += 10;
  const daysSincePush = (Date.now() - new Date(repo.pushed_at)) / 86400000;
  if (daysSincePush < 30)        score += 15;
  return Math.min(100, score);
}

/* ══════════════════════════════════════════════════════════════════════════
   SHARED UTILITIES
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Open a URL in a new tab (Chrome extension context).
 * @param {string} url
 */
function openTab(url) {
  if (typeof chrome !== "undefined" && chrome.tabs) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, "_blank", "noopener");
  }
}

/**
 * Show a brief toast message by flashing the online status label.
 * (Lightweight — avoids adding a separate toast container.)
 * @param {string} msg
 * @param {"cyan"|"gold"|"magenta"} type
 */
function showToast(msg, type = "cyan") {
  const el = document.createElement("div");
  el.style.cssText = `
    position: fixed; bottom: 36px; left: 50%; transform: translateX(-50%);
    background: var(--bg-panel);
    border: 1px solid var(--${type === "cyan" ? "cyan" : type === "gold" ? "gold" : "magenta"});
    color: var(--${type === "cyan" ? "cyan" : type === "gold" ? "gold" : "magenta"});
    font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
    padding: 6px 14px; border-radius: 20px; z-index: 999;
    box-shadow: 0 0 10px rgba(0,0,0,0.6);
    white-space: nowrap;
  `;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ── Stub for loadFirebaseConfig (mirrors adminKeys.js — avoids duplication) */
async function loadFirebaseConfig() {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(["gnx_firebase_config"], (r) =>
        resolve(r["gnx_firebase_config"] || null)
      );
    } else {
      resolve(null);
    }
  });
}

/* ── Init ───────────────────────────────────────────────────────────────── */
(async function init() {
  await refreshMilestones();
  await refreshCertificatesPanel();
})();
