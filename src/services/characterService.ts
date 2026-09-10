import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  deleteDoc
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

// Local fallback store
let localCharacters: CharacterProfile[] = (() => {
  try {
    const saved = localStorage.getItem('starstream_characters');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}
  return INITIAL_CHARACTERS;
})();

let localShopItems: Item[] = (() => {
  try {
    const saved = localStorage.getItem('starstream_shop_items');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // localStorage is only a temporary fallback; Firestore remains authoritative.
        // Do not resurrect shop items that an admin deleted from the server.
        return parsed;
      }
    }
  } catch (e) {}
  return INITIAL_SHOP_ITEMS;
})();

let gachaDefaultsMigrationStarted = false;

const gachaRewardsListeners = new Set<(rewards: GachaReward[]) => void>();

let localGachaRewards: GachaReward[] = (() => {
  try {
    const saved = localStorage.getItem('starstream_gacha_rewards');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return INITIAL_GACHA_REWARDS;
})();

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
const pendingShopItems = new Map<string, Item>();
const pendingShopDeletes = new Set<string>();

let localGachaConfig: GachaConfig = (() => {
  try {
    const saved = localStorage.getItem('starstream_gacha_config');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return INITIAL_GACHA_CONFIG;
})();

let pendingGachaConfig: GachaConfig | null = null;

let localDuelRooms: CardDuelRoom[] = (() => {
  try {
    const saved = localStorage.getItem('starstream_duel_rooms');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
})();
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
  try {
    localStorage.setItem('starstream_characters', JSON.stringify(localCharacters));
    localStorage.setItem('starstream_shop_items', JSON.stringify(localShopItems));
    localStorage.setItem('starstream_gacha_rewards', JSON.stringify(localGachaRewards));
    localStorage.setItem('starstream_gacha_config', JSON.stringify(localGachaConfig));
    localStorage.setItem('starstream_duel_rooms', JSON.stringify(localDuelRooms));
  } catch (e) {}
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
      snapshot.forEach((docSnap) => {
        const raw = { ...docSnap.data(), id: docSnap.id } as CharacterProfile;
        const pending = pendingCharacterUpdates.get(raw.id);
        const confirmed = pending ? valuesMatch(raw, pending) : false;
        const source = pending && !confirmed ? pending : raw;
        const synced = source;
        if (confirmed) {
          pendingCharacterUpdates.delete(raw.id);
        }
        list.push(synced);

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
      broadcast.addEventListener('message', handleBroadcast);
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
      broadcast.addEventListener('message', handleBroadcast);
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

  // Update Firestore
  try {
    const cleaned = sanitizeForFirestore(updated);
    await setDoc(doc(db, CHARACTERS_COLLECTION, updated.id), cleaned);
  } catch (err) {
    pendingCharacterUpdates.delete(updated.id);
    console.error("Error updating character in Firestore:", err);
    throw err;
  }
}

// Delete Character
export async function deleteCharacter(charId: string): Promise<void> {
  localCharacters = localCharacters.filter(c => c.id !== charId);
  saveLocalAll();
  broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });

  try {
    await deleteDoc(doc(db, CHARACTERS_COLLECTION, charId));
  } catch (err) {
    console.warn("Error deleting character in Firestore:", err);
  }
}

// Transfer coins
export async function transferCoins(
  fromCharOrId: CharacterProfile | string,
  toCharId: string,
  amount: number,
  memoOrToName?: string
): Promise<{ success: boolean; message: string }> {
  if (amount <= 0) return { success: false, message: "จำนวนเหรียญต้องมากกว่า 0" };
  const senderId = typeof fromCharOrId === 'string' ? fromCharOrId : fromCharOrId.id;
  if (senderId === toCharId) return { success: false, message: "ไม่สามารถโอนเหรียญให้ตนเองได้" };

  const sender = localCharacters.find(c => c.id === senderId);
  const receiver = localCharacters.find(c => c.id === toCharId);
  if (!sender || !receiver) return { success: false, message: "ไม่พบข้อมูลผู้เล่น" };

  if (sender.coins < amount) {
    return { success: false, message: "เหรียญไม่เพียงพอสำหรับการโอน" };
  }

  sender.coins -= amount;
  receiver.coins += amount;
  receiver.notifications = [
    {
      id: `notif-transfer-${Date.now()}`,
      title: "ได้รับเหรียญ Coins โอนเข้าบัญชี",
      message: `ได้รับ ${amount.toLocaleString()} Coins จาก "${sender.displayName}"${memoOrToName ? ` (บันทึก: ${memoOrToName})` : ''}`,
      timestamp: Date.now(),
      read: false,
      type: "trade",
    },
    ...(receiver.notifications || [])
  ];

  await updateCharacterData(sender);
  await updateCharacterData(receiver);
  return { success: true, message: `โอนสำเร็จ ${amount.toLocaleString()} Coins!` };
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
    await setDoc(doc(db, SHOP_ITEMS_COLLECTION, id), sanitizeForFirestore(fullItem));
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
    await deleteDoc(doc(db, SHOP_ITEMS_COLLECTION, itemId));
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

  async function migrateDefaultGachaRewards(currentRewards: GachaReward[]) {
    if (gachaDefaultsMigrationStarted) return;
    gachaDefaultsMigrationStarted = true;

    try {
      const markerRef = doc(db, GACHA_CONFIG_COLLECTION, "gacha-defaults-v1");
      const markerSnap = await getDoc(markerRef);
      if (markerSnap.exists()) return;

      const missingDefaults = INITIAL_GACHA_REWARDS.filter(
        defaultReward => !currentRewards.some(reward => reward.id === defaultReward.id)
      );
      await Promise.all(
        missingDefaults.map(reward =>
          setDoc(doc(db, GACHA_REWARDS_COLLECTION, reward.id), reward)
        )
      );
      await setDoc(markerRef, { version: 1, migratedAt: Date.now() });
    } catch (err) {
      gachaDefaultsMigrationStarted = false;
      console.warn("Error migrating default gacha rewards:", err);
    }
  }

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

      void migrateDefaultGachaRewards(list);

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

    if (broadcast) {
      const handleBroadcast = (ev: MessageEvent) => {
        if (ev.data?.type === 'GACHA_REWARDS_UPDATE') callback(localGachaRewards);
      };
      broadcast.addEventListener('message', handleBroadcast);
    }
    return () => {
      gachaRewardsListeners.delete(callback);
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

    if (broadcast) {
      const handleBroadcast = (ev: MessageEvent) => {
        if (ev.data?.type === 'GACHA_CONFIG_UPDATE') {
          callback(localGachaConfig);
        }
      };
      broadcast.addEventListener('message', handleBroadcast);
    }
    return unsub;
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
    await setDoc(doc(db, GACHA_CONFIG_COLLECTION, "main"), config);
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
    await setDoc(doc(db, GACHA_REWARDS_COLLECTION, id), firestoreReward);
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
    await deleteDoc(doc(db, GACHA_REWARDS_COLLECTION, rewardId));
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
    return { success: false, message: "ไม่พบไอเทมนี้ในคลังของผู้เล่น" };
  }

  const targetItem = currentInventory[targetItemIndex];
  const removedItemName = targetItem.name;

  if (quantityToRemove && quantityToRemove < targetItem.quantity) {
    currentInventory[targetItemIndex] = {
      ...targetItem,
      quantity: targetItem.quantity - quantityToRemove
    };
  } else {
    currentInventory.splice(targetItemIndex, 1);
  }

  const notifs = [
    {
      id: `notif-revoke-${Date.now()}`,
      title: "ระบบได้ทำการลบไอเทมออกจากคลัง",
      message: `${adminName} ได้ทำการลบไอเทม "${removedItemName}" ออกจากคลังกระเป๋าของคุณ`,
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
    message: `ลบไอเทม "${removedItemName}" ออกจากคลังของ ${char.displayName} สำเร็จ!`,
    updatedChar: updated
  };
}

// Subscribe to Card Duel Rooms
export function subscribeToDuelRooms(callback: (rooms: CardDuelRoom[]) => void) {
  duelRoomListeners.add(callback);

  try {
    const q = collection(db, CARD_DUEL_ROOMS_COLLECTION);
    const unsub = onSnapshot(q, (snapshot) => {
      applyDuelRoomSnapshot(snapshot);
    }, (err) => {
      console.warn("Duel rooms listener error, polling Firestore:", err);
      notifyDuelRooms();
    });

    const pollTimer = setInterval(async () => {
      // Automatically flush any pending room writes to Firestore
      if (pendingDuelRooms.size > 0) {
        for (const [id, pendingRoom] of Array.from(pendingDuelRooms.entries())) {
          try {
            await setDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, id), sanitizeForFirestore(pendingRoom));
            pendingDuelRooms.delete(id);
          } catch (e) {
            // Keep in pending for next flush attempt
          }
        }
      }
      try {
        const polledSnapshot = await getDocs(q);
        applyDuelRoomSnapshot(polledSnapshot);
      } catch (err) {
        console.warn("Duel rooms polling error:", err);
      }
    }, 2000);

    if (broadcast) {
      const handleBroadcast = (ev: MessageEvent) => {
        if (ev.data?.type !== 'DUEL_ROOMS_UPDATE') return;
        if (ev.data.room?.id) {
          pendingDuelRooms.set(ev.data.room.id, ev.data.room);
          pendingDuelDeletes.delete(ev.data.room.id);
          localDuelRooms = [ev.data.room, ...localDuelRooms.filter(room => room.id !== ev.data.room.id)];
        } else if (ev.data.roomId) {
          pendingDuelDeletes.add(ev.data.roomId);
          pendingDuelRooms.delete(ev.data.roomId);
          localDuelRooms = localDuelRooms.filter(room => room.id !== ev.data.roomId);
        }
        saveLocalAll();
        notifyDuelRooms();
      };
      broadcast.addEventListener('message', handleBroadcast);
      return () => {
        duelRoomListeners.delete(callback);
        broadcast.removeEventListener('message', handleBroadcast);
        clearInterval(pollTimer);
        unsub();
      };
    }

    return () => {
      duelRoomListeners.delete(callback);
      clearInterval(pollTimer);
      unsub();
    };
  } catch (err) {
    notifyDuelRooms();
    return () => duelRoomListeners.delete(callback);
  }
}

// Create Card Duel Room
export async function createDuelRoom(room: CardDuelRoom): Promise<string> {
  const id = room.id || `room-${Date.now()}`;
  const fullRoom = {
    ...room,
    id,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  pendingDuelRooms.set(id, fullRoom);
  pendingDuelDeletes.delete(id);
  localDuelRooms = [fullRoom, ...localDuelRooms.filter(r => r.id !== id)];
  saveLocalAll();
  notifyDuelRooms();
  broadcast?.postMessage({ type: 'DUEL_ROOMS_UPDATE', room: fullRoom });

  // If invitedPlayerId or opponentId is specified, notify them!
  const targetOpponentId = room.invitedPlayerId || room.opponentId;
  if (targetOpponentId) {
    const opp = localCharacters.find(c => c.id === targetOpponentId);
    if (opp) {
      opp.notifications = [
        {
          id: `notif-duel-invite-${Date.now()}`,
          title: "มีสารท้าดวลศึกไพ่ 21!",
          message: `"${room.creatorName}" ได้เชิญคุณเข้าร่วมศึกดวลไพ่ 21 เดิมพัน ${room.betAmount.toLocaleString()} Coins กดเข้าสู่โหมดการ์ดเกมเพื่อตอบรับคำท้า`,
          timestamp: Date.now(),
          read: false,
          type: "game" as const
        },
        ...(opp.notifications || [])
      ];
      await updateCharacterData(opp);
    }
  }

  const cleaned = sanitizeForFirestore(fullRoom);
  try {
    await setDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, id), cleaned);
    pendingDuelRooms.delete(id);
  } catch (err: any) {
    console.warn("Firestore create duel room error:", err?.code, err?.message);
    if (err?.code === 'unavailable' || err?.message?.includes('offline') || err?.message?.includes('unavailable')) {
      // Offline / transient disconnect: keep room in local state and retry in background
      setTimeout(async () => {
        try {
          await setDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, id), cleaned);
          pendingDuelRooms.delete(id);
        } catch (retryErr) {
          console.warn("Background create retry failed:", retryErr);
        }
      }, 1500);
      return id;
    }
    pendingDuelRooms.delete(id);
    localDuelRooms = localDuelRooms.filter(r => r.id !== id);
    saveLocalAll();
    notifyDuelRooms();
    console.error("Error creating duel room in Firestore:", err);
    throw new Error("ไม่สามารถสร้างห้องดวลบนเซิร์ฟเวอร์ได้: " + (err?.message || ''));
  }
  return id;
}

