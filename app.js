let appData = { teams: [], players: [], evaluations: [], changeRequests: [] };
let currentUser = null; // {username, isAdmin, groupIds, vorname, nachname, canEdit} — nur im Gateway-Modus gesetzt, sonst null

// Im lokalen Datei-Modus (storageMode !== "gateway") gibt es kein Gruppen-Konzept —
// wer die Datei lokal geöffnet hat, darf sie wie bisher komplett bearbeiten. Nur im
// Gateway-Modus entscheidet das server-seitige Bearbeiten-Recht (editGroupIds).
function canEdit() { return storageMode !== "gateway" || !!(currentUser && (currentUser.isAdmin || currentUser.canEdit)); }
let fileHandle = null;
let pendingHandle = null;
let backupDirHandle = null;
let storageMode = "fs"; // "fs" | "gateway"
let autoBackupDoneThisSession = false;
let saveTimer = null;
let profileCharts = { line: null, radar: null, compare: null };
const TEAM_FILTER_SELECT_IDS = [
  "team-filter-select",
  "dashboard-team-filter-select",
  "players-team-filter-select",
  "evaluate-team-filter-select",
  "profile-team-filter-select"
];
let currentTeamFilter = "";
let dashboardStalenessFilter = "";
let dashboardThresholdOnly = false;
let teamsSortOrder = "age-desc";
let playersPositionFilter = "";
let playersSortOrder = "name-asc";
let playersBirthdateFromFilter = "";
let playersBirthdateToFilter = "";
let playersSearchQuery = "";

function daysSince(dateStr) {
  const ms = Date.now() - new Date(dateStr + "T00:00:00").getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function stalenessClass(days) {
  if (days === null) return "stale-never";
  if (days >= 270) return "stale-red";
  if (days >= 180) return "stale-orange";
  if (days >= 90) return "stale-yellow";
  return "stale-ok";
}

function migrateData(data) {
  if (!Array.isArray(data.teams)) data.teams = [];
  if (!Array.isArray(data.players)) data.players = [];
  if (!Array.isArray(data.evaluations)) data.evaluations = [];
  if (!Array.isArray(data.changeRequests)) data.changeRequests = [];
  if (!data.ageGroupWeights || typeof data.ageGroupWeights !== "object") {
    data.ageGroupWeights = JSON.parse(JSON.stringify(DEFAULT_AGE_GROUP_WEIGHTS));
  } else {
    Object.keys(DEFAULT_AGE_GROUP_WEIGHTS).forEach((group) => {
      if (!data.ageGroupWeights[group]) {
        data.ageGroupWeights[group] = { ...DEFAULT_AGE_GROUP_WEIGHTS[group] };
      } else {
        SCORE_CATEGORIES.forEach((cat) => {
          if (data.ageGroupWeights[group][cat.id] === undefined) {
            data.ageGroupWeights[group][cat.id] = DEFAULT_AGE_GROUP_WEIGHTS[group][cat.id] || 0;
          }
        });
      }
    });
  }
  if (!data.ageGroupThresholds || typeof data.ageGroupThresholds !== "object") {
    data.ageGroupThresholds = { ...DEFAULT_AGE_GROUP_THRESHOLDS };
  } else {
    Object.keys(DEFAULT_AGE_GROUP_THRESHOLDS).forEach((group) => {
      if (data.ageGroupThresholds[group] === undefined) {
        data.ageGroupThresholds[group] = DEFAULT_AGE_GROUP_THRESHOLDS[group];
      }
    });
  }
  data.players.forEach((p) => {
    if (p.teamId === undefined) {
      if (p.team) {
        let t = data.teams.find((t) => t.name.toLowerCase() === p.team.toLowerCase());
        if (!t) {
          t = { id: uuid(), name: p.team };
          data.teams.push(t);
        }
        p.teamId = t.id;
      } else {
        p.teamId = null;
      }
    }
    delete p.team;
    if (p.firstName === undefined && p.lastName === undefined && typeof p.name === "string") {
      const parts = p.name.trim().split(/\s+/);
      p.lastName = parts.length > 1 ? parts.pop() : parts[0] || "";
      p.firstName = parts.join(" ");
    }
    if (p.firstName === undefined) p.firstName = "";
    if (p.lastName === undefined) p.lastName = "";
    delete p.name;
    if (p.spielertyp === undefined) p.spielertyp = "feldspieler";
  });
  return data;
}

function teamName(teamId) {
  const t = appData.teams.find((x) => x.id === teamId);
  return t ? t.name : "";
}

function playerFullName(p) {
  if (!p) return "";
  return `${p.firstName || ""} ${p.lastName || ""}`.trim();
}

function calculateAge(birthdate) {
  if (!birthdate) return null;
  const today = new Date();
  const bd = new Date(birthdate + "T00:00:00");
  if (isNaN(bd.getTime())) return null;
  let age = today.getFullYear() - bd.getFullYear();
  const hadBirthdayThisYear = today.getMonth() > bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() >= bd.getDate());
  if (!hadBirthdayThisYear) age--;
  return age;
}

function getAgeGroupForAge(age) {
  if (age === null || age === undefined) return null;
  if (age <= 10) return "f_e";
  if (age <= 14) return "d_c";
  if (age <= 18) return "a_b";
  return null;
}

function getAgeGroupForPlayer(p) {
  return getAgeGroupForAge(calculateAge(p.birthdate));
}

function getAgeGroupForTeam(team) {
  if (!team) return null;
  return getAgeGroupForAge(calculateAge(team.birthdateFrom || team.birthdateTo));
}

function weightedPercent(scores, ageGroup, player) {
  const weights = ageGroup && appData.ageGroupWeights ? appData.ageGroupWeights[ageGroup] : null;
  if (!weights) return totalScore(scores) / TOTAL_MAX_SCORE * 100;
  let sum = 0;
  scoreCategoriesFor(player).forEach((cat) => {
    const pct = (categorySubtotal(scores, cat) / cat.max) * 100;
    sum += pct * ((Number(weights[cat.id]) || 0) / 100);
  });
  return sum;
}

function formatDateDe(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("de-DE");
}

function formatBirthdateRange(t) {
  const hasFrom = !!t.birthdateFrom;
  const hasTo = !!t.birthdateTo;
  if (!hasFrom && !hasTo) return "";
  if (hasFrom && hasTo) return `${formatDateDe(t.birthdateFrom)} – ${formatDateDe(t.birthdateTo)}`;
  if (hasFrom) return `ab ${formatDateDe(t.birthdateFrom)}`;
  return `bis ${formatDateDe(t.birthdateTo)}`;
}

function findTeamForBirthdate(birthdate) {
  if (!birthdate) return null;
  const matches = appData.teams.filter((t) => {
    const hasFrom = !!t.birthdateFrom;
    const hasTo = !!t.birthdateTo;
    if (!hasFrom && !hasTo) return false;
    if (hasFrom && birthdate < t.birthdateFrom) return false;
    if (hasTo && birthdate > t.birthdateTo) return false;
    return true;
  });
  if (!matches.length) return null;
  matches.sort((a, b) => {
    const rangeA = new Date(a.birthdateTo || "9999-12-31") - new Date(a.birthdateFrom || "0000-01-01");
    const rangeB = new Date(b.birthdateTo || "9999-12-31") - new Date(b.birthdateFrom || "0000-01-01");
    return rangeA - rangeB;
  });
  return matches[0];
}

function autoAssignTeamForPlayer(p) {
  if (!p.birthdate) return false;
  const team = findTeamForBirthdate(p.birthdate);
  if (!team || p.teamId === team.id) return false;
  p.teamId = team.id;
  return true;
}

function autoAssignAllPlayers() {
  let changed = false;
  appData.players.forEach((p) => {
    if (autoAssignTeamForPlayer(p)) changed = true;
  });
  if (changed) persist();
  return changed;
}

function resolveTeamByName(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  let t = appData.teams.find((x) => x.name.toLowerCase() === trimmed.toLowerCase());
  if (!t) {
    t = { id: uuid(), name: trimmed };
    appData.teams.push(t);
  }
  return t;
}

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function todayStr() {
  // Lokales Datum statt UTC (toISOString) – sonst bekommt z.B. eine Bewertung
  // kurz nach Mitternacht in Deutschland noch das Datum des Vortags.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------- Persistenz ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.error(e));
  });
}

async function init() {
  document.getElementById("btn-connect-existing").addEventListener("click", connectExisting);
  document.getElementById("btn-connect-new").addEventListener("click", connectNew);
  document.getElementById("btn-change-location-existing").addEventListener("click", connectExisting);
  document.getElementById("btn-change-location-new").addEventListener("click", saveCurrentDataToNewLocation);
  document.getElementById("btn-reconnect").addEventListener("click", reconnectStoredHandle);
  document.getElementById("btn-reconnect-other").addEventListener("click", connectExisting);

  if (!fsApiSupported()) {
    document.getElementById("fs-api-warning").style.display = "block";
  }

  // Cloud-Sync über die zentrale Anmeldung (Tools-Übersicht): sobald ein
  // Login-Token vorliegt, wird es genutzt — unabhängig von einem früher
  // gespeicherten lokalen Datei-Modus. Das Token liegt in derselben Origin
  // (tecko1985.github.io) und wird wiederverwendet. Nur ohne gültiges Login
  // greift unten der lokale Datei-Modus.
  if (getSessionToken()) {
    try {
      const data = await gatewayLoad();
      storageMode = "gateway";
      appData = data && Array.isArray(data.players) ? data : { teams: [], players: [], evaluations: [], changeRequests: [] };
      migrateData(appData);
      autoAssignAllPlayers();
      try { currentUser = await fetchMe(); } catch (_) { /* best effort, für die Bewerter-Vorbelegung */ }
      await FileStore.setStorageMode("gateway");
      await FileStore.clearWebdavConfig(); // alte, im Klartext gespeicherte Zugangsdaten aufräumen
      startApp();
      return;
    } catch (e) {
      if (!(e instanceof NotLoggedInError)) {
        console.error("Nextcloud-Zugriff über Login fehlgeschlagen", e);
        showGatewayError("Zugriff auf Nextcloud fehlgeschlagen: " + e.message);
        showConnectScreen(false);
        return;
      }
      // kein gültiges Login → unten lokaler Modus bzw. Anmelde-Hinweis
    }
  }

  storageMode = "fs";
  const handle = await FileStore.getHandle();
  if (handle) {
    const granted = await verifyPermissionSilent(handle);
    if (granted) {
      fileHandle = handle;
      await loadAndStart();
      return;
    }
    pendingHandle = handle;
    showConnectScreen(true);
    return;
  }
  showConnectScreen(false);
}

