import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  deleteDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "../firebase";
import { 
  CharacterProfile, 
  Item, 
  Quest, 
  InventoryItem, 
  GachaReward, 
  GachaConfig, 
  CardDuelRoom,
  BattleConfig,
  BattleDiceConfig,
  BattleBot,
  BattleRoom,
  BattleCombatant,
  BattleRollResult,
  AdminStatusEffect,
  BattleSkillEffect,
  Skill,
  MAX_GACHA_REWARDS
} from "../types";
import { 
  INITIAL_CHARACTERS, 
  INITIAL_SHOP_ITEMS, 
  INITIAL_GACHA_CONFIG, 
  INITIAL_GACHA_REWARDS 
} from "../initialData";

const CHARACTERS_COLLECTION = "characters";
const SHOP_ITEMS_COLLECTION = "shop_items";
const GACHA_REWARDS_COLLECTION = "gacha_rewards";
const GACHA_CONFIG_COLLECTION = "gacha_config";
const CARD_DUEL_ROOMS_COLLECTION = "card_duel_rooms";

// Cross-tab broadcast channel for instant local reactivity
const broadcast = typeof window !== 'undefined' && 'BroadcastChannel' in window 
  ? new BroadcastChannel('star_stream_realtime_channel') 
  : null;

// Local storage is only an offline fallback. Preserve an intentionally empty
// collection; otherwise deleted server records are resurrected after reload.
function readLocalArray<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') return [...fallback];
  try {
    const saved = window.localStorage.getItem(key);
    if (saved == null) return [...fallback];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [...fallback];
  } catch {
    return [...fallback];
  }
}

function readLocalValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = window.localStorage.getItem(key);
    return saved == null ? fallback : JSON.parse(saved) as T;
  } catch {
    return fallback;
  }
}

let localCharacters: CharacterProfile[] = readLocalArray('starstream_characters', INITIAL_CHARACTERS);
let localShopItems: Item[] = readLocalArray('starstream_shop_items', INITIAL_SHOP_ITEMS);

const gachaRewardsListeners = new Set<(rewards: GachaReward[]) => void>();

let localGachaRewards: GachaReward[] = readLocalArray('starstream_gacha_rewards', INITIAL_GACHA_REWARDS);

function notifyGachaRewards() {
  const snapshot = [...localGachaRewards].sort((a, b) => (Number(a.rate) || 0) - (Number(b.rate) || 0));
  gachaRewardsListeners.forEach(listener => listener(snapshot));
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stripUndefined) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nestedValue]) => nestedValue !== undefined)
        .map(([key, nestedValue]) => [key, stripUndefined(nestedValue)])
    ) as T;
  }
  return value;
}

