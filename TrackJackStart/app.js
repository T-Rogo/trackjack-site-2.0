// ============================
// Track Jack - Upgraded (FREE Map)
// Leaflet + OpenStreetMap
// localStorage fallback + optional Firebase (login + cloud)
// ============================

/**
 * LOGIN + CLOUD (Firebase) NOTE
 * - This runs fine in Guest mode with localStorage.
 * - If you want login + cloud sync, paste your Firebase config below and enable it.
 * - I did NOT invent keys. You’ll paste them from Firebase console.
 */
const FIREBASE_ENABLED = false; // <- set true after you add config
const firebaseConfig = {
  // apiKey: "",
  // authDomain: "",
  // projectId: "",
  // storageBucket: "",
  // messagingSenderId: "",
  // appId: ""
};

// Local storage keys
const LS_CASINOS = "tj_casinos_v2";
const LS_VISITS  = "tj_visits_v2";

let map;
let markers = [];
let selectedCasinoId = null;

let addCasinoMode = false;
let pendingLatLng = null;

// ------- Utilities -------
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function money(n) {
  const sign = n < 0 ? "-" : "";
  const val = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return `${sign}$${val}`;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function monthKey(isoDate) {
  if (!isoDate || isoDate.length < 7) return "Unknown";
  return isoDate.slice(0, 7); // YYYY-MM
}

function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ------- Storage (Guest mode) -------
function loadCasinos() {
  const raw = localStorage.getItem(LS_CASINOS);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
function saveCasinos(casinos) {
  localStorage.setItem(LS_CASINOS, JSON.stringify(casinos));
}
function loadVisits() {
  const raw = localStorage.getItem(LS_VISITS);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
function saveVisits(visits) {
  localStorage.setItem(LS_VISITS, JSON.stringify(visits));
}

// ------- Optional Firebase (scaffold) -------
let cloud = {
  enabled: false,
  user: null,
  async init() {},
  async login(email, password) { throw new Error("Firebase not enabled"); },
  async logout() {},
  async pull() { return null; },
  async push() {}
};

// ------- UI Elements -------
const panelTitle = document.getElementById("panelTitle");
const panelSubtitle = document.getElementById("panelSubtitle");
const statNet = document.getElementById("statNet");
const statVisits = document.getElementById("statVisits");
const visitsList = document.getElementById("visitsList");

const btnAddCasino = document.getElementById("btnAddCasino");
const btnAddVisit = document.getElementById("btnAddVisit");
const btnAddVisitQuick = document.getElementById("btnAddVisitQuick");
const btnEditCasino = document.getElementById("btnEditCasino");
const btnDeleteCasino = document.getElementById("btnDeleteCasino");

const btnLocate = document.getElementById("btnLocate");

const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");
const fileImport = document.getElementById("fileImport");
const btnReset = document.getElementById("btnReset");

const casinoSearch = document.getElementById("casinoSearch");
const searchResults = document.getElementById("searchResults");

const tabMap = document.getElementById("tabMap");
const tabAnalytics = document.getElementById("tabAnalytics");
const viewMap = document.getElementById("viewMap");
const viewAnalytics = document.getElementById("viewAnalytics");

const gameFilter = document.getElementById("gameFilter");
const dateFilter = document.getElementById("dateFilter");

// Analytics elements
const kpiTotalNet = document.getElementById("kpiTotalNet");
const kpiTotalVisits = document.getElementById("kpiTotalVisits");
const kpiTotalCasinos = document.getElementById("kpiTotalCasinos");
const tableCasino = document.getElementById("tableCasino");
const tableGame = document.getElementById("tableGame");
const tableMonth = document.getElementById("tableMonth");

const syncHint = document.getElementById("syncHint");

// Bottom sheet elements
const sheetBackdrop = document.getElementById("sheetBackdrop");
const sheet = document.getElementById("sheet");
const sheetTitle = document.getElementById("sheetTitle");
const sheetSub = document.getElementById("sheetSub");
const sheetClose = document.getElementById("sheetClose");

const sheetCasino = document.getElementById("sheetCasino");
const sheetVisit = document.getElementById("sheetVisit");
const sheetLogin = document.getElementById("sheetLogin");

// Casino form (sheet)
const casinoName = document.getElementById("casinoName");
const casinoNotes = document.getElementById("casinoNotes");
const casinoLat = document.getElementById("casinoLat");
const casinoLng = document.getElementById("casinoLng");
const casinoCancel = document.getElementById("casinoCancel");
const casinoSave = document.getElementById("casinoSave");

// Visit form (sheet)
const visitCasino = document.getElementById("visitCasino");
const visitDate = document.getElementById("visitDate");
const visitGame = document.getElementById("gameSelect");
const visitAmount = document.getElementById("visitAmount");
const visitNotes = document.getElementById("visitNotes");
const visitCancel = document.getElementById("visitCancel");
const visitSave = document.getElementById("visitSave");

// Login form (sheet)
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginCancel = document.getElementById("loginCancel");
const loginGo = document.getElementById("loginGo");

// ------- Sheet control (fixes “stuck open” + adds ESC close) -------
function showSheet(which) {
  // hide all bodies
  sheetCasino.classList.add("hidden");
  sheetVisit.classList.add("hidden");
  sheetLogin.classList.add("hidden");

  if (which === "casino") sheetCasino.classList.remove("hidden");
  if (which === "visit") sheetVisit.classList.remove("hidden");
  if (which === "login") sheetLogin.classList.remove("hidden");

  sheetBackdrop.classList.remove("hidden");
  sheet.classList.remove("hidden");
}

function hideSheet() {
  sheetBackdrop.classList.add("hidden");
  sheet.classList.add("hidden");
  // safety: hide all bodies too
  sheetCasino.classList.add("hidden");
  sheetVisit.classList.add("hidden");
  sheetLogin.classList.add("hidden");
}

sheetClose.addEventListener("click", hideSheet);
sheetBackdrop.addEventListener("click", hideSheet);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideSheet();
});

// ------- Map init -------
function initMap() {
  // Center USA-ish
  map = L.map("map", { zoomControl: true }).setView([39.8283, -98.5795], 4);

  // FREE OpenStreetMap tiles
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  // Click map to add casino (when in Add mode)
  map.on("click", (e) => {
    if (!addCasinoMode) return;
    pendingLatLng = e.latlng;
    openAddCasinoSheet(pendingLatLng.lat, pendingLatLng.lng);
  });

  renderAllMarkers();
  refreshVisitCasinoDropdown();
  refreshGameFilter();
  refreshAnalytics();
  refreshSyncHint();
}

// ------- Markers -------
function clearMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
}

