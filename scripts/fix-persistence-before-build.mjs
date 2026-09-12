import fs from 'node:fs';
import path from 'node:path';

function read(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf8');
}
function write(filePath, source) {
  fs.writeFileSync(path.resolve(filePath), source, 'utf8');
}

// Firestore writes are last-write-wins. Serialize writes for the same Shop/Gacha
// document so rapid save/delete operations cannot finish out of order.
const characterFile = 'src/services/characterService.ts';
let source = read(characterFile);
const helper = `
// Serialize persistence writes per document to prevent stale writes from winning.
const persistenceWriteQueues = new Map<string, Promise<void>>();

function enqueuePersistenceWrite(key: string, write: () => Promise<void>): Promise<void> {
  const previous = persistenceWriteQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(write);
  persistenceWriteQueues.set(key, next);
  return next.finally(() => {
    if (persistenceWriteQueues.get(key) === next) persistenceWriteQueues.delete(key);
  });
}
`;

if (!source.includes('const persistenceWriteQueues = new Map<string, Promise<void>>();')) {
  const anchor = 'const pendingShopDeletes = new Set<string>();';
  if (!source.includes(anchor)) throw new Error('Persistence anchor not found');
  source = source.replace(anchor, `${anchor}\n${helper}`);
}

const persistenceReplacements = [
  ['await setDoc(doc(db, SHOP_ITEMS_COLLECTION, id), sanitizeForFirestore(fullItem));', 'await enqueuePersistenceWrite(`shop:${id}`, () => setDoc(doc(db, SHOP_ITEMS_COLLECTION, id), sanitizeForFirestore(fullItem)));'],
  ['await deleteDoc(doc(db, SHOP_ITEMS_COLLECTION, itemId));', 'await enqueuePersistenceWrite(`shop:${itemId}`, () => deleteDoc(doc(db, SHOP_ITEMS_COLLECTION, itemId)));'],
  ['await setDoc(doc(db, GACHA_REWARDS_COLLECTION, id), firestoreReward);', 'await enqueuePersistenceWrite(`gacha-reward:${id}`, () => setDoc(doc(db, GACHA_REWARDS_COLLECTION, id), firestoreReward));'],
  ['await deleteDoc(doc(db, GACHA_REWARDS_COLLECTION, rewardId));', 'await enqueuePersistenceWrite(`gacha-reward:${rewardId}`, () => deleteDoc(doc(db, GACHA_REWARDS_COLLECTION, rewardId)));'],
  ['await setDoc(doc(db, GACHA_CONFIG_COLLECTION, "main"), config);', 'await enqueuePersistenceWrite("gacha-config:main", () => setDoc(doc(db, GACHA_CONFIG_COLLECTION, "main"), config));']
];
for (const [from, to] of persistenceReplacements) if (source.includes(from)) source = source.replace(from, to);