// Compare server snapshots without depending on object key order.
// Realtime listeners can briefly deliver the previous server version after a write.
function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return '[' + value.map(stableSerialize).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + stableSerialize(record[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? String(value);
}

function valuesMatch(left: unknown, right: unknown): boolean {
  return stableSerialize(stripUndefined(left)) === stableSerialize(stripUndefined(right));
}

// Keep optimistic writes from being overwritten by an older Firestore snapshot.
const pendingGachaRewards = new Map<string, GachaReward>();
const pendingGachaDeletes = new Set<string>();

// Keep a local write ahead of an older Firestore realtime snapshot.
const pendingCharacterUpdates = new Map<string, CharacterProfile>();
const pendingCharacterDeletes = new Set<string>();
const pendingShopItems = new Map<string, Item>();
const pendingShopDeletes = new Set<string>();

// Serialize writes per character. Firestore is last-write-wins; rapid saves
// must not finish out of order and restore an older character version.
const characterWriteQueues = new Map<string, Promise<void>>();
const persistenceWriteQueues = new Map<string, Promise<void>>();

function enqueueCharacterWrite(id: string, write: () => Promise<void>): Promise<void> {
  const previous = characterWriteQueues.get(id) || Promise.resolve();
  const next = previous.catch(() => {}).then(write);
  characterWriteQueues.set(id, next);
  return next.finally(() => {
    if (characterWriteQueues.get(id) === next) characterWriteQueues.delete(id);
  });
}

function enqueuePersistenceWrite(key: string, write: () => Promise<void>): Promise<void> {
  const previous = persistenceWriteQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(write);
  persistenceWriteQueues.set(key, next);
  return next.finally(() => {
    if (persistenceWriteQueues.get(key) === next) persistenceWriteQueues.delete(key);
  });
}

function isPendingNewer(
  pending: { updatedAt?: number; lastUpdated?: number },
  server: { updatedAt?: number; lastUpdated?: number },
): boolean {
  const pendingVersion = Number(pending.updatedAt ?? pending.lastUpdated) || 0;
  const serverVersion = Number(server.updatedAt ?? server.lastUpdated) || 0;
  return pendingVersion > serverVersion;
}


let localGachaConfig: GachaConfig = readLocalValue('starstream_gacha_config', INITIAL_GACHA_CONFIG);

let pendingGachaConfig: GachaConfig | null = null;

let localDuelRooms: CardDuelRoom[] = readLocalArray('starstream_duel_rooms', []);
const duelRoomListeners = new Set<(rooms: CardDuelRoom[]) => void>();
const pendingDuelRooms = new Map<string, CardDuelRoom>();
const pendingDuelDeletes = new Set<string>();

function notifyDuelRooms() {
  const snapshot = [...localDuelRooms].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  duelRoomListeners.forEach(listener => listener(snapshot));
}

function applyDuelRoomSnapshot(snapshot: any) {
  const list: CardDuelRoom[] = [];
  snapshot.forEach((docSnap: any) => {
    const raw = { ...docSnap.data(), id: docSnap.id } as CardDuelRoom;
    const hasLocalPendingWrite = docSnap.metadata?.hasPendingWrites === true;
    const pending = pendingDuelRooms.get(raw.id);
    if (pending && (hasLocalPendingWrite || (pending.updatedAt && raw.updatedAt && pending.updatedAt > raw.updatedAt))) {
      list.push(pending);
    } else {
      if (pending) pendingDuelRooms.delete(raw.id);
      if (!pendingDuelDeletes.has(raw.id) || hasLocalPendingWrite) list.push(raw);
    }
  });

  pendingDuelRooms.forEach((pending) => {
    if (!list.some(room => room.id === pending.id) && !pendingDuelDeletes.has(pending.id)) list.push(pending);
  });

  list.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  localDuelRooms = list;
  saveLocalAll();
  notifyDuelRooms();
}


function saveLocalAll() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('starstream_characters', JSON.stringify(localCharacters));
    window.localStorage.setItem('starstream_shop_items', JSON.stringify(localShopItems));
    window.localStorage.setItem('starstream_gacha_rewards', JSON.stringify(localGachaRewards));
    window.localStorage.setItem('starstream_gacha_config', JSON.stringify(localGachaConfig));
    window.localStorage.setItem('starstream_duel_rooms', JSON.stringify(localDuelRooms));
  } catch {}
}

export function calculatePowerScore(char: CharacterProfile): number {
  const statTotal = 
    (char.stats?.strength || 0) * 15 +
    (char.stats?.durability || 0) * 15 +
    (char.stats?.agility || 0) * 15 +
    (char.stats?.magic || 0) * 20;

  let skillTotal = 0;
  char.skills?.forEach(s => {
    const effectiveLvl = (s.level || 1) * (s.multiplier || 1);
    skillTotal += effectiveLvl * 80;
  });

  let equipBonus = 0;
  char.inventory?.forEach(inv => {
    if (inv.isEquipped) {
      equipBonus += 300;
      if (inv.effectType === "buff_stat" && inv.effectValue) {
        equipBonus += inv.effectValue * 20;
      }
    }
  });

  const transcendenceBonus = (char.statUpgradeCount || 0) * 500;
  return Math.round(statTotal + skillTotal + equipBonus + (char.hp || 0) / 2 + transcendenceBonus);
}

// Seed initial data if Firestore is empty
export async function seedInitialDataIfNeeded() {
  try {
    const [charsSnap, shopSnap, gachaRewardsSnap, gachaConfigSnap] = await Promise.all([
      getDocs(collection(db, CHARACTERS_COLLECTION)),
      getDocs(collection(db, SHOP_ITEMS_COLLECTION)),
      getDocs(collection(db, GACHA_REWARDS_COLLECTION)),
      getDocs(collection(db, GACHA_CONFIG_COLLECTION)),
    ]);

    // Seed only a genuinely new database. Once any shared data exists, an empty
    // collection may be an intentional deletion and must not be repopulated.
    const isFreshDatabase =
      charsSnap.empty &&
      shopSnap.empty &&
      gachaRewardsSnap.empty &&
      gachaConfigSnap.empty;
    if (!isFreshDatabase) return;

    for (const char of INITIAL_CHARACTERS) {
      const score = calculatePowerScore(char);
      await setDoc(doc(db, CHARACTERS_COLLECTION, char.id), {
        ...char,
        powerScore: score,
      });
    }
    for (const item of INITIAL_SHOP_ITEMS) {
      await setDoc(doc(db, SHOP_ITEMS_COLLECTION, item.id), item);
    }
    for (const reward of INITIAL_GACHA_REWARDS) {
      await setDoc(doc(db, GACHA_REWARDS_COLLECTION, reward.id), reward);
    }
    await setDoc(doc(db, GACHA_CONFIG_COLLECTION, "main"), INITIAL_GACHA_CONFIG);
  } catch (err) {
    console.warn("Firestore seed check fallback to local:", err);
  }
}