function getCasinoNet(casinoId) {
  const visits = loadVisits();
  return visits
    .filter(v => v.casinoId === casinoId)
    .reduce((sum, v) => sum + Number(v.amount || 0), 0);
}

function markerStyleByNet(net) {
  return {
    radius: 8,
    color: net >= 0 ? "#57d38c" : "#ff6b6b",
    weight: 2,
    fillOpacity: 0.9
  };
}

function renderAllMarkers() {
  clearMarkers();
  const casinos = loadCasinos();

  casinos.forEach(c => {
    const net = getCasinoNet(c.id);
    const marker = L.circleMarker([c.lat, c.lng], markerStyleByNet(net))
      .addTo(map)
      .on("click", () => selectCasino(c.id))
      .bindPopup(`<strong>${escapeHTML(c.name)}</strong><br/>Net: ${money(net)}`);

    markers.push(marker);
  });

  refreshVisitCasinoDropdown();
  refreshGameFilter();
}

function calcCasinoStats(casinoId, visits) {
  const v = visits.filter(x => x.casinoId === casinoId);
  const net = v.reduce((sum, x) => sum + Number(x.amount || 0), 0);
  return { visits: v, net, count: v.length };
}

function selectCasino(casinoId) {
  selectedCasinoId = casinoId;

  const casinos = loadCasinos();
  const visits = loadVisits();
  const casino = casinos.find(c => c.id === casinoId);
  if (!casino) return;

  const { visits: v, net, count } = calcCasinoStats(casinoId, visits);

  panelTitle.textContent = casino.name;
  panelSubtitle.textContent = "Casino totals and visit history";

  statNet.textContent = money(net);
  statNet.style.color = net >= 0 ? "var(--good)" : "var(--danger)";
  statVisits.textContent = String(count);

  btnEditCasino.disabled = false;
  btnDeleteCasino.disabled = false;

  renderVisits(v);

  // Focus map
  const targetZoom = Math.max(map.getZoom(), 10);
  map.setView([casino.lat, casino.lng], targetZoom);

  // update marker colors (net may have changed)
  renderAllMarkers();
  refreshAnalytics();
}