function showGatewayError(text) {
  const el = document.getElementById("cloud-error");
  if (!el) return;
  el.textContent = text;
  el.style.display = text ? "block" : "none";
}

async function verifyPermissionSilent(handle) {
  try {
    return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
  } catch (e) {
    return false;
  }
}

async function reconnectStoredHandle() {
  if (!pendingHandle) return;
  try {
    if (!(await verifyPermission(pendingHandle, true))) {
      alert("Zugriff auf die Datei wurde nicht erlaubt.");
      return;
    }
    fileHandle = pendingHandle;
    pendingHandle = null;
    storageMode = "fs";
    await FileStore.setStorageMode("fs");
    await FileStore.setHandle(fileHandle);
    await loadAndStart();
  } catch (e) {
    console.error(e);
  }
}

function showConnectScreen(hasStoredHandle) {
  document.getElementById("connect-screen").style.display = "block";
  document.getElementById("app-shell").style.display = "none";
  document.getElementById("reconnect-block").style.display = hasStoredHandle ? "block" : "none";
  document.getElementById("connect-default-actions").style.display = hasStoredHandle ? "none" : "flex";
}

async function connectExisting() {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
    });
    if (!(await verifyPermission(handle, true))) {
      alert("Zugriff auf die Datei wurde nicht erlaubt.");
      return;
    }
    fileHandle = handle;
    storageMode = "fs";
    await FileStore.setStorageMode("fs");
    await FileStore.setHandle(handle);
    await loadAndStart();
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  }
}

async function connectNew() {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "spielerdaten.json",
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
    });
    if (!(await verifyPermission(handle, true))) {
      alert("Zugriff auf die Datei wurde nicht erlaubt.");
      return;
    }
    fileHandle = handle;
    storageMode = "fs";
    appData = { teams: [], players: [], evaluations: [], changeRequests: [] };
    migrateData(appData);
    await writeDataFile(fileHandle, appData);
    await FileStore.setStorageMode("fs");
    await FileStore.setHandle(handle);
    startApp();
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  }
}

async function saveCurrentDataToNewLocation() {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "spielerdaten.json",
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
    });
    if (!(await verifyPermission(handle, true))) {
      alert("Zugriff auf die Datei wurde nicht erlaubt.");
      return;
    }
    fileHandle = handle;
    storageMode = "fs";
    await writeDataFile(fileHandle, appData);
    await FileStore.setStorageMode("fs");
    await FileStore.setHandle(handle);
    startApp();
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  }
}

async function loadAndStart() {
  try {
    const data = await readDataFile(fileHandle);
    appData = data && Array.isArray(data.players) ? data : { teams: [], players: [], evaluations: [], changeRequests: [] };
  } catch (e) {
    console.error("Fehler beim Lesen der Datei", e);
    appData = { teams: [], players: [], evaluations: [], changeRequests: [] };
  }
  migrateData(appData);
  autoAssignAllPlayers();
  startApp();
}

function startApp() {
  document.getElementById("connect-screen").style.display = "none";
  document.getElementById("app-shell").style.display = "block";
  const status = document.getElementById("file-status");
  status.classList.add("connected");
  const fileLabel = storageMode === "gateway" ? "Nextcloud (über Anmeldung)" : fileHandle ? fileHandle.name : "Datei";
  status.querySelector(".label").textContent = "Verbunden: " + fileLabel;
  const settingsFileName = document.getElementById("settings-file-name");
  if (settingsFileName) settingsFileName.textContent = fileLabel;
  setSaveStatus("Autospeichern aktiv · Autoladen beim nächsten Öffnen aktiv");
  const fsActions = document.getElementById("settings-fs-actions");
  const webdavActions = document.getElementById("settings-webdav-actions");
  if (fsActions) fsActions.style.display = storageMode === "fs" ? "flex" : "none";
  if (webdavActions) webdavActions.style.display = "none";
  renderAll();
  updateBackupFolderStatus();
  tryAutoBackupOnStart();
}

function setSaveStatus(text) {
  const el = document.getElementById("settings-save-status");
  if (el) el.textContent = text;
}

function persist() {
  setSaveStatus("Speichert…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doPersist, 300);
}

// Es darf immer nur EIN Schreibvorgang unterwegs sein. gatewayRev (das ETag, mit dem
// der Worker Konflikte erkennt) wird erst aktualisiert, wenn ein Save zurückkommt —
// ein zweiter Save, der währenddessen startet, schickt also dasselbe, inzwischen
// veraltete ETag und wird zwangsläufig mit 409 abgelehnt. Für die bearbeitende
// Person sah das aus wie "ein anderes Gerät hat geändert", obwohl sie allein war,
// und reloadAfterConflict() verwarf dabei ihre letzte Eingabe. Beim zügigen
// Bearbeiten (Spielerzeilen ändern, Bewertungen speichern, Gewichtungen und
// Förderschwellen setzen — 300-ms-Debounce, WebDAV-Runde deutlich länger)
// passierte das regelmäßig.
// Deshalb: Änderungen, die während eines laufenden Saves anfallen, nur vormerken
// und danach in einem Rutsch nachschreiben. appData wird ohnehin immer komplett
// geschrieben, es geht also nichts verloren, wenn mehrere Änderungen zusammenfallen.
let saveRunner = null;
let saveDirty = false;
function doPersist() {
  saveDirty = true;
  if (!saveRunner) saveRunner = runSaveLoop().finally(() => { saveRunner = null; });
  return saveRunner;
}
async function runSaveLoop() {
  let ok = true;
  while (saveDirty) {
    saveDirty = false;
    ok = await writeOnce();
    // Bei Konflikt/Fehler wurde der Stand neu geladen bzw. die Sitzung ist
    // abgelaufen — dann NICHT blind nachschreiben, das würde den fremden Stand
    // wieder überbügeln.
    if (!ok) { saveDirty = false; break; }
  }
  return ok;
}
// Schreibt beide Speicherwege (Gateway UND lokale Datei); true = geschrieben bzw.
// nichts zu tun, false = Konflikt/Fehler.
async function writeOnce() {
  try {
    if (storageMode === "gateway") {
      await gatewaySave(appData);
    } else {
      if (!fileHandle) return true;
      await writeDataFile(fileHandle, appData);
    }
    const time = new Date().toLocaleTimeString("de-DE");
    setSaveStatus(`Zuletzt automatisch gespeichert um ${time} · Autoladen beim nächsten Öffnen aktiv`);
    return true;
  } catch (e) {
    if (e instanceof ConflictError) {
      await reloadAfterConflict();
    } else if (e instanceof NotLoggedInError) {
      setSaveStatus("Sitzung abgelaufen — bitte in der Tools-Übersicht neu anmelden.");
    } else {
      console.error("Speichern fehlgeschlagen", e);
      setSaveStatus("Speichern fehlgeschlagen — siehe Konsole.");
    }
    return false;
  }
}

// Konflikt beim Speichern (nur Gateway-Modus): ein anderes Gerät hat zwischen-
// zeitlich gespeichert. Remote-Stand übernehmen und neu rendern — die letzte
// eigene Eingabe geht dabei sichtbar verloren (Hinweis unten), statt dass die
// Änderung des anderen Geräts stillschweigend überschrieben wird.
async function reloadAfterConflict() {
  try {
    const data = await gatewayLoad();
    appData = data && Array.isArray(data.players) ? data : { teams: [], players: [], evaluations: [], changeRequests: [] };
    migrateData(appData);
    renderAll();
    setSaveStatus("⚠️ Anderes Gerät hat gleichzeitig gespeichert — Stand neu geladen, letzte Eingabe bitte prüfen.");
  } catch (e) {
    console.error("Neu laden nach Konflikt fehlgeschlagen", e);
    setSaveStatus("Speicher-Konflikt — bitte Seite neu laden.");
  }
}

// ---------- Navigation ----------

function setupNav() {
  document.querySelectorAll("nav button").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  const versionBadgeHeader = document.getElementById("version-badge");
  versionBadgeHeader.addEventListener("click", () => switchTab("info"));
  versionBadgeHeader.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); switchTab("info"); }
  });
}

function switchTab(tab) {
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-section").forEach((s) => s.classList.toggle("active", s.id === "tab-" + tab));
  if (tab === "dashboard") renderDashboard();
  if (tab === "teams") {
    renderTeams();
    renderAgeWeights();
    renderAgeThresholds();
  }
  if (tab === "players") renderPlayers();
  if (tab === "evaluate") renderEvaluateForm();
  if (tab === "profile") {
    renderProfile();
    renderPlayerComparison();
  }
}

function renderAll() {
  renderVersionInfo();
  populateTeamFilterSelect();
  populatePlayerSelects();
  renderDashboard();
  renderTeams();
  renderAgeWeights();
  renderAgeThresholds();
  renderPlayers();
  renderEvaluateForm();
  renderProfile();
  renderPlayerComparison();
}

// ---------- Versionsinfo ----------

