import { INITIAL_CHARACTERS, INITIAL_SHOP_ITEMS, INITIAL_GACHA_CONFIG, INITIAL_GACHA_REWARDS } from "../initialData";

type StoredDoc = Record<string, any>;
type Store = Record<string, Record<string, StoredDoc>>;

const STORAGE_KEY = "starstream_file_database_v1";

const listeners = new Set<() => void>();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function loadStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const legacy: Store = {
    characters: {},
    shop_items: {},
    gacha_rewards: {},
    gacha_config: {},
    card_duel_rooms: {},
    battle_config: {},
    battle_bots: {},
    battle_rooms: {},
  };

  const legacyArray = <T extends { id: string }>(key: string, values: T[]) => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      const list = Array.isArray(parsed) ? parsed : values;
      for (const item of list) legacy[key === "starstream_characters" ? "characters" : key === "starstream_shop_items" ? "shop_items" : key === "starstream_gacha_rewards" ? "gacha_rewards" : "card_duel_rooms"][item.id] = clone(item);
    } catch {
      for (const item of values) {
        const collection = key === "starstream_characters" ? "characters" : key === "starstream_shop_items" ? "shop_items" : key === "starstream_gacha_rewards" ? "gacha_rewards" : "card_duel_rooms";
        legacy[collection][item.id] = clone(item);
      }
    }
  };

  legacyArray("starstream_characters", INITIAL_CHARACTERS);
  legacyArray("starstream_shop_items", INITIAL_SHOP_ITEMS);
  legacyArray("starstream_gacha_rewards", INITIAL_GACHA_REWARDS);

  try {
    const config = JSON.parse(window.localStorage.getItem("starstream_gacha_config") || "null");
    legacy.gacha_config.main = clone(config || INITIAL_GACHA_CONFIG);
  } catch {
    legacy.gacha_config.main = clone(INITIAL_GACHA_CONFIG);
  }

  return legacy;
}

let store: Store = loadStore();

function persist() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent("starstream-file-db-change"));
  } catch (error) {
    console.warn("File database persistence failed:", error);
  }
}

function notify() {
  persist();
  listeners.forEach(listener => listener());
}

export const db = { kind: "local-file-database" } as const;

export type CollectionRef = { kind: "collection"; name: string };
export type DocumentRef = { kind: "document"; collection: string; id: string };

export function collection(_db: unknown, name: string): CollectionRef {
  if (!store[name]) store[name] = {};
  return { kind: "collection", name };
}

export function doc(_db: unknown, collectionOrPath: string | CollectionRef, id?: string): DocumentRef {
  if (typeof collectionOrPath === "string") {
    if (!id) throw new Error("Document id is required");
    return { kind: "document", collection: collectionOrPath, id };
  }
  if (!id) throw new Error("Document id is required");
  return { kind: "document", collection: collectionOrPath.name, id };
}

function read(ref: DocumentRef): StoredDoc | undefined {
  return store[ref.collection]?.[ref.id];
}

export async function getDoc(ref: DocumentRef) {
  const data = read(ref);
  return {
    exists: () => data !== undefined,
    data: () => data ? clone(data) : undefined,
    id: ref.id,
    metadata: { fromCache: false, hasPendingWrites: false },
  };
}

export async function getDocs(ref: CollectionRef) {
  const values = Object.entries(store[ref.name] || {}).map(([id, data]) => ({ id, data: () => clone(data), metadata: { fromCache: false, hasPendingWrites: false } }));
  return {
    empty: values.length === 0,
    size: values.length,
    forEach: (callback: (snapshot: any) => void) => values.forEach(callback),
    docs: values,
    metadata: { fromCache: false, hasPendingWrites: false },
  };
}

function emit() {
  notify();
}

export async function setDoc(ref: DocumentRef, data: StoredDoc) {
  if (!store[ref.collection]) store[ref.collection] = {};
  store[ref.collection][ref.id] = clone(data);
  emit();
}

export async function updateDoc(ref: DocumentRef, data: StoredDoc) {
  if (!store[ref.collection]) store[ref.collection] = {};
  store[ref.collection][ref.id] = { ...(store[ref.collection][ref.id] || {}), ...clone(data) };
  emit();
}

export async function deleteDoc(ref: DocumentRef) {
  delete store[ref.collection]?.[ref.id];
  emit();
}

export function onSnapshot(ref: CollectionRef | DocumentRef, optionsOrCallback: any, maybeCallback?: any) {
  const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;

  const send = async () => {
    if (ref.kind === "collection") {
      const snap = await getDocs(ref);
      callback?.(snap);
    } else {
      const snap = await getDoc(ref);
      callback?.(snap);
    }
  };

  const listener = () => { void send(); };
  listeners.add(listener);
  void send();

  const storageHandler = () => { void send(); };
  if (typeof window !== "undefined") window.addEventListener("storage", storageHandler);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", storageHandler);
  };
}

export async function runTransaction(_db: unknown, callback: (transaction: any) => Promise<void> | void) {
  const transaction = {
    get: getDoc,
    set: (ref: DocumentRef, data: StoredDoc) => {
      if (!store[ref.collection]) store[ref.collection] = {};
      store[ref.collection][ref.id] = clone(data);
    },
    update: (ref: DocumentRef, data: StoredDoc) => {
      if (!store[ref.collection]) store[ref.collection] = {};
      store[ref.collection][ref.id] = { ...(store[ref.collection][ref.id] || {}), ...clone(data) };
    },
    delete: (ref: DocumentRef) => {
      delete store[ref.collection]?.[ref.id];
    },
  };
  await callback(transaction);
  emit();
}

export function writeBatch(_db: unknown) {
  const operations: (() => void)[] = [];
  return {
    set(ref: DocumentRef, data: StoredDoc) {
      operations.push(() => {
        if (!store[ref.collection]) store[ref.collection] = {};
        store[ref.collection][ref.id] = clone(data);
      });
    },
    update(ref: DocumentRef, data: StoredDoc) {
      operations.push(() => {
        if (!store[ref.collection]) store[ref.collection] = {};
        store[ref.collection][ref.id] = { ...(store[ref.collection][ref.id] || {}), ...clone(data) };
      });
    },
    delete(ref: DocumentRef) {
      operations.push(() => { delete store[ref.collection]?.[ref.id]; });
    },
    async commit() {
      operations.forEach(operation => operation());
      emit();
    },
  };
}
