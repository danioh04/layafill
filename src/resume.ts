import type { StoredFile } from "./types";

// The resume lives in the extension's IndexedDB (extension pages and the service
// worker share it); content scripts ask the service worker for it.
const DB_NAME = "layafill";
const STORE = "files";
const KEY = "resume";
const MAX_RESUME_BYTES = 10 * 1024 * 1024;

interface StoredRecord {
  name: string;
  type: string;
  data: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveResume(file: File): Promise<void> {
  if (file.size > MAX_RESUME_BYTES) throw new Error("Resume is larger than 10 MB");
  const record: StoredRecord = { name: file.name, type: file.type || "application/pdf", data: await file.arrayBuffer() };
  await run("readwrite", (store) => store.put(record, KEY));
}

export async function deleteResume(): Promise<void> {
  await run("readwrite", (store) => store.delete(KEY));
}

export async function resumeName(): Promise<string | null> {
  const record = (await run("readonly", (store) => store.get(KEY))) as StoredRecord | undefined;
  return record?.name ?? null;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function loadResume(): Promise<StoredFile | null> {
  const record = (await run("readonly", (store) => store.get(KEY))) as StoredRecord | undefined;
  return record ? { name: record.name, type: record.type, base64: toBase64(record.data) } : null;
}

export function storedFileToFile(stored: StoredFile): File {
  const binary = atob(stored.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], stored.name, { type: stored.type });
}