function renderVersionInfo() {
  document.querySelectorAll(".version-badge").forEach((el) => {
    el.textContent = "v" + APP_VERSION;
  });
  const list = document.getElementById("changelog-list");
  if (!list) return;
  list.innerHTML = APP_CHANGELOG.map((entry) => {
    const body = entry.groups
      ? entry.groups
          .map(
            (g) => `
        <div class="changelog-group">
          <div class="cg-title">${escapeHtml(g.title)}</div>
          <ul class="cg-items">${g.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
        </div>`
          )
          .join("")
      : `<span class="cn">${escapeHtml(entry.notes)}</span>`;
    return `
    <div class="changelog-entry">
      <span class="cv">v${escapeHtml(entry.version)}</span>
      ${body}
    </div>`;
  }).join("");
}

// ---------- Team Filter & Team Management ----------

function populateTeamFilterSelect() {
  const current = currentTeamFilter;
  const options = sortedTeamsList()
    .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`)
    .join("");
  const html = `<option value="">Alle Mannschaften</option>` + options;
  const validCurrent = current && appData.teams.some((t) => t.id === current) ? current : "";
  TEAM_FILTER_SELECT_IDS.forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = html;
    sel.value = validCurrent;
  });
  currentTeamFilter = validCurrent;
}

function applyTeamFilter(value) {
  currentTeamFilter = value;
  TEAM_FILTER_SELECT_IDS.forEach((id) => {
    const sel = document.getElementById(id);
    if (sel) sel.value = value;
  });
  populatePlayerSelects();
  renderDashboard();
  renderPlayers();
  renderEvaluateForm();
  renderProfile();
  renderPlayerComparison();
}

function setupTeamFilter() {
  TEAM_FILTER_SELECT_IDS.forEach((id) => {
    document.getElementById(id).addEventListener("change", (e) => applyTeamFilter(e.target.value));
  });
}

function applyStalenessFilter(value) {
  dashboardStalenessFilter = value;
  const sel = document.getElementById("dashboard-staleness-select");
  if (sel) sel.value = value;
  renderDashboard();
}

function setupDashboardStalenessFilter() {
  document.getElementById("dashboard-staleness-select").addEventListener("change", (e) => applyStalenessFilter(e.target.value));
  document.getElementById("dashboard-threshold-checkbox").addEventListener("change", (e) => {
    dashboardThresholdOnly = e.target.checked;
    renderDashboard();
  });
}

function setupPlayersExtraFilters() {
  document.getElementById("players-position-filter-select").addEventListener("change", (e) => {
    playersPositionFilter = e.target.value;
    renderPlayers();
  });
  document.getElementById("players-sort-select").addEventListener("change", (e) => {
    playersSortOrder = e.target.value;
    renderPlayers();
  });
  document.getElementById("players-birthdate-from-filter").addEventListener("change", (e) => {
    playersBirthdateFromFilter = e.target.value;
    renderPlayers();
  });
  document.getElementById("players-birthdate-to-filter").addEventListener("change", (e) => {
    playersBirthdateToFilter = e.target.value;
    renderPlayers();
  });
  document.getElementById("players-search-input").addEventListener("input", (e) => {
    playersSearchQuery = e.target.value.trim().toLowerCase();
    renderPlayers();
  });
}

function setupTeamForm() {
  document.getElementById("team-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!canEdit()) return;
    const nameInput = document.getElementById("team-name");
    const fromInput = document.getElementById("team-birthdate-from");
    const toInput = document.getElementById("team-birthdate-to");
    const name = nameInput.value.trim();
    if (!name) return;
    appData.teams.push({
      id: uuid(),
      name,
      birthdateFrom: fromInput.value || null,
      birthdateTo: toInput.value || null
    });
    persist();
    nameInput.value = "";
    fromInput.value = "";
    toInput.value = "";
    populateTeamFilterSelect();
    renderTeams();
    if (autoAssignAllPlayers()) {
      populatePlayerSelects();
      renderPlayers();
      renderDashboard();
    }
  });
}

function teamAgeSortKey(team) {
  // Fällt auf birthdateTo zurück, wenn kein birthdateFrom gesetzt ist (z.B. "alle bis Jahrgang X"),
  // statt die Mannschaft unabhängig vom tatsächlichen Alter ans Ende der Sortierung zu schieben.
  return team.birthdateFrom || team.birthdateTo || "9999-99-99";
}

function compareTeamsByOrder(teamA, teamB, countA, countB) {
  switch (teamsSortOrder) {
    case "name-desc":
      return teamB.name.localeCompare(teamA.name);
    case "count-desc":
      return countB - countA || teamA.name.localeCompare(teamB.name);
    case "count-asc":
      return countA - countB || teamA.name.localeCompare(teamB.name);
    case "age-desc": {
      const av = teamAgeSortKey(teamA);
      const bv = teamAgeSortKey(teamB);
      return av < bv ? -1 : av > bv ? 1 : teamA.name.localeCompare(teamB.name);
    }
    case "age-asc": {
      const av = teamAgeSortKey(teamA);
      const bv = teamAgeSortKey(teamB);
      return av > bv ? -1 : av < bv ? 1 : teamA.name.localeCompare(teamB.name);
    }
    default:
      return teamA.name.localeCompare(teamB.name);
  }
}

function sortedTeamsList() {
  return appData.teams
    .slice()
    .sort((a, b) => compareTeamsByOrder(a, b, 0, 0));
}

function sortedTeamsWithCounts() {
  const withCounts = appData.teams.map((t) => ({
    team: t,
    count: appData.players.filter((p) => p.teamId === t.id).length
  }));
  withCounts.sort((a, b) => compareTeamsByOrder(a.team, b.team, a.count, b.count));
  return withCounts;
}

function setupTeamsSort() {
  document.getElementById("teams-sort-select").addEventListener("change", (e) => {
    teamsSortOrder = e.target.value;
    renderTeams();
    populateTeamFilterSelect();
  });
}

function renderTeams() {
  const list = document.getElementById("teams-list");
  if (!appData.teams.length) {
    list.innerHTML = `<div class="empty-state">Noch keine Mannschaften angelegt.</div>`;
    return;
  }
  list.innerHTML = sortedTeamsWithCounts()
    .map(
      ({ team: t, count }) => `
    <div class="team-edit-row" data-id="${escapeHtml(t.id)}">
      <input type="text" class="t-edit-name" value="${escapeHtml(t.name)}" placeholder="Name" />
      <input type="date" class="t-edit-from" value="${escapeHtml(t.birthdateFrom || "")}" />
      <input type="date" class="t-edit-to" value="${escapeHtml(t.birthdateTo || "")}" />
      <span class="team-count">${count} Spieler</span>
      <button class="btn small danger" data-action="delete">Löschen</button>
    </div>`
    )
    .join("");

  list.querySelectorAll(".team-edit-row").forEach((row) => {
    const id = row.dataset.id;
    const team = appData.teams.find((x) => x.id === id);
    if (!team) return;
    row.querySelector(".t-edit-name").addEventListener("change", (e) => {
      team.name = e.target.value.trim() || team.name;
      commitTeamEdit();
    });
    row.querySelector(".t-edit-from").addEventListener("change", (e) => {
      team.birthdateFrom = e.target.value || null;
      commitTeamEdit();
    });
    row.querySelector(".t-edit-to").addEventListener("change", (e) => {
      team.birthdateTo = e.target.value || null;
      commitTeamEdit();
    });
    row.querySelector('[data-action="delete"]').addEventListener("click", () => deleteTeam(id));
  });
}

function commitTeamEdit() {
  if (!canEdit()) return;
  persist();
  populateTeamFilterSelect();
  renderTeams();
  renderDashboard();
  renderPlayers();
  if (autoAssignAllPlayers()) {
    populatePlayerSelects();
    renderPlayers();
    renderDashboard();
  }
}

function renderCriteriaLegend() {
  const legend = document.getElementById("weights-criteria-legend");
  if (!legend) return;
  const focusBlocks = Object.keys(AGE_GROUP_LABELS)
    .slice()
    .reverse()
    .map((group) => {
      const focus = AGE_GROUP_FOCUS[group];
      if (!focus) return "";
      const rows = SCORE_CATEGORIES.map(
        (cat) => `
          <tr>
            <td><b>${escapeHtml(cat.label)}</b></td>
            <td>${escapeHtml(focus[cat.id] ? focus[cat.id].range : "—")}</td>
            <td>${escapeHtml(focus[cat.id] ? focus[cat.id].text : "")}</td>
          </tr>`
      ).join("");
      return `
        <details style="margin-bottom:10px;">
          <summary><b>${escapeHtml(focus.title)}</b></summary>
          <p class="muted" style="margin:6px 0 8px;">${escapeHtml(focus.intro)}</p>
          <table>
            <thead><tr><th>Bereich</th><th>Gewichtung (Anhaltspunkt)</th><th>Fokus / Inhalt</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </details>`;
    })
    .join("");

  legend.innerHTML = `
    ${focusBlocks}
    <details>
      <summary>Welche Kriterien zählen zu welchem Bereich?</summary>
      <div class="rubric-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
        ${ALL_SCORE_CATEGORIES.map(
          (cat) => `<div><b>${escapeHtml(cat.label)}${cat === GK_CATEGORY ? " (nur Torhüter)" : ""}</b>${cat.criteria.map((c) => escapeHtml(c.label)).join(", ")}</div>`
        ).join("")}
      </div>
      <p class="muted" style="margin-top:8px;">
        Bei Torhütern ersetzt das Torwartspiel den Bereich Technik &amp; Taktik. Beide zählen gleich viel,
        die Gewichtung unten gilt daher unverändert für beide Spielertypen.
      </p>
    </details>
  `;
}

function renderAgeWeights() {
  renderCriteriaLegend();
  const list = document.getElementById("age-weights-list");
  if (!list) return;
  list.innerHTML = Object.keys(AGE_GROUP_LABELS)
    .slice()
    .reverse()
    .map((group) => {
      const weights = appData.ageGroupWeights[group];
      const sum = SCORE_CATEGORIES.reduce((s, cat) => s + (Number(weights[cat.id]) || 0), 0);
      const sumClass = sum === 100 ? "ok" : "bad";
      const inputs = SCORE_CATEGORIES.map(
        (cat) => `<input type="number" min="0" max="100" step="1" class="weight-input" data-cat="${cat.id}" value="${escapeHtml(weights[cat.id])}" />`
      ).join("");
      return `
      <div class="weights-row" data-group="${group}">
        <span>${escapeHtml(AGE_GROUP_LABELS[group])}</span>
        ${inputs}
        <span class="weights-sum ${sumClass}">${sum}%</span>
      </div>`;
    })
    .join("");

  list.querySelectorAll(".weights-row").forEach((row) => {
    const group = row.dataset.group;
    row.querySelectorAll(".weight-input").forEach((input) => {
      input.addEventListener("change", () => {
        const catId = input.dataset.cat;
        const value = Math.min(100, Math.max(0, Number(input.value) || 0));
        input.value = value;
        appData.ageGroupWeights[group][catId] = value;
        persist();
        renderAgeWeights();
        renderDashboard();
        renderPlayers();
        renderEvaluateForm();
        renderProfile();
      });
    });
  });
}

function renderAgeThresholds() {
  const list = document.getElementById("age-thresholds-list");
  if (!list) return;
  list.innerHTML = Object.keys(AGE_GROUP_LABELS)
    .slice()
    .reverse()
    .map((group) => {
      const value = appData.ageGroupThresholds[group];
      return `
      <div class="threshold-row" data-group="${group}">
        <span>${escapeHtml(AGE_GROUP_LABELS[group])}</span>
        <input type="number" min="0" max="100" step="1" class="threshold-input" value="${escapeHtml(value)}" />
      </div>`;
    })
    .join("");

  list.querySelectorAll(".threshold-row").forEach((row) => {
    const group = row.dataset.group;
    row.querySelector(".threshold-input").addEventListener("change", (e) => {
      const value = Math.min(100, Math.max(0, Number(e.target.value) || 0));
      e.target.value = value;
      appData.ageGroupThresholds[group] = value;
      persist();
      renderAgeThresholds();
      renderDashboard();
    });
  });
}

function deleteTeam(id) {
  if (!canEdit()) return;
  const t = appData.teams.find((x) => x.id === id);
  if (!t) return;
  const count = appData.players.filter((p) => p.teamId === id).length;
  const msg = count
    ? `"${t.name}" löschen? ${count} Spieler werden auf "ohne Mannschaft" gesetzt (Bewertungen bleiben erhalten).`
    : `"${t.name}" wirklich löschen?`;
  if (!confirm(msg)) return;
  appData.teams = appData.teams.filter((x) => x.id !== id);
  appData.players.forEach((p) => {
    if (p.teamId === id) p.teamId = null;
  });
  if (currentTeamFilter === id) currentTeamFilter = "";
  persist();
  populateTeamFilterSelect();
  populatePlayerSelects();
  renderTeams();
  renderPlayers();
  renderDashboard();
  if (autoAssignAllPlayers()) {
    populatePlayerSelects();
    renderPlayers();
    renderDashboard();
  }
}

// ---------- Scoring Helpers ----------

function categorySubtotal(scores, category) {
  return category.criteria.reduce((sum, c) => sum + (Number(scores[c.key]) || 0), 0);
}

// Summiert über alle je vorkommenden Kategorien inkl. der Torwart-Variante. Da eine Bewertung
// immer nur die Kriterien-Keys ihres Spielertyps enthält, steuert die jeweils andere Variante
// 0 Punkte bei — die Summe stimmt dadurch für Feldspieler und Torhüter ohne Spielerkontext.
function totalScore(scores) {
  return ALL_SCORE_CATEGORIES.reduce((sum, cat) => sum + categorySubtotal(scores, cat), 0);
}

// Beschränkt eine Bewertung auf die Kriterien des jeweiligen Spielertyps. Nötig, wenn ein
// Spieler nach einer Bewertung den Typ wechselt: sonst blieben die Werte des alten Typs in
// der Bewertung stehen und würden in totalScore() zusätzlich mitgezählt.
function pickScoresForPlayer(scores, player) {
  const erlaubt = new Set();
  scoreCategoriesFor(player).forEach((cat) => cat.criteria.forEach((c) => erlaubt.add(c.key)));
  const gefiltert = {};
  Object.keys(scores || {}).forEach((key) => {
    if (erlaubt.has(key)) gefiltert[key] = scores[key];
  });
  return gefiltert;
}

function latestEvaluationFor(playerId) {
  const evals = appData.evaluations.filter((e) => e.playerId === playerId).sort((a, b) => a.date.localeCompare(b.date));
  return evals.length ? evals[evals.length - 1] : null;
}

function evaluationsFor(playerId) {
  return appData.evaluations.filter((e) => e.playerId === playerId).sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Player Management ----------

function filteredPlayers() {
  if (!currentTeamFilter) return appData.players.slice();
  return appData.players.filter((p) => p.teamId === currentTeamFilter);
}

function populatePlayerSelects() {
  const options = filteredPlayers()
    .sort((a, b) => playerFullName(a).localeCompare(playerFullName(b)))
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(playerFullName(p))}${p.teamId ? " (" + escapeHtml(teamName(p.teamId)) + ")" : ""}</option>`)
    .join("");
  ["eval-player-select", "profile-player-select"].forEach((id) => {
    const sel = document.getElementById(id);
    const current = sel.value;
    sel.innerHTML = `<option value="">— Spieler wählen —</option>` + options;
    if (current && [...sel.options].some((o) => o.value === current)) sel.value = current;
  });
  populateComparePlayerSelect();
  populateMultiCompareSelects();
}

