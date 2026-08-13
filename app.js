/* CIS Scanner — app logic
 * Source of truth for the product list: ./products.json (edit that file on GitHub to update it).
 * Local overlay: changes made with "Marquer comme acheté" in this app are stored in
 * localStorage on THIS phone only, under key CIS_LOCAL_OVERRIDES. They are shown on the
 * "À reporter" tab so you can copy them back into products.json later.
 */

const DATA_URL = "./products.json";
const LOCAL_KEY = "CIS_LOCAL_OVERRIDES_V1";

let PRODUCTS = [];         // raw list from products.json
let MATCH_INDEX = new Map(); // match_key -> array of product indices
let OVERRIDES = {};        // upc_source -> { purchased: bool, ts: number }
let html5QrCode = null;
let scanning = false;
let lastScanTs = 0;
let lastScanCode = null;

// ---------- storage helpers ----------
function loadOverrides() {
  try {
    OVERRIDES = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
  } catch (e) {
    OVERRIDES = {};
  }
}
function saveOverrides() {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(OVERRIDES));
  renderPendingBadge();
}
function setOverride(product, purchased) {
  OVERRIDES[product.upc_source] = {
    purchased,
    ts: Date.now(),
    brand: product.brand,
    description: product.description,
    barcode: product.barcode
  };
  saveOverrides();
}
function clearOverrides() {
  OVERRIDES = {};
  saveOverrides();
  renderPendingList();
}
function effectivePurchased(product) {
  const ov = OVERRIDES[product.upc_source];
  return ov ? ov.purchased : product.purchased;
}

// ---------- data loading ----------
async function loadProducts() {
  const dbInfo = document.getElementById("dbInfo");
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    PRODUCTS = await res.json();
    buildIndex();
    dbInfo.textContent = `${PRODUCTS.length} produits chargés`;
  } catch (e) {
    dbInfo.textContent = "Erreur de chargement des données";
    console.error(e);
  }
}

function buildIndex() {
  MATCH_INDEX = new Map();
  PRODUCTS.forEach((p, i) => {
    (p.match_keys || []).forEach((k) => {
      if (!MATCH_INDEX.has(k)) MATCH_INDEX.set(k, []);
      MATCH_INDEX.get(k).push(i);
    });
  });
}

// Generate candidate lookup keys from a raw scanned/typed string, ordered
// from most specific (full digit string) to least specific (last-10).
function candidateKeys(raw) {
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 6) return [];
  const cands = new Set();
  cands.add(digits);
  if (digits.length > 1) cands.add(digits.replace(/^0+/, "")); // strip leading zero(s)
  cands.add("0" + digits); // with an added leading zero (UPC-A <-> EAN-13)
  if (digits.length > 12) cands.add(digits.slice(-12));
  if (digits.length > 10) cands.add(digits.slice(-10));
  return Array.from(cands);
}

function findProduct(raw) {
  const cands = candidateKeys(raw);
  for (const key of cands) {
    if (MATCH_INDEX.has(key)) {
      const idxs = [...new Set(MATCH_INDEX.get(key))];
      if (idxs.length === 1) return { product: PRODUCTS[idxs[0]], ambiguous: false };
      if (idxs.length > 1) return { product: PRODUCTS[idxs[0]], ambiguous: true, all: idxs.map(i => PRODUCTS[i]) };
    }
  }
  return null;
}

// ---------- screens ----------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelectorAll(".navbtn").forEach((b) => b.classList.toggle("active", b.dataset.screen === id));
  if (id === "pendingScreen") renderPendingList();
}

document.querySelectorAll(".navbtn").forEach((b) => {
  b.addEventListener("click", () => {
    if (b.dataset.screen === "scanScreen" && scanning) {
      // keep camera running if navigating back to scan tab
    }
    showScreen(b.dataset.screen);
  });
});

// ---------- feedback ----------
function feedback(kind) {
  if (navigator.vibrate) {
    if (kind === "found") navigator.vibrate(60);
    else if (kind === "notfound") navigator.vibrate([40, 60, 40]);
  }
}

