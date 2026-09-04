const DB_NAME = "lyricforge";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects");
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs");
      if (!db.objectStoreNames.contains("peaks")) db.createObjectStore("peaks");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(store: string, key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet<T>(store: string, key: string): Promise<T | null> {
  const db = await openDb();
  const value = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}

export async function mirrorProject(id: string, document: unknown, updatedAt: string): Promise<void> {
  await idbPut("projects", id, { document, updatedAt, mirroredAt: Date.now() });
}

export async function readMirror(id: string): Promise<{ document: unknown; updatedAt: string; mirroredAt: number } | null> {
  return idbGet("projects", id);
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  await idbPut("blobs", id, blob);
}

export async function getBlob(id: string): Promise<Blob | null> {
  return idbGet<Blob>("blobs", id);
}

export async function putPeaks(id: string, peaks: Float32Array): Promise<void> {
  await idbPut("peaks", id, Array.from(peaks));
}

export async function getPeaks(id: string): Promise<Float32Array | null> {
  const arr = await idbGet<number[]>("peaks", id);
  return arr ? Float32Array.from(arr) : null;
}