function populateMultiCompareSelects() {
  const options = filteredPlayers()
    .sort((a, b) => playerFullName(a).localeCompare(playerFullName(b)))
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(playerFullName(p))}${p.teamId ? " (" + escapeHtml(teamName(p.teamId)) + ")" : ""}</option>`)
    .join("");
  ["compare-player-1", "compare-player-2", "compare-player-3", "compare-player-4"].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = `<option value="">— keiner —</option>` + options;
    if (current && [...sel.options].some((o) => o.value === current)) sel.value = current;
    else sel.value = "";
  });
}

function populateComparePlayerSelect() {
  const sel = document.getElementById("eval-compare-player-select");
  if (!sel) return;
  const current = sel.value;
  // Nur Spieler desselben Typs zur Auswahl stellen: ein Feldspieler hat keine Werte zu den
  // Torwart-Kriterien (und umgekehrt), ein typübergreifender Vergleich liefe dort ins Leere.
  const evalPlayerSel = document.getElementById("eval-player-select");
  const evalPlayer = evalPlayerSel ? appData.players.find((p) => p.id === evalPlayerSel.value) : null;
  const istTorwart = !!evalPlayer && evalPlayer.spielertyp === "torhueter";
  const options = filteredPlayers()
    .filter((p) => !evalPlayer || p.id === evalPlayer.id || (p.spielertyp === "torhueter") === istTorwart)
    .sort((a, b) => playerFullName(a).localeCompare(playerFullName(b)))
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(playerFullName(p))}${p.teamId ? " (" + escapeHtml(teamName(p.teamId)) + ")" : ""}</option>`)
    .join("");
  sel.innerHTML = `<option value="">— kein Vergleich, Bestwert anzeigen —</option>` + options;
  if (current && sel.querySelector(`option[value="${current}"]`)) sel.value = current;
  else sel.value = "";
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setupPlayerForm() {
  document.getElementById("player-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!canEdit()) return;
    const firstName = document.getElementById("p-firstname").value.trim();
    const lastName = document.getElementById("p-lastname").value.trim();
    if (!firstName && !lastName) return;
    const player = {
      id: uuid(),
      firstName,
      lastName,
      teamId: null,
      position: document.getElementById("p-position").value.trim(),
      spielertyp: document.getElementById("p-spielertyp").value,
      birthdate: document.getElementById("p-birthdate").value,
      createdAt: new Date().toISOString()
    };
    autoAssignTeamForPlayer(player);
    appData.players.push(player);
    persist();
    e.target.reset();
    populatePlayerSelects();
    renderPlayers();
    renderDashboard();
  });
}