// ------- Visit list (filters included) -------
function passesFilters(visit) {
  const g = (gameFilter.value || "").trim();
  const m = (dateFilter.value || "").trim(); // YYYY-MM

  if (g && (visit.game || "").trim().toLowerCase() !== g.toLowerCase()) return false;
  if (m && monthKey(visit.date) !== m) return false;
  return true;
}

function renderVisits(v) {
  const filtered = v.filter(passesFilters);

  if (!filtered.length) {
    visitsList.className = "list empty";
    visitsList.textContent = "No visits match your filters.";
    return;
  }

  // Sort newest -> oldest
  filtered.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  visitsList.className = "list";
  visitsList.innerHTML = "";

  filtered.forEach(x => {
    const amt = Number(x.amount || 0);

    const item = document.createElement("div");
    item.className = "item";

    const top = document.createElement("div");
    top.className = "item-top";

    const left = document.createElement("div");
    left.innerHTML = `
      <div style="font-weight:900">${escapeHTML(x.game || "Game")}</div>
      <div class="badge">${escapeHTML(x.date || "No date")}</div>
    `;

    const right = document.createElement("div");
    right.className = "amount " + (amt >= 0 ? "good" : "bad");
    right.textContent = money(amt);

    top.appendChild(left);
    top.appendChild(right);

    item.appendChild(top);

    if (x.notes) {
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = x.notes;
      item.appendChild(meta);
    }

    // quick delete (optional)
    const actions = document.createElement("div");
    actions.className = "item-actions";

    const del = document.createElement("button");
    del.className = "pill danger";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      const ok = confirm("Delete this visit?");
      if (!ok) return;
      const visits = loadVisits().filter(vv => vv.id !== x.id);
      saveVisits(visits);
      selectCasino(selectedCasinoId);
    });

    actions.appendChild(del);
    item.appendChild(actions);

    visitsList.appendChild(item);
  });
}

// ------- Bottom Sheet Openers -------
function openAddCasinoSheet(lat, lng) {
  sheetTitle.textContent = "Add Casino";
  sheetSub.textContent = "Tap Save when you’re ready";
  casinoName.value = "";
  casinoNotes.value = "";
  casinoLat.value = lat.toFixed(6);
  casinoLng.value = lng.toFixed(6);
  casinoSave.dataset.mode = "add";
  showSheet("casino");
}

function openEditCasinoSheet(casino) {
  sheetTitle.textContent = "Edit Casino";
  sheetSub.textContent = "Update name/notes";
  casinoName.value = casino.name || "";
  casinoNotes.value = casino.notes || "";
  casinoLat.value = Number(casino.lat).toFixed(6);
  casinoLng.value = Number(casino.lng).toFixed(6);
  casinoSave.dataset.mode = "edit";
  casinoSave.dataset.casinoId = casino.id;
  showSheet("casino");
}

function openAddVisitSheet(defaultCasinoId) {
  const casinos = loadCasinos();
  if (!casinos.length) {
    alert("Add a casino first.");
    return;
  }

  refreshVisitCasinoDropdown();
  visitCasino.value = defaultCasinoId || casinos[0].id;

  sheetTitle.textContent = "Add Visit";
  sheetSub.textContent = "Track game, date, and win/loss";
  visitDate.value = todayISO();
  visitGame.value = "";
  visitAmount.value = "";
  visitNotes.value = "";
  showSheet("visit");
}

