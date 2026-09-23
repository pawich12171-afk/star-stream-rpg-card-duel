import {
  collection,
  doc,
  getDocs,
  getDocsFromServer,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  deleteDoc,
  writeBatch
} from "../apiDb";
import { db } from "../apiDb";
import { 
  CharacterProfile, 
  Item, 
  Quest, 
  InventoryItem, 
  GachaReward, 
  GachaBanner,
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
  ItemPassiveEffect,
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
const GACHA_BANNERS_COLLECTION = "gacha_banners";
const CARD_DUEL_ROOMS_COLLECTION = "card_duel_rooms";
const MARKETPLACE_LISTINGS_COLLECTION = "marketplace_listings";
const CHAT_MESSAGES_COLLECTION = "chat_messages";

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

const AVATAR_OVERRIDES_KEY = 'starstream_profile_avatar_overrides';

function readAvatarOverrides(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const saved = window.localStorage.getItem(AVATAR_OVERRIDES_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveAvatarOverride(id: string, avatarUrl: string): void {
  if (typeof window === 'undefined') return;
  try {
    const overrides = readAvatarOverrides();
    const avatar = String(avatarUrl || '').trim();
    if (avatar && isCustomProfileAvatar(avatar)) overrides[id] = avatar;
    else delete overrides[id];
    window.localStorage.setItem(AVATAR_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {}
}

function applyAvatarOverrides(chars: CharacterProfile[]): CharacterProfile[] {
  const overrides = readAvatarOverrides();
  return chars.map(char => overrides[char.id] ? { ...char, avatarUrl: overrides[char.id] } : char);
}

let localCharacters: CharacterProfile[] = applyAvatarOverrides(
  readLocalArray('starstream_characters', INITIAL_CHARACTERS)
);
let localShopItems: Item[] = readLocalArray('starstream_shop_items', INITIAL_SHOP_ITEMS);

const gachaRewardsListeners = new Set<(rewards: GachaReward[]) => void>();

let localGachaRewards: GachaReward[] = readLocalArray('starstream_gacha_rewards', INITIAL_GACHA_REWARDS);
const gachaBannerListeners = new Set<(banners: GachaBanner[]) => void>();
let localGachaBanners: GachaBanner[] = readLocalArray('starstream_gacha_banners', []);
let gachaBannerInitializationStarted = false;

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
const pendingGachaBanners = new Map<string, GachaBanner>();
const pendingGachaBannerDeletes = new Set<string>();

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
    window.localStorage.setItem('starstream_gacha_banners', JSON.stringify(localGachaBanners));
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
    const [charsSnap, shopSnap, gachaRewardsSnap, gachaConfigSnap, gachaBannersSnap] = await Promise.all([
      getDocs(collection(db, CHARACTERS_COLLECTION)),
      getDocs(collection(db, SHOP_ITEMS_COLLECTION)),
      getDocs(collection(db, GACHA_REWARDS_COLLECTION)),
      getDocs(collection(db, GACHA_CONFIG_COLLECTION)),
      getDocs(collection(db, GACHA_BANNERS_COLLECTION)),
    ]);

    // Seed only a genuinely new database. Once any shared data exists, an empty
    // collection may be an intentional deletion and must not be repopulated.
    const isFreshDatabase =
      charsSnap.empty &&
      shopSnap.empty &&
      gachaRewardsSnap.empty &&
      gachaConfigSnap.empty &&
      gachaBannersSnap.empty;
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
    await setDoc(doc(db, GACHA_BANNERS_COLLECTION, "main"), {
      id: "main",
      name: "ตู้หลัก",
      pullCost: INITIAL_GACHA_CONFIG.pullCost,
      tenPullCost: INITIAL_GACHA_CONFIG.tenPullCost,
         multiPullCounts: INITIAL_GACHA_CONFIG.multiPullCounts || [20, 30, 50],
      enabled: INITIAL_GACHA_CONFIG.enabled,
      bannerTitle: INITIAL_GACHA_CONFIG.bannerTitle,
      bannerDescription: INITIAL_GACHA_CONFIG.bannerDescription,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn("Firestore seed check fallback to local:", err);
  }
}

// A profile avatar chosen in the Profile Customizer is stored as the avatarUrl
// itself (normally a data: URL). Keep that local custom value when an older server
// snapshot still contains one of the bundled preset avatars. This prevents a
// refresh from replacing the user's chosen profile image with chaewon.svg, etc.
function isCustomProfileAvatar(value: unknown): boolean {
  const avatar = String(value || '').trim();
  if (!avatar) return false;
  if (avatar.startsWith('data:image/')) return true;
  // Object URLs are temporary browser memory references and become invalid
  // after a refresh. They must never be treated as a persistent custom avatar.
  if (/^blob:/i.test(avatar)) return false;
  return !/^\/avatars\/(system|chaewon|hayeon|miyeon|sera)\.svg$/i.test(avatar);
}

function getPreservedCustomAvatar(_charId: string, incomingAvatar: unknown): string | null {
  const incoming = String(incomingAvatar || '').trim();
  return isCustomProfileAvatar(incoming) ? incoming : null;
}

function preserveLocalCustomAvatars(serverCharacters: CharacterProfile[]): CharacterProfile[] {
  // Kept as a compatibility wrapper for older callers. Server data is now
  // authoritative; avatar persistence belongs to the shared character record.
  return serverCharacters;
}

// Subscribe to characters
export function subscribeToCharacters(callback: (chars: CharacterProfile[]) => void) {
  // Render the local seed immediately so the UI never stays on LINKING while
  // the first server request is in flight. A successful server snapshot below
  // will replace it with the shared Supabase data.
  callback([...localCharacters]);

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
      // Preserve a custom avatar selected in Profile Customizer while the
      // server snapshot catches up. This is intentionally limited to avatarUrl
      // so server changes to stats, coins, inventory, skills, etc. are untouched.
      const reconciledList = preserveLocalCustomAvatars(list);
      reconciledList.sort((a, b) => (b.powerScore || 0) - (a.powerScore || 0));
      // The shared database is authoritative. A deleted character must never
      // come back from localStorage or the bundled seed.
      localCharacters = list;
      saveLocalAll();
      callback(list);
    }, (err) => {
      // Keep the app usable while the API/Supabase connection is unavailable.
      // The next successful poll will replace this fallback with server data.
      console.error("Characters listener error:", err);
      callback([...localCharacters]);
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


// Global player chat
export function subscribeToChat(callback: (messages: import("../types").ChatMessage[]) => void) {
  try {
    const q = collection(db, CHAT_MESSAGES_COLLECTION);
    const unsub = onSnapshot(q, (snapshot: any) => {
      const list: import("../types").ChatMessage[] = [];
      snapshot.forEach((d: any) => list.push({ ...d.data(), id: d.id } as import("../types").ChatMessage));
      list.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
      callback(list.slice(-100));
    }, () => callback([]));
    return unsub;
  } catch { callback([]); return () => {}; }
}

export async function sendChatMessage(sender: CharacterProfile, message: string): Promise<void> {
  const text = String(message || '').trim().slice(0, 300);
  if (!text) throw new Error('ข้อความว่าง');
  const now = Date.now();
  const chatMessage: import("../types").ChatMessage = {
    id: `chat-${now}-${Math.random().toString(36).slice(2, 8)}`,
    senderId: sender.id,
    senderName: sender.displayName,
    senderAvatar: sender.avatarUrl,
    message: text,
    createdAt: now,
  };
  await setDoc(doc(db, CHAT_MESSAGES_COLLECTION, chatMessage.id), sanitizeForFirestore(chatMessage));
}

// Player-to-player marketplace
export function subscribeToMarketplace(callback: (listings: import("../types").MarketplaceListing[]) => void) {
  try {
    const q = collection(db, MARKETPLACE_LISTINGS_COLLECTION);
    const unsub = onSnapshot(q, (snapshot: any) => {
      const list: import("../types").MarketplaceListing[] = [];
      snapshot.forEach((d: any) => list.push({ ...d.data(), id: d.id } as import("../types").MarketplaceListing));
      list.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
      callback(list);
    }, () => callback([]));
    return unsub;
  } catch { callback([]); return () => {}; }
}

export async function createMarketplaceListing(sellerId: string, item: InventoryItem, price: number, quantity: number = 1): Promise<void> {
  const normalizedPrice = Math.max(1, Math.floor(Number(price)));
  const requestedQty = Math.max(1, Math.floor(Number(quantity) || 1));
  const listingId = `listing-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const sellerRef = doc(db, CHARACTERS_COLLECTION, sellerId);
  const listingRef = doc(db, MARKETPLACE_LISTINGS_COLLECTION, listingId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(sellerRef);
    if (!snap.exists()) throw new Error("ไม่พบตัวละครผู้ขาย");
    const seller = { ...snap.data(), id: snap.id } as CharacterProfile;
    const inventory = [...(seller.inventory || [])];
    const idx = inventory.findIndex(x => x.instanceId === item.instanceId);
    if (idx < 0) throw new Error("ไม่พบไอเทมชิ้นนี้ในกระเป๋า");
    if (inventory[idx].isEquipped) throw new Error("ต้องถอดอุปกรณ์ก่อนนำไปขาย");
    const owned = inventory[idx];
    const available = Math.max(1, Number(owned.quantity) || 1);
    const qty = Math.min(requestedQty, available);
    const soldItem = { ...owned, quantity: qty, isEquipped: false, equippedQuantity: 0 };
    if (available > qty) inventory[idx] = { ...owned, quantity: available - qty };
    else inventory.splice(idx, 1);
    const now = Date.now();
    const listing: import("../types").MarketplaceListing = { id: listingId, sellerId, sellerName: seller.displayName, item: soldItem, price: normalizedPrice, quantity: qty, createdAt: now, updatedAt: now };
    const updated = { ...seller, inventory, lastUpdated: now };
    tx.update(sellerRef, sanitizeForFirestore({ ...updated, powerScore: calculatePowerScore(updated) }));
    tx.set(listingRef, sanitizeForFirestore(listing));
  });
}

export async function cancelMarketplaceListing(listingId: string, sellerId: string): Promise<void> {
  const lr = doc(db, MARKETPLACE_LISTINGS_COLLECTION, listingId);
  const sr = doc(db, CHARACTERS_COLLECTION, sellerId);
  await runTransaction(db, async (tx) => {
    const ls = await tx.get(lr), ss = await tx.get(sr);
    if (!ls.exists() || !ss.exists()) throw new Error("ไม่พบประกาศขาย");
    const listing = { ...ls.data(), id: ls.id } as import("../types").MarketplaceListing;
    if (listing.sellerId !== sellerId) throw new Error("ไม่มีสิทธิ์ยกเลิกประกาศนี้");
    const seller = { ...ss.data(), id: ss.id } as CharacterProfile;
    const returned = { ...listing.item, quantity: Math.max(1, Number(listing.quantity) || Number(listing.item.quantity) || 1), isEquipped: false, equippedQuantity: 0 };
    const inventory = [...(seller.inventory || [])];
    const mergeIdx = inventory.findIndex(x => x.name === returned.name && x.category === returned.category && x.effectType === returned.effectType && x.effectValue === returned.effectValue && x.targetStat === returned.targetStat);
    if (mergeIdx >= 0) inventory[mergeIdx] = { ...inventory[mergeIdx], quantity: (Number(inventory[mergeIdx].quantity)||1) + returned.quantity };
    else inventory.push({ ...returned, instanceId: returned.instanceId || `returned-${Date.now()}` });
    const updated = { ...seller, inventory, lastUpdated: Date.now() };
    tx.update(sr, sanitizeForFirestore({ ...updated, powerScore: calculatePowerScore(updated) }));
    tx.delete(lr);
  });
}

export async function buyMarketplaceListing(listingId: string, buyerId: string, requestedQuantity: number = 1): Promise<{ success: boolean; message: string }> {
  const lr = doc(db, MARKETPLACE_LISTINGS_COLLECTION, listingId);
  const br = doc(db, CHARACTERS_COLLECTION, buyerId);
  let message = "";
  try {
    await runTransaction(db, async (tx) => {
      const ls = await tx.get(lr), bs = await tx.get(br);
      if (!ls.exists() || !bs.exists()) throw new Error("ประกาศขายนี้ไม่มีอยู่แล้ว");
      const listing = { ...ls.data(), id: ls.id } as import("../types").MarketplaceListing;
      if (listing.sellerId === buyerId) throw new Error("ไม่สามารถซื้อไอเทมของตัวเองได้");
      const buyer = { ...bs.data(), id: bs.id } as CharacterProfile;
      const stock = Math.max(1, Number(listing.quantity) || Number(listing.item.quantity) || 1);
      const qty = Math.max(1, Math.min(Math.floor(Number(requestedQuantity) || 1), stock));
      const unitPrice = Math.max(1, Math.floor(Number(listing.price) || 0));
      const totalPrice = unitPrice * qty;
      const coins = Math.floor(Number(buyer.coins) || 0);
      if (coins < totalPrice) throw new Error(`Coins ไม่พอ ต้องใช้ ${totalPrice.toLocaleString()} Coins`);
      const sr = doc(db, CHARACTERS_COLLECTION, listing.sellerId);
      const ss = await tx.get(sr);
      if (!ss.exists()) throw new Error("ไม่พบผู้ขาย");
      const seller = { ...ss.data(), id: ss.id } as CharacterProfile;
      const now = Date.now();
      const boughtItem = { ...listing.item, instanceId: `market-${now}-${Math.random().toString(36).slice(2,7)}`, quantity: qty, isEquipped: false, equippedQuantity: 0 };
      const buyerInventory = [...(buyer.inventory || [])];
      const mergeIdx = buyerInventory.findIndex(x => x.name === boughtItem.name && x.category === boughtItem.category && x.effectType === boughtItem.effectType && x.effectValue === boughtItem.effectValue && x.targetStat === boughtItem.targetStat);
      if (mergeIdx >= 0) buyerInventory[mergeIdx] = { ...buyerInventory[mergeIdx], quantity: (Number(buyerInventory[mergeIdx].quantity)||1) + qty };
      else buyerInventory.push(boughtItem);
      const remaining = stock - qty;
      const updatedBuyer = { ...buyer, coins: coins - totalPrice, inventory: buyerInventory, lastUpdated: now };
      const updatedSeller = { ...seller, coins: Math.floor(Number(seller.coins) || 0) + totalPrice, lastUpdated: now };
      tx.update(br, sanitizeForFirestore({ ...updatedBuyer, powerScore: calculatePowerScore(updatedBuyer) }));
      tx.update(sr, sanitizeForFirestore({ ...updatedSeller, powerScore: calculatePowerScore(updatedSeller) }));
      if (remaining > 0) tx.update(lr, sanitizeForFirestore({ ...listing, quantity: remaining, item: { ...listing.item, quantity: remaining }, updatedAt: now }));
      else tx.delete(lr);
      message = `ซื้อ "${listing.item.name}" x${qty} สำเร็จในราคา ${totalPrice.toLocaleString()} Coins`;
    });
    return { success: true, message };
  } catch (e) { return { success: false, message: e instanceof Error ? e.message : "ซื้อขายไม่สำเร็จ" }; }
}

const ITEM_TRANSFER_COLLECTION = "item_transfers";
const MARKETPLACE_AUCTIONS_COLLECTION = "marketplace_auctions";

export async function transferInventoryItem(senderId: string, recipientId: string, itemInstanceId: string, requestedQuantity: number = 1): Promise<void> {
  if (senderId === recipientId) throw new Error("ไม่สามารถโอนให้ตัวเองได้");
  const sr = doc(db, CHARACTERS_COLLECTION, senderId), rr = doc(db, CHARACTERS_COLLECTION, recipientId);
  await runTransaction(db, async tx => {
    const ss = await tx.get(sr), rs = await tx.get(rr);
    if (!ss.exists() || !rs.exists()) throw new Error("ไม่พบผู้เล่น");
    const sender = { ...ss.data(), id: ss.id } as CharacterProfile;
    const receiver = { ...rs.data(), id: rs.id } as CharacterProfile;
    const inv = [...(sender.inventory || [])];
    const idx = inv.findIndex(x => x.instanceId === itemInstanceId);
    if (idx < 0) throw new Error("ไม่พบไอเทมชิ้นนี้");
    if (inv[idx].isEquipped) throw new Error("ต้องถอดอุปกรณ์ก่อนโอน");
    const available = Math.max(1, Number(inv[idx].quantity) || 1);
    const quantity = Math.min(available, Math.max(1, Math.floor(Number(requestedQuantity) || 1)));
    const item = { ...inv[idx], quantity, isEquipped: false, equippedQuantity: 0 };
    if (available > quantity) inv[idx] = { ...inv[idx], quantity: available - quantity };
    else inv.splice(idx, 1);
    const transferKey = (x: InventoryItem) => [String(x.name || '').trim().toLocaleLowerCase(), String(x.category || ''), String(x.effectType || ''), String(x.targetStat || ''), String(x.effectValue ?? ''), String(x.hpBonus ?? '')].join('|');
    const receiverInv = [...(receiver.inventory || [])];
    const mergeIdx = receiverInv.findIndex(x => transferKey(x) === transferKey(item));
    if (mergeIdx >= 0) {
      const existing = receiverInv[mergeIdx];
      receiverInv[mergeIdx] = { ...existing, quantity: (Number(existing.quantity) || 0) + quantity };
    } else {
      receiverInv.push({ ...item, instanceId: `gift-${Date.now()}-${Math.random().toString(36).slice(2,7)}` });
    }
    const now = Date.now();
    tx.update(sr, sanitizeForFirestore({ ...sender, inventory: inv, lastUpdated: now, powerScore: calculatePowerScore({ ...sender, inventory: inv }) }));
    tx.update(rr, sanitizeForFirestore({ ...receiver, inventory: receiverInv, lastUpdated: now, powerScore: calculatePowerScore({ ...receiver, inventory: receiverInv }) }));
  });
}

export function subscribeToMarketplaceAuctions(callback: (auctions: import("../types").MarketplaceAuction[]) => void) {
  try {
    const q = collection(db, MARKETPLACE_AUCTIONS_COLLECTION);
    return onSnapshot(q, (snapshot: any) => {
      const list: import("../types").MarketplaceAuction[] = [];
      snapshot.forEach((d: any) => list.push({ ...d.data(), id: d.id } as import("../types").MarketplaceAuction));
      callback(list.filter(x => x.status === 'active').sort((a,b) => b.createdAt-a.createdAt));
    }, () => callback([]));
  } catch { callback([]); return () => {}; }
}

export async function createMarketplaceAuction(sellerId: string, item: InventoryItem, startingPrice: number, durationMs: number, quantity: number = 1): Promise<void> {
  const sr = doc(db, CHARACTERS_COLLECTION, sellerId);
  const id = `auction-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const ar = doc(db, MARKETPLACE_AUCTIONS_COLLECTION, id);
  await runTransaction(db, async tx => {
    const ss = await tx.get(sr);
    if (!ss.exists()) throw new Error("ไม่พบผู้ขาย");
    const seller = { ...ss.data(), id: ss.id } as CharacterProfile;
    const inv = [...(seller.inventory || [])];
    const idx = inv.findIndex(x => x.instanceId === item.instanceId);
    if (idx < 0) throw new Error("ไม่พบไอเทม");
    if (inv[idx].isEquipped) throw new Error("ต้องถอดอุปกรณ์ก่อนประมูล");
    const available = Math.max(1, Number(inv[idx].quantity) || 1);
    const qty = Math.min(Math.max(1, Math.floor(Number(quantity)||1)), available);
    const owned = { ...inv[idx], quantity: qty, isEquipped: false, equippedQuantity: 0 };
    if (available > qty) inv[idx] = { ...inv[idx], quantity: available - qty }; else inv.splice(idx,1);
    const now = Date.now();
    const auction: import("../types").MarketplaceAuction = { id, sellerId, sellerName: seller.displayName, item: owned, quantity: qty, startingPrice: Math.max(1, Math.floor(startingPrice)), currentBid: 0, endsAt: now + Math.max(60000, durationMs), createdAt: now, updatedAt: now, status: 'active' };
    tx.update(sr, sanitizeForFirestore({ ...seller, inventory: inv, lastUpdated: now, powerScore: calculatePowerScore({ ...seller, inventory: inv }) }));
    tx.set(ar, sanitizeForFirestore(auction));
  });
}

export async function cancelMarketplaceAuction(auctionId: string, sellerId: string): Promise<void> {
  const ar = doc(db, MARKETPLACE_AUCTIONS_COLLECTION, auctionId);
  const sr = doc(db, CHARACTERS_COLLECTION, sellerId);
  await runTransaction(db, async tx => {
    const as = await tx.get(ar), ss = await tx.get(sr);
    if (!as.exists() || !ss.exists()) throw new Error("ไม่พบการประมูล");
    const auction = { ...as.data(), id: as.id } as import("../types").MarketplaceAuction;
    if (auction.sellerId !== sellerId) throw new Error("ไม่มีสิทธิ์ยกเลิกการประมูล");
    if (auction.status !== 'active') throw new Error("การประมูลนี้ปิดแล้ว");
    if (auction.highestBidderId) throw new Error("มีผู้เสนอราคาแล้ว จึงยกเลิกไม่ได้");
    const seller = { ...ss.data(), id: ss.id } as CharacterProfile;
    const qty = Math.max(1, Number(auction.quantity) || Number(auction.item.quantity) || 1);
    const returned = { ...auction.item, quantity: qty, isEquipped: false, equippedQuantity: 0 };
    const inv = [...(seller.inventory || [])];
    const mergeIdx = inv.findIndex(x => x.name === returned.name && x.category === returned.category && x.effectType === returned.effectType && x.effectValue === returned.effectValue && x.targetStat === returned.targetStat);
    if (mergeIdx >= 0) inv[mergeIdx] = { ...inv[mergeIdx], quantity: (Number(inv[mergeIdx].quantity)||1) + qty };
    else inv.push(returned);
    const now = Date.now();
    tx.update(sr, sanitizeForFirestore({ ...seller, inventory: inv, lastUpdated: now, powerScore: calculatePowerScore({ ...seller, inventory: inv }) }));
    tx.update(ar, sanitizeForFirestore({ ...auction, status: 'cancelled', updatedAt: now }));
  });
}

export async function placeMarketplaceBid(auctionId: string, bidderId: string, bid: number): Promise<void> {
  const ar = doc(db, MARKETPLACE_AUCTIONS_COLLECTION, auctionId);
  const br = doc(db, CHARACTERS_COLLECTION, bidderId);
  await runTransaction(db, async tx => {
    const as = await tx.get(ar), bs = await tx.get(br);
    if (!as.exists() || !bs.exists()) throw new Error("ไม่พบการประมูล");
    const auction = { ...as.data(), id: as.id } as import("../types").MarketplaceAuction;
    if (auction.status !== 'active' || Date.now() >= auction.endsAt) throw new Error("การประมูลสิ้นสุดแล้ว");
    if (auction.sellerId === bidderId) throw new Error("ผู้ขายไม่สามารถประมูลของตัวเอง");
    const buyer = { ...bs.data(), id: bs.id } as CharacterProfile;
    const amount = Math.floor(Number(bid));
    const minimum = Math.max(auction.startingPrice, auction.currentBid + 1);
    if (!Number.isFinite(amount) || amount < minimum) throw new Error(`ต้องเสนออย่างน้อย ${minimum.toLocaleString()} Coins`);

    const previousBidderId = auction.highestBidderId;
    const previousReserved = auction.bidFundsReserved ? Math.max(0, Number(auction.currentBid) || 0) : 0;
    const buyerCoins = Math.max(0, Math.floor(Number(buyer.coins) || 0));
    const additionalRequired = previousBidderId === bidderId ? Math.max(0, amount - previousReserved) : amount;
    if (buyerCoins < additionalRequired) throw new Error("Coins ไม่พอสำหรับยอดเสนอใหม่");

    const now = Date.now();
    if (previousBidderId && previousBidderId !== bidderId && previousReserved > 0) {
      const previousRef = doc(db, CHARACTERS_COLLECTION, previousBidderId);
      const previousSnap = await tx.get(previousRef);
      if (previousSnap.exists()) {
        const previous = { ...previousSnap.data(), id: previousSnap.id } as CharacterProfile;
        const refunded = { ...previous, coins: Math.max(0, Number(previous.coins) || 0) + previousReserved, lastUpdated: now };
        tx.update(previousRef, sanitizeForFirestore({ ...refunded, powerScore: calculatePowerScore(refunded) }));
      }
    }

    const updatedBuyer = {
      ...buyer,
      coins: buyerCoins - additionalRequired,
      lastUpdated: now,
    };
    const updated = {
      ...auction,
      currentBid: amount,
      highestBidderId: bidderId,
      highestBidderName: buyer.displayName,
      bidFundsReserved: true,
      updatedAt: now,
    };
    tx.update(br, sanitizeForFirestore({ ...updatedBuyer, powerScore: calculatePowerScore(updatedBuyer) }));
    tx.update(ar, sanitizeForFirestore(updated));
  });
}

export async function finalizeMarketplaceAuction(auctionId: string): Promise<void> {
  const ar = doc(db, MARKETPLACE_AUCTIONS_COLLECTION, auctionId);
  await runTransaction(db, async tx => {
    const as = await tx.get(ar);
    if (!as.exists()) throw new Error("ไม่พบการประมูล");
    const auction = { ...as.data(), id: as.id } as import("../types").MarketplaceAuction;
    if (auction.status !== 'active' || Date.now() < auction.endsAt) throw new Error("ยังไม่ถึงเวลาปิดประมูล");
    const sr = doc(db, CHARACTERS_COLLECTION, auction.sellerId);
    const ss = await tx.get(sr);
    if (!ss.exists()) throw new Error("ไม่พบผู้ขาย");
    const seller = { ...ss.data(), id: ss.id };
    const now = Date.now();

    if (!auction.highestBidderId) {
      const sellerProfile = seller as CharacterProfile;
      const inv = [...(sellerProfile.inventory || []), auction.item];
      const updatedSeller = { ...sellerProfile, inventory: inv, lastUpdated: now };
      tx.update(sr, sanitizeForFirestore({ ...updatedSeller, powerScore: calculatePowerScore(updatedSeller) }));
    } else {
      const br = doc(db, CHARACTERS_COLLECTION, auction.highestBidderId);
      const bs = await tx.get(br);
      if (!bs.exists()) throw new Error("ไม่พบผู้ชนะ");
      const buyer = { ...bs.data(), id: bs.id } as CharacterProfile;
      const bid = Math.max(0, Math.floor(Number(auction.currentBid) || 0));
      const reserved = auction.bidFundsReserved === true;

      // New auctions reserve the current bid at bid time. Legacy auctions that
      // predate this field are charged here only once.
      if (!reserved && Number(buyer.coins) < bid) throw new Error("Coins ของผู้ชนะไม่พอแล้ว");
      const buyerCoins = Math.max(0, Math.floor(Number(buyer.coins) || 0));
      const updatedBuyer = {
        ...buyer,
        coins: reserved ? buyerCoins : buyerCoins - bid,
        inventory: [...(buyer.inventory || []), { ...auction.item, instanceId: `auction-${Date.now()}-${Math.random().toString(36).slice(2,7)}` }],
        lastUpdated: now,
      };
      const sellerProfile = seller as CharacterProfile;
      const updatedSeller = { ...sellerProfile, coins: Math.max(0, Math.floor(Number(sellerProfile.coins) || 0)) + bid, lastUpdated: now };
      tx.update(br, sanitizeForFirestore({ ...updatedBuyer, powerScore: calculatePowerScore(updatedBuyer) }));
      tx.update(sr, sanitizeForFirestore({ ...updatedSeller, powerScore: calculatePowerScore(updatedSeller) }));
    }
    tx.update(ar, sanitizeForFirestore({ ...auction, status: 'completed', bidFundsReserved: false, updatedAt: now }));
  });
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
      console.error("Shop listener error:", err);
      callback([]);
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
  const preservedAvatar = getPreservedCustomAvatar(char.id, char.avatarUrl);
  const requested: CharacterProfile = {
    ...char,
    ...(preservedAvatar ? { avatarUrl: preservedAvatar } : {}),
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
  // Keep the selected profile image in its own small persistent key.
  // This survives a hard refresh even when the full character cache is large.
  saveAvatarOverride(updated.id, updated.avatarUrl || '');

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
      // Character updates must never recreate a document that was deleted by
      // another player/device. setDoc() is an upsert; updateDoc() requires the
      // shared database row to still exist.
      await updateDoc(doc(db, CHARACTERS_COLLECTION, updated.id), cleaned);
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

export async function deleteCharacterFromDB(characterId: string): Promise<void> {
  const id = String(characterId || '').trim();
  if (!id) throw new Error('ไม่พบ ID ตัวละครที่ต้องการลบ');

  // Mark the deletion before touching the server so a realtime poll cannot
  // briefly reinsert the character while the DELETE request is in flight.
  pendingCharacterDeletes.add(id);
  pendingCharacterUpdates.delete(id);
  const previous = localCharacters.find(character => character.id === id);
  localCharacters = localCharacters.filter(character => character.id !== id);
  saveLocalAll();
  broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });

  try {
    await enqueueCharacterWrite(id, async () => {
      await deleteDoc(doc(db, CHARACTERS_COLLECTION, id));
    });
  } catch (error) {
    pendingCharacterDeletes.delete(id);
    if (previous) localCharacters = [previous, ...localCharacters.filter(character => character.id !== id)];
    saveLocalAll();
    broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });
    throw error;
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
      const preservedAvatar = getPreservedCustomAvatar(charId, current.avatarUrl);
      const updated: CharacterProfile = {
        ...current,
        ...(preservedAvatar ? { avatarUrl: preservedAvatar } : {}),
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
    // Status is a partial update. Read the current shared Firestore document,
    // then update only Status fields. This avoids a transaction being rejected
    // when the client briefly loses connectivity and avoids overwriting newer
    // unrelated fields from another device.
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('ไม่พบตัวละครที่ต้องการบันทึก');

    const current = { ...snap.data(), id: snap.id } as CharacterProfile;
    const preservedAvatar = getPreservedCustomAvatar(charId, current.avatarUrl);
    const updated: CharacterProfile = {
      ...current,
      ...(preservedAvatar ? { avatarUrl: preservedAvatar } : {}),
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

    await updateDoc(ref, sanitizeForFirestore({
      stats: updated.stats,
      hp: updated.hp,
      maxHp: updated.maxHp,
      statusBuffs: updated.statusBuffs,
      characteristics: updated.characteristics,
      powerScore: updated.powerScore,
      lastUpdated: updated.lastUpdated,
    }));

    result = updated;
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

// Gacha Banner management
export function subscribeToGachaBanners(callback: (banners: GachaBanner[]) => void) {
  gachaBannerListeners.add(callback);

  const fallback: GachaBanner[] = localGachaBanners.length ? [...localGachaBanners] : [{
    id: 'main',
    name: 'ตู้หลัก',
    pullCost: localGachaConfig.pullCost,
    tenPullCost: localGachaConfig.tenPullCost,
         multiPullCounts: localGachaConfig.multiPullCounts || [20, 30, 50],
    enabled: localGachaConfig.enabled,
    bannerTitle: localGachaConfig.bannerTitle,
    bannerDescription: localGachaConfig.bannerDescription,
    createdAt: 0,
    updatedAt: 0,
  }];

  callback([...fallback]);

  // If this is an existing database created before multi-banner support,
  // materialize the legacy main banner once so Admin and players both have
  // a real persistent banner document to work with.
  if (!gachaBannerInitializationStarted) {
    gachaBannerInitializationStarted = true;
    void getDocs(collection(db, GACHA_BANNERS_COLLECTION)).then(snapshot => {
      if (!snapshot.empty) {
        mergeServerBanners(snapshot.docs.map(s => ({ ...s.data(), id: s.id } as GachaBanner)));
        return;
      }
      const mainBanner: GachaBanner = {
        id: 'main',
        name: 'ตู้หลัก',
        pullCost: localGachaConfig.pullCost,
        tenPullCost: localGachaConfig.tenPullCost,
         multiPullCounts: localGachaConfig.multiPullCounts || [20, 30, 50],
        enabled: localGachaConfig.enabled,
        bannerTitle: localGachaConfig.bannerTitle,
        bannerDescription: localGachaConfig.bannerDescription,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return saveGachaBanner(mainBanner);
    }).catch(error => {
      gachaBannerInitializationStarted = false;
      console.warn('Could not initialize main gacha banner:', error);
    });
  }

  const mergeServerBanners = (serverList: GachaBanner[]) => {
    const serverIds = new Set(serverList.map(b => b.id));

    pendingGachaBannerDeletes.forEach(id => {
      if (!serverIds.has(id)) pendingGachaBannerDeletes.delete(id);
    });

    const merged = serverList
      .filter(b => !pendingGachaBannerDeletes.has(b.id))
      .map(serverBanner => {
        const pending = pendingGachaBanners.get(serverBanner.id);
        if (pending && valuesMatch(serverBanner, pending)) {
          pendingGachaBanners.delete(serverBanner.id);
          return serverBanner;
        }
        return pending || serverBanner;
      });

    pendingGachaBanners.forEach((pending, id) => {
      if (!pendingGachaBannerDeletes.has(id) && !merged.some(b => b.id === id)) {
        merged.unshift(pending);
      }
    });

    localGachaBanners = merged;
    saveLocalAll();
    callback([...merged]);
  };

  const onBroadcast = (event: MessageEvent) => {
    if (event.data?.type === 'GACHA_BANNERS_UPDATE') {
      callback([...localGachaBanners]);
    }
  };
  broadcast?.addEventListener('message', onBroadcast);

  // Force one authoritative server read immediately. This prevents an old localStorage snapshot
  // or a delayed polling cycle from making Admin temporarily show 0 banners.
  void getDocs(collection(db, GACHA_BANNERS_COLLECTION)).then(snapshot => {
    const list: GachaBanner[] = [];
    snapshot.forEach(s => list.push({ ...s.data(), id: s.id } as GachaBanner));
    mergeServerBanners(list);
  }).catch(error => console.warn('Initial gacha banner fetch failed:', error));

  try {
    const unsub = onSnapshot(collection(db, GACHA_BANNERS_COLLECTION), { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) return;
      const list: GachaBanner[] = [];
      snapshot.forEach(s => list.push({ ...s.data(), id: s.id } as GachaBanner));
      mergeServerBanners(list);
    }, (err) => {
      console.warn('Gacha banners listener error:', err);
      callback([...localGachaBanners]);
    });

    return () => {
      gachaBannerListeners.delete(callback);
      broadcast?.removeEventListener('message', onBroadcast);
      unsub();
    };
  } catch (err) {
    console.warn('Gacha banners subscription error:', err);
    broadcast?.removeEventListener('message', onBroadcast);
    return () => { gachaBannerListeners.delete(callback); };
  }
}

export async function saveGachaBanner(banner: GachaBanner): Promise<void> {
  const normalized = {
    ...banner,
    id: banner.id || `banner-${Date.now()}`,
    updatedAt: Date.now(),
  };

  pendingGachaBannerDeletes.delete(normalized.id);
  pendingGachaBanners.set(normalized.id, normalized);
  localGachaBanners = [normalized, ...localGachaBanners.filter(b => b.id !== normalized.id)];
  saveLocalAll();
  gachaBannerListeners.forEach(cb => cb([...localGachaBanners]));
  broadcast?.postMessage({ type: 'GACHA_BANNERS_UPDATE' });

  try {
    await enqueuePersistenceWrite(
      `gacha-banner:${normalized.id}`,
      async () => {
        const cleaned = sanitizeForFirestore(normalized);
        await setDoc(doc(db, GACHA_BANNERS_COLLECTION, normalized.id), cleaned);

        // Do not report success until the API/Supabase can read the exact banner back.
        // This prevents a local optimistic banner from looking saved when the server write failed.
        const saved = await getDoc(doc(db, GACHA_BANNERS_COLLECTION, normalized.id));
        if (!saved.exists()) {
          throw new Error('สร้างตู้กาชาไม่สำเร็จ: Supabase ไม่พบข้อมูลที่เพิ่งบันทึก');
        }
        const savedData = { ...saved.data(), id: saved.id } as GachaBanner;
        if (!valuesMatch(savedData, cleaned)) {
          throw new Error('สร้างตู้กาชาไม่สำเร็จ: ข้อมูลใน Supabase ไม่ตรงกับข้อมูลที่บันทึก');
        }
      }
    );
  } catch (error) {
    pendingGachaBanners.delete(normalized.id);
    localGachaBanners = localGachaBanners.filter(b => b.id !== normalized.id);
    saveLocalAll();
    gachaBannerListeners.forEach(cb => cb([...localGachaBanners]));
    broadcast?.postMessage({ type: 'GACHA_BANNERS_UPDATE' });
    throw error;
  }
}

export async function deleteGachaBanner(bannerId: string): Promise<void> {
  if (localGachaBanners.length <= 1) throw new Error('ต้องเหลือตู้กาชาอย่างน้อย 1 ตู้');

  const previous = localGachaBanners.find(b => b.id === bannerId);
  pendingGachaBanners.delete(bannerId);
  pendingGachaBannerDeletes.add(bannerId);
  localGachaBanners = localGachaBanners.filter(b => b.id !== bannerId);
  saveLocalAll();
  gachaBannerListeners.forEach(cb => cb([...localGachaBanners]));
  broadcast?.postMessage({ type: 'GACHA_BANNERS_UPDATE' });

  try {
    await enqueuePersistenceWrite(
      `gacha-banner:${bannerId}`,
      () => deleteDoc(doc(db, GACHA_BANNERS_COLLECTION, bannerId))
    );
  } catch (error) {
    pendingGachaBannerDeletes.delete(bannerId);
    if (previous) localGachaBanners = [previous, ...localGachaBanners.filter(b => b.id !== bannerId)];
    saveLocalAll();
    gachaBannerListeners.forEach(cb => cb([...localGachaBanners]));
    broadcast?.postMessage({ type: 'GACHA_BANNERS_UPDATE' });
    throw error;
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
  if (targetItemIndex === -1) {    return { success: false, message: "ไม่พบไอเทมนี้ในคลังของผู้เล่น" };
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
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) return;
      applyDuelRoomSnapshot(snapshot);
    }, (err) => {
      console.warn("Duel rooms listener error, using local fallback:", err);
      notifyDuelRooms();
    });

    let handleBroadcast: ((ev: MessageEvent) => void) | null = null;
    if (broadcast) {
      handleBroadcast = (ev: MessageEvent) => {
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
    }

    return () => {
      duelRoomListeners.delete(callback);
      if (broadcast && handleBroadcast) broadcast.removeEventListener('message', handleBroadcast);
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
    await enqueuePersistenceWrite(`duel:${id}`, () =>
      setDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, id), cleaned)
    );
  } catch (err: any) {
    console.warn("Firestore create duel room error:", err?.code, err?.message);
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

  try {
    await enqueuePersistenceWrite(`duel:${updated.id}`, () =>
      setDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, updated.id), sanitizeForFirestore(updated))
    );
  } catch (err: any) {
    console.warn("Firestore updateDuelRoom failed:", err?.message || err);
    throw err;
  }
}

// Force-sync a specific duel room by ID from Firestore and flush any local pending writes
export async function syncDuelRoomById(roomId: string): Promise<CardDuelRoom | null> {
  // 1. Flush any pending write for this room
  const pending = pendingDuelRooms.get(roomId);
  if (pending) {
    try {
      await enqueuePersistenceWrite(`duel:${roomId}`, () =>
        setDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, roomId), sanitizeForFirestore(pending))
      );
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
      if (currentPending && (valuesMatch(currentPending, room) || !isPendingNewer(currentPending, room))) {
        pendingDuelRooms.delete(roomId);
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
  const previous = localDuelRooms.find(room => room.id === roomId);
  pendingDuelDeletes.add(roomId);
  pendingDuelRooms.delete(roomId);
  localDuelRooms = localDuelRooms.filter(r => r.id !== roomId);
  saveLocalAll();
  notifyDuelRooms();
  broadcast?.postMessage({ type: 'DUEL_ROOMS_UPDATE', roomId });

  try {
    await enqueuePersistenceWrite(`duel:${roomId}`, () =>
      deleteDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, roomId))
    );
  } catch (err) {
    pendingDuelDeletes.delete(roomId);
    if (previous) localDuelRooms = [previous, ...localDuelRooms.filter(room => room.id !== roomId)];
    saveLocalAll();
    notifyDuelRooms();
    console.error("Error deleting duel room in Firestore:", err);
    throw err;
  }
}

// Reset all database collections to initial values
export async function resetDatabaseToDefaults(): Promise<void> {
  pendingCharacterUpdates.clear();
  pendingCharacterDeletes.clear();
  pendingShopItems.clear();
  pendingShopDeletes.clear();
  pendingGachaRewards.clear();
  pendingGachaDeletes.clear();
  pendingGachaBanners.clear();
  pendingGachaBannerDeletes.clear();
  pendingGachaConfig = null;
  pendingDuelRooms.clear();
  pendingDuelDeletes.clear();
  pendingBattleConfig = null;
  pendingBattleBots.clear();
  pendingBattleBotDeletes.clear();
  pendingBattleRooms.clear();
  pendingBattleRoomDeletes.clear();

  localCharacters = INITIAL_CHARACTERS;
  localShopItems = INITIAL_SHOP_ITEMS;
  localGachaRewards = INITIAL_GACHA_REWARDS;
  localGachaConfig = INITIAL_GACHA_CONFIG;
  localGachaBanners = [{
    id: "main",
    name: "ตู้หลัก",
    pullCost: INITIAL_GACHA_CONFIG.pullCost,
    tenPullCost: INITIAL_GACHA_CONFIG.tenPullCost,
         multiPullCounts: INITIAL_GACHA_CONFIG.multiPullCounts || [20, 30, 50],
    enabled: INITIAL_GACHA_CONFIG.enabled,
    bannerTitle: INITIAL_GACHA_CONFIG.bannerTitle,
    bannerDescription: INITIAL_GACHA_CONFIG.bannerDescription,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }];
  localDuelRooms = [];
  saveLocalAll();

  broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });
  broadcast?.postMessage({ type: 'SHOP_UPDATE' });
  broadcast?.postMessage({ type: 'GACHA_REWARDS_UPDATE' });
  broadcast?.postMessage({ type: 'GACHA_CONFIG_UPDATE' });
  broadcast?.postMessage({ type: 'GACHA_BANNERS_UPDATE' });
  broadcast?.postMessage({ type: 'DUEL_ROOMS_UPDATE' });

  try {
    const [charsSnap, shopSnap, rewardsSnap, configSnap, duelSnap] = await Promise.all([
      getDocs(collection(db, CHARACTERS_COLLECTION)),
      getDocs(collection(db, SHOP_ITEMS_COLLECTION)),
      getDocs(collection(db, GACHA_REWARDS_COLLECTION)),
      getDocs(collection(db, GACHA_CONFIG_COLLECTION)),
      getDocs(collection(db, GACHA_BANNERS_COLLECTION)),
      getDocs(collection(db, CARD_DUEL_ROOMS_COLLECTION)),
    ]);
    const batch = writeBatch(db);
    [...charsSnap.docs, ...shopSnap.docs, ...rewardsSnap.docs, ...configSnap.docs, ...gachaBannersSnap.docs, ...duelSnap.docs]
      .forEach(item => batch.delete(item.ref));
    INITIAL_CHARACTERS.forEach(char => {
      batch.set(doc(db, CHARACTERS_COLLECTION, char.id), {
        ...char,
        powerScore: calculatePowerScore(char),
      });
    });
    INITIAL_SHOP_ITEMS.forEach(item => {
      batch.set(doc(db, SHOP_ITEMS_COLLECTION, item.id), sanitizeForFirestore(item));
    });
    INITIAL_GACHA_REWARDS.forEach(reward => {
      batch.set(doc(db, GACHA_REWARDS_COLLECTION, reward.id), sanitizeForFirestore(reward));
    });
    batch.set(doc(db, GACHA_CONFIG_COLLECTION, "main"), sanitizeForFirestore(INITIAL_GACHA_CONFIG));
    batch.set(doc(db, GACHA_BANNERS_COLLECTION, "main"), sanitizeForFirestore({
      id: "main",
      name: "ตู้หลัก",
      pullCost: INITIAL_GACHA_CONFIG.pullCost,
      tenPullCost: INITIAL_GACHA_CONFIG.tenPullCost,
         multiPullCounts: INITIAL_GACHA_CONFIG.multiPullCounts || [20, 30, 50],
      enabled: INITIAL_GACHA_CONFIG.enabled,
      bannerTitle: INITIAL_GACHA_CONFIG.bannerTitle,
      bannerDescription: INITIAL_GACHA_CONFIG.bannerDescription,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    await batch.commit();
  } catch (error) {
    console.error("Error resetting database:", error);
    throw error;
  }
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
  victoryImageUrl: "",
  victoryVideoUrl: "",
  victoryTitle: "VICTORY",
  victoryMessage: "ผู้ชนะการต่อสู้",
};

let localBattleConfig: BattleConfig = readLocalValue("starstream_battle_config", DEFAULT_BATTLE_CONFIG);
let localBattleBots: BattleBot[] = readLocalArray("starstream_battle_bots", []);
let localBattleRooms: BattleRoom[] = readLocalArray("starstream_battle_rooms", []);
const battleConfigListeners = new Set<(config: BattleConfig) => void>();
const battleBotListeners = new Set<(bots: BattleBot[]) => void>();
const battleRoomListeners = new Set<(rooms: BattleRoom[]) => void>();
let pendingBattleConfig: BattleConfig | null = null;
const pendingBattleBots = new Map<string, BattleBot>();
const pendingBattleBotDeletes = new Set<string>();
const pendingBattleRooms = new Map<string, BattleRoom>();
const pendingBattleRoomDeletes = new Set<string>();

function saveBattleLocal() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem("starstream_battle_config", JSON.stringify(localBattleConfig));
    window.localStorage.setItem("starstream_battle_bots", JSON.stringify(localBattleBots));
    window.localStorage.setItem("starstream_battle_rooms", JSON.stringify(localBattleRooms));
  } catch {}
}
function notifyBattleConfig() { battleConfigListeners.forEach(listener => listener(localBattleConfig)); }
function notifyBattleBots() { battleBotListeners.forEach(listener => listener([...localBattleBots])); }
function notifyBattleRooms() { battleRoomListeners.forEach(listener => listener([...localBattleRooms])); }

export function subscribeToBattleConfig(callback: (config: BattleConfig) => void) {
  callback(localBattleConfig);
  battleConfigListeners.add(callback);
  try {
    const unsub = onSnapshot(doc(db, BATTLE_CONFIG_COLLECTION, "main"), { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) return;
      if (snapshot.exists()) {
        const serverConfig = { ...DEFAULT_BATTLE_CONFIG, ...snapshot.data(), id: "main" } as BattleConfig;
        if (pendingBattleConfig && (valuesMatch(serverConfig, pendingBattleConfig) || !isPendingNewer(pendingBattleConfig, serverConfig))) {
          pendingBattleConfig = null;
        }
        localBattleConfig = pendingBattleConfig || serverConfig;
      } else if (!pendingBattleConfig) {
        localBattleConfig = DEFAULT_BATTLE_CONFIG;
      }
      saveBattleLocal();
      notifyBattleConfig();
    }, () => notifyBattleConfig());
    return () => {
      battleConfigListeners.delete(callback);
      unsub();
    };
  } catch (err) {
    return () => {};
  }
}

export function subscribeToBattleBots(callback: (bots: BattleBot[]) => void) {
  callback(localBattleBots);
  battleBotListeners.add(callback);
  try {
    const unsub = onSnapshot(collection(db, BATTLE_BOTS_COLLECTION), { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) return;
      const serverIds = new Set(snapshot.docs.map(item => item.id));
      localBattleBots = snapshot.docs
        .map(item => ({ ...item.data(), id: item.id } as BattleBot))
        .filter(item => !pendingBattleBotDeletes.has(item.id))
        .map(item => {
          const pending = pendingBattleBots.get(item.id);
          if (pending && (valuesMatch(item, pending) || !isPendingNewer(pending, item))) {
            pendingBattleBots.delete(item.id);
            return item;
          }
          return pending || item;
        });
      pendingBattleBotDeletes.forEach(id => {
        if (!serverIds.has(id)) pendingBattleBotDeletes.delete(id);
      });
      pendingBattleBots.forEach((pending, id) => {
        if (!serverIds.has(id) && !pendingBattleBotDeletes.has(id)) localBattleBots.push(pending);
      });
      localBattleBots.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      saveBattleLocal();
      notifyBattleBots();
    }, () => notifyBattleBots());
    return () => {
      battleBotListeners.delete(callback);
      unsub();
    };
  } catch (err) {
    return () => {};
  }
}

export function subscribeToBattleRooms(callback: (rooms: BattleRoom[]) => void) {
  callback(localBattleRooms);
  battleRoomListeners.add(callback);
  try {
    const unsub = onSnapshot(collection(db, BATTLE_ROOMS_COLLECTION), { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) return;
      const serverIds = new Set(snapshot.docs.map(item => item.id));
      localBattleRooms = snapshot.docs
        .map(item => ({ ...item.data(), id: item.id } as BattleRoom))
        .filter(item => !pendingBattleRoomDeletes.has(item.id))
        .map(item => {
          const pending = pendingBattleRooms.get(item.id);
          if (pending && (valuesMatch(item, pending) || !isPendingNewer(pending, item))) {
            pendingBattleRooms.delete(item.id);
            return item;
          }
          return pending || item;
        })
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      pendingBattleRoomDeletes.forEach(id => {
        if (!serverIds.has(id)) pendingBattleRoomDeletes.delete(id);
      });
      pendingBattleRooms.forEach((pending, id) => {
        if (!serverIds.has(id) && !pendingBattleRoomDeletes.has(id)) localBattleRooms.push(pending);
      });
      localBattleRooms.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      saveBattleLocal();
      notifyBattleRooms();
    }, () => notifyBattleRooms());
    return () => {
      battleRoomListeners.delete(callback);
      unsub();
    };
  } catch (err) {
    return () => {};
  }
}