function teamOptionsHtml(selectedId) {
  const options = appData.teams
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === selectedId ? "selected" : ""}>${escapeHtml(t.name)}</option>`)
    .join("");
  return `<option value="" ${!selectedId ? "selected" : ""}>— ohne Mannschaft —</option>` + options;
}

function spielertypOptionsHtml(selected) {
  const val = selected === "torhueter" ? "torhueter" : "feldspieler";
  return (
    `<option value="feldspieler" ${val === "feldspieler" ? "selected" : ""}>Feldspieler</option>` +
    `<option value="torhueter" ${val === "torhueter" ? "selected" : ""}>Torhüter</option>`
  );
}

function populatePlayersPositionFilter() {
  const sel = document.getElementById("players-position-filter-select");
  if (!sel) return;
  const current = sel.value;
  const positions = Array.from(new Set(appData.players.map((p) => (p.position || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
  sel.innerHTML = `<option value="">Alle Positionen</option>` + positions.map((pos) => `<option value="${escapeHtml(pos)}">${escapeHtml(pos)}</option>`).join("");
  if (current && positions.includes(current)) sel.value = current;
}

function filterAndSortPlayers(players) {
  let result = players;
  if (playersPositionFilter) {
    result = result.filter((p) => (p.position || "") === playersPositionFilter);
  }
  if (playersBirthdateFromFilter) {
    result = result.filter((p) => p.birthdate && p.birthdate >= playersBirthdateFromFilter);
  }
  if (playersBirthdateToFilter) {
    result = result.filter((p) => p.birthdate && p.birthdate <= playersBirthdateToFilter);
  }
  if (playersSearchQuery) {
    result = result.filter((p) => playerFullName(p).toLowerCase().includes(playersSearchQuery));
  }
  result = result.slice().sort((a, b) => {
    switch (playersSortOrder) {
      case "name-desc":
        return playerFullName(b).localeCompare(playerFullName(a));
      case "birthdate-asc":
        return (a.birthdate || "9999-99-99").localeCompare(b.birthdate || "9999-99-99");
      case "birthdate-desc":
        return (b.birthdate || "0000-00-00").localeCompare(a.birthdate || "0000-00-00");
      default:
        return playerFullName(a).localeCompare(playerFullName(b));
    }
  });
  return result;
}

function renderPlayers() {
  const list = document.getElementById("players-list");
  populatePlayersPositionFilter();
  const players = filterAndSortPlayers(filteredPlayers());
  if (!players.length) {
    list.innerHTML = `<div class="empty-state">${appData.players.length ? "Kein Spieler entspricht den aktuellen Filtern." : "Noch keine Spieler angelegt."}</div>`;
    return;
  }
  list.innerHTML = players
    .map(
      (p) => `
    <div class="player-edit-row" data-id="${escapeHtml(p.id)}">
      <input type="text" class="p-edit-firstname" value="${escapeHtml(p.firstName || "")}" placeholder="Vorname" />
      <input type="text" class="p-edit-lastname" value="${escapeHtml(p.lastName || "")}" placeholder="Nachname" />
      <input type="text" class="p-edit-position" value="${escapeHtml(p.position || "")}" placeholder="Position" />
      <select class="p-edit-spielertyp">${spielertypOptionsHtml(p.spielertyp)}</select>
      <input type="date" class="p-edit-birthdate" value="${escapeHtml(p.birthdate || "")}" />
      <select class="p-edit-team">${teamOptionsHtml(p.teamId)}</select>
      <button class="btn small danger" data-action="delete">Löschen</button>
    </div>`
    )
    .join("");

  list.querySelectorAll(".player-edit-row").forEach((row) => {
    const id = row.dataset.id;
    const player = appData.players.find((x) => x.id === id);
    if (!player) return;
    row.querySelector(".p-edit-firstname").addEventListener("change", (e) => {
      player.firstName = e.target.value.trim();
      commitPlayerEdit();
    });
    row.querySelector(".p-edit-lastname").addEventListener("change", (e) => {
      player.lastName = e.target.value.trim();
      commitPlayerEdit();
    });
    row.querySelector(".p-edit-position").addEventListener("change", (e) => {
      player.position = e.target.value.trim();
      commitPlayerEdit();
    });
    row.querySelector(".p-edit-spielertyp").addEventListener("change", (e) => {
      player.spielertyp = e.target.value;
      commitPlayerEdit();
    });
    row.querySelector(".p-edit-birthdate").addEventListener("change", (e) => {
      player.birthdate = e.target.value;
      autoAssignTeamForPlayer(player);
      commitPlayerEdit();
    });
    row.querySelector(".p-edit-team").addEventListener("change", (e) => {
      player.teamId = e.target.value || null;
      commitPlayerEdit();
    });
    row.querySelector('[data-action="delete"]').addEventListener("click", () => deletePlayer(id));
  });
}

function commitPlayerEdit() {
  if (!canEdit()) return;
  persist();
  populateTeamFilterSelect();
  populatePlayerSelects();
  renderPlayers();
  renderDashboard();
}

function deletePlayer(id) {
  if (!canEdit()) return;
  const p = appData.players.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`"${playerFullName(p)}" und alle zugehörigen Bewertungen wirklich löschen?`)) return;
  appData.players = appData.players.filter((x) => x.id !== id);
  appData.evaluations = appData.evaluations.filter((e) => e.playerId !== id);
  persist();
  populatePlayerSelects();
  renderPlayers();
  renderDashboard();
  renderProfile();
}

// ---------- Dashboard ----------

function isAboveThreshold(weighted, ageGroup) {
  if (weighted === null || !ageGroup || !appData.ageGroupThresholds) return false;
  const threshold = Number(appData.ageGroupThresholds[ageGroup]);
  return !isNaN(threshold) && weighted >= threshold;
}

function renderDashboard() {
  const tbody = document.getElementById("dashboard-tbody");
  const players = filteredPlayers();
  if (!players.length) {
    document.getElementById("dashboard-empty").style.display = "block";
    document.getElementById("dashboard-empty").textContent = appData.players.length
      ? "Keine Spieler in dieser Mannschaft."
      : "Noch keine Spieler angelegt. Wechsle zu \"Spieler verwalten\".";
    tbody.innerHTML = "";
    return;
  }
  let rows = players
    .slice()
    .map((p) => {
      const last = latestEvaluationFor(p.id);
      const total = last ? totalScore(last.scores) : null;
      const pct = total !== null ? Math.round((total / TOTAL_MAX_SCORE) * 100) : 0;
      const ageGroup = getAgeGroupForPlayer(p);
      const weighted = last ? Math.round(weightedPercent(last.scores, ageGroup, p)) : null;
      const days = last ? daysSince(last.date) : null;
      return { p, last, total, pct, weighted, ageGroup, days };
    });

  if (dashboardStalenessFilter) {
    const minDays = Number(dashboardStalenessFilter) * 30;
    rows = rows.filter((r) => r.days === null || r.days >= minDays);
  }

  if (dashboardThresholdOnly) {
    rows = rows.filter((r) => isAboveThreshold(r.weighted, r.ageGroup));
  }

  rows.sort((a, b) => (b.weighted ?? -1) - (a.weighted ?? -1));

  if (!rows.length) {
    document.getElementById("dashboard-empty").style.display = "block";
    document.getElementById("dashboard-empty").textContent = "Kein Spieler entspricht dem aktuellen Filter.";
    tbody.innerHTML = "";
    return;
  }
  document.getElementById("dashboard-empty").style.display = "none";

  tbody.innerHTML = rows
    .map(
      ({ p, last, total, pct, weighted, ageGroup, days }) => `
    <tr data-id="${escapeHtml(p.id)}">
      <td>${escapeHtml(playerFullName(p))}</td>
      <td>${escapeHtml(p.position || "—")}</td>
      <td>${escapeHtml(teamName(p.teamId) || "—")}</td>
      <td class="${stalenessClass(days)}">${last ? `${escapeHtml(last.date)} <span class="muted">(vor ${days} Tagen)</span>` : "noch nie bewertet"}</td>
      <td>
        <div class="score-cell">
          <div class="score-bar-bg"><div class="score-bar-fill" style="width:${pct}%"></div></div>
          <span>${total !== null ? total + "/" + TOTAL_MAX_SCORE : "—"}</span>
        </div>
      </td>
      <td>${weighted !== null ? weighted + "%" : "—"}${isAboveThreshold(weighted, ageGroup) ? `<span class="potential-flag" title="Über Förder-/Beobachtungsschwelle (${appData.ageGroupThresholds[ageGroup]}%)">🔭</span>` : ""}<div class="muted" style="font-size:11px;">${ageGroup ? escapeHtml(AGE_GROUP_LABELS[ageGroup]) : "keine Altersstufe"}</div></td>
      <td class="row-actions">
        <button class="btn small success" data-action="evaluate">Bewerten</button>
        <button class="btn small secondary" data-action="profile">Profil</button>
      </td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll('[data-action="profile"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.target.closest("tr").dataset.id;
      switchTab("profile");
      document.getElementById("profile-player-select").value = id;
      renderProfile();
    });
  });

  tbody.querySelectorAll('[data-action="evaluate"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.target.closest("tr").dataset.id;
      switchTab("evaluate");
      const sel = document.getElementById("eval-player-select");
      sel.value = id;
      // Programmatisches Setzen von .value löst kein change-Event aus – manuell anstoßen,
      // damit die Bewertungsfelder mit den letzten Werten des gewählten Spielers vorbelegt
      // (und Gesamtscore/Letzte-Bewertung-Info aktualisiert) werden.
      sel.dispatchEvent(new Event("change"));
    });
  });
}

// ---------- Evaluation Form ----------

function getBestForCriterion(critKey, comparePlayerId) {
  if (comparePlayerId) {
    const p = appData.players.find((x) => x.id === comparePlayerId);
    if (!p) return null;
    const last = latestEvaluationFor(p.id);
    if (!last) return null;
    if (last.scores[critKey] === undefined || isNaN(Number(last.scores[critKey]))) return null;
    const val = Number(last.scores[critKey]);
    return { player: p, value: val, isComparison: true };
  }
  let pool = appData.players;
  if (currentTeamFilter) {
    const teamPlayers = appData.players.filter((p) => p.teamId === currentTeamFilter);
    const filterTeam = appData.teams.find((t) => t.id === currentTeamFilter);
    if (filterTeam && (filterTeam.birthdateFrom || filterTeam.birthdateTo)) {
      // Auf den konkreten Jahrgang/Bereich der gefilterten Mannschaft (z.B. U19) einschränken,
      // statt auf die grobe Altersklasse (F/E, D/C, A/B), die mehrere Jahrgänge umfasst.
      pool = appData.players.filter((p) => {
        if (!p.birthdate) return false;
        if (filterTeam.birthdateFrom && p.birthdate < filterTeam.birthdateFrom) return false;
        if (filterTeam.birthdateTo && p.birthdate > filterTeam.birthdateTo) return false;
        return true;
      });
    } else {
      pool = teamPlayers;
    }
  }
  let best = null;
  pool.forEach((p) => {
    const last = latestEvaluationFor(p.id);
    if (!last) return;
    if (last.scores[critKey] === undefined || isNaN(Number(last.scores[critKey]))) return;
    const val = Number(last.scores[critKey]);
    if (!best || val > best.value) {
      best = { player: p, value: val };
      return;
    }
    if (val === best.value) {
      if (p.birthdate && best.player.birthdate && p.birthdate > best.player.birthdate) {
        best = { player: p, value: val };
      }
    }
  });
  return best;
}