// ------- Buttons / actions -------
btnAddCasino.addEventListener("click", () => {
  addCasinoMode = !addCasinoMode;
  btnAddCasino.textContent = addCasinoMode ? "✅ Tap map to place" : "Add Casino";
});

btnAddVisit.addEventListener("click", () => openAddVisitSheet(selectedCasinoId));
btnAddVisitQuick.addEventListener("click", () => openAddVisitSheet(selectedCasinoId));

btnEditCasino.addEventListener("click", () => {
  if (!selectedCasinoId) return;
  const casino = loadCasinos().find(c => c.id === selectedCasinoId);
  if (!casino) return;
  openEditCasinoSheet(casino);
});

btnDeleteCasino.addEventListener("click", () => {
  if (!selectedCasinoId) return;
  const ok = confirm("Delete this casino AND its visits?");
  if (!ok) return;

  const casinos = loadCasinos().filter(c => c.id !== selectedCasinoId);
  const visits = loadVisits().filter(v => v.casinoId !== selectedCasinoId);
  saveCasinos(casinos);
  saveVisits(visits);

  selectedCasinoId = null;
  panelTitle.textContent = "Select a casino";
  panelSubtitle.textContent = "Click a pin to view totals and visits.";
  statNet.textContent = "$0";
  statNet.style.color = "var(--text)";
  statVisits.textContent = "0";
  visitsList.className = "list empty";
  visitsList.textContent = "No visits yet.";

  btnEditCasino.disabled = true;
  btnDeleteCasino.disabled = true;

  renderAllMarkers();
  refreshAnalytics();
});

btnLocate.addEventListener("click", () => {
  if (!navigator.geolocation) {
    alert("Geolocation not supported in this browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      map.setView([latitude, longitude], 14);
      L.circleMarker([latitude, longitude], {
        radius: 9,
        color: "#6ea8ff",
        weight: 2,
        fillOpacity: 0.9
      }).addTo(map).bindPopup("You are here").openPopup();
    },
    () => alert("Could not get your location. Allow location access and try again."),
    { enableHighAccuracy: true, timeout: 8000 }
  );
});

// Sheet cancel/save handlers (THIS fixes “can’t close” too)
casinoCancel.addEventListener("click", hideSheet);
visitCancel.addEventListener("click", hideSheet);

casinoSave.addEventListener("click", () => {
  const name = casinoName.value.trim();
  const notes = (casinoNotes.value || "").trim();
  const lat = Number(casinoLat.value);
  const lng = Number(casinoLng.value);

  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    alert("Please enter a name. (Lat/lng are filled when you tap the map.)");
    return;
  }

  const mode = casinoSave.dataset.mode;

  if (mode === "edit") {
    const id = casinoSave.dataset.casinoId;
    const casinos = loadCasinos().map(c => {
      if (c.id !== id) return c;
      return { ...c, name, notes, lat, lng };
    });
    saveCasinos(casinos);
    hideSheet();
    renderAllMarkers();
    selectCasino(id);
    return;
  }

  // add
  const casinos = loadCasinos();
  const newCasino = { id: uid(), name, notes, lat, lng };
  casinos.push(newCasino);
  saveCasinos(casinos);

  addCasinoMode = false;
  btnAddCasino.textContent = "Add Casino";

  hideSheet();
  renderAllMarkers();
  selectCasino(newCasino.id);
});

visitSave.addEventListener("click", () => {
  const casinoId = visitCasino.value;
  const date = visitDate.value || "";
  const game = (visitGame.value || "Other").trim() || "Other";
  const amount = Number(visitAmount.value);
  const notes = visitNotes.value.trim();

  if (!casinoId) {
    alert("Pick a casino.");
    return;
  }
  if (!Number.isFinite(amount)) {
    alert("Enter a win/loss amount (negative for loss).");
    return;
  }

  const visits = loadVisits();
  visits.push({ id: uid(), casinoId, date, game, amount, notes });
  saveVisits(visits);

  hideSheet();
  selectCasino(casinoId);
});

