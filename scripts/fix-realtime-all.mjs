import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('src/services/characterService.ts');
let source = fs.readFileSync(file, 'utf8');

// Shared FIFO queues: every collection/document is written in order. Firestore's
// realtime listener may deliver optimistic/cache/server snapshots in between writes,
// so serializing writes is the first line of defense against old data winning.
const helper = `
// Global realtime write queues. Writes for the same document are serialized, while
// different documents can still update independently.
const realtimeWriteQueues = new Map<string, Promise<void>>();
function enqueueRealtimeWrite(key: string, write: () => Promise<void>): Promise<void> {
  const previous = realtimeWriteQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(write);
  realtimeWriteQueues.set(key, next);
  return next.finally(() => {
    if (realtimeWriteQueues.get(key) === next) realtimeWriteQueues.delete(key);
  });
}
`;
if (!source.includes('const realtimeWriteQueues = new Map<string, Promise<void>>();')) {
  const anchor = 'const characterWriteQueues = new Map<string, Promise<void>>();\n';
  if (!source.includes(anchor)) throw new Error('realtime queue anchor not found');
  source = source.replace(anchor, helper + '\n' + anchor);
}

// Replace battle subscriptions with listeners that treat an empty server snapshot as
// authoritative (the old code ignored empty snapshots and resurrected deleted data).
const battleConfigOld = `export function subscribeToBattleConfig(callback: (config: BattleConfig) => void) {
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
}`;
const battleConfigNew = `export function subscribeToBattleConfig(callback: (config: BattleConfig) => void) {
  callback(localBattleConfig);
  battleConfigListeners.add(callback);
  try {
    const ref = doc(db, BATTLE_CONFIG_COLLECTION, "main");
    const unsub = onSnapshot(ref, { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) return;
      if (snapshot.exists()) {
        const serverConfig = { ...DEFAULT_BATTLE_CONFIG, ...snapshot.data(), id: "main" } as BattleConfig;
        if (pendingBattleConfig && valuesMatch(serverConfig, pendingBattleConfig)) pendingBattleConfig = null;
        localBattleConfig = pendingBattleConfig || serverConfig;
      } else if (!pendingBattleConfig) {
        localBattleConfig = DEFAULT_BATTLE_CONFIG;
      }
      saveBattleLocal();
      notifyBattleConfig();
    }, () => notifyBattleConfig());
    return () => { battleConfigListeners.delete(callback); unsub(); };
  } catch (err) {
    battleConfigListeners.delete(callback);
    return () => {};
  }
}`;
if (source.includes(battleConfigOld)) source = source.replace(battleConfigOld, battleConfigNew);

const battleBotsOld = `export function subscribeToBattleBots(callback: (bots: BattleBot[]) => void) {
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
}`;
const battleBotsNew = `export function subscribeToBattleBots(callback: (bots: BattleBot[]) => void) {
  callback(localBattleBots);
  battleBotListeners.add(callback);
  try {
    return onSnapshot(collection(db, BATTLE_BOTS_COLLECTION), { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) return;
      localBattleBots = snapshot.docs.map(item => ({ ...item.data(), id: item.id } as BattleBot));
      saveBattleLocal();
      notifyBattleBots();
    }, () => notifyBattleBots());
  } catch (err) {
    battleBotListeners.delete(callback);
    return () => {};
  }
}`;
if (source.includes(battleBotsOld)) source = source.replace(battleBotsOld, battleBotsNew);

const battleRoomsOld = `export function subscribeToBattleRooms(callback: (rooms: BattleRoom[]) => void) {
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
}`;
const battleRoomsNew = `export function subscribeToBattleRooms(callback: (rooms: BattleRoom[]) => void) {
  callback(localBattleRooms);
  battleRoomListeners.add(callback);
  try {
    return onSnapshot(collection(db, BATTLE_ROOMS_COLLECTION), { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) return;
      localBattleRooms = snapshot.docs
        .map(item => ({ ...item.data(), id: item.id } as BattleRoom))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      saveBattleLocal();
      notifyBattleRooms();
    }, () => notifyBattleRooms());
  } catch (err) {
    battleRoomListeners.delete(callback);
    return () => {};
  }
}`;
if (source.includes(battleRoomsOld)) source = source.replace(battleRoomsOld, battleRoomsNew);