function renderCategoryFields(container, scores, onChange, player) {
  container.innerHTML = "";
  const compareSelect = document.getElementById("eval-compare-player-select");
  const comparePlayerId = compareSelect ? compareSelect.value : "";
  scoreCategoriesFor(player).forEach((cat) => {
    const card = document.createElement("div");
    card.className = "category-card";
    card.innerHTML = `
      <div class="category-head">
        <h3>${cat.label} <span class="muted">(max. ${cat.max})</span></h3>
        <span class="subtotal" data-cat="${cat.id}">0 / ${cat.max}</span>
      </div>
      <div class="criteria-wrap"></div>
    `;
    const wrap = card.querySelector(".criteria-wrap");
    cat.criteria.forEach((crit) => {
      const val = scores[crit.key] || 5;
      scores[crit.key] = val;
      const rubric = CRITERIA_RUBRIC[crit.key] || {};
      const best = getBestForCriterion(crit.key, comparePlayerId);
      const bestLabel = best && best.isComparison ? "Vergleichswert" : "Bestwert";
      const bestIcon = best && best.isComparison ? "🆚" : "🏆";
      const div = document.createElement("div");
      div.className = "criterion";
      div.innerHTML = `
        <div class="criterion-head">
          <label>${crit.label}</label>
          <input type="number" class="val-input" min="1" max="10" step="1" value="${escapeHtml(val)}" />
        </div>
        <input type="range" class="range-input" min="1" max="10" step="1" value="${escapeHtml(val)}" data-key="${crit.key}" />
        ${best ? `<div class="criterion-best muted">${bestIcon} ${bestLabel}: ${escapeHtml(playerFullName(best.player))} (${escapeHtml(best.value)})</div>` : ""}
        <details>
          <summary>Bewertungshilfe anzeigen</summary>
          <div class="rubric-grid">
            <div><b>1 · Sehr schwach</b>${escapeHtml(rubric[1] || "")}</div>
            <div><b>5 · Solide</b>${escapeHtml(rubric[5] || "")}</div>
            <div><b>10 · Elite</b>${escapeHtml(rubric[10] || "")}</div>
          </div>
        </details>
      `;
      const rangeInput = div.querySelector(".range-input");
      const numberInput = div.querySelector(".val-input");

      const applyValue = (value) => {
        const clamped = Math.min(10, Math.max(1, Math.round(value)));
        scores[crit.key] = clamped;
        rangeInput.value = clamped;
        numberInput.value = clamped;
        updateCategorySubtotals(container, scores, player);
        onChange();
      };

      rangeInput.addEventListener("input", () => applyValue(Number(rangeInput.value)));
      numberInput.addEventListener("input", () => {
        if (numberInput.value === "") return;
        applyValue(Number(numberInput.value));
      });
      numberInput.addEventListener("blur", () => {
        if (numberInput.value === "" || isNaN(Number(numberInput.value))) {
          applyValue(scores[crit.key] || 5);
        }
      });
      wrap.appendChild(div);
    });
    container.appendChild(card);
  });
  updateCategorySubtotals(container, scores, player);
}

function updateCategorySubtotals(container, scores, player) {
  scoreCategoriesFor(player).forEach((cat) => {
    const subtotal = categorySubtotal(scores, cat);
    const el = container.querySelector(`[data-cat="${cat.id}"]`);
    if (el) el.textContent = `${subtotal} / ${cat.max}`;
  });
}

let currentEvalScores = {};

function renderEvaluateForm() {
  document.getElementById("eval-date").value = document.getElementById("eval-date").value || todayStr();
  // Bewerter-Feld vorbelegen: im Gateway-Modus mit dem eingeloggten Nutzer (jede
  // Bewertung soll nachvollziehbar sein, wer sie erfasst hat), sonst mit dem zuletzt
  // im lokalen Datei-Modus verwendeten Namen. Bleibt in beiden Fällen änderbar.
  const eigenerName = currentUser ? (`${currentUser.vorname || ""} ${currentUser.nachname || ""}`.trim() || currentUser.username) : "";
  const savedEvaluator = localStorage.getItem("spielertool_evaluator") || "";
  document.getElementById("eval-evaluator").value = document.getElementById("eval-evaluator").value || eigenerName || savedEvaluator;

  const playerId = document.getElementById("eval-player-select").value;
  currentEvalScores = getInitialScoresForPlayer(playerId);
  const container = document.getElementById("eval-categories");
  const player = appData.players.find((p) => p.id === playerId);
  renderCategoryFields(container, currentEvalScores, updateEvalTotal, player);
  updateEvalTotal();
  updateLastEvaluationInfo();
}

function getInitialScoresForPlayer(playerId) {
  if (!playerId) return {};
  const last = latestEvaluationFor(playerId);
  if (!last) return {};
  const player = appData.players.find((p) => p.id === playerId);
  return pickScoresForPlayer(last.scores, player);
}

function updateLastEvaluationInfo() {
  const playerId = document.getElementById("eval-player-select").value;
  const info = document.getElementById("eval-last-evaluation-info");
  if (!playerId) {
    info.textContent = "";
    return;
  }
  const last = latestEvaluationFor(playerId);
  if (!last) {
    info.textContent = "Noch keine Bewertung für diesen Spieler vorhanden.";
    return;
  }
  const total = totalScore(last.scores);
  info.textContent = `Letzte Bewertung: ${last.date} (${total} / ${TOTAL_MAX_SCORE} Punkte) — Werte unten sind damit vorausgefüllt.`;
}

function updateEvalTotal() {
  const total = totalScore(currentEvalScores);
  const playerId = document.getElementById("eval-player-select").value;
  const player = appData.players.find((p) => p.id === playerId);
  const ageGroup = player ? getAgeGroupForPlayer(player) : null;
  const weighted = Math.round(weightedPercent(currentEvalScores, ageGroup, player));
  const ageGroupLabel = ageGroup ? AGE_GROUP_LABELS[ageGroup] : "keine Altersstufe";
  document.getElementById("eval-total-val").innerHTML =
    `${total} / ${TOTAL_MAX_SCORE} <span class="muted" style="font-size:13px;">· gewichtet ${weighted}% (${escapeHtml(ageGroupLabel)})</span>`;
}

function setupEvaluateForm() {
  document.getElementById("eval-player-select").addEventListener("change", () => {
    const playerId = document.getElementById("eval-player-select").value;
    currentEvalScores = getInitialScoresForPlayer(playerId);
    // Spielertyp neu auflösen: bei einem Wechsel zwischen Feldspieler und Torhüter
    // müssen die Kriterien-Karten komplett neu aufgebaut werden.
    const player = appData.players.find((p) => p.id === playerId);
    populateComparePlayerSelect();
    renderCategoryFields(document.getElementById("eval-categories"), currentEvalScores, updateEvalTotal, player);
    updateEvalTotal();
    updateLastEvaluationInfo();
  });

  document.getElementById("eval-compare-player-select").addEventListener("change", () => {
    const player = appData.players.find((p) => p.id === document.getElementById("eval-player-select").value);
    renderCategoryFields(document.getElementById("eval-categories"), currentEvalScores, updateEvalTotal, player);
    updateEvalTotal();
  });

  document.getElementById("evaluate-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!canEdit()) return;
    const playerId = document.getElementById("eval-player-select").value;
    if (!playerId) {
      alert("Bitte einen Spieler wählen.");
      return;
    }
    const date = document.getElementById("eval-date").value || todayStr();
    const evaluator = document.getElementById("eval-evaluator").value.trim();
    localStorage.setItem("spielertool_evaluator", evaluator);

    const evaluation = {
      id: uuid(),
      playerId,
      date,
      evaluator,
      notes: document.getElementById("eval-notes").value.trim(),
      scores: pickScoresForPlayer(currentEvalScores, appData.players.find((p) => p.id === playerId))
    };
    appData.evaluations.push(evaluation);
    persist();
    alert("Bewertung gespeichert.");
    document.getElementById("eval-notes").value = "";
    renderEvaluateForm();
    renderDashboard();
    renderProfile();
  });
}

// ---------- Profile ----------

function renderProfile() {
  const sel = document.getElementById("profile-player-select");
  const playerId = sel.value;
  const detail = document.getElementById("profile-detail");
  const empty = document.getElementById("profile-empty");

  if (!playerId) {
    detail.style.display = "none";
    empty.style.display = "block";
    return;
  }
  const player = appData.players.find((p) => p.id === playerId);
  if (!player) {
    detail.style.display = "none";
    empty.style.display = "block";
    return;
  }
  detail.style.display = "block";
  empty.style.display = "none";

  const ageGroup = getAgeGroupForPlayer(player);
  document.getElementById("profile-name").textContent = playerFullName(player);
  document.getElementById("profile-meta").textContent =
    `${player.position || "—"} · ${player.spielertyp === "torhueter" ? "Torhüter" : "Feldspieler"}` +
    ` · ${teamName(player.teamId) || "ohne Mannschaft"}${player.jersey ? " · #" + player.jersey : ""}` +
    ` · ${ageGroup ? AGE_GROUP_LABELS[ageGroup] : "keine Altersstufe"}`;

  const evals = evaluationsFor(playerId);
  renderProfileHistoryTable(evals, ageGroup, player);
  renderProfileCharts(evals, player);
}