// Subscribe to characters
export function subscribeToCharacters(callback: (chars: CharacterProfile[]) => void) {
  try {
    const q = collection(db, CHARACTERS_COLLECTION);
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      // Ignore cache-only snapshots so stale local data cannot repaint the UI
      // before the authoritative Firestore server snapshot arrives.
      if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) return;

      const list: CharacterProfile[] = [];
       const snapshotIds = new Set<string>();
      snapshot.forEach((docSnap) => {
        const raw = { ...docSnap.data(), id: docSnap.id } as CharacterProfile;
         snapshotIds.add(raw.id);
         if (pendingCharacterDeletes.has(raw.id)) return;
        const pending = pendingCharacterUpdates.get(raw.id);
        const serverVersion = Number(raw.lastUpdated || 0);
        const pendingVersion = Number(pending?.lastUpdated || 0);

        // Never let an older Firestore snapshot overwrite a newer optimistic write.
        // Firestore may emit cached/previous data while a write is still settling.
        if (pending && pendingVersion > serverVersion) {
          list.push(pending);
        } else {
          if (pending && (valuesMatch(raw, pending) || serverVersion >= pendingVersion)) {
            pendingCharacterUpdates.delete(raw.id);
          }
           list.push(raw);
        }
      });
       pendingCharacterDeletes.forEach((id) => {
         if (!snapshotIds.has(id)) pendingCharacterDeletes.delete(id);
       });
       pendingCharacterUpdates.forEach((pending, id) => {
         if (!snapshotIds.has(id) && !pendingCharacterDeletes.has(id)) list.push(pending);
       });
      list.sort((a, b) => (b.powerScore || 0) - (a.powerScore || 0));
      // Firestore is authoritative, including an empty collection.
      localCharacters = list;
      saveLocalAll();
      callback(list);
    }, (err) => {
      console.warn("Characters listener error, using local:", err);
      localCharacters = [...localCharacters];
      callback(localCharacters);
    });

    if (broadcast) {
      const handleBroadcast = (ev: MessageEvent) => {
        if (ev.data?.type === 'CHARACTERS_UPDATE') {
          callback(localCharacters);
        }
      };
       broadcast?.addEventListener('message', handleBroadcast);
       return () => {
         broadcast?.removeEventListener('message', handleBroadcast);
         unsub();
       };
    }
    return unsub;
  } catch (err) {
    callback(localCharacters);
    return () => {};
  }
}

// Subscribe to Shop items
export function subscribeToShop(callback: (items: Item[]) => void) {
  try {
    const q = collection(db, SHOP_ITEMS_COLLECTION);
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      // Ignore cache-only snapshots until the server confirms the current data.
      if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) return;

      const list: Item[] = [];
      const snapshotIds = new Set<string>();
      snapshot.forEach((docSnap) => {
        const itemId = docSnap.id;
        snapshotIds.add(itemId);
        if (pendingShopDeletes.has(itemId)) return;
        const serverItem = { ...docSnap.data(), id: itemId } as Item;
        const pending = pendingShopItems.get(itemId);
        if (pending && valuesMatch(serverItem, pending)) {
          pendingShopItems.delete(itemId);
        }
        list.push((pendingShopItems.get(itemId) || serverItem) as Item);
      });
      pendingShopDeletes.forEach((itemId) => {
        if (!snapshotIds.has(itemId)) pendingShopDeletes.delete(itemId);
      });
      pendingShopItems.forEach((item, itemId) => {
        if (!snapshotIds.has(itemId) && !pendingShopDeletes.has(itemId)) {
          list.push(item);
        }
      });
      // A successful Firestore snapshot is authoritative, including an empty collection.
      // Never resurrect deleted items from localStorage after realtime sync.
      localShopItems = list;
      saveLocalAll();
      callback(list);
    }, (err) => {
      console.warn("Shop listener error, using local:", err);
      callback(localShopItems);
    });

    if (broadcast) {
      const handleBroadcast = (ev: MessageEvent) => {
        if (ev.data?.type === 'SHOP_UPDATE') {
          callback(localShopItems);
        }
      };
       broadcast?.addEventListener('message', handleBroadcast);
       return () => {
         broadcast?.removeEventListener('message', handleBroadcast);
         unsub();
       };
    }
    return unsub;
  } catch (err) {
    callback(localShopItems);
    return () => {};
  }
}

function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = sanitizeForFirestore(value);
    }
  }
  return cleaned;
}

