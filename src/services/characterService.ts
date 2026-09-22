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

function applyItemPassiveEffects(
  attacker: BattleCombatant,
  defender: BattleCombatant,
  result: BattleRollResult,
  trigger: ItemPassiveEffect['trigger'],
) {
  const passives = [...(attacker.activeSkillPassives || []), ...getEquippedItemPassives(attacker)].filter(effect => effect.trigger === trigger);
  const ordered = [...passives.filter(effect => effect.kind === 'stack'), ...passives.filter(effect => effect.kind !== 'stack')];
  for (const passive of ordered) {
    const chance = passive.chance == null ? 100 : Math.max(0, Math.min(100, Number(passive.chance) || 0));
    const passiveRoll = Math.random() * 100;
    const chanceLabel = Number.isInteger(chance) ? String(chance) : String(Number(chance.toFixed(2)));
    if (passiveRoll >= chance) {
      if (chance < 100) result.message += ` • ❌ Passive ${passive.name}: ล้มเหลว (${chanceLabel}% ไม่ออก)`;