function renderProfileHistoryTable(evals, ageGroup, player) {
  const tbody = document.getElementById("profile-history-tbody");
  if (!evals.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Noch keine Bewertungen für diesen Spieler.</td></tr>`;
    return;
  }
  tbody.innerHTML = evals
    .slice()
    .reverse()
    .map((ev) => {
      const total = totalScore(ev.scores);
      const pct = Math.round((total / TOTAL_MAX_SCORE) * 100);
      const weighted = Math.round(weightedPercent(ev.scores, ageGroup, player));
      return `
      <tr data-id="${escapeHtml(ev.id)}">
        <td>${escapeHtml(ev.date)}</td>
        <td>${escapeHtml(ev.evaluator || "—")}</td>
        <td>
          <div class="score-cell">
            <div class="score-bar-bg"><div class="score-bar-fill" style="width:${pct}%"></div></div>
            <span>${total} / ${TOTAL_MAX_SCORE}</span>
          </div>
        </td>
        <td><strong>${weighted}%</strong></td>
        <td class="muted">${escapeHtml(ev.notes || "")}</td>
        <td class="row-actions">
          <button class="btn small secondary" data-action="view-eval">Ansehen</button>
          <button class="btn small danger" data-action="del-eval">Löschen</button>
        </td>
      </tr>
      <tr class="eval-detail-row" data-detail-id="${escapeHtml(ev.id)}" style="display:none;">
        <td colspan="6">${renderEvalDetailHtml(ev, player)}</td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll('[data-action="view-eval"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.target.closest("tr").dataset.id;
      const detailRow = tbody.querySelector(`.eval-detail-row[data-detail-id="${id}"]`);
      if (!detailRow) return;
      const isOpen = detailRow.style.display !== "none";
      detailRow.style.display = isOpen ? "none" : "table-row";
      e.target.textContent = isOpen ? "Ansehen" : "Verbergen";
    });
  });

  tbody.querySelectorAll('[data-action="del-eval"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (!canEdit()) return;
      const id = e.target.closest("tr").dataset.id;
      if (!confirm("Diese Bewertung löschen?")) return;
      appData.evaluations = appData.evaluations.filter((ev) => ev.id !== id);
      persist();
      renderProfile();
      renderDashboard();
    });
  });
}

function renderEvalDetailHtml(ev, player) {
  return scoreCategoriesFor(player).map((cat) => {
    const subtotal = categorySubtotal(ev.scores, cat);
    const rows = cat.criteria
      .map((crit) => `<div class="eval-detail-item"><span>${escapeHtml(crit.label)}</span><span class="eval-detail-val">${escapeHtml(ev.scores[crit.key] ?? "—")}</span></div>`)
      .join("");
    return `
      <div class="eval-detail-cat">
        <div class="eval-detail-cat-head"><strong>${escapeHtml(cat.label)}</strong><span>${subtotal} / ${cat.max}</span></div>
        ${rows}
      </div>`;
  }).join("");
}

function renderProfileCharts(evals, player) {
  const cats = scoreCategoriesFor(player);
  const lineCtx = document.getElementById("profile-line-chart").getContext("2d");
  const radarCtx = document.getElementById("profile-radar-chart").getContext("2d");

  if (profileCharts.line) profileCharts.line.destroy();
  if (profileCharts.radar) profileCharts.radar.destroy();

  const labels = evals.map((e) => e.date);
  const totals = evals.map((e) => totalScore(e.scores));
  const datasets = [
    {
      label: "Gesamtscore",
      data: totals,
      borderColor: "#1a56a0",
      backgroundColor: "rgba(26,86,160,0.1)",
      tension: 0.25,
      fill: true
    }
  ];
  const palette = ["#2d8c4e", "#c0392b", "#c9941f", "#7a5cc7", "#1a9ba0"];
  cats.forEach((cat, i) => {
    datasets.push({
      label: cat.label,
      data: evals.map((e) => categorySubtotal(e.scores, cat)),
      borderColor: palette[i % palette.length],
      backgroundColor: "transparent",
      tension: 0.25,
      hidden: true
    });
  });

  profileCharts.line = new Chart(lineCtx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true } }
    }
  });

  const radarColors = [
    { border: "#1a56a0", bg: "rgba(26,86,160,0.2)" },
    { border: "#c0392b", bg: "rgba(192,57,43,0.12)" },
    { border: "#2d8c4e", bg: "rgba(45,140,78,0.12)" }
  ];
  const compareEvals = evals.slice(-3).reverse();
  const radarDatasets = compareEvals.length
    ? compareEvals.map((ev, i) => ({
        label: ev.date,
        data: cats.map((cat) => Math.round((categorySubtotal(ev.scores, cat) / cat.max) * 100)),
        borderColor: radarColors[i].border,
        backgroundColor: radarColors[i].bg
      }))
    : [{ label: "Keine Daten", data: cats.map(() => 0), borderColor: "#1a56a0", backgroundColor: "rgba(26,86,160,0.2)" }];

  profileCharts.radar = new Chart(radarCtx, {
    type: "radar",
    data: {
      labels: cats.map((c) => c.label),
      datasets: radarDatasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: { r: { min: 0, max: 100 } }
    }
  });
}

function setupProfileForm() {
  document.getElementById("profile-player-select").addEventListener("change", renderProfile);
  document.getElementById("btn-export-profile-pdf").addEventListener("click", exportProfilePdf);
  ["compare-player-1", "compare-player-2", "compare-player-3", "compare-player-4"].forEach((id) => {
    document.getElementById(id).addEventListener("change", renderPlayerComparison);
  });
}

function renderPlayerComparison() {
  const radarCanvas = document.getElementById("compare-radar-chart");
  const emptyEl = document.getElementById("compare-empty");
  const tableEl = document.getElementById("compare-table");
  const tbody = document.getElementById("compare-table-tbody");

  const playerIds = ["compare-player-1", "compare-player-2", "compare-player-3", "compare-player-4"]
    .map((id) => document.getElementById(id).value)
    .filter(Boolean);

  if (profileCharts.compare) {
    profileCharts.compare.destroy();
    profileCharts.compare = null;
  }

  if (!playerIds.length) {
    emptyEl.style.display = "block";
    tableEl.style.display = "none";
    return;
  }
  emptyEl.style.display = "none";
  tableEl.style.display = "table";

  const palette = ["#1a56a0", "#c0392b", "#2d8c4e", "#c9941f"];
  const entries = playerIds.map((id) => {
    const player = appData.players.find((p) => p.id === id);
    const latest = latestEvaluationFor(id);
    const ageGroup = player ? getAgeGroupForPlayer(player) : null;
    return { player, latest, ageGroup };
  });

  tbody.innerHTML = entries
    .map(({ player, latest, ageGroup }) => {
      if (!player) return "";
      const total = latest ? totalScore(latest.scores) : null;
      const weighted = latest ? Math.round(weightedPercent(latest.scores, ageGroup, player)) : null;
      return `
        <tr>
          <td>${escapeHtml(playerFullName(player))}</td>
          <td>${escapeHtml(teamName(player.teamId) || "—")}</td>
          <td>${ageGroup ? escapeHtml(AGE_GROUP_LABELS[ageGroup]) : "—"}</td>
          <td>${latest ? escapeHtml(latest.date) : "—"}</td>
          <td>${total !== null ? total + " / " + TOTAL_MAX_SCORE : "—"}</td>
          <td><strong>${weighted !== null ? weighted + "%" : "—"}</strong></td>
        </tr>`;
    })
    .join("");

  // Jeder Spieler wird an seinen eigenen Kategorien gemessen (Torhüter am Torwartspiel,
  // Feldspieler an Technik & Taktik). Da beide Varianten dieselbe Reihenfolge und dieselben
  // Maximalwerte haben, bleiben die Prozentwerte auf einer gemeinsamen Achse darstellbar.
  const vorhandenePlayer = entries.filter((e) => e.player);
  const radarDatasets = vorhandenePlayer.map((e, i) => ({
    label: playerFullName(e.player),
    data: scoreCategoriesFor(e.player).map((cat) => (e.latest ? Math.round((categorySubtotal(e.latest.scores, cat) / cat.max) * 100) : 0)),
    borderColor: palette[i % palette.length],
    backgroundColor: palette[i % palette.length] + "33"
  }));

  const anzahlTorhueter = vorhandenePlayer.filter((e) => e.player.spielertyp === "torhueter").length;
  const gemischt = anzahlTorhueter > 0 && anzahlTorhueter < vorhandenePlayer.length;
  const hintEl = document.getElementById("compare-mixed-hint");
  if (hintEl) hintEl.style.display = gemischt ? "block" : "none";
  const radarLabels = scoreCategoriesFor(gemischt ? null : vorhandenePlayer[0] && vorhandenePlayer[0].player).map((c) => c.label);
  if (gemischt) radarLabels[0] = "Technik & Taktik / Torwartspiel";

  profileCharts.compare = new Chart(radarCanvas.getContext("2d"), {
    type: "radar",
    data: {
      labels: radarLabels,
      datasets: radarDatasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: { r: { min: 0, max: 100 } }
    }
  });
}

