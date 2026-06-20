// Kleine IndexedDB-Hilfe, um das FileSystemFileHandle der Datendatei
// zwischen Sitzungen zu merken (damit nicht jedes Mal neu ausgewählt werden muss).
const FileStore = (() => {
  const DB_NAME = "spielertool-db";
  const STORE = "handles";
  const KEY_DATA = "dataFileHandle";
  const KEY_BACKUP_DIR = "backupDirHandle";

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
    clearBackupDirHandle: () => clearValue(KEY_BACKUP_DIR)
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
