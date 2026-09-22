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

  // Keep the compatibility API working even when the optional SQL RPC migration
  // has not been installed in Supabase. Each operation uses the same service-role
  // REST connection as the document API.
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

  const filter = `collection=eq.characters&id=eq.${encodeURIComponent(playerId)}`;
  const rows = await supabase(`star_stream_documents?select=data&${filter}`);
  if (!rows?.length) throw new Error('Player not found');

  const currentData = rows[0].data || {};
  const currentCoins = Math.max(0, Math.floor(Number(currentData.coins) || 0));
  if (currentCoins < fee) throw new Error(`Coins ไม่พอ ต้องใช้ ${fee} Coins`);

  // The coins condition makes concurrent requests fail instead of charging twice.
  const nextData = {
    ...currentData,
    coins: currentCoins - fee,
    lastUpdated: Math.max(Date.now(), Number(currentData.lastUpdated) || 0) + 1,
  };

  const updateFilter =
    `collection=eq.characters&id=eq.${encodeURIComponent(playerId)}&data->>coins=eq.${currentCoins}`;
  const updated = await supabase(`star_stream_documents?${updateFilter}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ data: nextData, updated_at: Date.now() }),
  });

  if (!updated?.length) {
    throw new Error('Battle entry changed while joining. Please try again.');
  }

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

  if (!validId(roomId) || !validId(playerId)) throw new Error('Invalid reward reference');

  const roomFilter = `collection=eq.battle_rooms&id=eq.${encodeURIComponent(roomId)}`;
  const rooms = await supabase(`star_stream_documents?select=data&${roomFilter}`);
  const roomData = rooms?.[0]?.data || {};

  if (
    roomData.status !== 'completed' ||
    roomData.mode !== 'pve' ||
    roomData.winnerTeam !== 'a' ||
    roomData.rewardClaimedBy
  ) {
    return false;
  }

  const claimData = {
    ...roomData,
    rewardClaimedBy: playerId,
    updatedAt: Date.now(),
  };

  const claimed = await supabase(`star_stream_documents?${roomFilter}&data->>rewardClaimedBy=is.null`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ data: claimData, updated_at: Date.now() }),
  });

  if (!claimed?.length) return false;

  const charFilter = `collection=eq.characters&id=eq.${encodeURIComponent(playerId)}`;
  const chars = await supabase(`star_stream_documents?select=data&${charFilter}`);
  if (!chars?.length) throw new Error('Player not found');

  const charData = chars[0].data || {};
  const coins = Math.max(0, Math.floor(Number(charData.coins) || 0));
  await supabase(`star_stream_documents?${charFilter}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      data: {
        ...charData,
        coins: coins + reward,
        lastUpdated: Math.max(Date.now(), Number(charData.lastUpdated) || 0) + 1,
      },
      updated_at: Date.now(),
    }),
  });

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
