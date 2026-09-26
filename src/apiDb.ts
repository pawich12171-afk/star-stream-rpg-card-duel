export type DocumentReference = { collection: string; id: string };
export type CollectionReference = { collection: string };
type SnapshotDoc = { id: string; data(): any; exists(): boolean; ref: DocumentReference };
type QuerySnapshot = { docs: SnapshotDoc[]; empty: boolean; metadata: { fromCache: boolean; hasPendingWrites: boolean }; forEach(cb: (doc: SnapshotDoc) => void): void };
type DocSnapshot = SnapshotDoc & { metadata: { fromCache: boolean; hasPendingWrites: boolean } };

const API_BASE = '/api/database';
const db = { type: 'star-stream-api' };

function collectionPath(ref: CollectionReference) { return `${API_BASE}?collection=${encodeURIComponent(ref.collection)}`; }
function docPath(ref: DocumentReference) { return `${API_BASE}?collection=${encodeURIComponent(ref.collection)}&id=${encodeURIComponent(ref.id)}`; }

async function request(url: string, init?: RequestInit) {
  // All persistence goes through the Vercel backend API. Never let a stalled
  // network request hang indefinitely in the browser.
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { error: text }; }
    if (!res.ok) throw new Error(body?.error || `Backend API request failed (${res.status})`);
    return body;
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('Backend API request timed out');
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function makeDoc(collection: string, raw: any): SnapshotDoc {
  return { id: raw.id, data: () => raw.data ?? raw, exists: () => true, ref: { collection, id: raw.id } };
}

export function collection(_db: typeof db, name: string): CollectionReference { return { collection: name }; }
export function doc(_db: typeof db, collectionName: string, id: string): DocumentReference { return { collection: collectionName, id }; }

export async function getDocs(ref: CollectionReference): Promise<QuerySnapshot> {
  const body = await request(collectionPath(ref));
  const docs = (body?.docs || []).map((d: any) => makeDoc(ref.collection, d));
  return { docs, empty: docs.length === 0, metadata: { fromCache: false, hasPendingWrites: false }, forEach: cb => docs.forEach(cb) };
}
export const getDocsFromServer = getDocs;

export async function getDoc(ref: DocumentReference): Promise<DocSnapshot> {
  try {
    const body = await request(docPath(ref));
    const d = makeDoc(ref.collection, body);
    return { ...d, metadata: { fromCache: false, hasPendingWrites: false } };
  } catch (error: any) {
    if (String(error?.message || '').includes('(404)')) return { id: ref.id, data: () => undefined, exists: () => false, ref, metadata: { fromCache: false, hasPendingWrites: false } };
    throw error;
  }
}

export async function setDoc(ref: DocumentReference, data: any) {
  await request(docPath(ref), { method: 'PUT', body: JSON.stringify({ data }) });
}
export async function updateDoc(ref: DocumentReference, data: any) {
  await request(docPath(ref), { method: 'PATCH', body: JSON.stringify({ data }) });
}
export async function deleteDoc(ref: DocumentReference) {
  await request(docPath(ref), { method: 'DELETE' });
}

export function onSnapshot(ref: CollectionReference, callback: (snapshot: QuerySnapshot) => void, errorCallback?: (error: unknown) => void): () => void;
export function onSnapshot(ref: DocumentReference, callback: (snapshot: DocSnapshot) => void, errorCallback?: (error: unknown) => void): () => void;
export function onSnapshot(ref: CollectionReference, options: any, callback: (snapshot: QuerySnapshot) => void, errorCallback?: (error: unknown) => void): () => void;
export function onSnapshot(ref: DocumentReference, options: any, callback: (snapshot: DocSnapshot) => void, errorCallback?: (error: unknown) => void): () => void;
export function onSnapshot(ref: CollectionReference | DocumentReference, optionsOrCallback: any, maybeCallback?: any, maybeError?: any) {
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
  const errorCallback = typeof optionsOrCallback === 'function' ? maybeCallback : maybeError;
  let stopped = false;
  let lastSerialized = '';
  const poll = async () => {
    if (stopped) return;
    try {
      if ('id' in ref) {
        const snap = await getDoc(ref);
        const serial = JSON.stringify(snap.exists() ? snap.data() : null);
        if (serial !== lastSerialized) { lastSerialized = serial; callback(snap); }
      } else {
        const snap = await getDocs(ref);
        const serial = JSON.stringify(snap.docs.map(d => ({ id: d.id, data: d.data() })));
        if (serial !== lastSerialized) { lastSerialized = serial; callback(snap); }
      }
    } catch (error) { errorCallback?.(error); }
    if (!stopped) window.setTimeout(poll, 1500);
  };
  void poll();
  return () => { stopped = true; };
}

export function writeBatch(_db: typeof db) {
  const operations: any[] = [];
  return {
    set(ref: DocumentReference, data: any) { operations.push({ op: 'set', collection: ref.collection, id: ref.id, data }); },
    update(ref: DocumentReference, data: any) { operations.push({ op: 'update', collection: ref.collection, id: ref.id, data }); },
    delete(ref: DocumentReference) { operations.push({ op: 'delete', collection: ref.collection, id: ref.id }); },
    async commit() { await request(`${API_BASE}?transaction=1`, { method: 'POST', body: JSON.stringify({ operations }) }); }
  };
}

export async function runTransaction<T>(_db: typeof db, callback: (tx: any) => Promise<T>): Promise<T> {
  const operations: any[] = [];
  const tx = {
    async get(ref: DocumentReference) { return getDoc(ref); },
    set(ref: DocumentReference, data: any) { operations.push({ op: 'set', collection: ref.collection, id: ref.id, data }); },
    update(ref: DocumentReference, data: any) { operations.push({ op: 'update', collection: ref.collection, id: ref.id, data }); },
    delete(ref: DocumentReference) { operations.push({ op: 'delete', collection: ref.collection, id: ref.id }); }
  };
  const result = await callback(tx);
  await request(`${API_BASE}?transaction=1`, { method: 'POST', body: JSON.stringify({ operations }) });
  return result;
}
export { db };