function exportProfilePdf() {
  const playerId = document.getElementById("profile-player-select").value;
  const player = appData.players.find((p) => p.id === playerId);
  if (!player) {
    alert("Bitte zuerst einen Spieler auswählen.");
    return;
  }
  const evals = evaluationsFor(playerId);
  if (!evals.length) {
    alert("Für diesen Spieler liegen noch keine Bewertungen vor.");
    return;
  }
  if (!window.jspdf) {
    alert("PDF-Bibliothek konnte nicht geladen werden (keine Internetverbindung?).");
    return;
  }
  if (typeof new window.jspdf.jsPDF().autoTable !== "function") {
    alert("PDF-Tabellen-Plugin (autoTable) konnte nicht geladen werden — bitte Seite neu laden.");
    return;
  }
  const compareEvals = evals.slice(-3);
  const ageGroup = getAgeGroupForPlayer(player);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text(`Spielerprofil: ${playerFullName(player)}`, 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${player.position || "—"} · ${teamName(player.teamId) || "ohne Mannschaft"} · ${ageGroup ? AGE_GROUP_LABELS[ageGroup] : "keine Altersstufe"}`, 14, 22);
  doc.text(`Vergleich der letzten ${compareEvals.length} Bewertung${compareEvals.length > 1 ? "en" : ""} · Erstellt am ${new Date().toLocaleDateString("de-DE")}`, 14, 27);
  doc.setTextColor(0);

  const head = ["Kriterium", ...compareEvals.map((e) => e.date)];
  const body = [];
  scoreCategoriesFor(player).forEach((cat) => {
    body.push([
      { content: cat.label, styles: { fontStyle: "bold", fillColor: [232, 240, 251] } },
      ...compareEvals.map(() => ({ content: "", styles: { fillColor: [232, 240, 251] } }))
    ]);
    cat.criteria.forEach((crit) => {
      body.push([crit.label, ...compareEvals.map((e) => String(e.scores[crit.key] ?? "—"))]);
    });
    body.push([
      { content: `${cat.label} – Summe`, styles: { fontStyle: "bold" } },
      ...compareEvals.map((e) => ({ content: `${categorySubtotal(e.scores, cat)} / ${cat.max}`, styles: { fontStyle: "bold" } }))
    ]);
  });
  body.push([
    { content: "Gesamtscore", styles: { fontStyle: "bold", fillColor: [26, 86, 160], textColor: 255 } },
    ...compareEvals.map((e) => ({
      content: `${totalScore(e.scores)} / ${TOTAL_MAX_SCORE}`,
      styles: { fontStyle: "bold", fillColor: [26, 86, 160], textColor: 255 }
    }))
  ]);
  body.push([
    { content: `Gewichtet (${ageGroup ? AGE_GROUP_LABELS[ageGroup] : "ohne Altersstufe"})`, styles: { fontStyle: "bold", fillColor: [45, 140, 78], textColor: 255 } },
    ...compareEvals.map((e) => ({
      content: `${Math.round(weightedPercent(e.scores, ageGroup, player))}%`,
      styles: { fontStyle: "bold", fillColor: [45, 140, 78], textColor: 255 }
    }))
  ]);

  doc.autoTable({
    head: [head],
    body,
    startY: 32,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [26, 86, 160] }
  });

  let y = doc.lastAutoTable.finalY + 10;
  if (y > 200) {
    doc.addPage();
    y = 16;
  }

  const radarCanvas = document.getElementById("profile-radar-chart");
  const lineCanvas = document.getElementById("profile-line-chart");
  doc.setFontSize(11);
  doc.text("Vergleich nach Kategorie (%) und Verlauf", 14, y);
  if (radarCanvas) {
    doc.addImage(radarCanvas.toDataURL("image/png"), "PNG", 14, y + 4, 90, 70);
  }
  if (lineCanvas) {
    doc.addImage(lineCanvas.toDataURL("image/png"), "PNG", 108, y + 4, 90, 70);
  }

  doc.save(`Spielerprofil_${playerFullName(player).replace(/\s+/g, "_")}_${todayStr()}.pdf`);
}

// ---------- Export / Import (Backup) ----------

function setupBackupButtons() {
  document.getElementById("btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(appData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "spielerdaten-backup-" + todayStr() + ".json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("import-file-input").click();
  });

  document.getElementById("import-file-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data.players) || !Array.isArray(data.evaluations)) {
        alert("Ungültiges Datenformat.");
        return;
      }
      if (!confirm("Aktuelle Daten durch die importierte Datei ersetzen?")) return;
      appData = data;
      migrateData(appData);
      autoAssignAllPlayers();
      persist();
      renderAll();
    } catch (err) {
      alert("Datei konnte nicht gelesen werden.");
    }
    e.target.value = "";
  });
}

// ---------- Excel-Import (Spieler) ----------

function normalizeHeaderKey(key) {
  return String(key).trim().toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
}

const KNOWN_HEADER_KEYS = ["vorname", "nachname", "name", "position", "geburtsdatum", "geburtstag", "birthdate", "firstname", "lastname"];

function looksLikeHeaderRow(row) {
  const hasHeaderWord = row.some((cell) => KNOWN_HEADER_KEYS.includes(normalizeHeaderKey(cell)));
  if (!hasHeaderWord) return false;
  // Zusätzlich prüfen, ob die Geburtsdatum-Spalte kein echtes Datum enthält – sonst würde eine
  // Datenzeile, deren Positions-Feld zufällig z.B. "Position" lautet, fälschlich als Kopfzeile
  // erkannt und komplett übersprungen.
  return !parseExcelDateToIso(row[3]);
}

function parseExcelDateToIso(value) {
  if (value === undefined || value === null || value === "") return "";
  if (value instanceof Date && !isNaN(value.getTime())) {
    // Lokale Datumsbestandteile verwenden, nicht toISOString() (UTC): xlsx liefert mit
    // cellDates:true ein Date in lokaler Zeit; toISOString() würde es in Zeitzonen mit
    // positivem UTC-Offset (z.B. Deutschland) um einen Tag nach hinten verschieben.
    const y = value.getFullYear();
    const mo = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  const str = String(value).trim();
  let m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) {
      // Pivot-Jahr statt immer "20xx": zweistellige Jahre, die mehr als 10 Jahre in der
      // Zukunft lägen, gehören ins vorherige Jahrhundert (z.B. "65" -> 1965, nicht 2065).
      const currentYear = new Date().getFullYear();
      const century = Math.floor(currentYear / 100) * 100;
      let full = century + Number(y);
      if (full > currentYear + 10) full -= 100;
      y = String(full);
    }
    return `${y.padStart(4, "0")}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

function importPlayersFromRows(rows) {
  let added = 0;
  let skipped = 0;
  rows.forEach((row, idx) => {
    if (idx === 0 && looksLikeHeaderRow(row)) return;
    const firstName = String(row[0] ?? "").trim();
    const lastName = String(row[1] ?? "").trim();
    const position = String(row[2] ?? "").trim();
    const birthdate = parseExcelDateToIso(row[3]);
    if (!firstName && !lastName) return;
    if (!lastName) {
      skipped++;
      return;
    }
    const player = {
      id: uuid(),
      firstName,
      lastName,
      teamId: null,
      position,
      spielertyp: "feldspieler",
      birthdate,
      createdAt: new Date().toISOString()
    };
    autoAssignTeamForPlayer(player);
    appData.players.push(player);
    added++;
  });
  return { added, skipped };
}

function setupExcelImport() {
  document.getElementById("btn-import-excel").addEventListener("click", () => {
    document.getElementById("import-excel-input").click();
  });

  document.getElementById("import-excel-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    const statusEl = document.getElementById("settings-excel-import-status");
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const { added, skipped } = importPlayersFromRows(rows);
      persist();
      populatePlayerSelects();
      renderPlayers();
      renderDashboard();
      if (statusEl) {
        statusEl.textContent = `${added} Spieler importiert.` + (skipped ? ` ${skipped} Zeile(n) übersprungen (Nachname fehlt).` : "");
      }
    } catch (err) {
      console.error(err);
      if (statusEl) statusEl.textContent = "Excel-Datei konnte nicht gelesen werden.";
      else alert("Excel-Datei konnte nicht gelesen werden.");
    }
    e.target.value = "";
  });
}

// ---------- Automatisches Backup ----------

function setupBackupFolder() {
  document.getElementById("btn-choose-backup-folder").addEventListener("click", async () => {
    try {
      const dir = await window.showDirectoryPicker();
      if (!(await verifyPermission(dir, true))) {
        alert("Zugriff auf den Ordner wurde nicht erlaubt.");
        return;
      }
      backupDirHandle = dir;
      await FileStore.setBackupDirHandle(dir);
      updateBackupFolderStatus();
      await runAutoBackup(true);
    } catch (e) {
      if (e.name !== "AbortError") console.error(e);
    }
  });

  document.getElementById("btn-backup-now").addEventListener("click", async () => {
    if (!backupDirHandle) {
      alert("Bitte zuerst einen Backup-Ordner wählen.");
      return;
    }
    await runAutoBackup(true);
  });
}

function updateBackupFolderStatus() {
  const nameEl = document.getElementById("settings-backup-folder-name");
  if (nameEl) nameEl.textContent = backupDirHandle ? backupDirHandle.name : "— kein Ordner gewählt —";
}

async function runAutoBackup(withPrompt) {
  const statusEl = document.getElementById("settings-backup-status");
  if (!backupDirHandle) return;
  try {
    const granted = withPrompt ? await verifyPermission(backupDirHandle, true) : await verifyPermissionSilent(backupDirHandle);
    if (!granted) {
      if (statusEl) statusEl.textContent = "Automatisches Backup nicht möglich – Zugriff auf den Backup-Ordner fehlt. Bitte Ordner erneut wählen.";
      return;
    }
    const fileName = `spielerdaten-backup-${todayStr()}.json`;
    const backupFileHandle = await backupDirHandle.getFileHandle(fileName, { create: true });
    await writeDataFile(backupFileHandle, appData);
    if (statusEl) {
      const time = new Date().toLocaleTimeString("de-DE");
      statusEl.textContent = `Letztes automatisches Backup: ${fileName} (${time} Uhr)`;
    }
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = "Backup fehlgeschlagen: " + e.message;
  }
}

async function tryAutoBackupOnStart() {
  if (autoBackupDoneThisSession) return;
  autoBackupDoneThisSession = true;
  const dir = await FileStore.getBackupDirHandle();
  if (!dir) return;
  backupDirHandle = dir;
  updateBackupFolderStatus();
  await runAutoBackup(false);
}

// ---------- Start ----------

window.addEventListener("DOMContentLoaded", () => {
  setupNav();
  setupTeamForm();
  setupTeamsSort();
  setupTeamFilter();
  setupDashboardStalenessFilter();
  setupPlayersExtraFilters();
  setupPlayerForm();
  setupEvaluateForm();
  setupProfileForm();
  setupBackupButtons();
  setupBackupFolder();
  setupExcelImport();
  init();
});