// Add pending battle maps before the battle listener declarations.
const battlePendingAnchor = `const battleConfigListeners = new Set<(config: BattleConfig) => void>();`;
if (!source.includes('const pendingBattleConfig:')) {
  source = source.replace(battlePendingAnchor, `let pendingBattleConfig: BattleConfig | null = null;
const pendingBattleBots = new Map<string, BattleBot>();
const pendingBattleBotDeletes = new Set<string>();
const pendingBattleRooms = new Map<string, BattleRoom>();
const pendingBattleRoomDeletes = new Set<string>();

${battlePendingAnchor}`);
}

// Realtime-safe battle writes.
const saveBattleConfigOld = `export async function saveBattleConfig(config: BattleConfig): Promise<void> {
  const next = { ...config, id: "main", updatedAt: Date.now() };
  localBattleConfig = next;
  saveBattleLocal();
  notifyBattleConfig();
  await setDoc(doc(db, BATTLE_CONFIG_COLLECTION, "main"), sanitizeForFirestore(next));
}`;
const saveBattleConfigNew = `export async function saveBattleConfig(config: BattleConfig): Promise<void> {
  const next = { ...config, id: "main", updatedAt: Math.max(Date.now(), (localBattleConfig.updatedAt || 0) + 1) };
  pendingBattleConfig = next;
  localBattleConfig = next;
  saveBattleLocal();
  notifyBattleConfig();
  try {
    await enqueueRealtimeWrite('battle_config/main', async () => {
      await setDoc(doc(db, BATTLE_CONFIG_COLLECTION, "main"), sanitizeForFirestore(next));
    });
    if (pendingBattleConfig === next) pendingBattleConfig = null;
  } catch (err) {
    console.error('Failed to save battle config:', err);
    throw err;
  }
}`;
if (source.includes(saveBattleConfigOld)) source = source.replace(saveBattleConfigOld, saveBattleConfigNew);

const saveBattleBotOld = `export async function saveBattleBot(bot: BattleBot): Promise<void> {
  const id = bot.id || "bot-" + Date.now();
  const next = { ...bot, id, createdAt: bot.createdAt || Date.now(), updatedAt: Date.now() };
  localBattleBots = [next, ...localBattleBots.filter(item => item.id !== id)];
  saveBattleLocal();
  notifyBattleBots();
  await setDoc(doc(db, BATTLE_BOTS_COLLECTION, id), sanitizeForFirestore(next));
}`;
const saveBattleBotNew = `export async function saveBattleBot(bot: BattleBot): Promise<void> {
  const id = bot.id || "bot-" + Date.now();
  const next = { ...bot, id, createdAt: bot.createdAt || Date.now(), updatedAt: Math.max(Date.now(), (localBattleBots.find(item => item.id === id)?.updatedAt || 0) + 1) };
  pendingBattleBots.set(id, next);
  pendingBattleBotDeletes.delete(id);
  localBattleBots = [next, ...localBattleBots.filter(item => item.id !== id)];
  saveBattleLocal();
  notifyBattleBots();
  await enqueueRealtimeWrite('battle_bot/' + id, async () => {
    await setDoc(doc(db, BATTLE_BOTS_COLLECTION, id), sanitizeForFirestore(next));
  });
  if (pendingBattleBots.get(id) === next) pendingBattleBots.delete(id);
}`;
if (source.includes(saveBattleBotOld)) source = source.replace(saveBattleBotOld, saveBattleBotNew);

const deleteBattleBotOld = `export async function deleteBattleBot(botId: string): Promise<void> {
  localBattleBots = localBattleBots.filter(bot => bot.id !== botId);
  saveBattleLocal();
  notifyBattleBots();
  await deleteDoc(doc(db, BATTLE_BOTS_COLLECTION, botId));
}`;
const deleteBattleBotNew = `export async function deleteBattleBot(botId: string): Promise<void> {
  pendingBattleBotDeletes.add(botId);
  pendingBattleBots.delete(botId);
  localBattleBots = localBattleBots.filter(bot => bot.id !== botId);
  saveBattleLocal();
  notifyBattleBots();
  await enqueueRealtimeWrite('battle_bot/' + botId, async () => {
    await deleteDoc(doc(db, BATTLE_BOTS_COLLECTION, botId));
  });
}`;
if (source.includes(deleteBattleBotOld)) source = source.replace(deleteBattleBotOld, deleteBattleBotNew);

