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
  BattleBotSkill,
  BattleBotDrop,
  BattleRoom,
  BattleCombatant,
  BattleRollResult,
  BattleExtraEffect,
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
const CRAFTING_RECIPES_COLLECTION = "crafting_recipes";
const GACHA_REWARDS_COLLECTION = "gacha_rewards";
const GACHA_CONFIG_COLLECTION = "gacha_config";
const GACHA_BANNERS_COLLECTION = "gacha_banners";
const CARD_DUEL_ROOMS_COLLECTION = "card_duel_rooms";
const MARKETPLACE_LISTINGS_COLLECTION = "marketplace_listings";
const CHAT_MESSAGES_COLLECTION = "chat_messages";

// Cross-tab broadcast channel for instant local reactivity
let broadcast: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcast = new BroadcastChannel('star_stream_realtime_channel');
  } catch (error) {
    console.warn('[realtime] BroadcastChannel unavailable:', error);
    broadcast = null;
  }
}

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
  readLocalArray('starstream_characters', [])
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
// IDs created during this session. These may be updated immediately after creation
// by profile/status effects before the next backend read sees the document.
const pendingNewCharacters = new Set<string>();
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
  // Power is a readable combat index, not a raw sum of every stored number.
  // Keep multiplicative progression (skill ascension) from exploding the ranking.
  const stat = char.stats || { strength: 0, durability: 0, agility: 0, magic: 0 };
  const statTotal =
    Math.max(0, Number(stat.strength) || 0) * 8 +
    Math.max(0, Number(stat.durability) || 0) * 8 +
    Math.max(0, Number(stat.agility) || 0) * 8 +
    Math.max(0, Number(stat.magic) || 0) * 10;

  let skillTotal = 0;
  for (const skill of char.skills || []) {
    const level = Math.max(1, Number(skill.level) || 1);
    const multiplier = Math.max(1, Number(skill.multiplier) || 1);
    const upgradeCount = Math.max(0, Number(skill.upgradeCount) || 0);
    const battlePower = Math.max(0, Number(skill.battlePower) || 0);
    const crit = Math.max(0, Number(skill.battleCriticalChance) || 0);
    const repeat = Math.max(0, Number(skill.repeatAttackChance) || 0);

    // Level gives steady value; ascension uses log2 so x2/x4/x8 does not
    // double the whole character score each time.
    skillTotal += level * 24;
    skillTotal += (1 + Math.log2(multiplier)) * 55;
    skillTotal += Math.sqrt(upgradeCount) * 8;
    skillTotal += Math.min(150, battlePower) * 2;
    skillTotal += Math.min(100, crit) * 0.8;
    skillTotal += Math.min(100, repeat) * 0.5;
  }

  let equipmentTotal = 0;
  for (const item of char.inventory || []) {
    if (!(item.isEquipped || item.equipped)) continue;
    const copies = Math.max(1, Number(item.equippedQuantity) || 1);
    const positive =
      80 +
      Math.max(0, Number(item.equipmentStrengthBonus) || 0) * 3 +
      Math.max(0, Number(item.equipmentDurabilityBonus) || 0) * 3 +
      Math.max(0, Number(item.equipmentAgilityBonus) || 0) * 3 +
      Math.max(0, Number(item.equipmentMagicBonus) || 0) * 4 +
      Math.max(0, Number(item.equipmentMaxHpBonus) || 0) * 0.08 +
      Math.max(0, Number(item.equipmentAttackPercent) || 0) * 2 +
      Math.max(0, Number(item.equipmentDefensePercent) || 0) * 1.5 +
      Math.max(0, Number(item.equipmentMagicPercent) || 0) * 1.5 +
      Math.max(0, Number(item.battleCriticalChancePercent) || 0) * 1 +
      Math.max(0, Number(item.battleRepeatAttackChancePercent) || 0) * 1;

    const drawbackPenalty = (item.battleDrawbacks || []).reduce((sum, effect) => {
      const value = Math.max(0, Number(effect.value) || 0);
      const weight =
        effect.kind === 'reduce_max_hp_percent' ? 4 :
        effect.kind === 'reduce_defense_percent' ? 2.5 :
        effect.kind === 'damage_percent' ? 3 :
        effect.kind === 'stun' || effect.kind === 'freeze' ? 2.5 :
        1.5;
      return sum + value * weight;
    }, 0);

    equipmentTotal += Math.max(0, positive - drawbackPenalty) * copies;
  }

  // HP is deliberately soft-scaled so large HP pools do not dominate rankings.
  const hpScore = Math.sqrt(Math.max(0, Number(char.hp) || 0)) * 10;
  const transcendenceBonus = Math.sqrt(Math.max(0, Number(char.statUpgradeCount) || 0)) * 80;

  return Math.max(0, Math.round(statTotal + skillTotal + equipmentTotal + hpScore + transcendenceBonus));
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
  const overrides = readAvatarOverrides();
  if (!overrides || Object.keys(overrides).length === 0) return serverCharacters;

  return serverCharacters.map(char => {
    const localAvatar = String(overrides[char.id] || '').trim();
    // Only restore valid persistent custom avatars. Never restore blob: URLs
    // because those are tied to the previous browser session.
    if (!isCustomProfileAvatar(localAvatar)) return char;
    return { ...char, avatarUrl: localAvatar };
  });
}