// Update Character
export async function updateCharacterData(char: CharacterProfile): Promise<void> {
  const previousLocalCharacter = localCharacters.find(character => character.id === char.id);
  // IMPORTANT: the object passed by the UI is the user's newest edit.
  // Reconcile the admin snapshot BEFORE health sync so a deleted skill
  // cannot be resurrected from an older snapshot/local overlay.
  const requested: CharacterProfile = {
    ...char,
    skills: [...(char.skills || [])],
    adminBalanceSnapshot: char.adminBalanceSnapshot
      ? { ...char.adminBalanceSnapshot, skills: [...(char.adminBalanceSnapshot.skills || [])] }
      : char.adminBalanceSnapshot,
    adminBalanceModifiers: [...(char.adminBalanceModifiers || [])],
  };

  if (requested.adminBalanceSnapshot) {
    const currentSkillIds = new Set((requested.skills || []).map(s => s.id));
    const snapshotSkills = requested.adminBalanceSnapshot.skills || [];
    const keptSnapshotSkills = snapshotSkills.filter(s => currentSkillIds.has(s.id));
    const snapshotSkillIds = new Set(keptSnapshotSkills.map(s => s.id));
    const newlyAddedSkills = (requested.skills || []).filter(s => !snapshotSkillIds.has(s.id));

    requested.adminBalanceSnapshot = {
      ...requested.adminBalanceSnapshot,
      skills: [...keptSnapshotSkills, ...newlyAddedSkills.map(s => ({ ...s }))],
      capturedAt: Date.now(),
    };
  }

  // A modifier referencing a skill that no longer exists is stale data.
  requested.adminBalanceModifiers = (requested.adminBalanceModifiers || []).filter(m =>
    m.kind !== 'skill' || (requested.skills || []).some(s => s.id === m.skillId)
  );

  const synced = requested;
  const score = calculatePowerScore(synced);
  // Make the optimistic version strictly newer than the last local version.
  // This prevents an equal-millisecond or stale Firestore snapshot from winning.
  const previousVersion = Number(localCharacters.find(c => c.id === char.id)?.lastUpdated) || 0;
  const requestedVersion = Number(char.lastUpdated) || 0;
  const lastUpdated = Math.max(Date.now(), previousVersion + 1, requestedVersion);
  const updated: CharacterProfile = {
    ...synced,
    powerScore: score,
    lastUpdated,
  };

  // Update local and protect it from an older realtime snapshot.
  pendingCharacterUpdates.set(updated.id, updated);
  localCharacters = localCharacters.map(c => c.id === updated.id ? updated : c);
  if (!localCharacters.some(c => c.id === updated.id)) {
    localCharacters.push(updated);
  }
  saveLocalAll();
  broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });

  // Serialize writes so rapid consecutive saves cannot finish out of order.
  try {
    await enqueueCharacterWrite(updated.id, async () => {
      const cleaned = sanitizeForFirestore(updated);
      await setDoc(doc(db, CHARACTERS_COLLECTION, updated.id), cleaned);
    });
  } catch (err) {
    const pending = pendingCharacterUpdates.get(updated.id);
    if (pending && valuesMatch(pending, updated)) pendingCharacterUpdates.delete(updated.id);
    if (previousLocalCharacter) {
      localCharacters = localCharacters.map(character =>
        character.id === updated.id ? previousLocalCharacter : character
      );
    } else {
      localCharacters = localCharacters.filter(character => character.id !== updated.id);
    }
    saveLocalAll();
    broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });
    console.error("Error updating character in Firestore:", err);
    throw err;
  }
}

// Atomic partial character update used by systems that change only a few fields.
// The transaction reads the newest Firestore document first, then applies only
// the requested fields so stale component snapshots cannot overwrite unrelated data.
export async function updateCharacterFields(
  charId: string,
  patch: Partial<Omit<CharacterProfile, 'id' | 'lastUpdated' | 'powerScore'>>
): Promise<CharacterProfile> {
  const ref = doc(db, CHARACTERS_COLLECTION, charId);
  let result: CharacterProfile | null = null;

  await enqueueCharacterWrite(charId, async () => {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error('ไม่พบตัวละครที่ต้องการบันทึก');

      const current = { ...snap.data(), id: snap.id } as CharacterProfile;
      const updated: CharacterProfile = {
        ...current,
        ...patch,
        lastUpdated: Math.max(Date.now(), Number(current.lastUpdated || 0) + 1),
      };

      updated.powerScore = calculatePowerScore(updated);
      result = updated;

      const cleanPatch = sanitizeForFirestore({
        ...patch,
        powerScore: updated.powerScore,
        lastUpdated: updated.lastUpdated,
      });
      transaction.update(ref, cleanPatch);
    });
  });

  if (!result) throw new Error('ไม่สามารถบันทึกการเปลี่ยนแปลงตัวละครได้');

  pendingCharacterUpdates.set(charId, result);
  localCharacters = localCharacters.some(c => c.id === charId)
    ? localCharacters.map(c => c.id === charId ? result as CharacterProfile : c)
    : [...localCharacters, result];
  saveLocalAll();
  broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });

  return result;
}