// ---------- result rendering ----------
function renderResult(rawCode, match) {
  showScreen("resultScreen");
  const banner = document.getElementById("resultBanner");
  const statusEl = document.getElementById("resultStatus");
  const codeEl = document.getElementById("resultCode");
  const card = document.getElementById("resultCard");
  const notFoundCard = document.getElementById("notFoundCard");
  const markBtn = document.getElementById("markPurchasedBtn");
  const unmarkBtn = document.getElementById("markUnPurchasedBtn");

  codeEl.textContent = rawCode ? `Code scanné : ${rawCode}` : "";

  if (!match) {
    banner.className = "result-banner notfound";
    statusEl.textContent = "INTROUVABLE DANS LA BASE";
    card.hidden = true;
    notFoundCard.hidden = false;
    markBtn.hidden = true;
    unmarkBtn.hidden = true;
    feedback("notfound");
    return;
  }

  const p = match.product;
  const purchased = effectivePurchased(p);
  feedback("found");

  banner.className = "result-banner " + (purchased ? "purchased" : "tobuy");
  statusEl.textContent = purchased ? "DÉJÀ ACHETÉ" : "PAS ENCORE ACHETÉ";

  notFoundCard.hidden = true;
  card.hidden = false;
  document.getElementById("rBrand").textContent = p.brand || "—";
  document.getElementById("rSubBrand").textContent = p.sub_brand || "—";
  document.getElementById("rDesc").textContent = p.description || "(pas de description)";
  document.getElementById("rCat").textContent = p.category || "—";
  document.getElementById("rFormat").textContent = [p.format, p.ply && p.ply + "PLY", p.units && p.units + "S", p.sheets && p.sheets + "SHT"].filter(Boolean).join(" · ") || "—";
  document.getElementById("rManuf").textContent = p.manufacturer || "—";
  const ov = OVERRIDES[p.upc_source];
  document.getElementById("rStatus").textContent = ov
    ? `${p.status_raw} (modifié localement → ${ov.purchased ? "Acheté" : "À acheter"})`
    : p.status_raw;

  markBtn.hidden = purchased;
  unmarkBtn.hidden = !purchased;
  markBtn.onclick = () => { setOverride(p, true); renderResult(rawCode, match); };
  unmarkBtn.onclick = () => { setOverride(p, false); renderResult(rawCode, match); };

  if (match.ambiguous) {
    codeEl.textContent += " — plusieurs correspondances possibles, affichage de la première.";
  }
}

// ---------- pending / local overrides screen ----------
function renderPendingList() {
  const list = document.getElementById("pendingList");
  const copyBtn = document.getElementById("copyPendingBtn");
  const keys = Object.keys(OVERRIDES);
  if (keys.length === 0) {
    list.innerHTML = '<p class="muted">Aucune mise à jour locale pour l\'instant.</p>';
    copyBtn.hidden = true;
    return;
  }
  copyBtn.hidden = false;
  list.innerHTML = keys.map((upc) => {
    const o = OVERRIDES[upc];
    return `<div class="pending-item">
      <div><strong>${o.brand || ""}</strong> — ${o.description || ""}</div>
      <div class="pi-upc">UPC ${upc} → ${o.purchased ? "2 - Purchased" : "1 - To Buy"}</div>
    </div>`;
  }).join("");
}
function renderPendingBadge() {
  const n = Object.keys(OVERRIDES).length;
  const badge = document.getElementById("pendingBadge");
  badge.hidden = n === 0;
  badge.textContent = n;
}
function pendingAsText() {
  const keys = Object.keys(OVERRIDES);
  const lines = keys.map((upc) => {
    const o = OVERRIDES[upc];
    return `${upc} — ${o.brand || ""} ${o.description || ""} → ${o.purchased ? "Acheté" : "À acheter"}`;
  });
  return "Voici ce que j'ai marqué dans CIS Scanner, mets à jour le CIS Product Database:\n" + lines.join("\n");
}
document.getElementById("copyPendingBtn").addEventListener("click", async () => {
  const text = pendingAsText();
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById("copyPendingBtn");
    const original = btn.textContent;
    btn.textContent = "Copié ✓";
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch (e) {
    alert(text); // fallback: show it so it can be selected/copied manually
  }
});
document.getElementById("clearPendingBtn").addEventListener("click", () => {
  if (confirm("Effacer toutes les mises à jour locales non reportées ?")) clearOverrides();
});