// Subscribe to characters
export function subscribeToCharacters(callback: (chars: CharacterProfile[]) => void) {
  // Do not render localStorage characters before the first authoritative
  // server snapshot. LocalStorage can contain characters that were deleted on
  // another device, which caused deleted profiles (notably Yeon Chae-won) to
  // briefly appear and then disappear.
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

      // Server snapshots are authoritative. Never recreate a character just because
      // an old local copy contains customized profile data. Deleted characters must
      // stay deleted; localStorage is only an offline fallback and must not resurrect
      // records that no longer exist in the shared database.
      // Re-apply a locally persisted custom avatar after every realtime snapshot.
      // Profile images are intentionally kept in a small dedicated localStorage
      // key as a safety net. Without this step, Firestore can briefly/actually
      // repaint the character with the bundled avatar after the Profile
      // Customizer saves, making the new image disappear from Status/Profile.
      // Only avatarUrl is overlaid; all other server fields remain authoritative.
      const reconciledList = preserveLocalCustomAvatars(list);
      reconciledList.sort((a, b) => (b.powerScore || 0) - (a.powerScore || 0));
      // A deleted character must never come back from localStorage or the bundled seed.
      localCharacters = reconciledList;
      saveLocalAll();
      callback(reconciledList);
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
const ITEM_TRADE_COLLECTION = "item_trades";

export function subscribeToItemTrades(characterId: string, callback: (trades: import("../types").ItemTrade[]) => void) {
  if (!characterId) { callback([]); return () => {}; }
  try {
    const q = collection(db, ITEM_TRADE_COLLECTION);
    return onSnapshot(q, (snapshot: any) => {
      const list: import("../types").ItemTrade[] = [];
      snapshot.forEach((d: any) => {
        const trade = { ...d.data(), id: d.id } as import("../types").ItemTrade;
        if (trade.status === 'pending' && (trade.senderId === characterId || trade.recipientId === characterId)) list.push(trade);
      });
      callback(list.sort((a,b) => b.createdAt - a.createdAt));
    }, () => callback([]));
  } catch { callback([]); return () => {}; }
}

export async function createItemTrade(
  senderId: string,
  recipientId: string,
  offeredItemInstanceId: string,
  offeredQuantity: number,
  offeredCoins: number = 0,
  requestedItemInstanceId?: string,
  requestedQuantity: number = 0,
  requestedCoins: number = 0
): Promise<void> {
  if (!senderId || !recipientId || senderId === recipientId) throw new Error("ผู้รับเทรดไม่ถูกต้อง");
  const sr = doc(db, CHARACTERS_COLLECTION, senderId);
  const rr = doc(db, CHARACTERS_COLLECTION, recipientId);
  const tradeId = `trade-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const tr = doc(db, ITEM_TRADE_COLLECTION, tradeId);

  await runTransaction(db, async tx => {
    const ss = await tx.get(sr), rs = await tx.get(rr);
    if (!ss.exists() || !rs.exists()) throw new Error("ไม่พบผู้เล่น");
    const sender = { ...ss.data(), id: ss.id } as CharacterProfile;
    const receiver = { ...rs.data(), id: rs.id } as CharacterProfile;
    const inv = [...(sender.inventory || [])];
    const idx = inv.findIndex(x => x.instanceId === offeredItemInstanceId);
    if (idx < 0) throw new Error("ไม่พบไอเทมที่ต้องการเทรด");
    if (inv[idx].isEquipped) throw new Error("ต้องถอดอุปกรณ์ก่อนเทรด");
    const qty = Math.min(Math.max(1, Math.floor(Number(offeredQuantity) || 1)), Math.max(1, Number(inv[idx].quantity) || 1));
    const coins = Math.max(0, Math.floor(Number(offeredCoins) || 0));
    if (Math.floor(Number(sender.coins) || 0) < coins) throw new Error("Coins ของคุณไม่พอ");

    let requestedItem: InventoryItem | undefined;
    const reqQty = Math.max(0, Math.floor(Number(requestedQuantity) || 0));
    if (requestedItemInstanceId && reqQty > 0) {
      const requested = (receiver.inventory || []).find(x => x.instanceId === requestedItemInstanceId);
      if (!requested) throw new Error("ไม่พบไอเทมที่ต้องการขอ");
      if (requested.isEquipped) throw new Error("ไอเทมที่ขอถูกสวมใส่อยู่");
      const available = Math.max(1, Number(requested.quantity) || 1);
      if (reqQty > available) throw new Error("จำนวนไอเทมที่ขอเกินจำนวนที่มี");
      requestedItem = { ...requested, quantity: reqQty, isEquipped: false, equippedQuantity: 0 };
    }

    const requestedCoinAmount = Math.max(0, Math.floor(Number(requestedCoins) || 0));
    if (Math.floor(Number(receiver.coins) || 0) < requestedCoinAmount) {
      throw new Error("Coins ของผู้รับไม่พอสำหรับข้อเสนอ");
    }

    const trade: import("../types").ItemTrade = {
      id: tradeId,
      senderId,
      senderName: sender.displayName,
      recipientId,
      recipientName: receiver.displayName,
      offeredItem: { ...inv[idx], quantity: qty, isEquipped: false, equippedQuantity: 0 },
      offeredQuantity: qty,
      offeredCoins: coins,
      requestedItem,
      requestedQuantity: requestedItem ? reqQty : 0,
      requestedCoins: requestedCoinAmount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'pending',
    };
    tx.set(tr, sanitizeForFirestore(trade));
  });
}

export async function cancelItemTrade(tradeId: string, characterId: string): Promise<void> {
  const tr = doc(db, ITEM_TRADE_COLLECTION, tradeId);
  await runTransaction(db, async tx => {
    const snap = await tx.get(tr);
    if (!snap.exists()) throw new Error("ไม่พบคำขอเทรด");
    const trade = { ...snap.data(), id: snap.id } as import("../types").ItemTrade;
    if (trade.status !== 'pending') throw new Error("คำขอเทรดนี้ดำเนินการไปแล้ว");
    if (trade.senderId !== characterId && trade.recipientId !== characterId) throw new Error("ไม่มีสิทธิ์");
    tx.update(tr, sanitizeForFirestore({ ...trade, status: 'cancelled', updatedAt: Date.now() }));
  });
}

export async function acceptItemTrade(tradeId: string, recipientId: string): Promise<void> {
  const tr = doc(db, ITEM_TRADE_COLLECTION, tradeId);
  await runTransaction(db, async tx => {
    const ts = await tx.get(tr);
    if (!ts.exists()) throw new Error("ไม่พบคำขอเทรด");
    const trade = { ...ts.data(), id: ts.id } as import("../types").ItemTrade;
    if (trade.status !== 'pending') throw new Error("คำขอเทรดนี้ดำเนินการไปแล้ว");
    if (trade.recipientId !== recipientId) throw new Error("ไม่มีสิทธิ์รับเทรดนี้");

    const sr = doc(db, CHARACTERS_COLLECTION, trade.senderId);
    const rr = doc(db, CHARACTERS_COLLECTION, trade.recipientId);
    const ss = await tx.get(sr), rs = await tx.get(rr);
    if (!ss.exists() || !rs.exists()) throw new Error("ไม่พบผู้เล่น");
    const sender = { ...ss.data(), id: ss.id } as CharacterProfile;
    const receiver = { ...rs.data(), id: rs.id } as CharacterProfile;

    const senderInv = [...(sender.inventory || [])];
    const receiverInv = [...(receiver.inventory || [])];
    const offeredIdx = senderInv.findIndex(x => x.instanceId === trade.offeredItem.instanceId);
    if (offeredIdx < 0 || senderInv[offeredIdx].isEquipped) throw new Error("ผู้เสนอไม่มีไอเทมนี้แล้ว หรือกำลังสวมใส่อยู่");
    const offeredQty = Math.max(1, Math.min(Math.floor(Number(trade.offeredQuantity)||1), Number(senderInv[offeredIdx].quantity)||1));
    if (offeredQty !== Math.max(1, Number(trade.offeredQuantity)||1)) throw new Error("จำนวนไอเทมที่เสนอเปลี่ยนไป กรุณาสร้างข้อเสนอใหม่");
    const offeredCoins = Math.max(0, Math.floor(Number(trade.offeredCoins)||0));
    if (Math.floor(Number(sender.coins)||0) < offeredCoins) throw new Error("ผู้เสนอมี Coins ไม่พอแล้ว");

    let requestedItem: InventoryItem | undefined;
    const requestedQty = Math.max(0, Math.floor(Number(trade.requestedQuantity)||0));
    if (trade.requestedItem && requestedQty > 0) {
      const reqIdx = receiverInv.findIndex(x => x.instanceId === trade.requestedItem!.instanceId);
      if (reqIdx < 0 || receiverInv[reqIdx].isEquipped) throw new Error("ผู้รับไม่มีไอเทมที่ขอแล้ว หรือกำลังสวมใส่อยู่");
      const available = Math.max(1, Number(receiverInv[reqIdx].quantity)||1);
      if (available < requestedQty) throw new Error("ผู้รับมีไอเทมไม่พอแล้ว");
      requestedItem = { ...receiverInv[reqIdx], quantity: requestedQty, isEquipped: false, equippedQuantity: 0 };
    }

    const requestedCoins = Math.max(0, Math.floor(Number(trade.requestedCoins)||0));
    if (Math.floor(Number(receiver.coins)||0) < requestedCoins) throw new Error("Coins ของผู้รับไม่พอแล้ว");

    const removeFromStack = (list: InventoryItem[], instanceId: string, qty: number) => {
      const idx = list.findIndex(x => x.instanceId === instanceId);
      if (idx < 0) throw new Error("ไม่พบไอเทม");
      const item = list[idx];
      const available = Math.max(1, Number(item.quantity)||1);
      if (available < qty) throw new Error("จำนวนไอเทมไม่พอ");
      if (available === qty) list.splice(idx, 1);
      else list[idx] = { ...item, quantity: available - qty, equippedQuantity: Math.min(Number(item.equippedQuantity)||0, available - qty), isEquipped: Boolean(item.isEquipped && Number(item.equippedQuantity||0) > 0) };
    };
    const addToStack = (list: InventoryItem[], item: InventoryItem, prefix: string) => {
      const key = [String(item.name||'').trim().toLowerCase(),String(item.category||''),String(item.effectType||''),String(item.targetStat||''),String(item.effectValue??''),String(item.hpBonus??'')].join('|');
      const idx = list.findIndex(x => [String(x.name||'').trim().toLowerCase(),String(x.category||''),String(x.effectType||''),String(x.targetStat||''),String(x.effectValue??''),String(x.hpBonus??'')].join('|') === key);
      if (idx >= 0) list[idx] = { ...list[idx], quantity: (Number(list[idx].quantity)||0) + Math.max(1, Number(item.quantity)||1) };
      else list.push({ ...item, instanceId: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, isEquipped:false, equippedQuantity:0 });
    };

    removeFromStack(senderInv, trade.offeredItem.instanceId, offeredQty);
    addToStack(receiverInv, { ...trade.offeredItem, quantity: offeredQty }, 'trade-in');
    if (requestedItem) {
      removeFromStack(receiverInv, requestedItem.instanceId, requestedQty);
      addToStack(senderInv, requestedItem, 'trade-out');
    }

    const senderCoins = Math.floor(Number(sender.coins)||0) - offeredCoins + requestedCoins;
    const receiverCoins = Math.floor(Number(receiver.coins)||0) - requestedCoins + offeredCoins;
    const now = Date.now();
    const senderNotification = {
      id: `notif-trade-${trade.id}-sender`, title: "เทรดสำเร็จ", message: `เทรดกับ ${receiver.displayName} สำเร็จ`, timestamp: now, read:false, type:"trade" as const
    };
    const receiverNotification = {
      id: `notif-trade-${trade.id}-receiver`, title: "เทรดสำเร็จ", message: `เทรดกับ ${sender.displayName} สำเร็จ`, timestamp: now, read:false, type:"trade" as const
    };
    const updatedSender = { ...sender, coins: senderCoins, inventory: senderInv, notifications: [senderNotification, ...(sender.notifications||[])].slice(0,100), lastUpdated:now };
    const updatedReceiver = { ...receiver, coins: receiverCoins, inventory: receiverInv, notifications: [receiverNotification, ...(receiver.notifications||[])].slice(0,100), lastUpdated:now };
    tx.update(sr, sanitizeForFirestore({ ...updatedSender, powerScore: calculatePowerScore(updatedSender) }));
    tx.update(rr, sanitizeForFirestore({ ...updatedReceiver, powerScore: calculatePowerScore(updatedReceiver) }));
    tx.update(tr, sanitizeForFirestore({ ...trade, status:'completed', updatedAt:now }));
  });
}


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
export function subscribeToCraftingRecipes(callback: (recipes: import("../types").CraftingRecipe[]) => void) {
  try {
    return onSnapshot(collection(db, CRAFTING_RECIPES_COLLECTION), (snapshot: any) => {
      const list: import("../types").CraftingRecipe[] = [];
      snapshot.forEach((d: any) => list.push({ ...d.data(), id: d.id } as import("../types").CraftingRecipe));
      callback(list.filter(r => r.enabled !== false).sort((a,b) => (a.name || '').localeCompare(b.name || '')));
    }, () => callback([]));
  } catch { callback([]); return () => {}; }
}

export async function saveCraftingRecipe(recipe: import("../types").CraftingRecipe): Promise<void> {
  await setDoc(doc(db, CRAFTING_RECIPES_COLLECTION, recipe.id), sanitizeForFirestore(recipe));
}

export async function deleteCraftingRecipe(recipeId: string): Promise<void> {
  await deleteDoc(doc(db, CRAFTING_RECIPES_COLLECTION, recipeId));
}

export async function craftRecipe(characterId: string, recipe: import("../types").CraftingRecipe, shopItems: Item[]) {
  const charRef = doc(db, CHARACTERS_COLLECTION, characterId);
  return runTransaction(db, async tx => {
    const snap = await tx.get(charRef);
    if (!snap.exists()) throw new Error('ไม่พบตัวละคร');
    const char = { ...snap.data(), id: snap.id } as CharacterProfile;
    const inv = [...(char.inventory || [])];
    for (const ing of recipe.ingredients || []) {
      const needed = Math.max(1, Math.floor(Number(ing.quantity) || 1));
      const owned = inv.filter(x => x.id === ing.itemId).reduce((sum,x) => sum + Math.max(0, Number(x.quantity)||0), 0);
      if (owned < needed) return {success:false, message:'วัตถุดิบไม่พอ'};
    }
    for (const ing of recipe.ingredients || []) {
      let remain = Math.max(1, Math.floor(Number(ing.quantity)||1));
      for (let i=inv.length-1;i>=0 && remain>0;i--) {
        if (inv[i].id !== ing.itemId) continue;
        const q=Math.max(0, Number(inv[i].quantity)||0), take=Math.min(q,remain); remain-=take;
        if (q>take) inv[i]={...inv[i],quantity:q-take}; else inv.splice(i,1);
      }
    }
    const output = shopItems.find(x => x.id === recipe.outputItemId);
    if (!output) return {success:false,message:'ไม่พบไอเทมผลลัพธ์ของสูตรนี้'};
    const qty=Math.max(1,Math.floor(Number(recipe.outputQuantity)||1));
    const idx=inv.findIndex(x => x.id===output.id && x.name===output.name);
    if(idx>=0) inv[idx]={...inv[idx],quantity:Math.max(0,Number(inv[idx].quantity)||0)+qty};
    else inv.push({...output,instanceId:'craft-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),quantity:qty,isEquipped:false,equippedQuantity:0});
    const updated={...char,inventory:inv,lastUpdated:Date.now()};
    tx.update(charRef,sanitizeForFirestore({...updated,powerScore:calculatePowerScore(updated)}));
    return {success:true,message:'คราฟต์สำเร็จ',updatedChar:updated};
  });
}

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
      // Confirm that the shared document still exists before updating it.
      // A character deleted by an admin/player must not be recreated by a
      // stale Shop/Inventory/Profile client.
      const characterRef = doc(db, CHARACTERS_COLLECTION, updated.id);
      const serverSnap = await getDoc(characterRef);
      const cleaned = sanitizeForFirestore(updated);
      if (!serverSnap.exists()) {
        // A newly-created character can be updated before the API read cache
        // catches up. Only the explicitly tracked new-character path may
        // recreate the document; normal deleted characters stay deleted.
        if (pendingNewCharacters.has(updated.id)) {
          await setDoc(characterRef, cleaned);
        } else {
          throw new Error('CHARACTER_DELETED');
        }
      } else {
        // Persist the profile image separately first. Avatar edits are small and
        // must survive refresh even if the full character document is rejected
        // because another field made the payload too large or invalid.
        const avatarToPersist = String(updated.avatarUrl || '').trim();
        if (avatarToPersist && isCustomProfileAvatar(avatarToPersist)) {
          await updateDoc(characterRef, { avatarUrl: avatarToPersist });
        }
        await updateDoc(characterRef, cleaned);
      }
    });
  } catch (err) {
    const pending = pendingCharacterUpdates.get(updated.id);
    if (pending && valuesMatch(pending, updated)) pendingCharacterUpdates.delete(updated.id);

    // If another player/device deleted this character, accept that deletion
    // as the authoritative shared state instead of showing a database error
    // and restoring the stale character locally.
    const deleted = err instanceof Error && err.message === 'CHARACTER_DELETED'
      || String((err as any)?.message || '').includes('Document not found');
    if (deleted) {
      pendingCharacterDeletes.add(updated.id);
      localCharacters = localCharacters.filter(character => character.id !== updated.id);
      saveLocalAll();
      broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });
      return;
    }

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

  // Keep the Admin UI responsive: commit the optimistic item immediately and
  // persist in the background. Waiting for a Firestore write here could leave
  // the whole Admin form stuck on a loading screen when the network is slow.
  // Persist in the background, but keep the returned Promise tied to the
  // database write so AdminPanel can report a real save failure.
  return enqueuePersistenceWrite(`shop:${id}`, () =>
    setDoc(doc(db, SHOP_ITEMS_COLLECTION, id), sanitizeForFirestore(fullItem))
  ).then(() => {
    pendingShopItems.delete(id);
  }).catch((err) => {
    pendingShopItems.delete(id);
    localShopItems = previousItem
      ? [previousItem, ...localShopItems.filter(existing => existing.id !== id)]
      : localShopItems.filter(existing => existing.id !== id);
    saveLocalAll();
    broadcast?.postMessage({ type: 'SHOP_UPDATE' });
    console.error("Error adding shop item to Firestore:", err);
    throw err;
  });
}

// Delete Shop item (Admin)
export async function updateShopItem(item: Item): Promise<void> {
  const previousItem = localShopItems.find(existing => existing.id === item.id);
  const cleanItem = sanitizeForFirestore(item);

  // Keep the edited item visible immediately, but do not treat the local
  // update as the database save.
  localShopItems = [item, ...localShopItems.filter(existing => existing.id !== item.id)];
  pendingShopItems.set(item.id, item);
  saveLocalAll();
  broadcast?.postMessage({ type: 'SHOP_UPDATE' });

  try {
    // The project now uses /api/database -> Supabase, not Firebase.
    // PUT is an UPSERT, so it works for both old and new shop items.
    await enqueuePersistenceWrite(`shop:${item.id}`, () =>
      setDoc(doc(db, SHOP_ITEMS_COLLECTION, item.id), cleanItem)
    );

    // setDoc only resolves after the backend has returned HTTP 200.
    // Do not perform an extra read here: a realtime/polling snapshot can
    // legitimately lag the write and must not turn a successful save into
    // a false "save failed" message.
    pendingShopItems.delete(item.id);
  } catch (err) {
    pendingShopItems.delete(item.id);

    // Revert the optimistic UI only when the actual backend write failed.
    localShopItems = previousItem
      ? [previousItem, ...localShopItems.filter(existing => existing.id !== item.id)]
      : localShopItems.filter(existing => existing.id !== item.id);
    saveLocalAll();
    broadcast?.postMessage({ type: 'SHOP_UPDATE' });

    console.error('[ShopItem] Firestore/Supabase save failed:', err);
    throw err;
  }
}

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

      // Ensure legacy gacha item rewards also exist in the central catalog.
      for (const reward of mergedList) {
        if (reward.type !== 'item' || !reward.itemData) continue;
        const catalogItem: Item = {
          ...reward.itemData,
          id: reward.itemId || reward.itemData.id,
          inShop: reward.itemData.inShop === true,
          adminOnly: reward.itemData.inShop !== true,
          rewardEligible: true,
          stackable: reward.itemData.stackable !== false,
        };
        if (!localShopItems.some(item => item.id === catalogItem.id)) {
          localShopItems = [catalogItem, ...localShopItems];
        }
      }

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

      if ((snap as any).exists()) {
        const serverConfig = (snap as any).data() as GachaConfig;
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
    // Item rewards are linked to the central item catalog. Keep the catalog copy
    // available even when the item is not currently shown in the Shop.
    if (fullReward.type === 'item' && fullReward.itemData) {
      const catalogItem: Item = {
        ...fullReward.itemData,
        id: fullReward.itemId || fullReward.itemData.id,
        inShop: fullReward.itemData.inShop === true,
        adminOnly: fullReward.itemData.inShop !== true,
        rewardEligible: true,
        stackable: fullReward.itemData.stackable !== false,
      };
      await enqueuePersistenceWrite(`shop:${catalogItem.id}`, () =>
        setDoc(doc(db, SHOP_ITEMS_COLLECTION, catalogItem.id), sanitizeForFirestore(catalogItem))
      );
      localShopItems = [catalogItem, ...localShopItems.filter(item => item.id !== catalogItem.id)];
      saveLocalAll();
      broadcast?.postMessage({ type: 'SHOP_UPDATE' });
    }

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

  const incomingQuantity = Math.max(1, Math.floor(Number(quantity) || 1));

  // Use the same identity as the gacha stacker so admin-granted items
  // stack with existing copies even when legacy records have different IDs.
  const getItemStackKey = (entry: Item | InventoryItem) => [
    String(entry.name || '').trim().toLocaleLowerCase(),
    String(entry.category || ''),
    String(entry.effectType || ''),
    String(entry.targetStat || ''),
    String(entry.effectValue ?? ''),
    String(entry.hpBonus ?? ''),
    String(entry.gachaRateMultiplier ?? ''),
    String(entry.gachaRateMinRarity ?? 'rare'),
  ].join('|');

  const currentInventory: InventoryItem[] = [];
  const stackIndex = new Map<string, number>();

  // Normalize old duplicate stacks while processing this grant.
  for (const raw of (char.inventory || [])) {
    const normalized: InventoryItem = {
      ...raw,
      instanceId: raw.instanceId || `legacy-stack-${raw.id}-${currentInventory.length}`,
      quantity: Math.max(1, Number(raw.quantity) || 1),
      equippedQuantity: raw.category === 'equipment'
        ? raw.isEquipped === true
          ? Math.max(0, Number(raw.equippedQuantity) || 1)
          : 0
        : raw.equippedQuantity,
    };
    const key = getItemStackKey(normalized);
    const existingIndex = stackIndex.get(key);

    if (existingIndex === undefined) {
      stackIndex.set(key, currentInventory.length);
      currentInventory.push(normalized);
      continue;
    }

    const existing = currentInventory[existingIndex];
    existing.quantity += normalized.quantity;
    if (existing.category === 'equipment') {
      const equipped = existing.isEquipped === true
        ? Math.max(0, Number(existing.equippedQuantity) || 1)
        : 0;
      const incomingEquipped = normalized.isEquipped === true
        ? Math.max(0, Number(normalized.equippedQuantity) || 1)
        : 0;
      existing.equippedQuantity = Math.min(existing.quantity, equipped + incomingEquipped);
      existing.isEquipped = existing.equippedQuantity > 0;
    }
  }

  const key = getItemStackKey(item);
  const existingIndex = stackIndex.get(key);

  if (existingIndex !== undefined) {
    const existing = currentInventory[existingIndex];
    existing.quantity += incomingQuantity;
    if (existing.category === 'equipment') {
      existing.equippedQuantity = existing.isEquipped === true
        ? Math.min(existing.quantity, Math.max(0, Number(existing.equippedQuantity) || 1))
        : 0;
      existing.isEquipped = existing.equippedQuantity > 0;
    }
  } else {
    currentInventory.push({
      ...item,
      instanceId: `inst-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      quantity: incomingQuantity,
      equippedQuantity: item.category === 'equipment' ? 0 : undefined,
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
    const [charsSnap, shopSnap, rewardsSnap, configSnap, gachaBannersSnap, duelSnap] = await Promise.all([
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
export async function addCharacterToDB(char: CharacterProfile): Promise<void> {
  const id = String(char.id || '').trim();
  if (!id) throw new Error('ไม่พบ ID ตัวละครใหม่');

  const created: CharacterProfile = {
    ...char,
    // New characters always start with 50,000 Coins.
    coins: 50000,
    skills: [...(char.skills || [])],
    inventory: [...(char.inventory || [])],
    quests: [...(char.quests || [])],
    notifications: [...(char.notifications || [])],
    characteristics: [...(char.characteristics || [])],
    lastUpdated: Math.max(Date.now(), Number(char.lastUpdated || 0)),
  };

  const previous = localCharacters.find(c => c.id === id);
  pendingNewCharacters.add(id);
  pendingCharacterUpdates.set(id, created);
  localCharacters = [...localCharacters.filter(c => c.id !== id), created];
  saveLocalAll();
  broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });

  try {
    // Creation is an UPSERT at the backend API. Do not GET first: a newly
    // created character is expected not to exist yet.
    await enqueueCharacterWrite(id, async () => {
      await setDoc(doc(db, CHARACTERS_COLLECTION, id), sanitizeForFirestore(created));
    });
    pendingCharacterUpdates.delete(id);
  } catch (err) {
    pendingCharacterUpdates.delete(id);
    pendingNewCharacters.delete(id);
    localCharacters = previous
      ? [...localCharacters.filter(c => c.id !== id), previous]
      : localCharacters.filter(c => c.id !== id);
    saveLocalAll();
    broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });
    console.error('Error creating character in backend:', err);
    throw err;
  }

  // Keep the ID marked as newly-created for the immediate post-creation
  // profile/status saves. It is removed after a short grace period.
  window.setTimeout(() => pendingNewCharacters.delete(id), 15000);
}
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
  randomBattleEntryFee: 15000,
  randomBattleRewards: [
    { id: "random-reward-1", name: "5,000 Coins", type: "coin", coinAmount: 5000, rate: 50 },
    { id: "random-reward-2", name: "10,000 Coins", type: "coin", coinAmount: 10000, rate: 30 },
    { id: "random-reward-3", name: "25,000 Coins", type: "coin", coinAmount: 25000, rate: 15 },
    { id: "random-reward-4", name: "100,000 Coins", type: "coin", coinAmount: 100000, rate: 5 },
  ],
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