// Update Card Duel Room
export async function updateDuelRoom(room: CardDuelRoom): Promise<void> {
  const updated = {
    ...room,
    updatedAt: Date.now()
  };
  pendingDuelRooms.set(updated.id, updated);
  pendingDuelDeletes.delete(updated.id);
  localDuelRooms = localDuelRooms.map(r => r.id === updated.id ? updated : r);
  saveLocalAll();
  notifyDuelRooms();
  broadcast?.postMessage({ type: 'DUEL_ROOMS_UPDATE', room: updated });

  const cleaned = sanitizeForFirestore(updated);

  // Write with a timeout so slow networks (e.g. mobile 0.40 KB/s) never hang the app
  const doWrite = async () => {
    let t: any;
    const timeout = new Promise<never>((_, reject) => {
      t = setTimeout(() => reject(new Error('timeout')), 3500);
    });
    try {
      await Promise.race([
        setDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, room.id), cleaned),
        timeout
      ]);
      clearTimeout(t);
      pendingDuelRooms.delete(updated.id);
    } catch (err) {
      clearTimeout(t);
      throw err;
    }
  };

  try {
    await doWrite();
  } catch (err: any) {
    console.warn("Direct Firestore updateDuelRoom deferred or timed out:", err?.message || err);
    // Keep in pendingDuelRooms! The poll loop and syncDuelRoomById will automatically flush it to Firestore.
    // Also schedule immediate retries
    [800, 2000, 4000].forEach((delay) => {
      setTimeout(async () => {
        if (!pendingDuelRooms.has(updated.id)) return;
        try {
          await setDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, room.id), cleaned);
          pendingDuelRooms.delete(updated.id);
        } catch (retryErr) {
          // Will be retried on next poll
        }
      }, delay);
    });
  }
}

