// Minimal IndexedDB access shared by the service worker and the panel: one store, keyed by
// capture id, holding { blob, width, height, createdAt }. Plain API, no library.

const DB_NAME = "teardown-spike-b";
const STORE = "blobs";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function request(txMode, run) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, txMode);
        const req = run(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const putBlob = (id, record) =>
  request("readwrite", (s) => s.put(record, id));
export const getBlob = (id) => request("readonly", (s) => s.get(id));
export const listIds = () => request("readonly", (s) => s.getAllKeys());
export const deleteAll = () => request("readwrite", (s) => s.clear());