// Save only the fields edited by the Status window.
// This prevents a stale full CharacterProfile from overwriting Coins,
// inventory, skills, admin effects, or other newer fields.
export async function updateCharacterStatusData(
  charId: string,
  patch: Pick<CharacterProfile, 'stats' | 'hp' | 'maxHp' | 'statusBuffs' | 'characteristics'>
): Promise<CharacterProfile> {
  const ref = doc(db, CHARACTERS_COLLECTION, charId);
  let result: CharacterProfile | null = null;

  await enqueueCharacterWrite(charId, async () => {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error('ไม่พบตัวละครที่ต้องการบันทึก');

      const current = { ...snap.data(), id: snap.id } as CharacterProfile;
      const updated: CharacterProfile = {
        ...current,
        stats: {
          ...current.stats,
          strength: Number(patch.stats.strength),
          durability: Number(patch.stats.durability),
          agility: Number(patch.stats.agility),
          magic: Number(patch.stats.magic),
        },
        hp: Number(patch.hp),
        maxHp: Number(patch.maxHp),
        statusBuffs: patch.statusBuffs || '',
        characteristics: [...(patch.characteristics || [])],
        lastUpdated: Math.max(Date.now(), Number(current.lastUpdated || 0) + 1),
      };

      updated.powerScore = calculatePowerScore(updated);
      result = updated;

      transaction.update(ref, {
        stats: updated.stats,
        hp: updated.hp,
        maxHp: updated.maxHp,
        statusBuffs: updated.statusBuffs,
        characteristics: updated.characteristics,
        powerScore: updated.powerScore,
        lastUpdated: updated.lastUpdated,
      });
    });
  });

  if (!result) throw new Error('ไม่สามารถสร้างข้อมูลตัวละครหลังบันทึกได้');

  pendingCharacterUpdates.set(charId, result);
  localCharacters = localCharacters.some(c => c.id === charId)
    ? localCharacters.map(c => c.id === charId ? result as CharacterProfile : c)
    : [...localCharacters, result];
  saveLocalAll();
  broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });

  return result;
}

// Delete Character
export async function deleteCharacter(charId: string): Promise<void> {
  const previous = localCharacters.find(c => c.id === charId);
  pendingCharacterDeletes.add(charId);
  pendingCharacterUpdates.delete(charId);
  localCharacters = localCharacters.filter(c => c.id !== charId);
  saveLocalAll();
  broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });

  try {
    await deleteDoc(doc(db, CHARACTERS_COLLECTION, charId));
  } catch (err) {
    pendingCharacterDeletes.delete(charId);
    if (previous) localCharacters = [previous, ...localCharacters.filter(c => c.id !== charId)];
    saveLocalAll();
    broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });
    console.error("Error deleting character in Firestore:", err);
    throw err;
  }
}