// Force-sync a specific duel room by ID from Firestore and flush any local pending writes
export async function syncDuelRoomById(roomId: string): Promise<CardDuelRoom | null> {
  // 1. Flush any pending write for this room
  const pending = pendingDuelRooms.get(roomId);
  if (pending) {
    try {
      await setDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, roomId), sanitizeForFirestore(pending));
      pendingDuelRooms.delete(roomId);
    } catch (e) {
      console.warn("Could not flush pending room yet during sync:", e);
    }
  }

  // 2. Fetch fresh room doc from Firestore
  try {
    const snap = await getDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, roomId));
    if (snap.exists()) {
      const room = { ...snap.data(), id: snap.id } as CardDuelRoom;
      const currentPending = pendingDuelRooms.get(roomId);
      // If we still have an unflushed pending action that is newer, don't overwrite with older remote
      if (currentPending && currentPending.updatedAt && room.updatedAt && currentPending.updatedAt > room.updatedAt) {
        return currentPending;
      }
      localDuelRooms = [room, ...localDuelRooms.filter(r => r.id !== roomId)];
      saveLocalAll();
      notifyDuelRooms();
      return room;
    }
  } catch (err) {
    console.warn("syncDuelRoomById getDoc error:", err);
  }
  return null;
}

// Accept Card Duel Challenge / Join Room
export async function acceptDuelChallenge(roomId: string, opponent: CharacterProfile): Promise<void> {
  const room = localDuelRooms.find(r => r.id === roomId);
  if (!room) throw new Error("ไม่พบห้องดวลที่เลือก");
  if (room.status !== 'waiting') throw new Error("ห้องนี้มีผู้เข้าร่วมครบแล้วหรือการแข่งขันได้เริ่มขึ้นแล้ว");

  // Deduct/hold coins or prepare match
  const readyList = Array.from(new Set([...(room.readyPlayers || []), room.creatorId, opponent.id]));
  const isFullAndReady = readyList.length >= (room.requiredPlayersCount || 2);

  room.opponentId = opponent.id;
  room.opponentName = opponent.displayName;
  room.opponentAvatar = opponent.avatarUrl;
  room.readyPlayers = readyList;
  room.status = isFullAndReady ? 'ready' : 'waiting';
  room.updatedAt = Date.now();

  // Send immediate notifications to both players
  const creator = localCharacters.find(c => c.id === room.creatorId);
  if (creator) {
    creator.notifications = [
      {
        id: `notif-duel-ready-${Date.now()}`,
        title: "ผู้เล่นพร้อมเล่นครบตามจำนวนแล้ว!",
        message: `"${opponent.displayName}" ได้เข้าร่วมห้องดวลไพ่ 21 แล้ว! ผู้เล่นพร้อมครบตามจำนวนที่กำหนดไว้ทันที สามารถเริ่มการดวลได้เลย`,
        timestamp: Date.now(),
        read: false,
        type: "game" as const
      },
      ...(creator.notifications || [])
    ];
    await updateCharacterData(creator);
  }

  opponent.notifications = [
    {
      id: `notif-duel-accepted-${Date.now()}`,
      title: "เข้าร่วมศึกดวลไพ่ 21 สำเร็จ!",
      message: `คุณได้เข้าร่วมห้องดวลกับ "${room.creatorName}" แล้ว! ผู้เล่นครบตามจำนวนพร้อมเริ่มการประลองทันที`,
      timestamp: Date.now(),
      read: false,
      type: "game" as const
    },
    ...(opponent.notifications || [])
  ];
  await updateCharacterData(opponent);

  await updateDuelRoom(room);
}