const createBattleRoomOld = `export async function createBattleRoom(room: BattleRoom): Promise<string> {
  const id = room.id || "battle-" + Date.now();
  const next = { ...room, id, createdAt: room.createdAt || Date.now(), updatedAt: Date.now() };
  localBattleRooms = [next, ...localBattleRooms.filter(item => item.id !== id)];
  saveBattleLocal();
  notifyBattleRooms();
  await setDoc(doc(db, BATTLE_ROOMS_COLLECTION, id), sanitizeForFirestore(next));
  return id;
}`;
const createBattleRoomNew = `export async function createBattleRoom(room: BattleRoom): Promise<string> {
  const id = room.id || "battle-" + Date.now();
  const next = { ...room, id, createdAt: room.createdAt || Date.now(), updatedAt: Math.max(Date.now(), (localBattleRooms.find(item => item.id === id)?.updatedAt || 0) + 1) };
  pendingBattleRooms.set(id, next);
  pendingBattleRoomDeletes.delete(id);
  localBattleRooms = [next, ...localBattleRooms.filter(item => item.id !== id)];
  saveBattleLocal();
  notifyBattleRooms();
  await enqueueRealtimeWrite('battle_room/' + id, async () => {
    await setDoc(doc(db, BATTLE_ROOMS_COLLECTION, id), sanitizeForFirestore(next));
  });
  if (pendingBattleRooms.get(id) === next) pendingBattleRooms.delete(id);
  return id;
}`;
if (source.includes(createBattleRoomOld)) source = source.replace(createBattleRoomOld, createBattleRoomNew);

const updateBattleRoomOld = `export async function updateBattleRoom(room: BattleRoom): Promise<void> {
  const next = { ...room, updatedAt: Date.now() };
  localBattleRooms = [next, ...localBattleRooms.filter(item => item.id !== next.id)];
  saveBattleLocal();
  notifyBattleRooms();
  await setDoc(doc(db, BATTLE_ROOMS_COLLECTION, next.id), sanitizeForFirestore(next));
}`;
const updateBattleRoomNew = `export async function updateBattleRoom(room: BattleRoom): Promise<void> {
  const next = { ...room, updatedAt: Math.max(Date.now(), (localBattleRooms.find(item => item.id === room.id)?.updatedAt || 0) + 1) };
  pendingBattleRooms.set(next.id, next);
  pendingBattleRoomDeletes.delete(next.id);
  localBattleRooms = [next, ...localBattleRooms.filter(item => item.id !== next.id)];
  saveBattleLocal();
  notifyBattleRooms();
  await enqueueRealtimeWrite('battle_room/' + next.id, async () => {
    await setDoc(doc(db, BATTLE_ROOMS_COLLECTION, next.id), sanitizeForFirestore(next));
  });
  if (pendingBattleRooms.get(next.id) === next) pendingBattleRooms.delete(next.id);
}`;
if (source.includes(updateBattleRoomOld)) source = source.replace(updateBattleRoomOld, updateBattleRoomNew);

const deleteBattleRoomOld = `export async function deleteBattleRoom(roomId: string): Promise<void> {
  localBattleRooms = localBattleRooms.filter(room => room.id !== roomId);
  saveBattleLocal();
  notifyBattleRooms();
  await deleteDoc(doc(db, BATTLE_ROOMS_COLLECTION, roomId));
}`;
const deleteBattleRoomNew = `export async function deleteBattleRoom(roomId: string): Promise<void> {
  pendingBattleRoomDeletes.add(roomId);
  pendingBattleRooms.delete(roomId);
  localBattleRooms = localBattleRooms.filter(room => room.id !== roomId);
  saveBattleLocal();
  notifyBattleRooms();
  await enqueueRealtimeWrite('battle_room/' + roomId, async () => {
    await deleteDoc(doc(db, BATTLE_ROOMS_COLLECTION, roomId));
  });
}`;
if (source.includes(deleteBattleRoomOld)) source = source.replace(deleteBattleRoomOld, deleteBattleRoomNew);

