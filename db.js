// Kleine IndexedDB-Hilfe, um das FileSystemFileHandle der Datendatei
// zwischen Sitzungen zu merken (damit nicht jedes Mal neu ausgewählt werden muss).
const FileStore = (() => {
  const DB_NAME = "spielertool-db";
  const STORE = "handles";
  const KEY_DATA = "dataFileHandle";
  const KEY_BACKUP_DIR = "backupDirHandle";
  const KEY_STORAGE_MODE = "storageMode";
  const KEY_WEBDAV_CONFIG = "webdavConfig";

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getValue(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function setValue(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearValue(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    getHandle: () => getValue(KEY_DATA),
    setHandle: (handle) => setValue(KEY_DATA, handle),
    clearHandle: () => clearValue(KEY_DATA),
    getBackupDirHandle: () => getValue(KEY_BACKUP_DIR),
    setBackupDirHandle: (handle) => setValue(KEY_BACKUP_DIR, handle),
    clearBackupDirHandle: () => clearValue(KEY_BACKUP_DIR),
    getStorageMode: () => getValue(KEY_STORAGE_MODE),
    setStorageMode: (mode) => setValue(KEY_STORAGE_MODE, mode),
    clearWebdavConfig: () => clearValue(KEY_WEBDAV_CONFIG)
  };
})();

async function verifyPermission(fileHandle, readWrite) {
  const options = {};
  if (readWrite) options.mode = "readwrite";
  if ((await fileHandle.queryPermission(options)) === "granted") return true;
  if ((await fileHandle.requestPermission(options)) === "granted") return true;
  return false;
}

async function readDataFile(fileHandle) {
  const file = await fileHandle.getFile();
  const text = await file.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

async function writeDataFile(fileHandle, dataObj) {
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(dataObj, null, 2));
  await writable.close();
}

function fsApiSupported() {
  return typeof window.showOpenFilePicker === "function" && typeof window.showSaveFilePicker === "function";
}

// ---------- Zentrales Login-Gateway (Tools-Übersicht) ----------
// Statt WebDAV-Zugangsdaten pro Gerät: das Login-Token der Tools-Übersicht
// (gleiche Origin tecko1985.github.io) wird wiederverwendet. Der landingpage-
// Worker prüft das Token + die Tool-Sichtbarkeit und greift serverseitig mit
// den Vereins-Zugangsdaten auf Nextcloud zu — hier liegt kein Passwort mehr.
const GATEWAY_URL = "https://landingpage.michel-brunner.workers.dev";
const TOKEN_STORAGE_KEY = "tu_session_token";
const GATEWAY_APP_ID = "spielertool-test";

class NotLoggedInError extends Error {
  constructor(message) {
    super(message || "Nicht angemeldet");
    this.name = "NotLoggedInError";
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message || "Daten wurden zwischenzeitlich von einem anderen Gerät geändert");
    this.name = "ConflictError";
  }
}

// ETag des zuletzt geladenen/geschriebenen Stands. Wird bei dav-save mitgeschickt,
// damit der Worker Konflikte (anderes Gerät hat inzwischen gespeichert) erkennt.
// Alte Worker ohne rev-Unterstützung liefern kein rev -> Verhalten wie früher.
let gatewayRev = null;

function getSessionToken() {
  try { return localStorage.getItem(TOKEN_STORAGE_KEY); } catch (_) { return null; }
}

async function gatewayRequest(payload) {
  const token = getSessionToken();
  if (!token) throw new NotLoggedInError();
  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(payload)
  });
  if (resp.status === 401) throw new NotLoggedInError("Sitzung abgelaufen");
  if (resp.status === 403) throw new Error("Kein Zugriff auf dieses Tool.");
  if (resp.status === 409) throw new ConflictError();
  if (!resp.ok) throw new Error(`Gateway-Fehler (HTTP ${resp.status})`);
  return resp.json();
}

async function gatewayLoad() {
  const body = await gatewayRequest({ action: "dav-load", app: GATEWAY_APP_ID });
  gatewayRev = typeof body.rev === "string" ? body.rev : null;
  return body.data; // Objekt oder null (Datei noch nicht vorhanden)
}

async function gatewaySave(dataObj) {
  const payload = { action: "dav-save", app: GATEWAY_APP_ID, data: dataObj };
  if (gatewayRev) payload.rev = gatewayRev;
  const body = await gatewayRequest(payload);
  gatewayRev = typeof body.rev === "string" ? body.rev : null;
}

// Liefert {username, isAdmin, groupIds, vorname, nachname, canEdit} der eingeloggten Person —
// für die automatische Vorbelegung des Bewerter-Felds bei neuen Bewertungen.
async function fetchMe() {
  return gatewayRequest({ action: "me", app: GATEWAY_APP_ID });
}