// Transfer coins
export async function transferCoins(
  fromCharOrId: CharacterProfile | string,
  toCharId: string,
  amount: number,
  memoOrToName?: string
): Promise<{ success: boolean; message: string }> {
  const normalizedAmount = Math.floor(Number(amount));
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    return { success: false, message: "จำนวนเหรียญต้องมากกว่า 0" };
  }
  const senderId = typeof fromCharOrId === 'string' ? fromCharOrId : fromCharOrId.id;
  if (senderId === toCharId) return { success: false, message: "ไม่สามารถโอนเหรียญให้ตนเองได้" };

  const senderRef = doc(db, CHARACTERS_COLLECTION, senderId);
  const receiverRef = doc(db, CHARACTERS_COLLECTION, toCharId);
  const notificationId = `notif-transfer-${Date.now()}-${senderId}-${toCharId}`;
  let committedSender: CharacterProfile | null = null;
  let committedReceiver: CharacterProfile | null = null;

  try {
    await runTransaction(db, async (transaction) => {
      const senderSnap = await transaction.get(senderRef);
      const receiverSnap = await transaction.get(receiverRef);
      if (!senderSnap.exists() || !receiverSnap.exists()) throw new Error("ไม่พบข้อมูลผู้เล่น");

      const sender = { ...senderSnap.data(), id: senderSnap.id } as CharacterProfile;
      const receiver = { ...receiverSnap.data(), id: receiverSnap.id } as CharacterProfile;
      const senderCoins = Number(sender.coins) || 0;
      if (senderCoins < normalizedAmount) throw new Error("เหรียญไม่เพียงพอสำหรับการโอน");

      const timestamp = Date.now();
      committedSender = {
        ...sender,
        coins: senderCoins - normalizedAmount,
        lastUpdated: Math.max(timestamp, (Number(sender.lastUpdated) || 0) + 1),
      };
      committedReceiver = {
        ...receiver,
        coins: (Number(receiver.coins) || 0) + normalizedAmount,
        notifications: [
          {
            id: notificationId,
            title: "ได้รับเหรียญ Coins โอนเข้าบัญชี",
            message: `ได้รับ ${normalizedAmount.toLocaleString()} Coins จาก "${sender.displayName}"${memoOrToName ? ` (บันทึก: ${memoOrToName})` : ''}`,
            timestamp,
            read: false,
            type: "trade" as const,
          },
          ...(receiver.notifications || [])
        ],
        lastUpdated: Math.max(timestamp, (Number(receiver.lastUpdated) || 0) + 1),
      };
      transaction.set(senderRef, sanitizeForFirestore(committedSender));
      transaction.set(receiverRef, sanitizeForFirestore(committedReceiver));
    });
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "การโอนเหรียญล้มเหลว" };
  }

  if (committedSender && committedReceiver) {
    pendingCharacterUpdates.set(senderId, committedSender);
    pendingCharacterUpdates.set(toCharId, committedReceiver);
    localCharacters = localCharacters.map(character =>
      character.id === senderId ? committedSender! :
      character.id === toCharId ? committedReceiver! : character
    );
    saveLocalAll();
    broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });
  }
  return { success: true, message: `โอนสำเร็จ ${normalizedAmount.toLocaleString()} Coins!` };
}

// Add Shop item (Admin)
export async function addShopItem(item: Item): Promise<void> {
  const id = item.id || `item-${Date.now()}`;
  const fullItem = { ...item, id };
  const previousItem = localShopItems.find(existing => existing.id === id);
  pendingShopItems.set(id, fullItem);
  pendingShopDeletes.delete(id);
  localShopItems = [fullItem, ...localShopItems.filter(i => i.id !== id)];
  saveLocalAll();
  broadcast?.postMessage({ type: 'SHOP_UPDATE' });

  try {
    // Admin forms intentionally leave unrelated effect fields undefined.
    // Firestore rejects undefined values, so sanitize before writing.
    await enqueuePersistenceWrite(`shop:${id}`, () =>
      setDoc(doc(db, SHOP_ITEMS_COLLECTION, id), sanitizeForFirestore(fullItem))
    );
  } catch (err) {
    pendingShopItems.delete(id);
    localShopItems = previousItem
      ? [previousItem, ...localShopItems.filter(existing => existing.id !== id)]
      : localShopItems.filter(existing => existing.id !== id);
    saveLocalAll();
    broadcast?.postMessage({ type: 'SHOP_UPDATE' });
    console.error("Error adding shop item to Firestore:", err);
    throw err;
  }
}

// Delete Shop item (Admin)
export async function deleteShopItem(itemId: string): Promise<void> {
  const previousItem = localShopItems.find(existing => existing.id === itemId);
  pendingShopDeletes.add(itemId);
  pendingShopItems.delete(itemId);
  localShopItems = localShopItems.filter(i => i.id !== itemId);
  saveLocalAll();
  broadcast?.postMessage({ type: 'SHOP_UPDATE' });

  try {
    await enqueuePersistenceWrite(`shop:${itemId}`, () =>
      deleteDoc(doc(db, SHOP_ITEMS_COLLECTION, itemId))
    );
  } catch (err) {
    pendingShopDeletes.delete(itemId);
    if (previousItem) localShopItems = [previousItem, ...localShopItems.filter(existing => existing.id !== itemId)];
    saveLocalAll();
    broadcast?.postMessage({ type: 'SHOP_UPDATE' });
    console.error("Error deleting shop item in Firestore:", err);
    throw err;
  }
}