// Search
casinoSearch.addEventListener("input", () => {
  const q = casinoSearch.value.trim().toLowerCase();
  if (!q) {
    searchResults.classList.add("hidden");
    searchResults.innerHTML = "";
    return;
  }

  const casinos = loadCasinos().filter(c => (c.name || "").toLowerCase().includes(q));
  if (!casinos.length) {
    searchResults.classList.remove("hidden");
    searchResults.innerHTML = `<div class="search-item">No matches</div>`;
    return;
  }

  searchResults.classList.remove("hidden");
  searchResults.innerHTML = "";
  casinos.slice(0, 8).forEach(c => {
    const div = document.createElement("div");
    div.className = "search-item";
    div.textContent = c.name;
    div.addEventListener("click", () => {
      searchResults.classList.add("hidden");
      casinoSearch.value = "";
      selectCasino(c.id);
    });
    searchResults.appendChild(div);
  });
});

// Filter changes
gameFilter.addEventListener("change", () => {
  if (selectedCasinoId) selectCasino(selectedCasinoId);
  refreshAnalytics();
});
dateFilter.addEventListener("change", () => {
  if (selectedCasinoId) selectCasino(selectedCasinoId);
  refreshAnalytics();
});

// Tabs
tabMap.addEventListener("click", () => {
  tabMap.className = "btn btn-primary";
  tabAnalytics.className = "btn btn-ghost";
  viewMap.classList.remove("hidden");
  viewAnalytics.classList.add("hidden");
  setTimeout(() => map.invalidateSize(), 50);
});

tabAnalytics.addEventListener("click", () => {
  tabAnalytics.className = "btn btn-primary";
  tabMap.className = "btn btn-ghost";
  viewAnalytics.classList.remove("hidden");
  viewMap.classList.add("hidden");
  refreshAnalytics();
});

// Export / Import (JSON backup)
btnExport.addEventListener("click", () => {
  const data = {
    casinos: loadCasinos(),
    visits: loadVisits(),
    exportedAt: new Date().toISOString()
  };
  downloadTextFile("track-jack-backup.json", JSON.stringify(data, null, 2), "application/json");
});

btnImport.addEventListener("click", () => fileImport.click());
fileImport.addEventListener("change", async () => {
  const f = fileImport.files?.[0];
  if (!f) return;

  try {
    const text = await f.text();
    const data = JSON.parse(text);

    if (!Array.isArray(data.casinos) || !Array.isArray(data.visits)) {
      alert("Invalid backup file.");
      return;
    }

    saveCasinos(data.casinos);
    saveVisits(data.visits);

    fileImport.value = "";
    renderAllMarkers();
    refreshGameFilter();
    refreshAnalytics();
    alert("Import complete!");
  } catch {
    alert("Could not import file.");
  }
});

btnReset.addEventListener("click", () => {
  const ok = confirm("Reset ALL casinos + visits? This cannot be undone.");
  if (!ok) return;

  localStorage.removeItem(LS_CASINOS);
  localStorage.removeItem(LS_VISITS);

  selectedCasinoId = null;
  panelTitle.textContent = "Select a casino";
  panelSubtitle.textContent = "Click a pin to view totals and visits.";
  statNet.textContent = "$0";
  statNet.style.color = "var(--text)";
  statVisits.textContent = "0";
  visitsList.className = "list empty";
  visitsList.textContent = "No visits yet.";

  btnEditCasino.disabled = true;
  btnDeleteCasino.disabled = true;

  renderAllMarkers();
  refreshGameFilter();
  refreshAnalytics();
});

// ------- Dropdown -------
function refreshVisitCasinoDropdown() {
  const casinos = loadCasinos();
  visitCasino.innerHTML = "";
  casinos.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    visitCasino.appendChild(opt);
  });
}

function refreshGameFilter() {
  const visits = loadVisits();
  const games = new Set(visits.map(v => (v.game || "").trim()).filter(Boolean));
  const current = gameFilter.value;

  gameFilter.innerHTML = `<option value="">All games</option>`;
  [...games].sort((a,b)=>a.localeCompare(b)).forEach(g => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    gameFilter.appendChild(opt);
  });

  if (current && [...games].includes(current)) gameFilter.value = current;
}