// ---------- manual search ----------
const manualBtn = document.getElementById("manualBtn");
const manualPanel = document.getElementById("manualPanel");
const manualInput = document.getElementById("manualInput");
const manualResults = document.getElementById("manualResults");

manualBtn.addEventListener("click", () => {
  manualPanel.hidden = !manualPanel.hidden;
  if (!manualPanel.hidden) manualInput.focus();
});

manualInput.addEventListener("input", () => {
  const q = manualInput.value.trim().toLowerCase();
  if (q.length < 2) { manualResults.innerHTML = ""; return; }
  const isNumeric = /^\d+$/.test(q);
  let hits;
  if (isNumeric) {
    const found = findProduct(q);
    hits = found ? [found.product] : [];
  } else {
    hits = PRODUCTS.filter((p) =>
      (p.brand || "").toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      (p.sub_brand || "").toLowerCase().includes(q)
    ).slice(0, 25);
  }
  manualResults.innerHTML = hits.map((p, i) => {
    const purchased = effectivePurchased(p);
    return `<div class="manual-result-item" data-idx="${PRODUCTS.indexOf(p)}">
      <div class="mri-desc">${p.brand} — ${p.description || p.sub_brand || ""}</div>
      <div class="mri-status">${purchased ? "✅ Déjà acheté" : "🔴 À acheter"} · ${p.upc_source}</div>
    </div>`;
  }).join("") || '<p class="muted">Aucun résultat.</p>';
});

manualResults.addEventListener("click", (e) => {
  const item = e.target.closest(".manual-result-item");
  if (!item) return;
  const p = PRODUCTS[parseInt(item.dataset.idx, 10)];
  manualPanel.hidden = true;
  manualInput.value = "";
  manualResults.innerHTML = "";
  renderResult(p.upc_source, { product: p, ambiguous: false });
});

// ---------- camera scanning (html5-qrcode / ZXing) ----------
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const scanAgainBtn = document.getElementById("scanAgainBtn");

async function startScanning() {
  if (scanning) return;
  html5QrCode = new Html5Qrcode("reader", {
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
    ],
    verbose: false,
  });
  try {
    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 12, qrbox: { width: 260, height: 160 } },
      onScanSuccess,
      () => {} // ignore per-frame decode failures
    );
    scanning = true;
    startBtn.hidden = true;
    stopBtn.hidden = false;
    document.getElementById("cameraHint").textContent = "Pointe la caméra sur un code-barres";
  } catch (err) {
    document.getElementById("cameraHint").textContent =
      "Impossible d'accéder à la caméra. Vérifie les permissions dans Réglages > Safari.";
    console.error(err);
  }
}

async function stopScanning() {
  if (!scanning || !html5QrCode) return;
  try { await html5QrCode.stop(); } catch (e) {}
  scanning = false;
  startBtn.hidden = false;
  stopBtn.hidden = true;
}

function onScanSuccess(decodedText) {
  const now = Date.now();
  // debounce: ignore identical re-scans within 1.5s
  if (decodedText === lastScanCode && now - lastScanTs < 1500) return;
  lastScanCode = decodedText;
  lastScanTs = now;

  const match = findProduct(decodedText);
  renderResult(decodedText, match);
  stopScanning();
}

startBtn.addEventListener("click", startScanning);
stopBtn.addEventListener("click", stopScanning);
scanAgainBtn.addEventListener("click", () => {
  showScreen("scanScreen");
  startScanning();
});

// ---------- boot ----------
(async function init() {
  loadOverrides();
  renderPendingBadge();
  await loadProducts();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