// Subscribe to Gacha Rewards
export function subscribeToGachaRewards(callback: (rewards: GachaReward[]) => void) {
  gachaRewardsListeners.add(callback);

  try {
    const q = collection(db, GACHA_REWARDS_COLLECTION);
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) return;

      const list: GachaReward[] = [];
      const snapshotIds = new Set<string>();
      snapshot.forEach((docSnap) => {
        const reward = { ...docSnap.data(), id: docSnap.id } as GachaReward;
        snapshotIds.add(docSnap.id);
        if (pendingGachaDeletes.has(docSnap.id)) return;
        const pending = pendingGachaRewards.get(docSnap.id);
        if (pending && valuesMatch(reward, pending)) {
          pendingGachaRewards.delete(docSnap.id);
        }
        list.push((pendingGachaRewards.get(docSnap.id) || reward) as GachaReward);
      });
      pendingGachaDeletes.forEach((rewardId) => {
        if (!snapshotIds.has(rewardId)) pendingGachaDeletes.delete(rewardId);
      });

      const pendingRewards = Array.from(pendingGachaRewards.values());
      const mergedList = [
        ...list.filter(reward => !pendingGachaRewards.has(reward.id) && !pendingGachaDeletes.has(reward.id)),
        ...pendingRewards
      ].sort((a, b) => (Number(a.rate) || 0) - (Number(b.rate) || 0));

      // Firebase is authoritative, including an empty collection.
      localGachaRewards = mergedList;
      saveLocalAll();
      callback(mergedList);
    }, (err) => {
      console.warn("Gacha rewards listener error:", err);
      callback(localGachaRewards);
    });

    let handleBroadcast: ((ev: MessageEvent) => void) | null = null;
    if (broadcast) {
      handleBroadcast = (ev: MessageEvent) => {
        if (ev.data?.type === 'GACHA_REWARDS_UPDATE') callback(localGachaRewards);
      };
      broadcast.addEventListener('message', handleBroadcast);
    }
    return () => {
      gachaRewardsListeners.delete(callback);
      if (broadcast && handleBroadcast) broadcast.removeEventListener('message', handleBroadcast);
      unsub();
    };
  } catch (err) {
    gachaRewardsListeners.delete(callback);
    callback(localGachaRewards);
    return () => {};
  }
}

// Subscribe to Gacha Config
export function subscribeToGachaConfig(callback: (config: GachaConfig) => void) {
  try {
    const docRef = doc(db, GACHA_CONFIG_COLLECTION, "main");
    const unsub = onSnapshot(docRef, { includeMetadataChanges: true }, (snap) => {
      if (snap.metadata.fromCache && !snap.metadata.hasPendingWrites) return;

      if (snap.exists()) {
        const serverConfig = snap.data() as GachaConfig;
        if (pendingGachaConfig && valuesMatch(serverConfig, pendingGachaConfig)) {
          pendingGachaConfig = null;
        }
        const config = pendingGachaConfig || serverConfig;
        localGachaConfig = config;
        saveLocalAll();
        callback(config);
      } else if (pendingGachaConfig) {
        localGachaConfig = pendingGachaConfig;
        saveLocalAll();
        callback(pendingGachaConfig);
      } else {
        // Never resurrect a stale local config when Firebase has no document.
        localGachaConfig = INITIAL_GACHA_CONFIG;
        saveLocalAll();
        callback(localGachaConfig);
      }
    }, (err) => {
      console.warn("Gacha config listener error:", err);
      callback(localGachaConfig);
    });

    let handleBroadcast: ((ev: MessageEvent) => void) | null = null;
    if (broadcast) {
      handleBroadcast = (ev: MessageEvent) => {
        if (ev.data?.type === 'GACHA_CONFIG_UPDATE') {
          callback(localGachaConfig);
        }
      };
      broadcast.addEventListener('message', handleBroadcast);
    }
    return () => {
      if (broadcast && handleBroadcast) broadcast.removeEventListener('message', handleBroadcast);
      unsub();
    };
  } catch (err) {
    callback(localGachaConfig);
    return () => {};
  }
}

// Update Gacha Config (Admin)
export async function updateGachaConfig(config: GachaConfig): Promise<void> {
  const previousConfig = localGachaConfig;
  pendingGachaConfig = config;
  localGachaConfig = config;
  saveLocalAll();
  broadcast?.postMessage({ type: 'GACHA_CONFIG_UPDATE' });

  try {
      await enqueuePersistenceWrite('gacha-config:main', () =>
        setDoc(doc(db, GACHA_CONFIG_COLLECTION, "main"), sanitizeForFirestore(config))
      );
  } catch (err) {
    pendingGachaConfig = null;
    localGachaConfig = previousConfig;
    saveLocalAll();
    broadcast?.postMessage({ type: 'GACHA_CONFIG_UPDATE' });
    console.warn("Error updating gacha config in Firestore:", err);
    throw err;
  }
}