export async function saveBattleConfig(config: BattleConfig): Promise<void> {
  const previous = localBattleConfig;
  const next = { ...config, id: "main", updatedAt: Math.max(Date.now(), (localBattleConfig.updatedAt || 0) + 1) };
  pendingBattleConfig = next;
  localBattleConfig = next;
  saveBattleLocal();
  notifyBattleConfig();
  try {
    await enqueuePersistenceWrite("battle-config:main", () =>
      setDoc(doc(db, BATTLE_CONFIG_COLLECTION, "main"), sanitizeForFirestore(next))
    );
  } catch (error) {
    if (pendingBattleConfig === next) pendingBattleConfig = null;
    localBattleConfig = previous;
    saveBattleLocal();
    notifyBattleConfig();
    throw error;
  }
}

export async function saveBattleBot(bot: BattleBot): Promise<void> {
  const id = bot.id || "bot-" + Date.now();
  const previous = localBattleBots.find(item => item.id === id);
  const next = {
    ...bot,
    id,
    createdAt: bot.createdAt || Date.now(),
    updatedAt: Math.max(Date.now(), (localBattleBots.find(item => item.id === id)?.updatedAt || 0) + 1),
  };
  pendingBattleBots.set(id, next);
  pendingBattleBotDeletes.delete(id);
  localBattleBots = [next, ...localBattleBots.filter(item => item.id !== id)];
  saveBattleLocal();
  notifyBattleBots();
  try {
    await enqueuePersistenceWrite(`battle-bot:${id}`, () =>
      setDoc(doc(db, BATTLE_BOTS_COLLECTION, id), sanitizeForFirestore(next))
    );
  } catch (error) {
    pendingBattleBots.delete(id);
    localBattleBots = previous
      ? [previous, ...localBattleBots.filter(item => item.id !== id)]
      : localBattleBots.filter(item => item.id !== id);
    saveBattleLocal();
    notifyBattleBots();
    throw error;
  }
}