function trimBattleRoom(room: BattleRoom): BattleRoom {
  const safeLog = Array.isArray(room.log) ? room.log.slice(0, 200) : [];
  return {
    ...room,
    teamA: Array.isArray(room.teamA) ? room.teamA : [],
    teamB: Array.isArray(room.teamB) ? room.teamB : [],
    log: safeLog,
  };
}

function saveBattleLocal() {
  if (typeof window === 'undefined') return;
  try {
    // Mobile browsers can freeze when a very large battle history is repeatedly
    // serialized to localStorage. Keep only the latest active/completed rooms and
    // a bounded battle log; Firestore remains the shared source of truth.
    localBattleRooms = localBattleRooms
      .map(trimBattleRoom)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, 50);
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
      if ((snapshot as any).exists()) {
        const serverConfig = { ...DEFAULT_BATTLE_CONFIG, ...(snapshot as any).data(), id: "main" } as BattleConfig;
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
        .map(item => trimBattleRoom({ ...item.data(), id: item.id } as BattleRoom))
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

export async function createBattleRoomWithEntryFee(room: BattleRoom, playerId: string, fee: number, currency: 'coins' | 'possibility' = 'possibility'): Promise<string> {
  const id = room.id || "battle-" + Date.now();
  const normalizedFee = Math.max(0, Math.floor(Number(fee) || 0));
  const current = localCharacters.find(character => character.id === playerId);
  if (!current) throw new Error('ไม่พบตัวละครผู้เข้าสนาม');
  const balance = currency === 'coins' ? (Number(current.coins) || 0) : (Number(current.possibility) || 0);
  if (normalizedFee > 0 && balance < normalizedFee) {
    throw new Error((currency === 'coins' ? 'Coins' : 'ความเป็นไปได้') + ' ไม่เพียงพอสำหรับค่าเข้าสนาม');
  }
  const nextCharacter = normalizedFee > 0
    ? {
        ...current,
        coins: currency === 'coins' ? balance - normalizedFee : (Number(current.coins) || 0),
        possibility: currency === 'possibility' ? balance - normalizedFee : (Number(current.possibility) || 0),
        lastUpdated: Math.max(Date.now(), Number(current.lastUpdated || 0) + 1),
      }
    : current;
  if (normalizedFee > 0) await updateCharacterInDB(nextCharacter);
  const next = {
    ...room,
    id,
    entryFeeCurrency: currency,
    entryFeeCoins: currency === 'coins' ? normalizedFee : 0,
    entryFeePossibility: currency === 'possibility' ? normalizedFee : 0,
    createdAt: room.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  await setDoc(doc(db, BATTLE_ROOMS_COLLECTION, id), sanitizeForFirestore(next));
  localCharacters = localCharacters.map(character => character.id === playerId ? nextCharacter : character);
  localStorage.setItem('starstream_characters', JSON.stringify(localCharacters));
  broadcast?.postMessage({ type: 'CHARACTERS_UPDATE' });
  localBattleRooms = [next, ...localBattleRooms.filter(item => item.id !== id)];
  saveBattleLocal();
  notifyBattleRooms();
  return id;
}

export async function settleBattleVictoryReward(room: BattleRoom, playerId: string): Promise<{ paid: number; awardedDrops: BattleBotDrop[] }> {
  if ((room.mode !== "pve" && room.mode !== "random") || room.status !== "completed" || room.winnerTeam !== "a") {
    return { paid: 0, awardedDrops: [] };
  }
  const randomReward = room.mode === 'random' ? room.randomReward : undefined;
  const reward = Math.max(0, Math.floor(Number(room.victoryRewardCoins) || 0));
  if (room.mode === 'random' && !randomReward) return { paid: 0, awardedDrops: [] };
  if (room.mode !== 'random' && reward <= 0 && !(room.battleDrops || []).length) {
    return { paid: 0, awardedDrops: [] };
  }

  const response = await fetch('/api/database?action=claim_battle_reward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomId: room.id,
      playerId,
      reward,
      rewardData: randomReward || null,
      drops: Array.isArray(room.battleDrops) ? room.battleDrops : [],
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || 'ไม่สามารถรับรางวัลการต่อสู้ได้');

  // The API is the single writer for battle rewards. Do not add the reward
  // again from the browser, otherwise a realtime snapshot can race this claim
  // and duplicate coins/items.
  if (!body?.paid) return { paid: 0, awardedDrops: [] };

  const awardedDrops = Array.isArray(body?.awardedDrops) ? body.awardedDrops : [];
  const updatedRoom = { ...room, rewardClaimedBy: playerId, updatedAt: Date.now() };
  pendingBattleRooms.set(room.id, updatedRoom);
  localBattleRooms = [updatedRoom, ...localBattleRooms.filter(item => item.id !== room.id)];
  saveBattleLocal();
  notifyBattleRooms();

  return { paid: reward, awardedDrops };
}

export async function updateBattleRoom(room: BattleRoom): Promise<void> {
  // A delete is authoritative. Do not allow an already queued/late battle update
  // to recreate a room that the user has just deleted.
  if (pendingBattleRoomDeletes.has(room.id)) return;
  const previous = localBattleRooms.find(item => item.id === room.id);
  const next = trimBattleRoom({
    ...room,
    updatedAt: Math.max(Date.now(), (localBattleRooms.find(item => item.id === room.id)?.updatedAt || 0) + 1),
  });
  pendingBattleRooms.set(next.id, next);
  pendingBattleRoomDeletes.delete(next.id);
  localBattleRooms = [next, ...localBattleRooms.filter(item => item.id !== next.id)];
  saveBattleLocal();
  notifyBattleRooms();
  try {
    await enqueuePersistenceWrite(`battle-room:${next.id}`, async () => {
      // The write may have been queued before deleteBattleRoom() was called.
      // Re-check the tombstone immediately before touching Firestore.
      if (pendingBattleRoomDeletes.has(next.id)) return;
      await setDoc(doc(db, BATTLE_ROOMS_COLLECTION, next.id), sanitizeForFirestore(next));
    });
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
  // Tombstone the room before changing any local state. Any queued update
  // for the same room will now be ignored instead of recreating it.
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
  const rawPassives = [...(attacker.activeSkillPassives || []), ...getEquippedItemPassives(attacker)]
    .filter(effect => effect && effect.trigger === trigger && effect.kind && effect.id);
  // Legacy data can accidentally contain the same passive many times. Execute
  // each logical passive once per trigger and cap the total work.
  const seenPassiveKeys = new Set<string>();
  const passives = rawPassives.filter(effect => {
    const key = String(effect.stackKey || effect.id || '').trim();
    if (!key || seenPassiveKeys.has(key + ':' + effect.kind)) return false;
    seenPassiveKeys.add(key + ':' + effect.kind);
    return true;
  }).slice(0, 50);
  const ordered = [...passives.filter(effect => effect.kind === 'stack'), ...passives.filter(effect => effect.kind !== 'stack')];
  for (const passive of ordered) {
    const baseChance = passive.chance == null ? 100 : Math.max(0, Math.min(100, Number(passive.chance) || 0));
    const chance = getBattleChance(attacker, baseChance);
    const passiveRoll = Math.random() * 100;
    const chanceLabel = Number.isInteger(chance) ? String(chance) : String(Number(chance.toFixed(2)));
    if (passiveRoll >= chance) {
      if (chance < 100) result.message += ` • ❌ ${passive.name} ไม่ทำงาน (${chanceLabel}%)`;
      continue;
    }
    const value = Math.max(0, Number(passive.value) || 0);
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
          result.message += ` • 💠 True Damage +${thresholdDamage} — ${threshold.name} (ครบ ${maxStacks} Stack)`;
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
          result.message += ` • 💠 True Damage +${trueDamage} — ${passive.name} (ครบ ${maxStacks} Stack)`;
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

export function getBattleSkillProfile(skill: Skill): { effect: BattleSkillEffect; power: number; cooldownTurns: number; duration: number } {
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
  const duration = Math.max(1, Math.min(10, Math.round(Number(skill.battleEffectDuration) || 1)));
  const power = Math.max(1, skill.battlePower ?? (effect === "reflect" ? percent || 35 : effect === "defense" ? 5 : 5));
  return { effect, power, cooldownTurns, duration };
}

function applyBattleExtraEffects(attacker: BattleCombatant, defender: BattleCombatant, effects: NonNullable<Skill['battleEffects']>, result: BattleRollResult) {
  for (const effect of effects || []) {
    const baseChance = effect.chance == null ? 100 : Math.max(0, Math.min(100, Number(effect.chance) || 0));
    const chance = getBattleChance(attacker, baseChance);
    if (Math.random() * 100 >= chance) continue;
    const label = effect.label || effect.kind;
    const value = Math.max(0, Number(effect.value) || 0);
    const duration = Math.max(1, Math.floor(Number(effect.duration) || 1));
    const target = effect.target === 'self' ? attacker : defender;
    const isStatusEffect = ['stun', 'freeze', 'poison', 'burn', 'bleeding', 'slow', 'curse', 'weakness'].includes(effect.kind);
    if (isStatusEffect && (target.passiveTraits?.statusImmunity || (target.statusImmunityTurns && target.statusImmunityTurns > 0))) {
      result.message += ` • 🚫 ${target.name} ต้านสถานะ ${label}`;
      continue;
    }
    if (effect.kind === 'damage_percent') {
      if (effect.target === 'self') {
        const selfDamage = Math.max(1, Math.round(target.maxHp * value / 100));
        target.hp = Math.max(0, target.hp - selfDamage);
        result.message += ` • ⚠️ ${target.name} เสีย HP ${value}% (-${selfDamage})`;
      } else {
        result.damage += Math.max(0, Math.round(result.damage * value / 100));
        result.message += ` • ${label} +${value}% ดาเมจ`;
      }
    } else if (effect.kind === 'heal_percent') {
      const healMultiplier = Math.max(0, Number(target.passiveTraits?.healingReceivedMultiplier) || 1);
      const healed = Math.max(0, Math.round(target.maxHp * value / 100 * healMultiplier));
      result.heal += healed;
      result.message += ` • ${label} ฟื้น HP ${value}%${healMultiplier !== 1 ? ` ×${healMultiplier}` : ''}`;
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
      const currentShield = Math.max(0, Number(target.defenseValue) || 0);
      const addedShield = Math.max(0, Math.round(value));
      target.defenseValue = currentShield + addedShield;
      target.defenseTurns = Math.max(target.defenseTurns || 0, duration);
      result.message += ` • ${label} เพิ่มโล่ +${addedShield} (รวม ${Math.round(target.defenseValue)})`;
    } else if (effect.kind === 'damage_reduction') {
      target.damageReductionPercent = Math.min(100, Math.max(0, value));
      target.damageReductionTurns = Math.max(target.damageReductionTurns || 0, duration);
      result.message += ` • 🛡️ ${label} ลดความเสียหาย ${value}% ${duration} เทิร์น`;
    } else if (effect.kind === 'reflect') {
      target.reflectPercent = Math.max(target.reflectPercent || 0, Math.min(100, value));
      target.reflectTurns = Math.max(target.reflectTurns || 0, duration);
      result.message += ` • ${label} สะท้อน ${value}%`;
    } else {
      // สถานะที่สร้างจาก modifier แบบ "status" มีทั้งฝั่งบัฟและดีบัฟ
      // regen เป็นบัฟ ส่วนสถานะก่อผลเสียเป็นดีบัฟ เพื่อให้ผลต่อเทิร์นทำงานตรงกับชนิดที่เลือก
      const mode = effect.kind === 'regen' ? 'buff' as const : 'nerf' as const;
      const existing = target.adminStatusEffects || [];
      const kind = effect.kind === 'freeze' ? 'stun' : effect.kind;
      // เอฟเฟกต์ชื่อเดิมต้องสะสมเวลา "ตามระยะเวลาที่ตั้งไว้" ของเอฟเฟกต์นี้
      // ไม่เอา remaining เก่าที่อาจเสีย/ค้างจากข้อมูลเดิม (เช่น 100T) มาบวกตรง ๆ
      // ดังนั้นเอฟเฟกต์ที่ตั้งไว้ 3T และติดซ้ำจะเป็น 6T ไม่ใช่ 103T
      const sameEffectIndex = existing.findIndex(item =>
        item.name.trim().toLowerCase() === label.trim().toLowerCase() && item.kind === kind
      );
      if (sameEffectIndex >= 0) {
        const nextEffects = [...existing];
        const current = nextEffects[sameEffectIndex];
        const safeExistingRemaining = Math.max(0, Math.floor(Number(current.remaining) || 0));
        nextEffects[sameEffectIndex] = {
          ...current,
          value,
          duration,
          remaining: safeExistingRemaining + duration,
          appliedAt: Date.now(),
        };
        target.adminStatusEffects = nextEffects;
      } else {
        const status = { id: `battle-effect-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, kind: kind as AdminStatusEffect['kind'], name: label, mode, power: value, duration, remaining: duration, appliedAt: Date.now(), source: 'admin' as const, description: label };
        target.adminStatusEffects = [...existing, status];
      }
      if (effect.kind === 'freeze' || effect.kind === 'stun') {
        const activeStuns = (target.adminStatusEffects || [])
          .filter(item => item.kind === 'stun')
          .map(item => Math.max(0, Math.floor(Number(item.remaining) || 0)));
        target.stunnedTurns = Math.max(...activeStuns, duration);
      }
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

function getDefenseStatDamageReduction(defenseStat: unknown): number {
  const defense = Math.max(0, Number(defenseStat) || 0);
  if (defense >= 500 && defense <= 1000) return 15;
  if (defense >= 200 && defense < 500) return 10;
  if (defense >= 1 && defense <= 100) return 5;
  return 0;
}

function getAdminIncomingDamageMultiplier(unit: BattleCombatant): number {
  // Skill damage reduction is applied explicitly at hit resolution so it is
  // never multiplied twice. This helper only handles percentage shield status.
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
  if (unit.immortalTurns && unit.immortalTurns > 0) unit.immortalTurns = Math.max(0, unit.immortalTurns - 1);
  if (unit.shieldTurns && unit.shieldTurns > 0) {
    unit.shieldTurns = Math.max(0, unit.shieldTurns - 1);
    if (unit.shieldTurns === 0) {
      unit.shieldPercent = 0;
      unit.defenseValue = 0;
      unit.defenseTurns = 0;
    }
  }
  if (unit.statusImmunityTurns && unit.statusImmunityTurns > 0) {
    unit.statusImmunityTurns = Math.max(0, unit.statusImmunityTurns - 1);
  }
  if (unit.damageReductionTurns && unit.damageReductionTurns > 0) {
    unit.damageReductionTurns = Math.max(0, unit.damageReductionTurns - 1);
    if (unit.damageReductionTurns === 0) unit.damageReductionPercent = 0;
  }
  // Reflect duration must tick down each completed turn as well.
  if (unit.reflectTurns && unit.reflectTurns > 0) {
    unit.reflectTurns = Math.max(0, unit.reflectTurns - 1);
    if (unit.reflectTurns === 0) unit.reflectPercent = 0;
  }
  if (unit.reflectNoDamageTurns && unit.reflectNoDamageTurns > 0) {
    unit.reflectNoDamageTurns = Math.max(0, unit.reflectNoDamageTurns - 1);
  }
  if (unit.skillStatModifiers?.length) {
    const nextModifiers = unit.skillStatModifiers.map(mod => ({ ...mod, remaining: Math.max(0, mod.remaining - 1) }));
    const expired = nextModifiers.filter(mod => mod.remaining === 0);
    expired.forEach(mod => {
      const current = Number(unit.stats?.[mod.stat]) || 0;
      unit.stats = { ...unit.stats, [mod.stat]: Math.max(0, current - mod.delta) };
    });
    unit.skillStatModifiers = nextModifiers.filter(mod => mod.remaining > 0);
  }
  if (unit.copiedAbilityTurns && unit.copiedAbilityTurns > 0) {
    unit.copiedAbilityTurns = Math.max(0, unit.copiedAbilityTurns - 1);
    if (unit.copiedAbilityTurns === 0) { unit.copiedAbility = undefined; unit.activeSkillPassives = (unit.activeSkillPassives || []).filter(effect => !String(effect.id).startsWith(`copy:${unit.id}:`)); }
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

const battleItemLocks = new Set<string>();

export async function useBattleItem(room: BattleRoom, playerId: string, itemInstanceId: string): Promise<BattleRoom> {
  const lockKey = String(room?.id || '') + ':' + String(playerId || '');
  if (!lockKey || lockKey === ':') throw new Error('ข้อมูลการใช้ไอเทมไม่ครบ');
  if (battleItemLocks.has(lockKey)) throw new Error('กำลังประมวลผลการใช้ไอเทมอยู่');
  battleItemLocks.add(lockKey);
  try {
  if (room.status !== 'active') throw new Error('การต่อสู้จบแล้ว');

  // Normalize the room first. Rooms created by an older build can contain
  // partial/legacy combatant data; using that data directly was able to crash
  // the page when the item button was pressed.
  const normalizeStats = (value: any) => ({
    strength: Number(value?.strength) || 0,
    durability: Number(value?.durability) || 0,
    agility: Number(value?.agility) || 0,
    magic: Number(value?.magic) || 0,
  });
  const normalizedRoom: BattleRoom = {
    ...room,
    teamA: (room.teamA || []).map(unit => ({
      ...unit,
      stats: normalizeStats(unit.stats),
      hp: Math.max(0, Number(unit.hp) || 0),
      maxHp: Math.max(1, Number(unit.maxHp) || 1),
      skillCooldowns: { ...(unit.skillCooldowns || {}) },
      skillUses: { ...(unit.skillUses || {}) },
    })),
    teamB: (room.teamB || []).map(unit => ({
      ...unit,
      stats: normalizeStats(unit.stats),
      hp: Math.max(0, Number(unit.hp) || 0),
      maxHp: Math.max(1, Number(unit.maxHp) || 1),
      skillCooldowns: { ...(unit.skillCooldowns || {}) },
      skillUses: { ...(unit.skillUses || {}) },
    })),
    log: [...(room.log || [])],
  };

  const actor = [...normalizedRoom.teamA, ...normalizedRoom.teamB]
    .find(unit => unit.id === normalizedRoom.turnActorId);
  if (!actor || actor.type !== 'player' || actor.sourceId !== playerId) {
    throw new Error('ยังไม่ใช่เทิร์นของผู้เล่นนี้');
  }

  const currentUses = Math.max(0, Number(normalizedRoom.battleItemUses) || 0);
  if (currentUses >= 2) throw new Error('เกมนี้ใช้ไอเทมครบ 2 ครั้งแล้ว');

  // Always read the newest shared character before consuming an item.
  // Do not rely on localCharacters here: the battle UI can be one polling
  // cycle behind, and using that stale inventory could make the item button
  // appear to work while writing an older bag back to the backend.
  const latestSnapshot = await getDoc(doc(db, CHARACTERS_COLLECTION, playerId));
  if (!latestSnapshot.exists()) throw new Error('ไม่พบตัวละครผู้ใช้');
  const character = { ...latestSnapshot.data(), id: latestSnapshot.id } as CharacterProfile;

  const requestedId = String(itemInstanceId || '').trim();
  if (!requestedId) throw new Error('ไม่พบรหัสไอเทม');

  const item = (character.inventory || []).find(inv =>
    String(inv.instanceId || '') === requestedId ||
    String(inv.id || '') === requestedId
  );
  if (!item || Math.max(0, Number(item.quantity) || 0) <= 0) {
    throw new Error('ไม่พบไอเทมในกระเป๋า');
  }
  // Legacy items may not have usableByPlayers yet. Only an explicit false
  // disables battle use, so older inventory records remain usable.
  if (item.category !== 'consumable' || item.usableByPlayers === false) {
    throw new Error('ไอเทมนี้ใช้ระหว่างการต่อสู้ไม่ได้');
  }

  // Normalize admin-created item data before it reaches the battle engine.
  const safeNum = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const x = Number(value);
    return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : 0;
  };
  const normalizedItem = {
    ...item,
    effectValue: safeNum(item.effectValue, 0, 1000000000),
    healPercent: safeNum(item.healPercent, 0, 100),
    battleDamagePercent: safeNum(item.battleDamagePercent, 0, 1000),
    battleDamageDuration: Math.floor(safeNum(item.battleDamageDuration, 0, 1000)),
    battleCriticalChancePercent: safeNum(item.battleCriticalChancePercent, 0, 100),
    battleRepeatAttackChancePercent: safeNum(item.battleRepeatAttackChancePercent, 0, 100),
    battleLuckMultiplier: Math.max(1, safeNum(item.battleLuckMultiplier, 1, 20)),
    battleLuckDuration: Math.floor(safeNum(item.battleLuckDuration, 0, 1000)),
    battlePassiveChanceMultiplier: Math.max(1, safeNum(item.battlePassiveChanceMultiplier, 1, 20)),
    damageReductionPercent: safeNum(item.damageReductionPercent, 0, 100),
    damageReductionDuration: Math.floor(safeNum(item.damageReductionDuration, 0, 1000)),
    revivePercent: safeNum(item.revivePercent, 0, 100),
    reviveAlly: Boolean(item.reviveAlly),
    cleanseNegative: Boolean(item.cleanseNegative),
    shieldPercent: safeNum(item.shieldPercent, 0, 100),
    shieldDuration: Math.floor(safeNum(item.shieldDuration, 0, 1000)),
    dodgeChancePercent: safeNum(item.dodgeChancePercent, 0, 100),
    lifestealPercent: safeNum(item.lifestealPercent, 0, 100),
    cooldownReductionPercent: safeNum(item.cooldownReductionPercent, 0, 100),
    statusImmunityDuration: Math.floor(safeNum(item.statusImmunityDuration, 0, 1000)),
    stunDuration: Math.floor(safeNum(item.stunDuration, 0, 1000)),
    passiveEffects: (Array.isArray(item.passiveEffects) ? item.passiveEffects : [])
      .filter(Boolean)
      .slice(0, 50)
      .map((p, index) => ({
        ...p,
        id: String(p.id || `item-passive-${item.id}-${index}`),
        name: String(p.name || 'Passive'),
        value: safeNum(p.value, 0, 1000000),
        chance: safeNum(p.chance, 0, 100),
        duration: Math.floor(safeNum(p.duration, 0, 1000)),
        maxStacks: Math.max(1, Math.floor(safeNum(p.maxStacks, 1, 1000))),
        stackKey: String(p.stackKey || p.id || `item-passive-${index}`),
      })),
    summonName: String(item.summonName || 'ลูกน้อง').slice(0, 80),
    summonMaxCount: Math.max(1, Math.min(20, Math.floor(safeNum(item.summonMaxCount, 1, 20)))),
    summonPerUse: Math.max(1, Math.min(20, Math.floor(safeNum(item.summonPerUse, 1, 20)))),
    summonHp: Math.max(1, Math.floor(safeNum(item.summonHp, 1, 1000000000))),
    summonStrength: Math.max(0, Math.floor(safeNum(item.summonStrength, 0, 1000000000))),
    summonDurability: Math.max(0, Math.floor(safeNum(item.summonDurability, 0, 1000000000))),
    summonAgility: Math.max(0, Math.floor(safeNum(item.summonAgility, 0, 1000000000))),
    summonMagic: Math.max(0, Math.floor(safeNum(item.summonMagic, 0, 1000000000))),
    summonIsBoss: Boolean(item.summonIsBoss),
    summonSkills: (Array.isArray(item.summonSkills) ? item.summonSkills : []).slice(0, 20).map((s: any, index: number) => ({
      ...s,
      id: String(s.id || 'item-summon-skill-' + item.id + '-' + index),
      name: String(s.name || 'สกิลลูกน้อง'),
      level: Math.max(1, Math.floor(Number(s.level) || 1)),
      multiplier: Number.isFinite(Number(s.multiplier)) ? Number(s.multiplier) : 1,
      description: String(s.description || ''),
      battlePower: Math.max(0, Number(s.battlePower) || 0),
      cooldownTurns: Math.max(0, Math.floor(Number(s.cooldownTurns) || 0)),
      aiChancePercent: Math.max(0, Math.min(100, Number(s.aiChancePercent) || 0)),
    })),
    battleDrawbacks: (Array.isArray(item.battleDrawbacks) ? item.battleDrawbacks : [])
      .filter(Boolean)
      .slice(0, 20)
      .map((d) => ({
        kind: String(d.kind || 'bleeding'),
        value: safeNum(d.value, 0, 1000000),
        duration: Math.floor(safeNum(d.duration, 0, 1000)),
        chance: safeNum(d.chance, 0, 100),
        target: d.target === 'enemy' ? 'enemy' : 'self',
        label: String(d.label || d.kind || 'ข้อเสีย'),
      })),
  };

  const inventory = (character.inventory || [])
    .map(inv => {
      const sameInstance = item.instanceId
        ? String(inv.instanceId || '') === String(item.instanceId)
        : false;
      const sameLegacyId = !item.instanceId && !inv.instanceId
        ? String(inv.id || '') === String(item.id || '')
        : false;
      return (sameInstance || sameLegacyId)
        ? { ...inv, quantity: Math.max(0, Number(inv.quantity) - 1) }
        : inv;
    })
    .filter(inv => Math.max(0, Number(inv.quantity) || 0) > 0);

  let hp = Math.max(0, Number(character.hp) || 0);
  let maxHp = Math.max(1, Number(character.maxHp) || 1);
  const rawStats = character.stats || {};
  const stats: any = {
    strength: Number(rawStats.strength) || 0,
    durability: Number(rawStats.durability) || 0,
    agility: Number(rawStats.agility) || 0,
    magic: Number(rawStats.magic) || 0,
  };

  // Basic item effects. Items can also target the whole allied team.
  const itemTargetMode = normalizedItem.targetMode || 'self';
  const itemAll = [...normalizedRoom.teamA, ...normalizedRoom.teamB];
  const itemTargets = itemTargetMode === 'all_allies'
    ? itemAll.filter(u => u.team === actor.team && u.hp > 0)
    : itemTargetMode === 'all_enemies'
      ? itemAll.filter(u => u.team !== actor.team && u.hp > 0)
      : itemTargetMode === 'all_combatants'
        ? itemAll.filter(u => u.hp > 0)
        : [actor];
  if (item.effectType === 'heal_hp') {
    const flatHeal = Math.max(0, Number(normalizedItem.effectValue) || 0);
    const percentHeal = Math.min(100, Math.max(0, Number(normalizedItem.healPercent) || 0));
    const baseHeal = flatHeal + Math.round(maxHp * percentHeal / 100);
    if (itemTargets.length > 1) {
      itemTargets.forEach(target => { target.hp = Math.min(target.maxHp, target.hp + baseHeal); });
    } else {
      hp = Math.min(maxHp, hp + baseHeal);
    }
  } else if (item.effectType === 'buff_stat' && normalizedItem.targetStat) {
    const stat = String(normalizedItem.targetStat) as keyof typeof stats;
    const amount = Math.max(0, Number(normalizedItem.effectValue) || 0);
    if (itemTargets.length > 1) {
      itemTargets.forEach(target => {
        target.stats = { ...target.stats, [stat]: Math.max(0, Number((target.stats as unknown as Record<string, number>)[String(stat)]) || 0) + amount };
      });
    } else if (stat in stats) {
      stats[stat] = Math.max(0, Number(stats[stat]) || 0) + amount;
    }
  } else if (item.effectType === 'boost_max_hp') {
    const bonus = Math.max(0, Number(normalizedItem.effectValue) || 0);
    maxHp += bonus;
    hp = Math.min(maxHp, hp + bonus);
  }

  // Keep the acting character's local patch in sync after an AoE item also affected them.
  if (itemTargets.some(target => target.id === actor.id) && itemTargets.length > 1) {
    hp = Math.max(0, Number(actor.hp) || hp);
    maxHp = Math.max(1, Number(actor.maxHp) || maxHp);
    Object.assign(stats, actor.stats || {});
  }

  const itemKey = String(item.instanceId || item.id || requestedId);

  if (Array.isArray(normalizedItem.useConditions) && normalizedItem.useConditions.length) {
    const allies = [...normalizedRoom.teamA, ...normalizedRoom.teamB].filter(u => u.team === actor.team);
    const summonCount = allies.filter(u => u.type === 'bot' && String(u.sourceId || '').startsWith('summon-item:')).length;
    const failed = normalizedItem.useConditions.filter((condition: any) => condition && condition.enabled !== false).some((condition: any) => {
      const value = Number(condition.value) || 0;
      const hpPercent = actor.maxHp > 0 ? (actor.hp / actor.maxHp) * 100 : 0;
      const statValue = condition.stat && condition.stat in actor.stats ? Number((actor.stats as unknown as Record<string, number>)[String(condition.stat)]) || 0 : 0;
      switch (condition.type) {
        case 'hp_below_percent': return !(hpPercent < value);
        case 'hp_above_percent': return !(hpPercent > value);
        case 'turn_at_least': return !(currentUses + 1 >= value);
        case 'stat_at_least': return !(statValue >= value);
        case 'stat_below': return !(statValue < value);
        case 'summon_count_below': return !(summonCount < value);
        case 'summon_count_at_least': return !(summonCount >= value);
        default: return false;
      }
    });
    if (failed) throw new Error('ไม่ผ่านเงื่อนไขการใช้ไอเทม');
  }

  // Summon items create temporary allied bot combatants directly in the current battle room.
  if (item.effectType === 'summon') {
    const prefix = 'summon-item:' + actor.id + ':' + requestedId;
    const currentCount = [...normalizedRoom.teamA, ...normalizedRoom.teamB]
      .filter(unit => unit.type === 'bot' && unit.team === actor.team && String(unit.sourceId || '').startsWith(prefix + ':')).length;
    const maxCount = Math.max(1, Math.min(20, Number(normalizedItem.summonMaxCount) || 1));
    const perUse = Math.max(1, Math.min(20, Number(normalizedItem.summonPerUse) || 1));
    if (currentCount >= maxCount) throw new Error('ไอเทมนี้เสกได้สูงสุด ' + maxCount + ' ตัวในสนาม');
    const spawnCount = Math.min(perUse, maxCount - currentCount);
    const unitTemplates = Array.isArray(normalizedItem.summonUnits) ? normalizedItem.summonUnits : [];
    for (let spawnIndex = 0; spawnIndex < spawnCount; spawnIndex++) {
    const template = unitTemplates.length ? unitTemplates[(currentCount + spawnIndex) % unitTemplates.length] : undefined;
    const summonId = prefix + ':' + (currentCount + spawnIndex + 1);
    const summon: BattleCombatant = {
      id: summonId,
      sourceId: summonId,
      name: (template?.name || normalizedItem.summonName || 'ลูกน้อง') + ' #' + (currentCount + spawnIndex + 1),
      avatarUrl: template?.avatarUrl || normalizedItem.summonAvatarUrl || actor.avatarUrl || '/avatars/system.svg',
      type: 'bot',
      team: actor.team,
      stats: {
        strength: Math.max(0, Number(template?.strength ?? normalizedItem.summonStrength) || 0),
        durability: Math.max(0, Number(template?.durability ?? normalizedItem.summonDurability) || 0),
        agility: Math.max(0, Number(template?.agility ?? normalizedItem.summonAgility) || 0),
        magic: Math.max(0, Number(template?.magic ?? normalizedItem.summonMagic) || 0),
      },
      hp: Math.max(1, Number(template?.hp ?? normalizedItem.summonHp) || 1),
      maxHp: Math.max(1, Number(template?.hp ?? normalizedItem.summonHp) || 1),
      isBoss: Boolean(normalizedItem.summonIsBoss),
      skillCooldowns: {},
      skillUses: {},
      skills: Array.isArray(template?.skills)
        ? template.skills.map((s: any) => ({ ...s }))
        : (Array.isArray(normalizedItem.summonSkills) ? normalizedItem.summonSkills.map((s: any) => ({ ...s })) : []),
    } as BattleCombatant;
    if (actor.team === 'a') normalizedRoom.teamA.push(summon); else normalizedRoom.teamB.push(summon);
    normalizedRoom.log = [{
      id: 'battle-log-summon-item-' + Date.now(),
      timestamp: Date.now(),
      actorName: actor.name,
      message: '🧿 ' + actor.name + ' ใช้ "' + item.name + '" และเสก ' + summon.name + ' · HP ' + summon.hp + ' · STR ' + summon.stats.strength,
    }, ...(normalizedRoom.log || [])];
    }
  }

  // Ally revive is a targeted battle effect. The battle item menu currently
  // selects the item (not a separate target), so use the first defeated ally
  // deterministically. Never try to revive an enemy or the acting character.
  const allyToRevive = normalizedItem.reviveAlly
    ? [...(normalizedRoom.teamA.filter(u => u.team === actor.team)), ...(normalizedRoom.teamB.filter(u => u.team === actor.team))]
        .filter(u => u.id !== actor.id && u.hp <= 0)
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0]
    : undefined;
  const revivePercent = Math.min(100, Math.max(1, Number(normalizedItem.revivePercent) || 30));
  const revivedAllyHp = allyToRevive
    ? Math.max(1, Math.round(Math.max(1, Number(allyToRevive.maxHp) || 1) * revivePercent / 100))
    : 0;

  const targetOpponent = [...normalizedRoom.teamA, ...normalizedRoom.teamB]
    .filter(unit => unit.team !== actor.team && unit.hp > 0)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];

  // Item utility effects are applied here so the values saved to BattleRoom
  // are the exact values consumed by the battle engine.
  if (normalizedItem.cleanseNegative) {
    actor.adminStatusEffects = (actor.adminStatusEffects || [])
      .filter(effect => effect.mode !== 'nerf');
    actor.stunnedTurns = 0;
    actor.frozenTurns = 0;
  }
  if (normalizedItem.shieldPercent > 0) {
    actor.defenseValue = Math.max(actor.defenseValue || 0, Math.round(actor.maxHp * normalizedItem.shieldPercent / 100));
    actor.defenseTurns = Math.max(actor.defenseTurns || 0, Math.max(1, normalizedItem.shieldDuration || 1));
  }
  if (normalizedItem.statusImmunityDuration > 0) {
    actor.statusImmunityTurns = Math.max(actor.statusImmunityTurns || 0, normalizedItem.statusImmunityDuration);
  }
  if (normalizedItem.stunDuration > 0 && targetOpponent) {
    targetOpponent.stunnedTurns = Math.max(targetOpponent.stunnedTurns || 0, normalizedItem.stunDuration);
  }
  if (normalizedItem.cooldownReductionPercent > 0) {
    const factor = 1 - normalizedItem.cooldownReductionPercent / 100;
    actor.skillCooldowns = Object.fromEntries(
      Object.entries(actor.skillCooldowns || {}).map(([skillId, turns]) => [
        skillId,
        Math.max(0, Math.ceil((Number(turns) || 0) * factor)),
      ])
    );
  }

  // Apply item drawbacks immediately when the item is consumed. Each drawback rolls its own chance.
  for (const drawback of normalizedItem.battleDrawbacks || []) {
    const chance = Math.max(0, Math.min(100, Number(drawback.chance ?? 100)));
    if (chance < 100 && Math.random() * 100 >= chance) continue;
    const value = Math.max(0, Number(drawback.value) || 0);
    if (value <= 0) continue;
    switch (drawback.kind) {
      case 'bleeding':
      case 'burn':
      case 'poison':
        hp = Math.max(0, hp - Math.round(value));
        break;
      case 'damage_percent':
        hp = Math.max(0, hp - Math.round(maxHp * Math.min(100, value) / 100));
        break;
      case 'reduce_max_hp_percent': {
        const reduction = Math.min(95, value);
        maxHp = Math.max(1, Math.round(maxHp * (1 - reduction / 100)));
        hp = Math.min(hp, maxHp);
        break;
      }
      case 'reduce_defense_percent':
        stats.durability = Math.max(0, Math.round(stats.durability * (1 - Math.min(100, value) / 100)));
        break;
      case 'stun':
        actor.stunnedTurns = Math.max(Number(actor.stunnedTurns || 0), Math.max(1, Math.floor(Number(drawback.duration) || 1)));
        break;
      case 'freeze':
        actor.frozenTurns = Math.max(Number(actor.frozenTurns || 0), Math.max(1, Math.floor(Number(drawback.duration) || 1)));
        break;
      default:
        break;
    }
  }

  const actorPatch: BattleCombatant = {
    ...actor,
    stats,
    hp: Math.min(maxHp, hp),
    maxHp,
    itemDamagePercent: Math.min(1000, Math.max(0, Number(normalizedItem.battleDamagePercent) || 0)),
    itemDamageTurns: Math.max(0, Math.floor(Number(normalizedItem.battleDamageDuration) || 0)),
    itemLuckMultiplier: Math.max(1, Math.min(20, Number(normalizedItem.battleLuckMultiplier) || 1)),
    itemLuckTurns: Math.max(0, Math.floor(Number(normalizedItem.battleLuckDuration) || 0)),
    itemCriticalChancePercent: Math.max(0, Math.min(100, Number(normalizedItem.battleCriticalChancePercent) || 0)),
    itemRepeatAttackChancePercent: Math.max(0, Math.min(100, Number(normalizedItem.battleRepeatAttackChancePercent) || 0)),
    itemPassiveChanceMultiplier: Math.max(1, Math.min(20, Number(normalizedItem.battlePassiveChanceMultiplier) || 1)),
    damageReductionPercent: Math.max(0, Math.min(100, Number(normalizedItem.damageReductionPercent) || 0)),
    damageReductionTurns: Math.max(0, Math.floor(Number(normalizedItem.damageReductionDuration) || 0)),
    dodgeChancePercent: Math.max(0, Math.min(100, Number(normalizedItem.dodgeChancePercent) || 0)),
    lifestealPercent: Math.max(0, Math.min(100, Number(normalizedItem.lifestealPercent) || 0)),
    cooldownReductionPercent: Math.max(0, Math.min(100, Number(normalizedItem.cooldownReductionPercent) || 0)),
    statusImmunityTurns: Math.max(0, Math.floor(Number(normalizedItem.statusImmunityDuration) || 0)),
    shieldPercent: Math.max(0, Math.min(100, Number(normalizedItem.shieldPercent) || 0)),
    shieldTurns: Math.max(0, Math.floor(Number(normalizedItem.shieldDuration) || 0)),
  };

  // Store the item-use result in the same room state that the next turn uses.
  const nextRoom: BattleRoom = {
    ...normalizedRoom,
    teamA: normalizedRoom.teamA.map(unit => {
      if (unit.id === actor.id) return actorPatch;
      if (allyToRevive && unit.id === allyToRevive.id) {
        return { ...unit, hp: revivedAllyHp, maxHp: Math.max(1, Number(unit.maxHp) || 1) };
      }
      return { ...unit };
    }),
    teamB: normalizedRoom.teamB.map(unit => {
      if (allyToRevive && unit.id === allyToRevive.id) {
        return { ...unit, hp: revivedAllyHp, maxHp: Math.max(1, Number(unit.maxHp) || 1) };
      }
      return { ...unit };
    }),
    battleItemUses: currentUses + 1,
    log: [{
      id: 'battle-log-item-' + Date.now() + '-' + itemKey,
      timestamp: Date.now(),
      actorName: actor.name,
      message: `🧪 ${actor.name} ใช้ไอเทม "${item.name}"${allyToRevive ? ` · 🤝 ชุบ ${allyToRevive.name} ฟื้น ${revivedAllyHp} HP` : ''}${item.healPercent ? ` · ฟื้น ${item.healPercent}% Max HP` : ''}${item.battleDamagePercent ? ` · ดาเมจ +${item.battleDamagePercent}% ${item.battleDamageDuration || 0} เทิร์น` : ''}${item.battleLuckMultiplier && item.battleLuckMultiplier > 1 ? ` · 🍀 โชค ×${item.battleLuckMultiplier} ${item.battleLuckDuration || 0} เทิร์น` : ''}${item.battleCriticalChancePercent ? ` · 💥 คริ +${item.battleCriticalChancePercent}%` : ''}${item.battleRepeatAttackChancePercent ? ` · 🔁 ตีซ้ำ +${item.battleRepeatAttackChancePercent}%` : ''} · โควตาไอเทม ${currentUses + 1}/2 ครั้งในเกมนี้`,
    }, ...(normalizedRoom.log || [])],
    updatedAt: Date.now(),
  };

  const nextActor = getNextBattleActor(nextRoom, actor.id);
  nextRoom.turnActorId = nextActor?.id || actor.id;
  nextRoom.round = nextActor?.team === 'a' && actor.team === 'b'
    ? (normalizedRoom.round || 1) + 1
    : (normalizedRoom.round || 1);

  await updateCharacterFields(playerId, {
    inventory,
    hp: actorPatch.hp,
    maxHp: actorPatch.maxHp,
    stats,
  });

  if (allyToRevive && allyToRevive.type === 'player' && allyToRevive.sourceId) {
    await updateCharacterFields(allyToRevive.sourceId, {
      hp: revivedAllyHp,
      maxHp: Math.max(1, Number(allyToRevive.maxHp) || 1),
    });
  }

  await updateBattleRoom(nextRoom);
  return nextRoom;
  } finally {
    battleItemLocks.delete(lockKey);
  }
}
function getBattleCombatants(room: BattleRoom): BattleCombatant[] {
  return [...room.teamA, ...room.teamB];
}
function getNextBattleActor(room: BattleRoom, actorId: string): BattleCombatant | undefined {
  const living = getBattleCombatants(room).filter(unit => unit.hp > 0);
  if (!living.length) return undefined;
  // AGILITY is the battle SPEED stat. Highest Agility always acts next.
  const candidates = living.filter(unit => unit.id !== actorId || living.length === 1);
  return candidates.sort((a, b) => {
    const speedDiff = (Number(b.stats?.agility) || 0) - (Number(a.stats?.agility) || 0);
    if (speedDiff !== 0) return speedDiff;
    return String(a.id).localeCompare(String(b.id));
  })[0];
}

export function resolveBattleTurn(room: BattleRoom, config: BattleConfig, skill?: Skill, targetId?: string): { room: BattleRoom; result: BattleRollResult | null } {
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
  const livingOpponents = opponentTeam.filter(item => item.hp > 0);
  const requestedTarget = targetId ? livingOpponents.find(item => item.id === targetId) : undefined;
  const defender = requestedTarget || (livingOpponents.length
    ? livingOpponents[Math.floor(Math.random() * livingOpponents.length)]
    : undefined);
  if (!defender) return { room: { ...nextRoom, status: "completed", winnerTeam: actor.team }, result: null };
  const current = all.find(item => item.id === actor.id) as BattleCombatant;
  // Duration is consumed on the owner's next turn, not at the end of the
  // opponent's turn. This keeps a 1-turn effect active for the full opposing
  // turn and makes duration behavior symmetric for Team A and Team B.
  advanceAdminStatusEffects(current);
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
    const skillUses = { ...(current.skillUses || {}) };
    const skillProfile = skill ? getBattleSkillProfile(skill) : null;
    const skillConditions = skill && Array.isArray((skill as BattleBotSkill).conditions)
      ? (skill as BattleBotSkill).conditions!.filter(condition => condition?.enabled !== false)
      : [];
    if (skill && skillConditions.length) {
      const summonCount = all.filter(unit => unit.type === 'bot' && unit.team === current.team && String(unit.sourceId || '').startsWith(`summon:${current.id}:`)).length;
      const targetHpPercent = defender.maxHp > 0 ? defender.hp / defender.maxHp * 100 : 0;
      const actorHpPercent = current.maxHp > 0 ? current.hp / current.maxHp * 100 : 0;
      const conditionsMet = skillConditions.every(condition => {
        const value = Number(condition.value);
        if (!Number.isFinite(value)) return true;
        switch (condition.type) {
          case 'hp_below_percent': return actorHpPercent <= Math.max(0, Math.min(100, value));
          case 'hp_above_percent': return actorHpPercent >= Math.max(0, Math.min(100, value));
          case 'target_hp_below_percent': return targetHpPercent <= Math.max(0, Math.min(100, value));
          case 'target_hp_above_percent': return targetHpPercent >= Math.max(0, Math.min(100, value));
          case 'turn_at_least': return Number(nextRoom.round || 1) >= Math.max(1, Math.floor(value));
          case 'chance_percent': return Math.random() * 100 < Math.max(0, Math.min(100, value));
          case 'summon_count_below': return summonCount < Math.max(0, Math.floor(value));
          case 'summon_count_at_least': return summonCount >= Math.max(0, Math.floor(value));
          default: return true;
        }
      });
      if (!conditionsMet) {
        nextRoom.log.unshift({
          id: "battle-log-" + Date.now(),
          timestamp: Date.now(),
          actorName: current.name,
          message: `${current.name} ยังไม่เข้าเงื่อนไขการใช้สกิล ${skill.name}`,
        });
        return { room: nextRoom, result: null };
      }
    }
    const skillName = skill?.name || "สกิล";
    const skillId = skill ? String(skill.id ?? skill.name ?? ("skill-" + skillName)).trim() : "";
    // Check cooldown BEFORE consuming this actor's turn. A skill with 1 turn
    // remaining must wait; cooldown is reduced after the actor successfully acts.
    if (skill && skillProfile && (cooldowns[skillId] || 0) > 0) {
      return { room, result: null };
    }
    if (skill && skill.battleUseLimit === 'once_per_battle' && Number(skillUses[skillId] || 0) >= 1) {
      nextRoom.log.unshift({
        id: "battle-log-" + Date.now(),
        timestamp: Date.now(),
        actorName: current.name,
        message: current.name + " ใช้สกิล " + skill.name + " ครบโควตา 1 ครั้งต่อเกมแล้ว",
      });
      return { room: nextRoom, result: null };
    }
    current.skillCooldowns = cooldowns;
    current.skillUses = skillUses;
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
    if (current.equippedDrawbacks?.length) {
      applyBattleExtraEffects(current, current, current.equippedDrawbacks.map(effect => ({ ...effect, target: 'self' })), result);
      if (current.equippedDrawbacks.length) result.message += ' • ⚠️ ข้อเสียจากอุปกรณ์ทำงาน';
    }
    if (skillProfile) {
      if (!result) return { room: nextRoom, result: null };
      result.skillEffect = skillProfile.effect;
      result.skillPower = skillProfile.power;
      const targetMode = skill?.targetMode || 'enemy';
      const allCombatants = [...nextRoom.teamA, ...nextRoom.teamB];
      const skillAllies = allCombatants.filter(unit => unit.team === current.team && unit.hp > 0);
      const skillEnemies = allCombatants.filter(unit => unit.team !== current.team && unit.hp > 0);
      const skillTargets = targetMode === 'all_allies' ? skillAllies
        : targetMode === 'all_enemies' ? skillEnemies
        : targetMode === 'all_combatants' ? allCombatants.filter(unit => unit.hp > 0)
        : targetMode === 'self' ? [current]
        : [defender];
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
        // "percent" means battlePower itself is % of each target's Max HP.
        // Legacy skills continue to use flat HP plus optional battleStats heal_percent.
        const powerMode = skill?.battlePowerMode === 'percent' ? 'percent' : 'flat';
        const configuredHealPercent = powerMode === 'percent'
          ? Math.max(0, Math.min(100, Number(skillProfile.power) || 0))
          : 0;
        const legacyHealPercent = Math.max(0, Math.min(100, getSkillStat(skill, 'heal_percent')));
        const healPercent = Math.max(configuredHealPercent, legacyHealPercent);
        const healTargets = skillTargets.filter(unit => unit.hp > 0);
        if (healTargets.length > 1) {
          let totalHealed = 0;
          healTargets.forEach(unit => {
            const healMultiplier = Math.max(0, Number(unit.passiveTraits?.healingReceivedMultiplier) || 1);
            const flatHeal = powerMode === 'percent' ? 0 : Math.max(0, skillProfile.power * healMultiplier);
            const percentHeal = healPercent > 0 ? Math.round(unit.maxHp * healPercent / 100 * healMultiplier) : 0;
            const before = unit.hp;
            unit.hp = Math.min(unit.maxHp, unit.hp + flatHeal + percentHeal);
            totalHealed += Math.max(0, unit.hp - before);
          });
          result.heal += totalHealed;
          result.message += ` • ใช้สกิล ${skillName} ฮีลหมู่ ${healTargets.length} คน รวม +${totalHealed} HP`;
        } else {
          const healTarget = healTargets[0] || current;
          const healMultiplier = Math.max(0, Number(healTarget.passiveTraits?.healingReceivedMultiplier) || 1);
          const flatHeal = powerMode === 'percent' ? 0 : Math.max(0, skillProfile.power * healMultiplier);
          const percentHeal = healPercent > 0 ? Math.round(healTarget.maxHp * healPercent / 100 * healMultiplier) : 0;
          const totalHeal = flatHeal + percentHeal;
          const beforeHeal = healTarget.hp;
          healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + totalHeal);
          result.heal += Math.max(0, healTarget.hp - beforeHeal);
          result.message += ` • ใช้สกิล ${skillName} ฟื้นฟู ${totalHeal} HP${healPercent > 0 ? ` (${healPercent}% Max HP)` : ''}`;
        }
      } else if (skillProfile.effect === "buff_stat") {
        const stat = skill?.buffStat || 'strength';
        const amount = Math.max(0, Number(skill?.buffAmount) || skillProfile.power);
        const buffTargets = skillTargets.filter(unit => unit.hp > 0);
        buffTargets.forEach(unit => {
          unit.stats = { ...unit.stats, [stat]: Math.max(0, Number(unit.stats?.[stat]) || 0) + amount };
        });
        result.message += ` • ใช้สกิล ${skillName} บัพ ${stat.toUpperCase()} +${amount} ให้ ${buffTargets.length > 1 ? 'ทีม' : buffTargets[0]?.name || current.name}` + (skill?.buffDuration ? ` ${skill.buffDuration} เทิร์น` : '');
      } else if (skillProfile.effect === "defense") {
        // A defense skill can now be configured as either a flat HP shield
        // or a percentage of the caster's Max HP. Legacy skills remain flat.
        const defenseMode = skill?.battlePowerMode === 'percent' ? 'percent' : 'flat';
        const rawDefense = Math.max(0, Number(skillProfile.power) || 0);
        const defensePower = defenseMode === 'percent'
          ? Math.round(current.maxHp * Math.min(100, rawDefense) / 100)
          : Math.round(rawDefense + getSkillStat(skill, 'defense_power'));
        current.defenseValue = defensePower;
        current.defenseTurns = skillProfile.duration;
        result.message += defenseMode === 'percent'
          ? ` • ใช้สกิล ${skillName} สร้างโล่ ${Math.min(100, rawDefense)}% Max HP = ${defensePower} HP เป็นเวลา ${skillProfile.duration} เทิร์น`
          : ` • ใช้สกิล ${skillName} สร้างโล่ ${defensePower} HP เป็นเวลา ${skillProfile.duration} เทิร์น`;
      } else if (skillProfile.effect === "reflect" || skillProfile.effect === "reflect_no_damage") {
        current.reflectPercent = Math.min(100, skillProfile.power);
        current.reflectTurns = skillProfile.duration;
        if (skillProfile.effect === "reflect_no_damage") {
          current.reflectNoDamageTurns = skillProfile.duration;
          result.message += ` • ใช้สกิล ${skillName} สะท้อนดาเมจ ${current.reflectPercent}% และไม่รับดาเมจ เป็นเวลา ${skillProfile.duration} เทิร์น`;
        } else {
          current.reflectNoDamageTurns = 0;
          result.message += ` • ใช้สกิล ${skillName} สะท้อนดาเมจ ${current.reflectPercent}% เป็นเวลา ${skillProfile.duration} เทิร์น`;
        }
      } else if (skillProfile.effect === "stun") {
        defender.stunnedTurns = Math.max(1, Math.min(99, Math.floor(Number(skillProfile.duration) || 1)));
        result.message += ` • ใช้สกิล ${skillName} ทำให้ ${defender.name} ติดสตัน ${skillProfile.duration} เทิร์น`;
      } else if (skillProfile.effect === "immortal") {
        current.immortalTurns = skillProfile.duration;
        result.message += ` • ใช้สกิล ${skillName} — อมตะ ${skillProfile.duration} เทิร์น`;
      } else if (skillProfile.effect === "damage_reduction") {
        current.damageReductionPercent = Math.min(100, skillProfile.power);
        current.damageReductionTurns = skillProfile.duration;
        result.message += ` • ใช้สกิล ${skillName} — ลดความเสียหาย ${current.damageReductionPercent}% เป็นเวลา ${skillProfile.duration} เทิร์น`;
      } else if (skillProfile.effect === "summon") {
        const summonName = String(skill?.summonName || 'ลูกน้อง').trim() || 'ลูกน้อง';
        const maxCount = Math.max(1, Math.min(20, Math.round(Number(skill?.summonMaxCount) || 1)));
        const perUse = Math.max(1, Math.min(20, Math.round(Number(skill?.summonPerUse) || 1)));
        const prefix = `summon:${current.id}:${String(skill?.id || skill?.name || 'skill')}`;
        const currentCount = getBattleCombatants(nextRoom).filter(unit => unit.type === 'bot' && unit.team === current.team && String(unit.sourceId || '').startsWith(prefix + ':')).length;
        if (currentCount >= maxCount) {
          result.message += ` • 🧿 ${skillName} เรียกลูกน้องไม่ได้ — ครบจำนวนสูงสุด ${maxCount} ตัวแล้ว`;
        } else {
          const unitTemplates = Array.isArray(skill?.summonUnits) ? skill.summonUnits : [];
          const spawnCount = Math.min(perUse, maxCount - currentCount);
          for (let spawnIndex = 0; spawnIndex < spawnCount; spawnIndex += 1) {
            const template = unitTemplates.length ? unitTemplates[(currentCount + spawnIndex) % unitTemplates.length] : undefined;
            const summonHp = Math.max(1, Math.round(Number(template?.hp ?? skill?.summonHp) || 10));
            const summonStrength = Math.max(0, Math.round(Number(template?.strength ?? skill?.summonStrength ?? skill?.summonDamage) || skillProfile.power || 1));
            const summonDurability = Math.max(0, Math.round(Number(template?.durability ?? skill?.summonDurability) || 0));
            const summonAgility = Math.max(0, Math.round(Number(template?.agility ?? skill?.summonAgility) || 1));
            const summonMagic = Math.max(0, Math.round(Number(template?.magic ?? skill?.summonMagic) || 0));
            // ถ้ามีการกำหนด skills ของลูกน้องไว้แล้ว ต้องใช้ค่าของลูกน้องตรง ๆ
            // แม้จะเป็น [] เพราะ [] หมายถึงผู้ใช้ลบสกิลทั้งหมดแล้ว
            // ห้าม fallback กลับไปใช้ summonSkills ของสกิลแม่ ไม่เช่นนั้นสกิลที่ลบจะเด้งกลับมา
            const rawSummonSkills = Array.isArray(template?.skills)
              ? template.skills
              : (Array.isArray(skill?.summonSkills) ? skill.summonSkills : []);
            const summonSkills = rawSummonSkills.filter(Boolean).map((item: any, skillIndex: number) => ({
              ...item,
              id: String(item.id ?? `minion-skill-${current.id}-${skillIndex}`),
              name: String(item.name || 'สกิลลูกน้อง'),
              battleEffect: item.battleEffect || item.effect || 'damage',
              battlePower: Number.isFinite(Number(item.battlePower)) ? Number(item.battlePower) : 0,
              cooldownTurns: Math.max(0, Math.floor(Number(item.cooldownTurns) || 0)),
              aiChancePercent: Math.max(0, Math.min(100, Number(item.aiChancePercent ?? 100) || 0)),
              battleEffectDuration: Math.max(1, Math.floor(Number(item.battleEffectDuration) || 1)),
            }));
            const ordinal = currentCount + spawnIndex + 1;
            const summonId = `${prefix}:${ordinal}`;
            const summoned: BattleCombatant = {
              id: summonId,
              sourceId: summonId,
              name: `${String(template?.name || summonName)} #${ordinal}`,
              avatarUrl: template?.avatarUrl || skill?.summonAvatarUrl || current.avatarUrl || '/avatars/system.svg',
              type: 'bot',
              team: current.team,
              stats: { strength: summonStrength, durability: summonDurability, agility: summonAgility, magic: summonMagic },
              hp: summonHp,
              maxHp: summonHp,
              isBoss: Boolean(skill?.summonIsBoss),
              skillCooldowns: {},
              skillUses: {},
              skills: summonSkills,
            } as BattleCombatant;
            if (current.team === 'a') nextRoom.teamA.push(summoned); else nextRoom.teamB.push(summoned);
          }
          result.message += ` • 🧿 ${current.name} เสกลูกน้อง ${spawnCount} ตัว (รวม ${currentCount + spawnCount}/${maxCount})`;
        }
      } else if (skillProfile.effect === "copy_ability") {
        const sourceSkill = defender.skills?.[0];
        if (defender.passiveTraits?.copyImmunity) {
          result.message += ` • 🚫 ${defender.name} มี Passive กัน Copy ความสามารถ`;
        } else if (sourceSkill) {
          current.copiedAbility = { ...sourceSkill };
          current.copiedAbilityTurns = skillProfile.duration;
          if (sourceSkill.passiveEffects?.length) current.activeSkillPassives = [...(current.activeSkillPassives || []), ...sourceSkill.passiveEffects.map(effect => ({ ...effect, id: `copy:${current.id}:${effect.id}`, name: `คัดลอก: ${effect.name}` }))];
          result.message += ` • 🧬 ${skillName} คัดลอกความสามารถ "${sourceSkill.name}" เป็นเวลา ${skillProfile.duration} เทิร์น`;
        } else {
          result.message += ` • 🧬 ${skillName} ไม่พบความสามารถให้คัดลอก`;
        }
      }
      // Apply the configurable multi-effect modifiers from the skill editor.
      // These are intentionally resolved here so minion skills use the same rules as
      // normal battle skills: each modifier has its own chance/value/duration.
      if (skill?.skillModifiers?.length) {
        for (const modifier of skill.skillModifiers) {
          const chance = getBattleChance(current, Math.max(0, Math.min(100, Number(modifier.chance ?? 100))));
          if (Math.random() * 100 >= chance) continue;
          const modifierTargets = targetMode === 'all_allies' ? skillAllies
            : targetMode === 'all_enemies' ? skillEnemies
            : targetMode === 'all_combatants' ? allCombatants.filter(unit => unit.hp > 0)
            : targetMode === 'self' ? [current]
            : skillTargets;
          const value = Math.max(0, Number(modifier.value) || 0);
          const duration = Math.max(1, Math.floor(Number(modifier.duration) || 1));
          if (modifier.kind === 'shield') {
            modifierTargets.forEach(target => {
              target.defenseValue = Math.max(0, Number(target.defenseValue) || 0) + value;
              target.defenseTurns = Math.max(target.defenseTurns || 0, duration);
            });
            result.message += ` • 🛡️ ${modifier.label || 'โล่'} +${value} HP เป็นเวลา ${duration} เทิร์น`;
          } else if ((modifier.kind === 'buff' || modifier.kind === 'debuff') && modifier.stat) {
            modifierTargets.forEach(target => {
              const delta = modifier.kind === 'buff' ? value : -value;
              target.stats = { ...target.stats, [modifier.stat!] : Math.max(0, (Number(target.stats?.[modifier.stat!]) || 0) + delta) };
              target.skillStatModifiers = [...(target.skillStatModifiers || []), {
                id: `skill-mod-${modifier.id}-${Date.now()}-${target.id}`,
                stat: modifier.stat!,
                delta,
                remaining: duration,
              }];
            });
            result.message += ` • ${modifier.kind === 'buff' ? '✨' : '⚠️'} ${modifier.label || (modifier.kind === 'buff' ? 'บัฟ' : 'ดีบัฟ')} ${modifier.stat.toUpperCase()} ${modifier.kind === 'buff' ? '+' : '-'}${value} เป็นเวลา ${duration} เทิร์น`;
          } else if (modifier.kind === 'status' && modifier.status) {
            const extraKind = modifier.status as BattleExtraEffect['kind'];
            const supported: BattleExtraEffect['kind'][] = ['bleeding','burn','poison','freeze','stun','regen','reduce_max_hp_percent','reduce_defense_percent','damage_percent','heal_percent','shield','reflect','damage_reduction'];
            if (supported.includes(extraKind)) {
              modifierTargets.forEach(target => { if (result) applyBattleExtraEffects(current, target, [{ kind: extraKind, value, duration, chance: 100, target: target.id === current.id ? 'self' : 'enemy', label: modifier.label || modifier.status }], result); });
            } else {
              result.message += ` • 💫 ${modifier.label || modifier.status} ${duration} เทิร์น`;
            }
          } else if (modifier.kind === 'cleanse') {
            modifierTargets.forEach(target => { target.adminStatusEffects = []; target.stunnedTurns = 0; target.frozenTurns = 0; });
            result.message += ` • 🧼 ${modifier.label || 'ล้างสถานะ'}`;
          }
        }
      }
      if (skill?.battleEffects?.length) {
        const statusChanceBonus = getSkillStat(skill, 'status_chance_percent');
        // Void weapon singularity 4 previously inherited a legacy status_duration=99
        // value. That value is a sentinel/old data value, not a +99-turn bonus.
        // For this skill only, use each effect's configured duration directly so
        // bleeding/burn/poison/freeze/stun respect the duration set in Skill Settings.
        const isVoidWeaponSingularity4 = String(skill.name || '').trim().toLowerCase() === 'void weapon singularity 4';
        const rawDurationBonus = Math.max(0, Math.round(getSkillStat(skill, 'status_duration')));
        const durationBonus = isVoidWeaponSingularity4 && rawDurationBonus >= 99 ? 0 : rawDurationBonus;
        const adjustedEffects = skill.battleEffects.map(effect => ({
          ...effect,
          chance: effect.chance == null ? Math.min(100, 100 + statusChanceBonus) : Math.min(100, Math.max(0, Number(effect.chance) + statusChanceBonus)),
          duration: Math.max(1, Math.min(99, Math.round((Number(effect.duration) || 1) + durationBonus))),
        }));
        applyBattleExtraEffects(current, defender, adjustedEffects, result);
      }
      if (skill?.battleDrawbacks?.length) {
        applyBattleExtraEffects(current, current, skill.battleDrawbacks.map(effect => ({ ...effect, target: 'self' })), result);
        result.message += ` • ⚠️ ข้อเสียของสกิล ${skillName} ทำงาน`;
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
          for (; repeatsDone < maxRepeats; repeatsDone += 1) {
            if (Math.random() * 100 >= repeatChance) break;
            const repeat = rollBattleAttack(current, defender, diceConfig);
            result.damage += repeat.damage;
            result.heal += repeat.heal;
            result.message += ` • 🔁 ตีซ้ำรอบที่ ${repeatsDone + 1} (${repeatChance}%) +${repeat.damage} ดาเมจ`;
          }
          if (repeatsDone === 0) {
            result.message += ` • ❌ ตีซ้ำไม่ทำงาน (${Number(repeatChance.toFixed(1))}%)`;
          }
        }
        skillUses[skillId] = Math.max(0, Number(skillUses[skillId] || 0)) + 1;
        current.skillUses = skillUses;
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
        for (; repeatsDone < maxRepeats; repeatsDone += 1) {
          if (Math.random() * 100 >= repeatChance) break;
          const repeat = rollBattleAttack(current, defender, diceConfig);
          result.damage += repeat.damage;
          result.heal += repeat.heal;
          result.message += ` • 🔁 ไอเทมติดตัวตีซ้ำรอบที่ ${repeatsDone + 1} (${repeatChance}%) +${repeat.damage} ดาเมจ`;
        }
        if (repeatsDone === 0) {
          result.message += ` • ❌ ตีซ้ำไม่ทำงาน (${Number(repeatChance.toFixed(1))}%)`;
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
      if (defender.immortalTurns && defender.immortalTurns > 0) {
        result.message += ` • ♾️ ${defender.name} อมตะ — ไม่ได้รับดาเมจ`;
        result.damage = 0;
      }
      if (defender.dodgeChancePercent && Math.random() * 100 < defender.dodgeChancePercent) {
        result.message += ` • 🍃 ${defender.name} หลบหลีกสำเร็จ ${defender.dodgeChancePercent}%`;
        result.damage = 0;
      }
      const reductionPercent = defender.damageReductionTurns && defender.damageReductionTurns > 0 ? Math.min(100, Math.max(0, Number(defender.damageReductionPercent) || 0)) : 0;
      // Apply skill damage reduction exactly once. getAdminIncomingDamageMultiplier
      // also knows about this state, so do not multiply it a second time here.
      if (reductionPercent > 0) {
        result.damage = Math.max(0, Math.round(result.damage * (1 - reductionPercent / 100)));
        result.message += ` • 🛡️ ลดความเสียหาย ${reductionPercent}%`;
      }
      const damageAfterStatus = Math.max(0, Math.round(result.damage * getAdminIncomingDamageMultiplier(defender)));
      const statusBlocked = Math.max(0, result.damage - damageAfterStatus);
      const statDefenseReduction = getDefenseStatDamageReduction(defender.stats?.durability);
      const damageAfterStatDefense = Math.max(0, Math.round(damageAfterStatus * (1 - statDefenseReduction / 100)));
      const statDefenseBlocked = Math.max(0, damageAfterStatus - damageAfterStatDefense);
      const blocked = Math.min(damageAfterStatDefense, defender.defenseTurns ? (defender.defenseValue || 0) : 0);
      const finalDamageBeforeReflectImmunity = Math.max(0, damageAfterStatDefense - blocked);
      const reflectNoDamage = Boolean(defender.reflectNoDamageTurns && defender.reflectNoDamageTurns > 0);
      const finalDamage = reflectNoDamage ? 0 : finalDamageBeforeReflectImmunity;
      if (statusBlocked > 0) result.message += ` • สถานะลดดาเมจ ${statusBlocked}`;
      if (statDefenseReduction > 0) result.message += ` • 🛡️ Defense ${Number(defender.stats?.durability) || 0} ลดดาเมจ ${statDefenseReduction}%`;
      defender.hp = Math.max(0, defender.hp - finalDamage);
      if (finalDamage > 0 && current.lifestealPercent) {
        const restored = Math.max(0, Math.round(finalDamage * Math.min(100, Math.max(0, current.lifestealPercent)) / 100));
        current.hp = Math.min(current.maxHp, current.hp + restored);
        if (restored > 0) result.message += ` • 🩸 ดูดเลือด +${restored} HP`;
      }
      if (blocked > 0) {
        result.message += ` • ป้องกันไว้ ${blocked}`;
        defender.defenseTurns = 0;
        defender.defenseValue = 0;
      }
      const adminReflectPercent = getAdminReflectPercent(defender);
      const reflectPercent = defender.passiveTraits?.reflectImmunity ? 0 : Math.max(defender.reflectTurns && defender.reflectPercent ? defender.reflectPercent : 0, adminReflectPercent);
      if (defender.passiveTraits?.reflectImmunity && adminReflectPercent > 0) result.message += ` • 🛡️ ${defender.name} ต้านความเสียหายสะท้อน`;
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
      const appliedTrueDamage = defender.immortalTurns && defender.immortalTurns > 0 ? 0 : Math.min(defender.hp, Math.max(0, Math.round(result.trueDamage || 0)));
      if (defender.immortalTurns && defender.immortalTurns > 0) result.message += ` • ♾️ ${defender.name} อมตะ — กัน True Damage ด้วย`;
      defender.hp = Math.max(0, defender.hp - appliedTrueDamage);
      result.message += ` • 💠 True Damage ${appliedTrueDamage}`;
      result.trueDamage = appliedTrueDamage;
    }
    if (result.heal > 0 && !['all_allies','all_combatants'].includes(String(skill?.targetMode || 'enemy'))) {
      const healMultiplier = Math.max(0, Number(current.passiveTraits?.healingReceivedMultiplier) || 1);
      current.hp = Math.min(current.maxHp, current.hp + Math.round(result.heal * healMultiplier));
    }
    if (result.face.effect === "stun" && defender.hp > 0) defender.stunnedTurns = 1;
    nextRoom.log.unshift({
      id: "battle-log-" + Date.now(),
      timestamp: Date.now(),
      actorName: current.name,
      targetName: defender.name,
      actorType: current.type,
      targetType: defender.type,
      message: "⚔️ " + current.name + " → " + defender.name + " | " + result.message + (result.face.effect === "stun" ? " และทำให้เป้าหมายติดสตัน" : ""),
      roll: result.roll,
      damage: result.damage,
      effect: result.face.effect
    });
  }
  const remainingOpponent = opponentTeam.filter(item => item.hp > 0);
  if (remainingOpponent.length === 0) {
    // Random PVE is a three-stage gauntlet. Defeating an enemy does NOT
    // complete the room until all three prepared enemies are defeated.
    // The reward settlement watcher only sees a completed room, so this also
    // guarantees that losing at any stage yields no reward.
    if (nextRoom.mode === "random" && actor.team === "a" && (nextRoom.randomBattleQueue || []).length > 0) {
      const queue = [...(nextRoom.randomBattleQueue || [])];
      const nextEnemy = queue.shift()!;
      const stage = Math.max(1, Number(nextRoom.randomBattleStage) || 1) + 1;
      nextRoom.randomBattleQueue = [];
      nextRoom.randomBattleStage = stage;
      // เมื่อ Admin/ผู้เล่นเลือกศัตรูมากกว่า 1 ตัว ให้ศัตรูที่เหลือเข้าพร้อมกัน
      // ไม่ต้องรอให้ตัวก่อนหน้าตายทีละตัวเหมือนระบบคิวเดิม
      nextRoom.teamB = queue.map((enemy) => ({
        ...enemy,
        skillCooldowns: { ...(enemy.skillCooldowns || {}) },
        skillUses: { ...(enemy.skillUses || {}) },
      }));
      nextRoom.status = "active";
      nextRoom.winnerTeam = undefined;
      nextRoom.turnActorId = current.id;
      nextRoom.log.unshift({
        id: "battle-log-" + Date.now(),
        timestamp: Date.now(),
        actorName: "SYSTEM",
        message: "🎲 กำจัดศัตรูตัวแรกแล้ว — ศัตรูที่เลือกไว้ที่เหลือ " + queue.length + " ตัวเข้าสนามพร้อมกัน: " + queue.map((enemy) => enemy.name).join(", "),
      });
      return { room: nextRoom, result };
    }
    nextRoom.status = "completed";
    nextRoom.winnerTeam = actor.team;
    nextRoom.turnActorId = current.id;
    return { room: nextRoom, result };
  }
  const nextActor = getNextBattleActor(nextRoom, current.id);
  nextRoom.turnActorId = nextActor?.id || current.id;
  nextRoom.round = (nextRoom.round || 1) + (nextActor?.team === "a" && current.team === "b" ? 1 : 0);
  return { room: nextRoom, result };
}