// Save or Update Gacha Reward (Admin)
export async function saveGachaReward(reward: GachaReward): Promise<void> {
  const id = reward.id || `gacha-r-${Date.now()}`;
  const isNewReward = !localGachaRewards.some(existing => existing.id === id);
  if (isNewReward && localGachaRewards.length >= MAX_GACHA_REWARDS) {
    throw new Error(`Gacha reward limit reached: ${MAX_GACHA_REWARDS}`);
  }

  const fullReward = { ...reward, id };
  const previousReward = localGachaRewards.find(existing => existing.id === id);
  pendingGachaRewards.set(id, fullReward);
  localGachaRewards = [fullReward, ...localGachaRewards.filter(r => r.id !== id)];
  saveLocalAll();
  broadcast?.postMessage({ type: 'GACHA_REWARDS_UPDATE' });
  notifyGachaRewards();

  try {
    const firestoreReward = stripUndefined(fullReward);
    await enqueuePersistenceWrite(`gacha-reward:${id}`, () =>
      setDoc(doc(db, GACHA_REWARDS_COLLECTION, id), firestoreReward)
    );
  } catch (err) {
    pendingGachaRewards.delete(id);
    localGachaRewards = previousReward
      ? [previousReward, ...localGachaRewards.filter(r => r.id !== id)]
      : localGachaRewards.filter(r => r.id !== id);
    saveLocalAll();
    notifyGachaRewards();
    console.warn("Error saving gacha reward in Firestore:", err);
    throw err;
  }
}

// Delete Gacha Reward (Admin)
export async function deleteGachaReward(rewardId: string): Promise<void> {
  const deletedReward = localGachaRewards.find(existing => existing.id === rewardId);
  pendingGachaDeletes.add(rewardId);
  localGachaRewards = localGachaRewards.filter(r => r.id !== rewardId);
  saveLocalAll();
  broadcast?.postMessage({ type: 'GACHA_REWARDS_UPDATE' });
  notifyGachaRewards();

  try {
    await enqueuePersistenceWrite(`gacha-reward:${rewardId}`, () =>
      deleteDoc(doc(db, GACHA_REWARDS_COLLECTION, rewardId))
    );
  } catch (err) {
    pendingGachaDeletes.delete(rewardId);
    if (deletedReward) localGachaRewards = [deletedReward, ...localGachaRewards];
    saveLocalAll();
    notifyGachaRewards();
    console.warn("Error deleting gacha reward in Firestore:", err);
    throw err;
  }
}

// Admin Grant / Spawn Item to player's inventory
export async function grantItemToPlayer(
  targetCharId: string,
  item: Item,
  quantity: number = 1,
  adminName: string = "โทแกบีผู้ดูแลระบบ"
): Promise<{ success: boolean; message: string; updatedChar?: CharacterProfile }> {
  const char = localCharacters.find(c => c.id === targetCharId);
  if (!char) return { success: false, message: "ไม่พบตัวละครเป้าหมาย" };

  const currentInventory: InventoryItem[] = [...(char.inventory || [])];
  const existingIndex = currentInventory.findIndex(
    i => i.id === item.id && !i.isEquipped && i.category === 'consumable'
  );

  if (existingIndex > -1) {
    currentInventory[existingIndex] = {
      ...currentInventory[existingIndex],
      quantity: currentInventory[existingIndex].quantity + quantity
    };
  } else {
    currentInventory.push({
      ...item,
      instanceId: `inst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      quantity: Math.max(1, quantity),
      isEquipped: false
    });
  }

  const notifs = [
    {
      id: `notif-spawn-${Date.now()}`,
      title: "ได้รับไอเทมพระราชทานจากแอดมิน!",
      message: `${adminName} ได้เสกไอเทม "${item.name}" (จำนวน ${quantity} ชิ้น) มอบให้แก่คุณ`,
      timestamp: Date.now(),
      read: false,
      type: "admin" as const
    },
    ...(char.notifications || [])
  ];

  const updated: CharacterProfile = {
    ...char,
    inventory: currentInventory,
    notifications: notifs,
    lastUpdated: Date.now()
  };

  await updateCharacterData(updated);
  return { 
    success: true, 
    message: `เสกไอเทม "${item.name}" (x${quantity}) ให้ ${char.displayName} สำเร็จ!`,
    updatedChar: updated
  };
}

// Admin Remove / Revoke Item from player's inventory
export async function removeItemFromPlayer(
  targetCharId: string,
  instanceId: string,
  quantityToRemove?: number,
  adminName: string = "โทแกบีผู้ดูแลระบบ"
): Promise<{ success: boolean; message: string; updatedChar?: CharacterProfile }> {
  const char = localCharacters.find(c => c.id === targetCharId);
  if (!char) return { success: false, message: "ไม่พบตัวละครเป้าหมาย" };

  const currentInventory: InventoryItem[] = [...(char.inventory || [])];
  const targetItemIndex = currentInventory.findIndex(i => i.instanceId === instanceId || i.id === instanceId);
  if (targetItemIndex === -1) {