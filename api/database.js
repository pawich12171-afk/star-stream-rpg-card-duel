const json = (res, status, body) => res.status(status).json(body);

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value.replace(/\/$/, '');
}

async function supabase(path, init = {}) {
  const base = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(base + '/rest/v1/' + path, {
      ...init,
      signal: controller.signal,
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    const body = await response.text();
    if (!response.ok) {
      let detail = body;
      try {
        const parsed = body ? JSON.parse(body) : null;
        detail = parsed?.message || parsed?.hint || parsed?.details || parsed?.error || body;
      } catch {}
      throw new Error(`Supabase ${response.status}: ${detail || 'request failed'}`);
    }
    return body ? JSON.parse(body) : null;
  } finally {
    clearTimeout(timer);
  }
}

function validCollection(value) {
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

function validId(value) {
  return /^[a-zA-Z0-9_.:-]+$/.test(value);
}

async function handleDocument(req, res, collection, id) {
  if (!collection || !validCollection(collection)) return json(res, 400, { error: 'Invalid collection' });
  if (id && !validId(id)) return json(res, 400, { error: 'Invalid document reference' });

  if (req.method === 'GET' && !id) {
    const rows = await supabase(`star_stream_documents?select=id,data,updated_at&collection=eq.${encodeURIComponent(collection)}&order=updated_at.desc`);
    return json(res, 200, { docs: rows || [] });
  }

  if (req.method === 'GET' && id) {
    const rows = await supabase(`star_stream_documents?select=id,data,updated_at&collection=eq.${encodeURIComponent(collection)}&id=eq.${encodeURIComponent(id)}`);
    if (!rows?.length) return json(res, 404, { error: 'Document not found' });
    return json(res, 200, rows[0]);
  }

  if (req.method === 'PUT' && id) {
    await supabase('star_stream_documents', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ collection, id, data: req.body?.data, updated_at: Date.now() }),
    });
    return json(res, 200, { ok: true });
  }

  if (req.method === 'PATCH' && id) {
    const filter = `collection=eq.${encodeURIComponent(collection)}&id=eq.${encodeURIComponent(id)}`;
    const current = await supabase(`star_stream_documents?select=data&${filter}`);
    if (!current?.length) return json(res, 404, { error: 'Document not found' });
    await supabase(`star_stream_documents?${filter}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        data: { ...(current[0].data || {}), ...(req.body?.data || {}) },
        updated_at: Date.now(),
      }),
    });
    return json(res, 200, { ok: true });
  }

  if (req.method === 'DELETE' && id) {
    const filter = `collection=eq.${encodeURIComponent(collection)}&id=eq.${encodeURIComponent(id)}`;
    await supabase(`star_stream_documents?${filter}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: 'Method not allowed' });
}

async function handleTransaction(req, res) {
  const operations = Array.isArray(req.body?.operations) ? req.body.operations : [];
  if (!operations.length) return json(res, 200, { ok: true });

  // Prefer the SQL RPC so multi-document writes are truly atomic.
  // Fall back to the compatibility path only when the RPC migration is unavailable.
  try {
    await supabase('rpc/apply_star_stream_ops', {
      method: 'POST',
      body: JSON.stringify({ ops: operations }),
    });
    return json(res, 200, { ok: true });
  } catch (rpcError) {
    console.warn('[database] atomic transaction RPC unavailable, using compatibility fallback', rpcError?.message || rpcError);
  }

  for (const op of operations) {
    const collection = op?.collection || '';
    const id = op?.id || '';
    if (!validCollection(collection) || !validId(id)) {
      throw new Error('Invalid transaction document reference');
    }

    const filter = `collection=eq.${encodeURIComponent(collection)}&id=eq.${encodeURIComponent(id)}`;

    if (op.op === 'delete') {
      await supabase(`star_stream_documents?${filter}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
      continue;
    }

    if (op.op === 'set') {
      await supabase('star_stream_documents', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          collection,
          id,
          data: op.data || {},
          updated_at: Date.now(),
        }),
      });
      continue;
    }

    if (op.op === 'update') {
      const current = await supabase(`star_stream_documents?select=data&${filter}`);
      if (!current?.length) throw new Error(`Document not found: ${collection}.${id}`);
      await supabase(`star_stream_documents?${filter}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          data: { ...(current[0].data || {}), ...(op.data || {}) },
          updated_at: Date.now(),
        }),
      });
      continue;
    }

    throw new Error(`Unsupported transaction operation: ${op.op}`);
  }

  return json(res, 200, { ok: true });
}