// Battle Arena: fixed PVE entry fee and deterministic victory rewards.
// These patches are idempotent because Vercel runs this script before every build.
if (!source.includes('createBattleRoomWithEntryFee')) {
  const anchor = 'export async function updateBattleRoom(room: BattleRoom): Promise<void> {';
  if (!source.includes(anchor)) throw new Error('Battle room update anchor not found');
  const helper = `/** Create a PVE battle while atomically charging the fixed entry fee. */
export async function createBattleRoomWithEntryFee(room: BattleRoom, playerId: string, entryFeeCoins: number): Promise<string> {
  const id = room.id || "battle-" + Date.now();
  const fee = Math.max(0, Math.floor(entryFeeCoins || 0));
  const next = { ...room, id, entryFeeCoins: fee, createdAt: room.createdAt || Date.now(), updatedAt: Date.now() };
  if (fee > 0) {
    await runTransaction(db, async transaction => {
      const charRef = doc(db, CHARACTERS_COLLECTION, playerId);
      const charSnap = await transaction.get(charRef);
      if (!charSnap.exists()) throw new Error('ไม่พบตัวละครผู้เข้าต่อสู้');
      const character = charSnap.data() as CharacterProfile;
      const coins = Number(character.coins) || 0;
      if (coins < fee) throw new Error(\`Coins ไม่พอ ต้องใช้ ${fee.toLocaleString()} Coins\`);
      transaction.set(charRef, { ...character, coins: coins - fee, lastUpdated: Date.now() });
      transaction.set(doc(db, BATTLE_ROOMS_COLLECTION, id), sanitizeForFirestore(next));
    });
  } else {
    await setDoc(doc(db, BATTLE_ROOMS_COLLECTION, id), sanitizeForFirestore(next));
  }
  localBattleRooms = [next, ...localBattleRooms.filter(item => item.id !== id)];
  saveBattleLocal();
  notifyBattleRooms();
  return id;
}

/** Pay the PVE victory reward exactly once. */
export async function settleBattleVictoryReward(room: BattleRoom, playerId: string): Promise<number> {
  if (room.mode !== 'pve' || room.status !== 'completed' || room.winnerTeam !== 'a') return 0;
  if (room.rewardClaimedBy === playerId) return 0;
  const reward = Math.max(0, Math.floor(room.victoryRewardCoins || 0));
  if (reward <= 0) return 0;
  let paid = 0;
  const roomRef = doc(db, BATTLE_ROOMS_COLLECTION, room.id);
  const charRef = doc(db, CHARACTERS_COLLECTION, playerId);
  await runTransaction(db, async transaction => {
    const roomSnap = await transaction.get(roomRef);
    const charSnap = await transaction.get(charRef);
    if (!roomSnap.exists() || !charSnap.exists()) return;
    const freshRoom = roomSnap.data() as BattleRoom;
    if (freshRoom.rewardClaimedBy) return;
    const character = charSnap.data() as CharacterProfile;
    const coins = Number(character.coins) || 0;
    transaction.set(charRef, { ...character, coins: coins + reward, lastUpdated: Date.now() });
    transaction.set(roomRef, { ...freshRoom, rewardClaimedBy: playerId, updatedAt: Date.now() });
    paid = reward;
  });
  if (paid > 0) {
    const updatedRoom = { ...room, rewardClaimedBy: playerId, updatedAt: Date.now() };
    localBattleRooms = [updatedRoom, ...localBattleRooms.filter(item => item.id !== room.id)];
    saveBattleLocal();
    notifyBattleRooms();
  }
  return paid;
}

`;
  source = source.replace(anchor, helper + anchor);
}
write(characterFile, source);

// Extend BattleRoom with optional economy fields used by the PVE arena.
const typesFile = 'src/types.ts';
let types = read(typesFile);
if (!types.includes('entryFeeCoins?: number;')) {
  const anchor = "  winnerTeam?: 'a' | 'b' | 'draw';\n";
  if (!types.includes(anchor)) throw new Error('BattleRoom type anchor not found');
  types = types.replace(anchor, `${anchor}  entryFeeCoins?: number;\n  victoryRewardCoins?: number;\n  rewardClaimedBy?: string;\n`);
}
write(typesFile, types);

