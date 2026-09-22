import type { Region, Viewport } from "@teardown/core/schemas/capture";

// The local buffer (spine §10.2): originals and audio chunks as Blobs, plus the light metadata
// the filmstrip and the uploader need. Cleared once the server has confirmed the session.
// Plain IndexedDB with promise wrappers; no library.

const DB_NAME = "teardown";
const DB_VERSION = 1;

export type StoredCapture = {
  id: string;
  sessionId: string;
  tPickStart: number;
  tCapture: number;
  url: string;
  pageTitle: string;
  viewport: Viewport;
  region: Region;
  width: number;
  height: number;
  createdAt: number;
  uploaded: boolean;
};

export type StoredChunk = {
  offsetMs: number;
  sessionId: string;
  durationMs: number;
  blob: Blob;
  uploaded: boolean;
};

type Store = "blobs" | "captures" | "chunks";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("blobs");
      req.result.createObjectStore("captures", { keyPath: "id" });
      req.result.createObjectStore("chunks", { keyPath: "offsetMs" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(
  store: Store,
  mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = op(db.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const putCaptureBlob = (id: string, blob: Blob) =>
  run("blobs", "readwrite", (s) => s.put(blob, id));
export const getCaptureBlob = (id: string) =>
  run<Blob | undefined>("blobs", "readonly", (s) => s.get(id));
export const deleteCaptureBlob = (id: string) =>
  run("blobs", "readwrite", (s) => s.delete(id));

export const putCapture = (capture: StoredCapture) =>
  run("captures", "readwrite", (s) => s.put(capture));
export const getCapture = (id: string) =>
  run<StoredCapture | undefined>("captures", "readonly", (s) => s.get(id));
export const listCaptures = () =>
  run<StoredCapture[]>("captures", "readonly", (s) => s.getAll());
export const deleteCapture = (id: string) =>
  run("captures", "readwrite", (s) => s.delete(id));

export const putChunk = (chunk: StoredChunk) =>
  run("chunks", "readwrite", (s) => s.put(chunk));
export const getChunk = (offsetMs: number) =>
  run<StoredChunk | undefined>("chunks", "readonly", (s) => s.get(offsetMs));
export const listChunks = () =>
  run<StoredChunk[]>("chunks", "readonly", (s) => s.getAll());
export const deleteChunk = (offsetMs: number) =>
  run("chunks", "readwrite", (s) => s.delete(offsetMs));

// Everything, once the server has the session (or the user has thrown it away).
export async function clearBuffer(): Promise<void> {
  await run("blobs", "readwrite", (s) => s.clear());
  await run("captures", "readwrite", (s) => s.clear());
  await run("chunks", "readwrite", (s) => s.clear());
}