// Add pending-aware merge to battle room/bot listeners. Replace the just-created simple
// assignments with merges so a local optimistic update cannot be painted over by a stale
// server event.
source = source.replace(
  `localBattleBots = snapshot.docs.map(item => ({ ...item.data(), id: item.id } as BattleBot));`,
  `localBattleBots = snapshot.docs.map(item => ({ ...item.data(), id: item.id } as BattleBot)).filter(item => !pendingBattleBotDeletes.has(item.id));
      pendingBattleBots.forEach((pending, id) => {
        localBattleBots = [pending, ...localBattleBots.filter(item => item.id !== id)];
      });`
);
source = source.replace(
  `localBattleRooms = snapshot.docs
        .map(item => ({ ...item.data(), id: item.id } as BattleRoom))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));`,
  `localBattleRooms = snapshot.docs
        .map(item => ({ ...item.data(), id: item.id } as BattleRoom))
        .filter(item => !pendingBattleRoomDeletes.has(item.id))
        .map(item => pendingBattleRooms.get(item.id) || item);
      pendingBattleRooms.forEach((pending, id) => {
        if (!localBattleRooms.some(item => item.id === id)) localBattleRooms.push(pending);
      });
      localBattleRooms.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));`
);

// Shop/Gacha writes are also serialized. Existing pending maps protect snapshots;
// queues additionally prevent an older request from completing after a newer request.
const shopAddOld = `await setDoc(doc(db, SHOP_ITEMS_COLLECTION, id), sanitizeForFirestore(fullItem));`;
if (source.includes(shopAddOld)) source = source.replace(shopAddOld, `await enqueueRealtimeWrite('shop/' + id, async () => {
      await setDoc(doc(db, SHOP_ITEMS_COLLECTION, id), sanitizeForFirestore(fullItem));
    });`);
const shopDeleteOld = `await deleteDoc(doc(db, SHOP_ITEMS_COLLECTION, itemId));`;
if (source.includes(shopDeleteOld)) source = source.replace(shopDeleteOld, `await enqueueRealtimeWrite('shop/' + itemId, async () => {
      await deleteDoc(doc(db, SHOP_ITEMS_COLLECTION, itemId));
    });`);
const gachaSaveOld = `await setDoc(doc(db, GACHA_REWARDS_COLLECTION, id), firestoreReward);`;
if (source.includes(gachaSaveOld)) source = source.replace(gachaSaveOld, `await enqueueRealtimeWrite('gacha_reward/' + id, async () => {
      await setDoc(doc(db, GACHA_REWARDS_COLLECTION, id), firestoreReward);
    });`);
const gachaDeleteOld = `await deleteDoc(doc(db, GACHA_REWARDS_COLLECTION, rewardId));`;
if (source.includes(gachaDeleteOld)) source = source.replace(gachaDeleteOld, `await enqueueRealtimeWrite('gacha_reward/' + rewardId, async () => {
      await deleteDoc(doc(db, GACHA_REWARDS_COLLECTION, rewardId));
    });`);
const gachaConfigSaveOld = `await setDoc(doc(db, GACHA_CONFIG_COLLECTION, "main"), config);`;
if (source.includes(gachaConfigSaveOld)) source = source.replace(gachaConfigSaveOld, `await enqueueRealtimeWrite('gacha_config/main', async () => {
      await setDoc(doc(db, GACHA_CONFIG_COLLECTION, "main"), sanitizeForFirestore(config));
    });`);

// Duel update retry must always read the newest pending object; otherwise a delayed retry
// can write an older room over a newer room.
const staleRetry = `await setDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, room.id), cleaned);
          pendingDuelRooms.delete(updated.id);`;
if (source.includes(staleRetry)) {
  source = source.replace(staleRetry, `const newestRetry = pendingDuelRooms.get(updated.id);
          if (!newestRetry) return;
          await setDoc(doc(db, CARD_DUEL_ROOMS_COLLECTION, updated.id), sanitizeForFirestore(newestRetry));
          if (pendingDuelRooms.get(updated.id) === newestRetry) pendingDuelRooms.delete(updated.id);`);
}

fs.writeFileSync(file, source, 'utf8');
console.log('Realtime all-systems patch applied.');