async function createBattleRoomWithFeeDirect(body) {
  const playerId = String(body.playerId || '');
  const fee = Math.max(0, Math.floor(Number(body.fee) || 0));
  const room = body.room;

  if (!validId(playerId)) throw new Error('Invalid player id');
  if (!room?.id || !validId(String(room.id))) throw new Error('Invalid battle room id');

  // Use the PostgreSQL row-locking function when the schema migration is installed.
  try {
    await supabase('rpc/create_battle_room_with_fee', {
      method: 'POST',
      body: JSON.stringify({
        p_player_id: playerId,
        p_fee: fee,
        p_room: room,
      }),
    });
    return;
  } catch (rpcError) {
    console.warn('[database] atomic battle-entry RPC unavailable, using compatibility fallback', rpcError?.message || rpcError);
  }

  const filter = `collection=eq.characters&id=eq.${encodeURIComponent(playerId)}`;
  const rows = await supabase(`star_stream_documents?select=data&${filter}`);
  if (!rows?.length) throw new Error('Player not found');

  const currentData = rows[0].data || {};
  const currentCoinsNumber = Number(currentData.coins);
  const currentCoins = Number.isFinite(currentCoinsNumber)
    ? Math.max(0, Math.floor(currentCoinsNumber))
    : 0;

  if (currentCoins < fee) throw new Error(`Coins ไม่พอ ต้องใช้ ${fee} Coins`);

  const nextData = {
    ...currentData,
    coins: currentCoins - fee,
    lastUpdated: Math.max(Date.now(), Number(currentData.lastUpdated) || 0) + 1,
  };

  await supabase(`star_stream_documents?${filter}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ data: nextData, updated_at: Date.now() }),
  });

  await supabase('star_stream_documents', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      collection: 'battle_rooms',
      id: String(room.id),
      data: room,
      updated_at: Date.now(),
    }),
  });
}
async function claimBattleRewardDirect(body) {
  const roomId = String(body.roomId || '');
  const playerId = String(body.playerId || '');
  const reward = Math.max(0, Math.floor(Number(body.reward) || 0));
  const rewardData = body.rewardData && typeof body.rewardData === 'object' ? body.rewardData : null;

  if (!validId(roomId) || !validId(playerId)) throw new Error('Invalid reward reference');

  // Use the unified compatibility path so team members receive the same
  // reward/drop logic as the room creator. The old RPC only understood a
  // single claimant and could silently reject teammates or configured drops.

  const roomFilter = `collection=eq.battle_rooms&id=eq.${encodeURIComponent(roomId)}`;
  const rooms = await supabase(`star_stream_documents?select=data&${roomFilter}`);
  const roomData = rooms?.[0]?.data || {};

  // The server is authoritative for configured monster/boss drops.
  // Never depend on the browser sending the drop list back during claim;
  // otherwise a stale client or a room snapshot without the field can make
  // a correctly configured drop disappear at reward time.
  // Prefer the drops persisted with the room. For legacy rooms created
  // before battleDrops was persisted, accept the room snapshot sent by the
  // battle client as a compatibility fallback.
  const persistedDrops = Array.isArray(roomData.battleDrops) ? roomData.battleDrops : [];
  const requestDrops = Array.isArray(body.drops) ? body.drops : [];
  const drops = (persistedDrops.length > 0 ? persistedDrops : requestDrops).filter(rawDrop => {
    if (!rawDrop || typeof rawDrop !== 'object') return false;
    const chance = rawDrop.dropChancePercent == null ? 100 : Math.max(0, Math.min(100, Number(rawDrop.dropChancePercent) || 0));
    return Math.random() * 100 < chance;
  });

  const winningPlayers = Array.isArray(roomData.teamA)
    ? roomData.teamA.filter(unit => unit?.type === 'player' && String(unit?.sourceId || ''))
    : [];
  const isWinningTeammate = winningPlayers.some(unit => String(unit.sourceId) === playerId);

  if (
    roomData.status !== 'completed' ||
    (roomData.mode !== 'pve' && roomData.mode !== 'random') ||
    roomData.winnerTeam !== 'a' ||
    !isWinningTeammate
  ) {
    return false;
  }

  const rewardClaims = roomData.rewardClaims && typeof roomData.rewardClaims === 'object'
    ? { ...roomData.rewardClaims }
    : {};
  if (rewardClaims[playerId]) return false;

  const claimData = {
    ...roomData,
    rewardClaims: { ...rewardClaims, [playerId]: Date.now() },
    rewardClaimedBy: playerId,
    updatedAt: Date.now(),
  };

  const claimFilter = 'star_stream_documents?' + roomFilter + '&data->rewardClaims->>' + encodeURIComponent(playerId) + '=is.null';
  const claimed = await supabase(claimFilter, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ data: claimData, updated_at: Date.now() }),
  });

  if (!claimed?.length) return false;
  const charFilter = `collection=eq.characters&id=eq.${encodeURIComponent(playerId)}`;
  const chars = await supabase(`star_stream_documents?select=data&${charFilter}`);
  if (!chars?.length) throw new Error('Player not found');

  const charData = chars[0].data || {};
  const nextData = {
    ...charData,
    coins: Math.max(0, Math.floor(Number(charData.coins) || 0)) + reward,
    lastUpdated: Math.max(Date.now(), Number(charData.lastUpdated) || 0) + 1,
  };

  if (rewardData?.type === 'item' && rewardData.itemData) {
    const item = { ...rewardData.itemData };
    const inventory = Array.isArray(nextData.inventory) ? [...nextData.inventory] : [];
    const existing = inventory.find(entry => entry.id === item.id && entry.name === item.name && entry.category === item.category && entry.effectType === item.effectType);
    if (existing) {
      existing.quantity = Math.max(0, Number(existing.quantity) || 0) + 1;
    } else {
      inventory.push({ ...item, instanceId: `battle-reward-${roomId}-${Date.now()}`, quantity: 1, isEquipped: false });
    }
    nextData.inventory = inventory;
  }

  if (rewardData?.type === 'skill' && rewardData.skillData) {
    const skill = { ...rewardData.skillData, id: `reward-${roomId}-${rewardData.skillData.id || Date.now()}` };
    const skills = Array.isArray(nextData.skills) ? [...nextData.skills] : [];
    if (!skills.some(existing => existing.name === skill.name)) skills.push(skill);
    nextData.skills = skills;
  }

  // Monster/Boss-specific drops are locked into the battle room when it is
  // created. Apply them only after the final victory claim so a lost run gives
  // nothing and the same room cannot be claimed twice.
  let dropCoinTotal = 0;
  for (const rawDrop of drops) {
    if (!rawDrop || typeof rawDrop !== 'object') continue;
    const amount = Math.max(0, Math.floor(Number(rawDrop.amount) || 0));
    if (amount <= 0) continue;
    if (rawDrop.type === 'coin') {
      dropCoinTotal += amount;
      continue;
    }
    if (rawDrop.type === 'item' && rawDrop.itemData && typeof rawDrop.itemData === 'object') {
      const item = { ...rawDrop.itemData };
      const inventory = Array.isArray(nextData.inventory) ? [...nextData.inventory] : [];
      const existing = inventory.find(entry =>
        entry.id === item.id &&
        entry.name === item.name &&
        entry.category === item.category &&
        entry.effectType === item.effectType
      );
      if (existing) {
        existing.quantity = Math.max(0, Number(existing.quantity) || 0) + amount;
      } else {
        inventory.push({
          ...item,
          instanceId: `battle-drop-${roomId}-${rawDrop.id || Date.now()}`,
          quantity: amount,
          isEquipped: false,
        });
      }
      nextData.inventory = inventory;
    }
  }
  if (dropCoinTotal > 0) {
    nextData.coins += dropCoinTotal;
  }

  try {
    await supabase(`star_stream_documents?${charFilter}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ data: nextData, updated_at: Date.now() }),
    });
  } catch (error) {
    // Do not leave the room permanently reward-locked when the character
    // write fails. The claim lock is only valid after the reward has been
    // successfully written to the player.
    try {
      const rollbackFilter = 'star_stream_documents?' + roomFilter;
      const rollbackRooms = await supabase(`star_stream_documents?select=data&${roomFilter}`);
      const latestRoom = rollbackRooms?.[0]?.data;
      if (latestRoom && latestRoom.rewardClaims && Object.prototype.hasOwnProperty.call(latestRoom.rewardClaims, playerId)) {
        const rollbackClaims = { ...latestRoom.rewardClaims };
        delete rollbackClaims[playerId];
        await supabase(rollbackFilter, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            data: { ...latestRoom, rewardClaims: rollbackClaims, rewardClaimedBy: undefined, updatedAt: Date.now() },
            updated_at: Date.now(),
          }),
        });
      }
    } catch (rollbackError) {
      console.error('[database] reward claim rollback failed', rollbackError?.message || rollbackError);
    }
    throw error;
  }

  return true;
}

export default async function handler(req, res) {
  console.log('[database] request', req.method, req.url);
  try {
    const url = new URL(req.url, 'https://star-stream.invalid');
    if (req.method === 'POST' && url.searchParams.get('transaction') === '1') {
      return await handleTransaction(req, res);
    }
    if (req.method === 'POST' && url.searchParams.get('action') === 'create_battle_room_with_fee') {
      await createBattleRoomWithFeeDirect(req.body || {});
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.searchParams.get('action') === 'claim_battle_reward') {
      const paid = await claimBattleRewardDirect(req.body || {});
      return json(res, 200, { ok: true, paid });
    }
    const collection = url.searchParams.get('collection') || '';
    const id = url.searchParams.get('id') || '';
    return await handleDocument(req, res, collection, id);
  } catch (error) {
    console.error('[database] failed', error?.stack || error);
    return json(res, 500, { error: error?.message || 'Database request failed' });
  }
}