export async function deleteBattleBot(botId: string): Promise<void> {
  const previous = localBattleBots.find(bot => bot.id === botId);
  pendingBattleBotDeletes.add(botId);
  pendingBattleBots.delete(botId);
  localBattleBots = localBattleBots.filter(bot => bot.id !== botId);
  saveBattleLocal();
  notifyBattleBots();
  try {
    await enqueuePersistenceWrite(`battle-bot:${botId}`, () =>
      deleteDoc(doc(db, BATTLE_BOTS_COLLECTION, botId))
    );
  } catch (error) {
    pendingBattleBotDeletes.delete(botId);
    if (previous) localBattleBots = [previous, ...localBattleBots.filter(bot => bot.id !== botId)];
    saveBattleLocal();
    notifyBattleBots();
    throw error;
  }
}

export async function createBattleRoom(room: BattleRoom): Promise<string> {
  const id = room.id || "battle-" + Date.now();
  const previous = localBattleRooms.find(item => item.id === id);
  const next = {
    ...room,
    id,
    createdAt: room.createdAt || Date.now(),
    updatedAt: Math.max(Date.now(), (localBattleRooms.find(item => item.id === id)?.updatedAt || 0) + 1),
  };
  pendingBattleRooms.set(id, next);
  pendingBattleRoomDeletes.delete(id);
  localBattleRooms = [next, ...localBattleRooms.filter(item => item.id !== id)];
  saveBattleLocal();
  notifyBattleRooms();
  try {
    await enqueuePersistenceWrite(`battle-room:${id}`, () =>
      setDoc(doc(db, BATTLE_ROOMS_COLLECTION, id), sanitizeForFirestore(next))
    );
  } catch (error) {
    pendingBattleRooms.delete(id);
    localBattleRooms = previous
      ? [previous, ...localBattleRooms.filter(item => item.id !== id)]
      : localBattleRooms.filter(item => item.id !== id);
    saveBattleLocal();
    notifyBattleRooms();
    throw error;
  }
  return id;
}