// ------- Analytics (simple tables) -------
function refreshAnalytics() {
  const casinos = loadCasinos();
  const visits = loadVisits();

  const totalNet = visits.reduce((s,v)=> s + Number(v.amount||0), 0);
  kpiTotalNet.textContent = money(totalNet);
  kpiTotalVisits.textContent = String(visits.length);
  kpiTotalCasinos.textContent = String(casinos.length);

  // Net by casino
  const byCasino = casinos.map(c => ({
    name: c.name,
    net: visits.filter(v=>v.casinoId===c.id).reduce((s,v)=>s+Number(v.amount||0),0)
  })).sort((a,b)=>b.net-a.net);

  tableCasino.innerHTML = byCasino.slice(0, 10).map(r => `
    <div class="table-row">
      <strong>${escapeHTML(r.name)}</strong>
      <span>${money(r.net)}</span>
    </div>
  `).join("") || `<div class="table-row"><span class="muted">No data</span></div>`;

  // Net by game
  const mapGame = new Map();
  visits.forEach(v => {
    if (!passesFilters(v)) return;
    const g = (v.game || "Other").trim() || "Other";
    mapGame.set(g, (mapGame.get(g) || 0) + Number(v.amount||0));
  });

  const byGame = [...mapGame.entries()].map(([game, net]) => ({ game, net }))
    .sort((a,b)=>b.net-a.net);

  tableGame.innerHTML = byGame.slice(0, 12).map(r => `
    <div class="table-row">
      <strong>${escapeHTML(r.game)}</strong>
      <span>${money(r.net)}</span>
    </div>
  `).join("") || `<div class="table-row"><span class="muted">No data</span></div>`;

  // Net by month
  const mapMonth = new Map();
  visits.forEach(v => {
    if (!passesFilters(v)) return;
    const mk = monthKey(v.date);
    mapMonth.set(mk, (mapMonth.get(mk) || 0) + Number(v.amount||0));
  });

  const byMonth = [...mapMonth.entries()].map(([m, net]) => ({ m, net }))
    .sort((a,b)=>a.m.localeCompare(b.m));

  tableMonth.innerHTML = byMonth.map(r => `
    <div class="table-row">
      <strong>${escapeHTML(r.m)}</strong>
      <span>${money(r.net)}</span>
    </div>
  `).join("") || `<div class="table-row"><span class="muted">No data</span></div>`;
}

// ------- Login (scaffold + guest mode UI) -------
btnLogin.addEventListener("click", () => {
  sheetTitle.textContent = "Login";
  sheetSub.textContent = "Cloud sync when Firebase is configured";
  loginEmail.value = "";
  loginPassword.value = "";
  showSheet("login");
});

loginCancel.addEventListener("click", hideSheet);

loginGo.addEventListener("click", async () => {
  if (!FIREBASE_ENABLED) {
    alert("Firebase is not enabled yet. You’re in Guest mode (local storage).");
    hideSheet();
    return;
  }
  alert("Firebase enabled mode is scaffolded. Add Firebase scripts + config to activate.");
  hideSheet();
});

btnLogout.addEventListener("click", async () => {
  alert("Logout is available only in Firebase mode.");
});

// ------- Sync hint -------
function refreshSyncHint() {
  if (FIREBASE_ENABLED) {
    syncHint.textContent = "Cloud sync is enabled (Firebase configured).";
  } else {
    syncHint.textContent = "You are in Guest mode (local storage). Enable Firebase for cloud sync.";
  }
}
// ------- Init -------
window.addEventListener("load", () => {
  initMap();
});
const GAMES = [
  "Blackjack",
  "Slots",
  "Roulette",
  "Craps",
  "Baccarat",
  "Poker (Cash)",
  "Poker (Tournament)",
  "Sportsbook",
  "Video Poker",
  "Keno",
  "Other"
];

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

const sel = document.getElementById("gameSelect");

  // keep the first placeholder option, clear the rest
  while (sel.options.length > 1) sel.remove(1);

  GAMES.forEach(game => {
    const opt = document.createElement("option");
    opt.value = game;
    opt.textContent = game;
    sel.appendChild(opt);
  });