// Cancel or Delete Card Duel Room
export async function cancelDuelRoom(roomId: string): Promise<void> {
  pendingDuelDeletes.add(roomId);
  pendingDuelRooms.delete(roomId);
  localDuelRooms = localDuelRooms.filter(r => r.id !== roomId);
  saveLocalAll();
  notifyDuelRooms();
  broadcast?.postMessage({ type: 'DUEL_ROOMS_UPDATE', roomId });

  try {
    await deleteDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, roomId));
  } catch (err) {
    console.warn("Error deleting duel room in Firestore:", err);
  }
}

// Reset all database collections to initial values
export async function resetDatabaseToDefaults(): Promise<void> {
  localCharacters = INITIAL_CHARACTERS;
  localShopItems = INITIAL_SHOP_ITEMS;
  localGachaRewards = INITIAL_GACHA_REWARDS;
  localGachaConfig = INITIAL_GACHA_CONFIG;
  localDuelRooms = [];
  saveLocalAll();

  broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });
  broadcast?.postMessage({ type: 'SHOP_UPDATE' });
  broadcast?.postMessage({ type: 'GACHA_REWARDS_UPDATE' });
  broadcast?.postMessage({ type: 'GACHA_CONFIG_UPDATE' });
  broadcast?.postMessage({ type: 'DUEL_ROOMS_UPDATE' });

  for (const char of INITIAL_CHARACTERS) {
    const score = calculatePowerScore(char);
    try {
      await setDoc(doc(db, CHARACTERS_COLLECTION, char.id), {
        ...char,
        powerScore: score,
      });
    } catch (e) {}
  }
  for (const item of INITIAL_SHOP_ITEMS) {
    try {
      await setDoc(doc(db, SHOP_ITEMS_COLLECTION, item.id), item);
    } catch (e) {}
  }
  for (const reward of INITIAL_GACHA_REWARDS) {
    try {
      await setDoc(doc(db, GACHA_REWARDS_COLLECTION, reward.id), reward);
    } catch (e) {}
  }
  try {
    await setDoc(doc(db, GACHA_CONFIG_COLLECTION, "main"), INITIAL_GACHA_CONFIG);
  } catch (e) {}
}

// Card 21 Match Bet Settlement
export async function settleCard21Bet(
  winnerChar: CharacterProfile,
  loserChar: CharacterProfile | null,
  betAmount: number,
  isTie: boolean,
  reason: string
): Promise<void> {
  if (betAmount <= 0) return;
  if (isTie) return;

  if (!loserChar) {
    const newCoins = winnerChar.coins + betAmount;
    await updateCharacterData({
      ...winnerChar,
      coins: newCoins,
      notifications: [
        {
          id: `notif-card21-win-${Date.now()}`,
          title: "ชนะศึกดวลไพ่ 21!",
          message: `${reason} ได้รับเหรียญรางวัล +${betAmount.toLocaleString()} Coins`,
          timestamp: Date.now(),
          read: false,
          type: "game",
        },
        ...winnerChar.notifications,
      ],
    });
  } else {
    await transferCoins(
      loserChar,
      winnerChar.id,
      betAmount,
      winnerChar.displayName
    );
  }
}

// Aliases
export const subscribeToShopItems = subscribeToShop;
export const updateCharacter = updateCharacterData;
export const updateCharacterInDB = updateCharacterData;
export const addCharacterToDB = updateCharacterData;
export const transferCoinsBetweenCharacters = transferCoins;
export const saveShopItem = addShopItem;
export const addShopItemToDB = addShopItem;
export const removeShopItem = deleteShopItem;
export const deleteShopItemFromDB = deleteShopItem;
export const removeGachaReward = deleteGachaReward;
export const deleteGachaRewardFromDB = deleteGachaReward;
export const addGachaRewardToDB = saveGachaReward;
export const updateGachaRewardInDB = saveGachaReward;
export const saveGachaConfig = updateGachaConfig;
export const updateGachaConfigInDB = updateGachaConfig;