// Wire the Battle Arena UI to the fixed PVE entry fee and rewards.
const arenaFile = 'src/components/BattleArena.tsx';
let arena = read(arenaFile);
if (!arena.includes('createBattleRoomWithEntryFee')) {
  arena = arena.replace('  createBattleRoom,\n', '  createBattleRoom,\n  createBattleRoomWithEntryFee,\n  settleBattleVictoryReward,\n');
}
if (!arena.includes('const BATTLE_ENTRY_FEE = 5000;')) {
  const anchor = '  const bossFaces = useMemo(() => makeDiceFaces(bossDice.faces, bossDice.sides), [bossDice.faces, bossDice.sides]);\n';
  if (!arena.includes(anchor)) throw new Error('Battle Arena constants anchor not found');
  arena = arena.replace(anchor, `${anchor}  const BATTLE_ENTRY_FEE = 5000;\n  const BOT_VICTORY_REWARD = 7000;\n  const BOSS_VICTORY_REWARD = 10000;\n`);
}
if (!arena.includes('const completedPveRooms = rooms.filter')) {
  const anchor = '  useEffect(() => { if (!isAdmin) setShowAdmin(false); }, [isAdmin]);\n';
  if (!arena.includes(anchor)) throw new Error('Battle Arena effect anchor not found');
  const effect = `${anchor}\n  useEffect(() => {\n    const completedPveRooms = rooms.filter(room => room.mode === 'pve' && room.status === 'completed' && room.createdBy === currentUser.id && room.winnerTeam === 'a' && !room.rewardClaimedBy);\n    completedPveRooms.forEach(room => {\n      void settleBattleVictoryReward(room, currentUser.id).then(paid => {\n        if (paid > 0) alert(\`ชนะการต่อสู้! ได้รับรางวัล +${paid.toLocaleString()} Coins\`);\n      }).catch(error => console.warn('ไม่สามารถจ่ายรางวัลการต่อสู้ได้', error));\n    });\n  }, [rooms, currentUser.id]);\n`;
  arena = arena.replace(anchor, effect);
}
if (!arena.includes('const selectedBots = mode === \'pve\'')) {
  const old = `    const teamB = mode === 'pve' ? enemies.slice(0, 3).map(bot => makeBotCombatant(bot as BattleBot, 'b')) : enemies.slice(0, 3).map(character => makePlayerCombatant(character as CharacterProfile, 'b'));\n    const now = Date.now();\n    await createBattleRoom({ id: 'battle-' + now, mode, status: 'active', createdBy: currentUser.id, createdByName: currentUser.displayName, teamA, teamB, turnActorId: teamA[0].id, round: 1, log: [{ id: 'battle-log-' + now, timestamp: now, actorName: 'SYSTEM', message: 'เริ่มการต่อสู้ — เลือกสกิลเพื่อใช้พร้อมการทอยลูกเต๋า' }], createdAt: now, updatedAt: now });\n`;
  const replacement = `    const selectedBots = mode === 'pve' ? enemies.slice(0, 3).map(bot => bot as BattleBot) : [];\n    const teamB = mode === 'pve' ? selectedBots.map(bot => makeBotCombatant(bot, 'b')) : enemies.slice(0, 3).map(character => makePlayerCombatant(character as CharacterProfile, 'b'));\n    const isPveBoss = selectedBots.some(bot => bot.isBoss);\n    const entryFee = mode === 'pve' ? BATTLE_ENTRY_FEE : 0;\n    const victoryReward = mode === 'pve' ? (isPveBoss ? BOSS_VICTORY_REWARD : BOT_VICTORY_REWARD) : 0;\n    if (mode === 'pve' && (Number(currentUser.coins) || 0) < entryFee) {\n      alert(\`Coins ไม่พอ ต้องมีอย่างน้อย ${entryFee.toLocaleString()} Coins เพื่อเข้าต่อสู้\`);\n      return;\n    }\n    const now = Date.now();\n    const room: BattleRoom = { id: 'battle-' + now, mode, status: 'active', createdBy: currentUser.id, createdByName: currentUser.displayName, teamA, teamB, turnActorId: teamA[0].id, round: 1, log: [{ id: 'battle-log-' + now, timestamp: now, actorName: 'SYSTEM', message: mode === 'pve' ? \`เริ่มการต่อสู้ — ค่าเข้าต่อสู้ ${entryFee.toLocaleString()} Coins · ชนะรับ ${victoryReward.toLocaleString()} Coins\` : 'เริ่มการต่อสู้ — เลือกสกิลเพื่อใช้พร้อมการทอยลูกเต๋า' }], entryFeeCoins: entryFee, victoryRewardCoins: victoryReward, createdAt: now, updatedAt: now };\n    try {\n      if (mode === 'pve') await createBattleRoomWithEntryFee(room, currentUser.id, entryFee);\n      else await createBattleRoom(room);\n    } catch (error: any) {\n      alert(error?.message || 'ไม่สามารถเปิดห้องรบได้');\n      return;\n    }\n`;
  if (!arena.includes(old)) throw new Error('Battle Arena create-room anchor not found');
  arena = arena.replace(old, replacement);
}
if (!arena.includes('ค่าเข้าต่อสู้: {BATTLE_ENTRY_FEE.toLocaleString()} Coins')) {
  const anchor = '<div className="text-xs font-bold text-slate-300">ฝ่ายตรงข้าม</div>';
  const replacement = `${anchor}{mode === 'pve' && <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-3 text-xs"><div className="font-black text-amber-200">ค่าเข้าต่อสู้: {BATTLE_ENTRY_FEE.toLocaleString()} Coins</div><div className="mt-1 text-slate-400">ชนะบอทรับ {BOT_VICTORY_REWARD.toLocaleString()} Coins · ชนะบอสรับ {BOSS_VICTORY_REWARD.toLocaleString()} Coins</div></div>}`;
  if (!arena.includes(anchor)) throw new Error('Battle Arena opponent anchor not found');
  arena = arena.replace(anchor, replacement);
}
write(arenaFile, arena);

console.log('Persistence and Battle Arena patches applied.');