export async function createBattleRoomWithEntryFee(room: BattleRoom, playerId: string, entryFeeCoins: number): Promise<string> {
  const id = room.id || "battle-" + Date.now();
  const fee = Math.max(0, Math.floor(Number(entryFeeCoins) || 0));
  const next = { ...room, id, entryFeeCoins: fee, createdAt: room.createdAt || Date.now(), updatedAt: Date.now() };
  if (fee > 0) {
    await enqueueCharacterWrite(playerId, async () => {
      const response = await fetch('/api/database?action=create_battle_room_with_fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, fee, room: sanitizeForFirestore(next) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'ไม่สามารถหักค่าเข้าสู้และสร้างห้องได้');
    });
  } else {
    await setDoc(doc(db, BATTLE_ROOMS_COLLECTION, id), sanitizeForFirestore(next));
  }
  localBattleRooms = [next, ...localBattleRooms.filter(item => item.id !== id)];
  saveBattleLocal();
  notifyBattleRooms();
  return id;
}

export async function settleBattleVictoryReward(room: BattleRoom, playerId: string): Promise<number> {
  if (room.mode !== "pve" || room.status !== "completed" || room.winnerTeam !== "a") return 0;
  const reward = Math.max(0, Math.floor(Number(room.victoryRewardCoins) || 0));
  if (reward <= 0) return 0;

  const response = await fetch('/api/database?action=claim_battle_reward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId: room.id, playerId, reward }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'ไม่สามารถรับรางวัลการต่อสู้ได้');
  if (!body?.paid) return 0;

  const updatedRoom = { ...room, rewardClaimedBy: playerId, updatedAt: Date.now() };
  pendingBattleRooms.set(room.id, updatedRoom);
  localBattleRooms = [updatedRoom, ...localBattleRooms.filter(item => item.id !== room.id)];
  saveBattleLocal();
  notifyBattleRooms();
  return reward;
}

export async function updateBattleRoom(room: BattleRoom): Promise<void> {
  const previous = localBattleRooms.find(item => item.id === room.id);
  const next = {
    ...room,
    updatedAt: Math.max(Date.now(), (localBattleRooms.find(item => item.id === room.id)?.updatedAt || 0) + 1),
  };
  pendingBattleRooms.set(next.id, next);
  pendingBattleRoomDeletes.delete(next.id);
  localBattleRooms = [next, ...localBattleRooms.filter(item => item.id !== next.id)];
  saveBattleLocal();
  notifyBattleRooms();
  try {
    await enqueuePersistenceWrite(`battle-room:${next.id}`, () =>
      setDoc(doc(db, BATTLE_ROOMS_COLLECTION, next.id), sanitizeForFirestore(next))
    );
  } catch (error) {
    pendingBattleRooms.delete(next.id);
    localBattleRooms = previous
      ? [previous, ...localBattleRooms.filter(item => item.id !== next.id)]
      : localBattleRooms.filter(item => item.id !== next.id);
    saveBattleLocal();
    notifyBattleRooms();
    throw error;
  }
}

export async function deleteBattleRoom(roomId: string): Promise<void> {
  const previous = localBattleRooms.find(room => room.id === roomId);
  pendingBattleRoomDeletes.add(roomId);
  pendingBattleRooms.delete(roomId);
  localBattleRooms = localBattleRooms.filter(room => room.id !== roomId);
  saveBattleLocal();
  notifyBattleRooms();
  try {
    await enqueuePersistenceWrite(`battle-room:${roomId}`, () =>
      deleteDoc(doc(db, BATTLE_ROOMS_COLLECTION, roomId))
    );
  } catch (error) {
    pendingBattleRoomDeletes.delete(roomId);
    if (previous) localBattleRooms = [previous, ...localBattleRooms.filter(room => room.id !== roomId)];
    saveBattleLocal();
    notifyBattleRooms();
    throw error;
  }
}

function getEquippedItemPassives(unit: BattleCombatant): ItemPassiveEffect[] {
  return (unit.equippedPassives || []).filter(effect => effect && effect.id && effect.kind);
}

function getBattleLuckMultiplier(unit: BattleCombatant): number {
  if (!unit.itemLuckTurns || unit.itemLuckTurns <= 0) return 1;
  return Math.max(1, Math.min(20, Number(unit.itemLuckMultiplier) || 1));
}

function getBattleChance(unit: BattleCombatant, baseChance: number): number {
  const luck = getBattleLuckMultiplier(unit);
  const explicitMultiplier = Math.max(1, Math.min(20, Number(unit.itemPassiveChanceMultiplier) || 1));
  return Math.min(100, Math.max(0, Number(baseChance) || 0) * luck * explicitMultiplier);
}

function applyItemPassiveEffects(
  attacker: BattleCombatant,
  defender: BattleCombatant,
  result: BattleRollResult,
  trigger: ItemPassiveEffect['trigger'],
) {
  const passives = [...(attacker.activeSkillPassives || []), ...getEquippedItemPassives(attacker)].filter(effect => effect.trigger === trigger);
  const ordered = [...passives.filter(effect => effect.kind === 'stack'), ...passives.filter(effect => effect.kind !== 'stack')];
  for (const passive of ordered) {
    const baseChance = passive.chance == null ? 100 : Math.max(0, Math.min(100, Number(passive.chance) || 0));
    const chance = getBattleChance(attacker, baseChance);
    const passiveRoll = Math.random() * 100;
    const chanceLabel = Number.isInteger(chance) ? String(chance) : String(Number(chance.toFixed(2)));
    if (passiveRoll >= chance) {
      if (chance < 100) result.message += ` • ❌ Passive ${passive.name}: ล้มเหลว (${chanceLabel}% ไม่ออก)`;
      continue;
    }
    const value = Math.max(0, Number(passive.value) || 0);
    result.message += ` • ✅ Passive ${passive.name}: ทำงาน (${chanceLabel}%)`;
    const maxStacks = Math.max(1, Math.min(999, Math.round(Number(passive.maxStacks) || 999)));
    const stackKey = passive.stackKey || passive.id;
    let stacks = Math.max(0, Number(attacker.passiveStacks?.[stackKey]) || 0);

    if (passive.kind === 'stack') {
      stacks = Math.min(maxStacks, stacks + Math.max(1, value));
      attacker.passiveStacks = { ...(attacker.passiveStacks || {}), [stackKey]: stacks };
      result.message += ` • 🌸 ${passive.name}: สะสม ${stacks}/${maxStacks}`;

      // เมื่อ Stack ถึง Max ให้ทริกเกอร์ Passive True Damage ที่ใช้ Stack Key เดียวกันทันที
      // ใช้ Max Stack ของตัวสะสมเป็นหลัก เพื่อไม่ให้ค่า Max Stack ของ Passive ดาเมจ
      // ที่ตั้งไว้คนละค่าหรือข้อมูลเก่าทำให้เอฟเฟกต์ไม่ทำงาน
      if (stacks >= maxStacks) {
        const thresholdPassives = passives.filter(effect => effect.kind === 'true_damage_at_max_stacks');
        for (const threshold of thresholdPassives) {
          const thresholdKey = threshold.stackKey?.trim();
          if (thresholdKey && thresholdKey !== stackKey) continue;

          const thresholdChance = threshold.chance == null
            ? 100
            : Math.max(0, Math.min(100, Number(threshold.chance) || 0));
          if (Math.random() * 100 >= thresholdChance) continue;

          const thresholdDamage = Math.max(0, Math.round(Number(threshold.value) || 0));
          if (thresholdDamage <= 0) continue;

          result.trueDamage = (result.trueDamage || 0) + thresholdDamage;
          result.message += ` • 💠 ${threshold.name}: ครบ ${maxStacks} Stack → True Damage +${thresholdDamage}`;
          attacker.passiveStacks = { ...(attacker.passiveStacks || {}), [stackKey]: 0 };
        }
      }
    } else if (passive.kind === 'true_damage_per_stack') {
      const trueDamage = Math.max(0, Math.round(value * stacks));
      if (trueDamage > 0) {
        result.trueDamage = (result.trueDamage || 0) + trueDamage;
        result.message += ` • 💠 ${passive.name}: True Damage +${trueDamage} (${stacks} stack)`;
      }
    } else if (passive.kind === 'true_damage_at_max_stacks') {
      if (stacks >= maxStacks) {
        const trueDamage = Math.max(0, Math.round(value));
        if (trueDamage > 0) {
          result.trueDamage = (result.trueDamage || 0) + trueDamage;
          result.message += ` • 💠 ${passive.name}: ครบ ${maxStacks} Stack → True Damage +${trueDamage}`;
          attacker.passiveStacks = { ...(attacker.passiveStacks || {}), [stackKey]: 0 };
        }
      }
    } else if (passive.kind === 'damage') {
      result.damage += Math.round(value);
      result.message += ` • ⚔️ ${passive.name} +${Math.round(value)} DMG`;
    } else if (passive.kind === 'damage_percent') {
      result.damage += Math.round(result.damage * value / 100);
      result.message += ` • ⚔️ ${passive.name} +${value}% DMG`;
    } else if (passive.kind === 'heal') {
      result.heal += Math.round(value);
      result.message += ` • 💚 ${passive.name} ฟื้น HP +${Math.round(value)}`;
    } else if (passive.kind === 'heal_percent') {
      result.heal += Math.max(0, Math.round(attacker.maxHp * value / 100));
      result.message += ` • 💚 ${passive.name} ฟื้น HP +${value}%`;
    } else if (passive.kind === 'shield') {
      attacker.defenseValue = Math.max(attacker.defenseValue || 0, Math.round(value));
      attacker.defenseTurns = Math.max(attacker.defenseTurns || 0, Math.max(1, Math.round(Number(passive.duration) || 1)));
      result.message += ` • 🛡️ ${passive.name} โล่ ${Math.round(value)}`;
    } else if (passive.kind === 'reflect') {
      attacker.reflectPercent = Math.max(attacker.reflectPercent || 0, Math.min(100, value));
      attacker.reflectTurns = Math.max(attacker.reflectTurns || 0, Math.max(1, Math.round(Number(passive.duration) || 1)));
      result.message += ` • 🔄 ${passive.name} สะท้อน ${value}%`;
    }
  }
}

function getSkillStat(skill: Skill | undefined, kind: NonNullable<Skill['battleStats']>[number]['kind']): number {
  return (skill?.battleStats || []).filter(s => s.kind === kind).reduce((sum, s) => sum + (Number(s.value) || 0), 0);
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

function applyBattleExtraEffects(attacker: BattleCombatant, defender: BattleCombatant, effects: NonNullable<Skill['battleEffects']>, result: BattleRollResult) {
  for (const effect of effects || []) {
    const baseChance = effect.chance == null ? 100 : Math.max(0, Math.min(100, Number(effect.chance) || 0));
    const chance = getBattleChance(attacker, baseChance);
    if (Math.random() * 100 >= chance) continue;
    const target = effect.target === 'self' ? attacker : defender;
    const value = Math.max(0, Number(effect.value) || 0);
    const duration = Math.max(1, Math.round(Number(effect.duration) || 1));
    const label = effect.label || effect.kind;
    if (effect.kind === 'damage_percent') {
      result.damage += Math.max(0, Math.round(result.damage * value / 100));
      result.message += ` • ${label} +${value}% ดาเมจ`;
    } else if (effect.kind === 'heal_percent') {
      result.heal += Math.max(0, Math.round(target.maxHp * value / 100));
      result.message += ` • ${label} ฟื้น HP ${value}%`;
    } else if (effect.kind === 'reduce_max_hp_percent') {
      const reduced = Math.max(1, Math.round(target.maxHp * (1 - Math.min(100, value) / 100)));
      const lost = Math.max(0, target.maxHp - reduced);
      target.maxHp = reduced;
      target.hp = Math.min(target.hp, target.maxHp);
      result.message += ` • ${label} ลด MAX HP ${value}%${lost > 0 ? ` (-${lost})` : ''}`;
    } else if (effect.kind === 'reduce_defense_percent') {
      const currentDefense = Math.max(0, Number(target.defenseValue) || 0);
      target.defenseValue = Math.max(0, Math.round(currentDefense * (1 - Math.min(100, value) / 100)));
      target.defenseTurns = Math.max(target.defenseTurns || 0, duration);
      result.message += ` • ${label} ลดป้องกัน ${value}%`;
    } else if (effect.kind === 'shield') {
      target.defenseValue = Math.max(target.defenseValue || 0, Math.round(value));
      target.defenseTurns = Math.max(target.defenseTurns || 0, duration);
      result.message += ` • ${label} ป้องกัน ${Math.round(value)}`;
    } else if (effect.kind === 'reflect') {
      target.reflectPercent = Math.max(target.reflectPercent || 0, Math.min(100, value));
      target.reflectTurns = Math.max(target.reflectTurns || 0, duration);
      result.message += ` • ${label} สะท้อน ${value}%`;
    } else {
      const mode = 'nerf' as const;
      const existing = target.adminStatusEffects || [];
      const kind = effect.kind === 'freeze' ? 'stun' : effect.kind;
      const status = { id: `battle-effect-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, kind: kind as AdminStatusEffect['kind'], name: label, mode, power: value, duration, remaining: duration, appliedAt: Date.now(), source: 'admin' as const, description: label };
      target.adminStatusEffects = [...existing, status];
      if (effect.kind === 'freeze' || effect.kind === 'stun') target.stunnedTurns = Math.max(target.stunnedTurns || 0, duration);
      result.message += ` • ${label} ${duration} เทิร์น`;
    }
  }
}

function getActiveAdminStatusEffects(unit: BattleCombatant): AdminStatusEffect[] {
  return (unit.adminStatusEffects || []).filter(effect => effect.remaining > 0);
}

function getAdminOutgoingDamageMultiplier(unit: BattleCombatant): number {
  const itemPercent = Math.min(1000, Math.max(0, Number(unit.itemDamagePercent) || 0));
  const itemMultiplier = unit.itemDamageTurns && unit.itemDamageTurns > 0 ? 1 + itemPercent / 100 : 1;
  return getActiveAdminStatusEffects(unit).reduce((multiplier, effect) => {
    if (!['curse', 'weakness', 'slow'].includes(effect.kind)) return multiplier;
    const percent = Math.min(100, Math.max(0, Number(effect.power) || 0)) / 100;
    return multiplier * (effect.mode === 'buff' ? 1 + percent : 1 - percent);
  }, itemMultiplier);
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
  if (unit.itemDamageTurns && unit.itemDamageTurns > 0) {
    unit.itemDamageTurns = Math.max(0, unit.itemDamageTurns - 1);
    if (unit.itemDamageTurns === 0) unit.itemDamagePercent = 0;
  }
  if (unit.itemLuckTurns && unit.itemLuckTurns > 0) {
    unit.itemLuckTurns = Math.max(0, unit.itemLuckTurns - 1);
    if (unit.itemLuckTurns === 0) {
      unit.itemLuckMultiplier = 1;
      unit.itemCriticalChancePercent = 0;
      unit.itemRepeatAttackChancePercent = 0;
      unit.itemPassiveChanceMultiplier = 1;
    }
  }
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

export async function useBattleItem(room: BattleRoom, playerId: string, itemInstanceId: string): Promise<BattleRoom> {
  if (room.status !== 'active') throw new Error('การต่อสู้จบแล้ว');
  const actor = [...room.teamA, ...room.teamB].find(unit => unit.id === room.turnActorId);
  if (!actor || actor.type !== 'player' || actor.sourceId !== playerId) throw new Error('ยังไม่ใช่เทิร์นของผู้เล่นนี้');

  const currentUses = Math.max(0, Number(room.battleItemUses) || 0);
  if (currentUses >= 2) throw new Error('เกมนี้ใช้ไอเทมครบ 2 ครั้งแล้ว');

  const character = localCharacters.find(item => item.id === playerId);
  if (!character) throw new Error('ไม่พบตัวละครผู้ใช้');
  const item = (character.inventory || []).find(inv => inv.instanceId === itemInstanceId);
  if (!item || item.quantity <= 0) throw new Error('ไม่พบไอเทมในกระเป๋า');
  if (item.category !== 'consumable' || !item.usableByPlayers) throw new Error('ไอเทมนี้ใช้ระหว่างการต่อสู้ไม่ได้');

  const inventory = (character.inventory || [])
    .map(inv => inv.instanceId === itemInstanceId ? { ...inv, quantity: Math.max(0, inv.quantity - 1) } : inv)
    .filter(inv => inv.quantity > 0);

  let hp = character.hp;
  let maxHp = character.maxHp;
  const stats = { ...character.stats };
  if (item.effectType === 'heal_hp') {
    const flatHeal = Math.max(0, Number(item.effectValue) || 0);
    const percentHeal = Math.min(100, Math.max(0, Number(item.healPercent) || 0));
    const percentAmount = Math.round(maxHp * percentHeal / 100);
    hp = Math.min(maxHp, hp + flatHeal + percentAmount);
  } else if (item.effectType === 'buff_stat' && item.targetStat) {
    stats[item.targetStat] = (stats[item.targetStat] || 0) + Math.max(0, Number(item.effectValue) || 0);
  } else if (item.effectType === 'boost_max_hp') {
    const bonus = Math.max(0, Number(item.effectValue) || 0);
    maxHp += bonus;
    hp = Math.min(maxHp, hp + bonus);
  }

  await updateCharacterFields(playerId, { inventory, hp, maxHp, stats, lastUpdated: Date.now() });

  const nextRoom: BattleRoom = {
    ...room,
    teamA: room.teamA.map(unit => unit.id === actor.id ? { ...unit, hp: Math.min(maxHp, hp), maxHp, stats, itemDamagePercent: Math.min(1000, Math.max(0, Number(item.battleDamagePercent) || 0)),
        itemDamageTurns: Math.max(0, Math.floor(Number(item.battleDamageDuration) || 0)),
        itemLuckMultiplier: Math.max(1, Math.min(20, Number(item.battleLuckMultiplier) || 1)),
        itemLuckTurns: Math.max(0, Math.floor(Number(item.battleLuckDuration) || 0)),
        itemCriticalChancePercent: Math.max(0, Math.min(100, Number(item.battleCriticalChancePercent) || 0)),
        itemRepeatAttackChancePercent: Math.max(0, Math.min(100, Number(item.battleRepeatAttackChancePercent) || 0)),
        itemPassiveChanceMultiplier: Math.max(1, Math.min(20, Number(item.battlePassiveChanceMultiplier) || 1)) } : { ...unit }),
    teamB: room.teamB.map(unit => ({ ...unit })),
    battleItemUses: currentUses + 1,
    log: [{
      id: 'battle-log-item-' + Date.now(),
      timestamp: Date.now(),
      actorName: actor.name,
      message: `🧪 ${actor.name} ใช้ไอเทม "${item.name}"${item.healPercent ? ` · ฟื้น ${item.healPercent}% Max HP` : ''}${item.battleDamagePercent ? ` · ดาเมจ +${item.battleDamagePercent}% ${item.battleDamageDuration || 0} เทิร์น` : ''}${item.battleLuckMultiplier && item.battleLuckMultiplier > 1 ? ` · 🍀 โชค ×${item.battleLuckMultiplier} ${item.battleLuckDuration || 0} เทิร์น` : ''}${item.battleCriticalChancePercent ? ` · 💥 คริ +${item.battleCriticalChancePercent}%` : ''}${item.battleRepeatAttackChancePercent ? ` · 🔁 ตีซ้ำ +${item.battleRepeatAttackChancePercent}%` : ''} · โควตาไอเทม ${currentUses + 1}/2 ครั้งในเกมนี้`,
    }, ...(room.log || [])],
    updatedAt: Date.now(),
  };

  const nextActor = getNextBattleActor(nextRoom, actor.id);
  nextRoom.turnActorId = nextActor?.id || actor.id;
  if (nextActor?.team === 'a' && actor.team === 'b') {
    nextRoom.round = (room.round || 1) + 1;
  } else {
    nextRoom.round = room.round || 1;
  }

  await updateBattleRoom(nextRoom);
  return nextRoom;
}
function getBattleCombatants(room: BattleRoom): BattleCombatant[] {
  return [...room.teamA, ...room.teamB];
}
function getNextBattleActor(room: BattleRoom, actorId: string): BattleCombatant | undefined {
  const all = getBattleCombatants(room);
  const current = all.find(item => item.id === actorId);
  if (!current) return all.find(item => item.hp > 0);

  // Turns alternate between teams, but each team also rotates through its
  // living members. The old implementation always picked team[0] after an
  // enemy turn, which made the same player attack repeatedly (A -> Boss ->
  // A -> Boss). Use battle-log history to remember who on the target team
  // acted most recently, then advance to the next living member.
  const nextTeam = current.team === 'a' ? room.teamB : room.teamA;
  const lastActorOnNextTeam = [...(room.log || [])]
    .map(entry => nextTeam.find(unit => unit.name === entry.actorName))
    .find(Boolean);

  const startIndex = lastActorOnNextTeam
    ? nextTeam.findIndex(unit => unit.id === lastActorOnNextTeam.id)
    : -1;

  for (let step = 1; step <= nextTeam.length; step += 1) {
    const candidate = nextTeam[(startIndex + step + nextTeam.length) % nextTeam.length];
    if (candidate && candidate.hp > 0) return candidate;
  }

  // If the opposing side has no living member, continue on the current side
  // after the actor who just finished.
  const currentTeam = current.team === 'a' ? room.teamA : room.teamB;
  const currentIndex = Math.max(0, currentTeam.findIndex(item => item.id === actorId));
  for (let step = 1; step <= currentTeam.length; step += 1) {
    const candidate = currentTeam[(currentIndex + step) % currentTeam.length];
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
    const skillProfile = skill ? getBattleSkillProfile(skill) : null;
    const skillName = skill?.name || "สกิล";
    const skillId = skill ? String(skill.id ?? skill.name ?? ("skill-" + skillName)).trim() : "";
    // Check cooldown BEFORE consuming this actor's turn. A skill with 1 turn
    // remaining must wait; cooldown is reduced after the actor successfully acts.
    if (skill && skillProfile && (cooldowns[skillId] || 0) > 0) {
      return { room, result: null };
    }
    current.skillCooldowns = cooldowns;
    // Skill-specific stats must be read from battleStats before applying the skill effect.
    // Without these local values, defense skills such as Zero Echo could throw
    // "defensePower is not defined" when the shield is created.
    const skillAccuracy = Math.max(0, Math.min(100, getSkillStat(skill, 'accuracy_percent')));
    if (skill && skillAccuracy > 0 && Math.random() * 100 >= skillAccuracy) {
      result = { roll: 0, face: diceConfig.faces[0], damage: 0, heal: 0, message: `${current.name} ใช้สกิล ${skill.name} แต่พลาดเป้าหมาย (แม่นยำ ${skillAccuracy}%)` };
    } else {
      result = rollBattleAttack(current, defender, diceConfig);
    }
    if (statusTick.message) result.message = statusTick.message + ' • ' + result.message;
    applyItemPassiveEffects(current, defender, result, 'turn_start');
    if (skillProfile) {
      result.skillEffect = skillProfile.effect;
      result.skillPower = skillProfile.power;
      if (skillProfile.effect === "damage") {
        const scaling = skill?.damageScaling || 'fixed';
        const scalingStat = scaling === 'strength' ? current.stats.strength
          : scaling === 'durability' ? current.stats.durability
          : scaling === 'agility' ? current.stats.agility
          : scaling === 'magic' ? current.stats.magic
          : skillProfile.power;
        const scalingMultiplier = Math.max(0, Number(skill?.damageScalingMultiplier) || 1);
        const skillDamage = Math.max(0, Math.round(
          (scaling === 'fixed' ? skillProfile.power : scalingStat * scalingMultiplier)
          * getAdminOutgoingDamageMultiplier(current)
        ));
        result.damage += skillDamage;
        const scalingLabel = scaling === 'fixed' ? 'คงที่' : `ตาม ${scaling.toUpperCase()} × ${scalingMultiplier}`;
        result.message += ` • ใช้สกิล ${skillName} เพิ่มดาเมจ ${skillDamage} [${scalingLabel}]`;
      } else if (skillProfile.effect === "heal") {
        const healPercent = getSkillStat(skill, 'heal_percent');
        const bonusHeal = healPercent > 0 ? Math.round(current.maxHp * healPercent / 100) : 0;
        result.heal += skillProfile.power + bonusHeal;
        result.message += ` • ใช้สกิล ${skillName} ฟื้นฟู ${skillProfile.power + bonusHeal}`;
      } else if (skillProfile.effect === "defense") {
        current.defenseValue = Math.max(0, skillProfile.power + getSkillStat(skill, 'defense_power'));
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
      if (skill?.battleEffects?.length) {
        const statusChanceBonus = getSkillStat(skill, 'status_chance_percent');
        const durationBonus = Math.max(0, Math.round(getSkillStat(skill, 'status_duration')));
        const adjustedEffects = skill.battleEffects.map(effect => ({
          ...effect,
          chance: effect.chance == null ? Math.min(100, 100 + statusChanceBonus) : Math.min(100, Math.max(0, Number(effect.chance) + statusChanceBonus)),
          duration: Math.max(1, Math.round((Number(effect.duration) || 1) + durationBonus)),
        }));
        applyBattleExtraEffects(current, defender, adjustedEffects, result);
      }
      // Skill-specific critical chance is separate from the dice's critical face.
      // This makes an Admin-created skill capable of critical hits regardless of the roll.
      if (skill && result.damage > 0) {
        const passiveCritChance = [...(current.activeSkillPassives || []), ...getEquippedItemPassives(current)]
          .filter(effect => effect.kind === 'critical_chance')
          .reduce((sum, effect) => sum + Math.max(0, Number(effect.value) || 0), 0);
        const baseCritChance = Math.max(0, (Number(skill.battleCriticalChance) || getSkillStat(skill, 'critical_chance_percent')) + passiveCritChance);
        const critChance = Math.min(100,
          baseCritChance * getBattleLuckMultiplier(current)
          * Math.max(1, Number(current.itemPassiveChanceMultiplier) || 1)
          + Math.max(0, Number(current.itemCriticalChancePercent) || 0)
        );
        const critMultiplier = Math.max(1, Number(skill.battleCriticalMultiplier) || getSkillStat(skill, 'critical_multiplier') || 1);
        if (critChance > 0 && Math.random() * 100 < critChance) {
          result.damage = Math.max(0, Math.round(result.damage * critMultiplier));
          result.message += ` • 💥 CRITICAL! ${critChance}% ×${critMultiplier}`;
          result.effect = 'critical';
        }
      }
      if (skill) {
        const passiveRepeatChance = [...(current.activeSkillPassives || []), ...getEquippedItemPassives(current)]
          .filter(effect => effect.kind === 'repeat_attack_chance')
          .reduce((sum, effect) => sum + Math.max(0, Number(effect.value) || 0), 0);
        const baseRepeatChance = Math.max(0, (Number(skill.repeatAttackChance) || 0) + passiveRepeatChance);
        const repeatChance = Math.min(100,
          baseRepeatChance * getBattleLuckMultiplier(current)
          * Math.max(1, Number(current.itemPassiveChanceMultiplier) || 1)
          + Math.max(0, Number(current.itemRepeatAttackChancePercent) || 0)
        );
        const maxRepeats = Math.max(1, Math.min(20, Number(skill.maxRepeatAttacks) || 1));
        let repeatsDone = 0;
        if (result.damage > 0 && repeatChance > 0) {
          let repeatRoll = Math.random() * 100;
          while (repeatsDone < maxRepeats && repeatRoll < repeatChance) {
            const repeat = rollBattleAttack(current, defender, diceConfig);
            result.damage += repeat.damage;
            result.heal += repeat.heal;
            repeatsDone += 1;
            result.message += ` • 🔁 ตีซ้ำรอบที่ ${repeatsDone} (${repeatChance}%) +${repeat.damage} ดาเมจ`;
            if (repeatsDone < maxRepeats) repeatRoll = Math.random() * 100;
          }
          if (repeatsDone === 0) {
            result.message += ` • ❌ Passive ${skillName} ล้มเหลว: โอกาส ${repeatChance}% ไม่ออก`;
          }
        }
        const configuredCooldown = getSkillStat(skill, 'cooldown_turns') || skillProfile.cooldownTurns;
        const speed = Math.max(0, getSkillStat(skill, 'speed'));
        const cooldown = Math.max(0, Math.min(99, Math.round(configuredCooldown - speed / 10)));

        // Cooldowns are measured in this actor's own completed turns.
        // First advance old cooldowns, then apply the newly used skill's CD.
        const advancedCooldowns: Record<string, number> = {};
        Object.entries(current.skillCooldowns || {}).forEach(([skillId, value]) => {
          const nextCooldown = Math.max(0, Number(value || 0) - 1);
          if (nextCooldown > 0) advancedCooldowns[skillId] = nextCooldown;
        });
        if (cooldown > 0) advancedCooldowns[skillId] = cooldown;
        current.skillCooldowns = advancedCooldowns;
        result.cooldownRemaining = cooldown;
      }
    }
    if (!skill && result.damage > 0) {
      const passiveCritChance = [...(current.activeSkillPassives || []), ...getEquippedItemPassives(current)]
        .filter(effect => effect.kind === 'critical_chance')
        .reduce((sum, effect) => sum + Math.max(0, Number(effect.value) || 0), 0);
      const critChance = Math.min(100,
        passiveCritChance * getBattleLuckMultiplier(current)
        * Math.max(1, Number(current.itemPassiveChanceMultiplier) || 1)
        + Math.max(0, Number(current.itemCriticalChancePercent) || 0)
      );
      if (critChance > 0 && Math.random() * 100 < critChance) {
        result.damage = Math.max(0, Math.round(result.damage * 2));
        result.message += ` • 💥 Passive CRITICAL! ${passiveCritChance}% ×2`;
        result.effect = 'critical';
      }
    }
    if (!skill) {
      const passiveRepeatChance = [...(current.activeSkillPassives || []), ...getEquippedItemPassives(current)]
        .filter(effect => effect.kind === 'repeat_attack_chance')
        .reduce((sum, effect) => sum + Math.max(0, Number(effect.value) || 0), 0);
      const repeatChance = Math.min(100,
        passiveRepeatChance * getBattleLuckMultiplier(current)
        * Math.max(1, Number(current.itemPassiveChanceMultiplier) || 1)
        + Math.max(0, Number(current.itemRepeatAttackChancePercent) || 0)
      );
      let repeatsDone = 0;
      const maxRepeats = 20;
      if (result.damage > 0 && repeatChance > 0) {
        let repeatRoll = Math.random() * 100;
        while (repeatsDone < maxRepeats && repeatRoll < repeatChance) {
          const repeat = rollBattleAttack(current, defender, diceConfig);
          result.damage += repeat.damage;
          result.heal += repeat.heal;
          repeatsDone += 1;
          result.message += ` • 🔁 ไอเทมติดตัวตีซ้ำรอบที่ ${repeatsDone} (${repeatChance}%) +${repeat.damage} ดาเมจ`;
          if (repeatsDone < maxRepeats) repeatRoll = Math.random() * 100;
        }
        if (repeatsDone === 0) {
          result.message += ` • ❌ Passive ตีซ้ำ ล้มเหลว: โอกาส ${repeatChance}% ไม่ออก`;
        }
      }
    }
    applyItemPassiveEffects(current, defender, result, 'attack');
    if (result.face.extraEffects?.length) applyBattleExtraEffects(current, defender, result.face.extraEffects, result);
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
    if ((result.trueDamage || 0) > 0) {
      const appliedTrueDamage = Math.min(defender.hp, Math.max(0, Math.round(result.trueDamage || 0)));
      defender.hp = Math.max(0, defender.hp - appliedTrueDamage);
      result.message += ` • 💠 True Damage ${appliedTrueDamage}`;
      result.trueDamage = appliedTrueDamage;
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