// TEAM BATTLE DATA AND RULES
const BATTLE_CONFIG_COLLECTION = "battle_config";
const BATTLE_BOTS_COLLECTION = "battle_bots";
const BATTLE_ROOMS_COLLECTION = "battle_rooms";

export const DEFAULT_BATTLE_CONFIG: BattleConfig = {
  id: "main",
  enabled: true,
  sides: 6,
  strengthPerDamage: 3,
  faces: [
    { face: 1, effect: "miss", value: 0, label: "พลาด", description: "การโจมตีไม่สร้างความเสียหาย" },
    { face: 2, effect: "damage", value: 1, label: "โจมตีปกติ", description: "ดาเมจพื้นฐาน" },
    { face: 3, effect: "damage", value: 1, label: "โจมตีปกติ", description: "ดาเมจพื้นฐาน" },
    { face: 4, effect: "damage", value: 1.5, label: "โจมตีหนัก", description: "ดาเมจพื้นฐาน x1.5" },
    { face: 5, effect: "critical", value: 2, label: "คริติคอล", description: "ดาเมจพื้นฐาน x2" },
    { face: 6, effect: "heal", value: 2, label: "ฟื้นฟู", description: "ฟื้น HP 2 หน่วย" },
  ],
  bossDice: {
    enabled: true,
    sides: 8,
    strengthPerDamage: 2,
    faces: [
      { face: 1, effect: "miss", value: 0, label: "พลาด", description: "บอสพลาดการโจมตี" },
      { face: 2, effect: "damage", value: 1, label: "กรงเล็บอสูร", description: "ดาเมจบอสพื้นฐาน" },
      { face: 3, effect: "damage", value: 1.5, label: "คำรามทำลาย", description: "ดาเมจบอส x1.5" },
      { face: 4, effect: "defense", value: 5, label: "เกราะบอส", description: "ลดดาเมจที่ได้รับ 5 ในเทิร์นถัดไป" },
      { face: 5, effect: "critical", value: 2, label: "คริติคอลบอส", description: "ดาเมจบอส x2" },
      { face: 6, effect: "heal", value: 4, label: "ฟื้นฟูบอส", description: "บอสฟื้น HP 4 หน่วย" },
      { face: 7, effect: "reflect", value: 35, label: "สะท้อนคำสาป", description: "สะท้อนดาเมจ 35% ในเทิร์นถัดไป" },
      { face: 8, effect: "stun", value: 1, label: "ทุบให้สตัน", description: "สร้างดาเมจและทำให้เป้าหมายเสียเทิร์น" },
    ],
  },
  updatedAt: Date.now(),
};

let localBattleConfig: BattleConfig = (() => {
  try {
    const saved = localStorage.getItem("starstream_battle_config");
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return DEFAULT_BATTLE_CONFIG;
})();
let localBattleBots: BattleBot[] = (() => {
  try {
    const saved = localStorage.getItem("starstream_battle_bots");
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
})();
let localBattleRooms: BattleRoom[] = (() => {
  try {
    const saved = localStorage.getItem("starstream_battle_rooms");
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
})();
const battleConfigListeners = new Set<(config: BattleConfig) => void>();
const battleBotListeners = new Set<(bots: BattleBot[]) => void>();
const battleRoomListeners = new Set<(rooms: BattleRoom[]) => void>();

function saveBattleLocal() {
  try {
    localStorage.setItem("starstream_battle_config", JSON.stringify(localBattleConfig));
    localStorage.setItem("starstream_battle_bots", JSON.stringify(localBattleBots));
    localStorage.setItem("starstream_battle_rooms", JSON.stringify(localBattleRooms));
  } catch (e) {}
}
function notifyBattleConfig() { battleConfigListeners.forEach(listener => listener(localBattleConfig)); }
function notifyBattleBots() { battleBotListeners.forEach(listener => listener([...localBattleBots])); }
function notifyBattleRooms() { battleRoomListeners.forEach(listener => listener([...localBattleRooms])); }

export function subscribeToBattleConfig(callback: (config: BattleConfig) => void) {
  callback(localBattleConfig);
  battleConfigListeners.add(callback);
  try {
    return onSnapshot(doc(db, BATTLE_CONFIG_COLLECTION, "main"), (snapshot) => {
      if (snapshot.exists()) {
        localBattleConfig = { ...DEFAULT_BATTLE_CONFIG, ...snapshot.data(), id: "main" } as BattleConfig;
        saveBattleLocal();
        callback(localBattleConfig);
      }
    }, () => callback(localBattleConfig));
  } catch (err) {
    return () => {};
  }
}

export function subscribeToBattleBots(callback: (bots: BattleBot[]) => void) {
  callback(localBattleBots);
  battleBotListeners.add(callback);
  try {
    return onSnapshot(collection(db, BATTLE_BOTS_COLLECTION), (snapshot) => {
      if (snapshot.empty) return;
      localBattleBots = snapshot.docs.map(item => ({ ...item.data(), id: item.id } as BattleBot));
      saveBattleLocal();
      callback(localBattleBots);
    }, () => callback(localBattleBots));
  } catch (err) {
    return () => {};
  }
}

export function subscribeToBattleRooms(callback: (rooms: BattleRoom[]) => void) {
  callback(localBattleRooms);
  battleRoomListeners.add(callback);
  try {
    return onSnapshot(collection(db, BATTLE_ROOMS_COLLECTION), (snapshot) => {
      if (snapshot.empty) return;
      localBattleRooms = snapshot.docs
        .map(item => ({ ...item.data(), id: item.id } as BattleRoom))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      saveBattleLocal();
      callback(localBattleRooms);
    }, () => callback(localBattleRooms));
  } catch (err) {
    return () => {};
  }
}

export async function saveBattleConfig(config: BattleConfig): Promise<void> {
  const next = { ...config, id: "main", updatedAt: Date.now() };
  localBattleConfig = next;
  saveBattleLocal();
  notifyBattleConfig();
  await setDoc(doc(db, BATTLE_CONFIG_COLLECTION, "main"), sanitizeForFirestore(next));
}

export async function saveBattleBot(bot: BattleBot): Promise<void> {
  const id = bot.id || "bot-" + Date.now();
  const next = { ...bot, id, createdAt: bot.createdAt || Date.now(), updatedAt: Date.now() };
  localBattleBots = [next, ...localBattleBots.filter(item => item.id !== id)];
  saveBattleLocal();
  notifyBattleBots();
  await setDoc(doc(db, BATTLE_BOTS_COLLECTION, id), sanitizeForFirestore(next));
}

export async function deleteBattleBot(botId: string): Promise<void> {
  localBattleBots = localBattleBots.filter(bot => bot.id !== botId);
  saveBattleLocal();
  notifyBattleBots();
  await deleteDoc(doc(db, BATTLE_BOTS_COLLECTION, botId));
}

export async function createBattleRoom(room: BattleRoom): Promise<string> {
  const id = room.id || "battle-" + Date.now();
  const next = { ...room, id, createdAt: room.createdAt || Date.now(), updatedAt: Date.now() };
  localBattleRooms = [next, ...localBattleRooms.filter(item => item.id !== id)];
  saveBattleLocal();
  notifyBattleRooms();
  await setDoc(doc(db, BATTLE_ROOMS_COLLECTION, id), sanitizeForFirestore(next));
  return id;
}

export async function updateBattleRoom(room: BattleRoom): Promise<void> {
  const next = { ...room, updatedAt: Date.now() };
  localBattleRooms = [next, ...localBattleRooms.filter(item => item.id !== next.id)];
  saveBattleLocal();
  notifyBattleRooms();
  await setDoc(doc(db, BATTLE_ROOMS_COLLECTION, next.id), sanitizeForFirestore(next));
}

export async function deleteBattleRoom(roomId: string): Promise<void> {
  localBattleRooms = localBattleRooms.filter(room => room.id !== roomId);
  saveBattleLocal();
  notifyBattleRooms();
  await deleteDoc(doc(db, BATTLE_ROOMS_COLLECTION, roomId));
}

export function getBattleSkillProfile(skill: Skill): { effect: BattleSkillEffect; power: number; cooldownTurns: number } {
  const text = `${skill.name || ""} ${skill.description || ""} ${skill.type || ""}`.toLowerCase();
  const effect = skill.battleEffect
    || (text.includes("สะท้อน") || text.includes("reflect") ? "reflect"
      : text.includes("ป้องกัน") || text.includes("เกราะ") || text.includes("ม่าน") || text.includes("shield") || text.includes("หลบ") ? "defense"
        : text.includes("สตัน") || text.includes("มึนงง") || text.includes("stun") ? "stun"
          : text.includes("ฟื้น") || text.includes("รักษา") || text.includes("heal") ? "heal" : "damage");
  const percent = Number(text.match(/(\d+)\s*%/)?.[1] || 0);
  // Skills created before cooldownTurns existed use the migration default of 3 turns.
  const configuredCooldown = skill.cooldownTurns == null ? 3 : skill.cooldownTurns;
  const cooldownTurns = Math.max(0, Math.min(99, Math.round(configuredCooldown)));
  const power = Math.max(1, skill.battlePower ?? (effect === "reflect" ? percent || 35 : effect === "defense" ? 5 : 5));
  return { effect, power, cooldownTurns };
}

function getActiveAdminStatusEffects(unit: BattleCombatant): AdminStatusEffect[] {
  return (unit.adminStatusEffects || []).filter(effect => effect.remaining > 0);
}

function getAdminOutgoingDamageMultiplier(unit: BattleCombatant): number {
  return getActiveAdminStatusEffects(unit).reduce((multiplier, effect) => {
    if (!['curse', 'weakness', 'slow'].includes(effect.kind)) return multiplier;
    const percent = Math.min(100, Math.max(0, Number(effect.power) || 0)) / 100;
    return multiplier * (effect.mode === 'buff' ? 1 + percent : 1 - percent);
  }, 1);
}

function getAdminIncomingDamageMultiplier(unit: BattleCombatant): number {
  return getActiveAdminStatusEffects(unit).reduce((multiplier, effect) => {
    if (effect.kind !== 'shield') return multiplier;
    const percent = Math.min(100, Math.max(0, Number(effect.power) || 0)) / 100;
    return multiplier * (effect.mode === 'buff' ? 1 - percent : 1 + percent);
  }, 1);
}

function getAdminReflectPercent(unit: BattleCombatant): number {
  return getActiveAdminStatusEffects(unit)
    .filter(effect => effect.kind === 'reflect')
    .reduce((percent, effect) => Math.max(percent, Math.min(100, Math.max(0, Number(effect.power) || 0))), 0);
}

function tickAdminStatusEffects(unit: BattleCombatant): { message: string; skipTurn: boolean } {
  const active = getActiveAdminStatusEffects(unit);
  let damage = 0;
  let healing = 0;
  let skipTurn = false;
  const messages: string[] = [];
  active.forEach(effect => {
    const power = Math.max(0, Math.round(Number(effect.power) || 0));
    if (['bleeding', 'burn', 'poison'].includes(effect.kind) && effect.mode === 'nerf') damage += power;
    if (effect.kind === 'regen' && effect.mode === 'buff') healing += power;
    if (effect.kind === 'stun') skipTurn = true;
  });
  if (damage > 0) {
    unit.hp = Math.max(0, unit.hp - damage);
    messages.push(unit.name + ' ได้รับความเสียหายจากสถานะ ' + damage);
  }
  if (healing > 0) {
    const restored = Math.min(healing, Math.max(0, unit.maxHp - unit.hp));
    unit.hp = Math.min(unit.maxHp, unit.hp + healing);
    if (restored > 0) messages.push(unit.name + ' ฟื้นฟูจากสถานะ ' + restored);
  }
  return { message: messages.join(' • '), skipTurn };
}

function advanceAdminStatusEffects(unit: BattleCombatant) {
  if (!unit.adminStatusEffects) return;
  unit.adminStatusEffects = unit.adminStatusEffects
    .map(effect => ({ ...effect, remaining: Math.max(0, effect.remaining - 1) }))
    .filter(effect => effect.remaining > 0);
}

export function rollBattleAttack(attacker: BattleCombatant, defender: BattleCombatant, config: BattleDiceConfig): BattleRollResult {
  const sides = Math.max(2, config.sides || 6);
  const roll = Math.floor(Math.random() * sides) + 1;
  const face = config.faces.find(item => item.face === roll) || {
    face: roll, effect: "damage" as const, value: 1, label: "โจมตีปกติ", description: "ดาเมจพื้นฐาน"
  };
  const baseDamage = Math.max(1, Math.round(Math.floor((attacker.stats?.strength || 0) / Math.max(1, config.strengthPerDamage || 3)) * getAdminOutgoingDamageMultiplier(attacker)));
  let damage = 0;
  let heal = 0;
  if (face.effect === "damage" || face.effect === "critical" || face.effect === "stun") {
    damage = Math.max(0, Math.round(baseDamage * Math.max(0, face.value || 1)));
  }
  if (face.effect === "heal") heal = Math.max(1, Math.round(face.value || 1));
  const message = face.effect === "miss"
    ? attacker.name + " ทอยได้หน้า " + roll + " — " + face.label
    : face.effect === "heal"
      ? attacker.name + " ทอยได้หน้า " + roll + " — " + face.label + " ฟื้น HP " + heal
      : face.effect === "defense"
        ? attacker.name + " ทอยได้หน้า " + roll + " — " + face.label + " ลดดาเมจ " + Math.max(0, Math.round(face.value || 0)) + " ในเทิร์นถัดไป"
        : face.effect === "reflect"
          ? attacker.name + " ทอยได้หน้า " + roll + " — " + face.label + " สะท้อนดาเมจ " + Math.max(0, Math.round(face.value || 0)) + "%"
      : attacker.name + " ทอยได้หน้า " + roll + " — " + face.label + " สร้างดาเมจ " + damage;
  return { roll, face, damage, heal, message };
}

function getBattleCombatants(room: BattleRoom): BattleCombatant[] {
  return [...room.teamA, ...room.teamB];
}
function getNextBattleActor(room: BattleRoom, actorId: string): BattleCombatant | undefined {
  const all = getBattleCombatants(room);
  const start = Math.max(0, all.findIndex(item => item.id === actorId));
  for (let step = 1; step <= all.length; step += 1) {
    const candidate = all[(start + step) % all.length];
    if (candidate && candidate.hp > 0) return candidate;
  }
  return undefined;
}

export function resolveBattleTurn(room: BattleRoom, config: BattleConfig, skill?: Skill): { room: BattleRoom; result: BattleRollResult | null } {
  if (room.status !== "active") return { room, result: null };
  const nextRoom: BattleRoom = {
    ...room,
    teamA: room.teamA.map(item => ({ ...item })),
    teamB: room.teamB.map(item => ({ ...item })),
    log: [...(room.log || [])],
  };
  const all = getBattleCombatants(nextRoom);
  const actor = all.find(item => item.id === nextRoom.turnActorId) || all.find(item => item.hp > 0);
  if (!actor || actor.hp <= 0) return { room, result: null };
  const opponentTeam = actor.team === "a" ? nextRoom.teamB : nextRoom.teamA;
  const defender = opponentTeam.find(item => item.hp > 0);
  if (!defender) return { room: { ...nextRoom, status: "completed", winnerTeam: actor.team }, result: null };
  const current = all.find(item => item.id === actor.id) as BattleCombatant;
  const statusTick = tickAdminStatusEffects(current);
  if (statusTick.skipTurn) current.stunnedTurns = Math.max(current.stunnedTurns || 0, 1);
  let result: BattleRollResult | null = null;
  if (current.hp <= 0) {
    nextRoom.log.unshift({ id: "battle-log-" + Date.now(), timestamp: Date.now(), actorName: current.name, message: current.name + (statusTick.message ? " • " + statusTick.message : "") + " หมดสติจากผลสถานะ", effect: "stun_skip" });
  } else if ((current.stunnedTurns || 0) > 0) {
    current.stunnedTurns = Math.max(0, (current.stunnedTurns || 0) - 1);
    nextRoom.log.unshift({ id: "battle-log-" + Date.now(), timestamp: Date.now(), actorName: current.name, message: current.name + (statusTick.message ? " • " + statusTick.message : "") + " ถูกสตัน จึงเสียเทิร์น", effect: "stun_skip" });
  } else {
    const diceConfig = current.isBoss && config.bossDice?.enabled ? config.bossDice : {
      enabled: true,
      sides: config.sides,
      strengthPerDamage: config.strengthPerDamage,
      faces: config.faces,
    };
    const cooldowns = { ...(current.skillCooldowns || {}) };
    Object.keys(cooldowns).forEach(skillId => {
      cooldowns[skillId] = Math.max(0, (cooldowns[skillId] || 0) - 1);
      if (cooldowns[skillId] === 0) delete cooldowns[skillId];
    });
    current.skillCooldowns = cooldowns;
    const skillProfile = skill ? getBattleSkillProfile(skill) : null;
    const skillName = skill?.name || "สกิล";
    if (skill && skillProfile && (current.skillCooldowns[skill.id] || 0) > 0) {
      return { room, result: null };
    }
    result = rollBattleAttack(current, defender, diceConfig);
    if (statusTick.message) result.message = statusTick.message + ' • ' + result.message;
    if (skillProfile) {
      result.skillEffect = skillProfile.effect;
      result.skillPower = skillProfile.power;
      if (skillProfile.effect === "damage") {
        const skillDamage = Math.max(0, Math.round(skillProfile.power * getAdminOutgoingDamageMultiplier(current)));
        result.damage += skillDamage;
        result.message += ` • ใช้สกิล ${skillName} เพิ่มดาเมจ ${skillDamage}`;
      } else if (skillProfile.effect === "heal") {
        result.heal += skillProfile.power;
        result.message += ` • ใช้สกิล ${skillName} ฟื้นฟู ${skillProfile.power}`;
      } else if (skillProfile.effect === "defense") {
        current.defenseValue = skillProfile.power;
        current.defenseTurns = 1;
        result.message += ` • ใช้สกิล ${skillName} ป้องกันดาเมจ ${skillProfile.power} ในเทิร์นถัดไป`;
      } else if (skillProfile.effect === "reflect") {
        current.reflectPercent = Math.min(100, skillProfile.power);
        current.reflectTurns = 1;
        result.message += ` • ใช้สกิล ${skillName} สะท้อนดาเมจ ${current.reflectPercent}% ในเทิร์นถัดไป`;
      } else if (skillProfile.effect === "stun") {
        defender.stunnedTurns = (defender.stunnedTurns || 0) + 1;
        result.message += ` • ใช้สกิล ${skillName} ทำให้ ${defender.name} ติดสตัน 1 เทิร์น`;
      }
      if (skill && skillProfile.cooldownTurns > 0) {
        current.skillCooldowns = { ...(current.skillCooldowns || {}), [skill.id]: skillProfile.cooldownTurns };
        result.cooldownRemaining = skillProfile.cooldownTurns;
      }
    }
    if (result.face.effect === "defense") {
      current.defenseValue = Math.max(current.defenseValue || 0, Math.max(0, Math.round(result.face.value || 0)));
      current.defenseTurns = 1;
    }
    if (result.face.effect === "reflect") {
      current.reflectPercent = Math.max(current.reflectPercent || 0, Math.min(100, Math.round(result.face.value || 0)));
      current.reflectTurns = 1;
    }
    if (result.damage > 0) {
      const damageAfterStatus = Math.max(0, Math.round(result.damage * getAdminIncomingDamageMultiplier(defender)));
      const statusBlocked = Math.max(0, result.damage - damageAfterStatus);
      const blocked = Math.min(damageAfterStatus, defender.defenseTurns ? (defender.defenseValue || 0) : 0);
      const finalDamage = Math.max(0, damageAfterStatus - blocked);
      if (statusBlocked > 0) result.message += ` • สถานะลดดาเมจ ${statusBlocked}`;
      defender.hp = Math.max(0, defender.hp - finalDamage);
      if (blocked > 0) {
        result.message += ` • ป้องกันไว้ ${blocked}`;
        defender.defenseTurns = 0;
        defender.defenseValue = 0;
      }
      const adminReflectPercent = getAdminReflectPercent(defender);
      const reflectPercent = Math.max(defender.reflectTurns && defender.reflectPercent ? defender.reflectPercent : 0, adminReflectPercent);
      if (reflectPercent > 0 && finalDamage > 0) {
        const reflected = Math.max(1, Math.round(finalDamage * reflectPercent / 100));
        current.hp = Math.max(0, current.hp - reflected);
        result.message += ` • สะท้อนกลับ ${reflected}`;
        if (defender.reflectTurns) {
          defender.reflectTurns = 0;
          defender.reflectPercent = 0;
        }
      }
      result.damage = finalDamage;
    }
    if (result.heal > 0) current.hp = Math.min(current.maxHp, current.hp + result.heal);
    if (result.face.effect === "stun" && defender.hp > 0) defender.stunnedTurns = (defender.stunnedTurns || 0) + 1;
    nextRoom.log.unshift({ id: "battle-log-" + Date.now(), timestamp: Date.now(), actorName: current.name, message: result.message + (result.face.effect === "stun" ? " และทำให้เป้าหมายติดสตัน" : ""), roll: result.roll, damage: result.damage, effect: result.face.effect });
  }
  const remainingOpponent = opponentTeam.filter(item => item.hp > 0);
  if (remainingOpponent.length === 0) {
    nextRoom.status = "completed";
    nextRoom.winnerTeam = actor.team;
    nextRoom.turnActorId = current.id;
    return { room: nextRoom, result };
  }
  const nextActor = getNextBattleActor(nextRoom, current.id);
  if (nextActor?.team === "a" && current.team === "b") getBattleCombatants(nextRoom).forEach(advanceAdminStatusEffects);
  nextRoom.turnActorId = nextActor?.id || current.id;
  nextRoom.round = (nextRoom.round || 1) + (nextActor?.team === "a" && current.team === "b" ? 1 : 0);
  return { room: nextRoom, result };
}