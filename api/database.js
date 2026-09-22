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
  const base = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const rpc = await fetch(base + '/rest/v1/rpc/apply_star_stream_ops', {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ops: operations }),
  });
  const body = await rpc.text();
  if (!rpc.ok) throw new Error(`Supabase ${rpc.status}: ${body || 'transaction failed'}`);
  return json(res, 200, { ok: true });
}

export default async function handler(req, res) {
  console.log('[database] request', req.method, req.url);
  try {
    const url = new URL(req.url, 'https://star-stream.invalid');
    if (req.method === 'POST' && url.searchParams.get('transaction') === '1') {
      return await handleTransaction(req, res);
    }
    if (req.method === 'POST' && url.searchParams.get('action') === 'create_battle_room_with_fee') {
      const body = req.body || {};
      const base = env('SUPABASE_URL');
      const key = env('SUPABASE_SERVICE_ROLE_KEY');
      const rpc = await fetch(base + '/rest/v1/rpc/create_battle_room_with_fee', {
        method: 'POST',
        headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_player_id: body.playerId,
          p_fee: Math.max(0, Math.floor(Number(body.fee) || 0)),
          p_room: body.room,
        }),
      });
      const bodyText = await rpc.text();
      if (!rpc.ok) throw new Error(`Supabase ${rpc.status}: ${bodyText || 'battle entry failed'}`);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.searchParams.get('action') === 'claim_battle_reward') {
      const body = req.body || {};
      const base = env('SUPABASE_URL');
      const key = env('SUPABASE_SERVICE_ROLE_KEY');
      const rpc = await fetch(base + '/rest/v1/rpc/claim_battle_reward', {
        method: 'POST',
        headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_room_id: body.roomId,
          p_player_id: body.playerId,
          p_reward: Math.max(0, Math.floor(Number(body.reward) || 0)),
        }),
      });
      const bodyText = await rpc.text();
      if (!rpc.ok) throw new Error(`Supabase ${rpc.status}: ${bodyText || 'battle reward failed'}`);
      return json(res, 200, { ok: true, paid: bodyText === 'true' || bodyText === '"true"' });
    }
    const collection = url.searchParams.get('collection') || '';
    const id = url.searchParams.get('id') || '';
    return await handleDocument(req, res, collection, id);
  } catch (error) {
    console.error('[database] failed', error?.stack || error);
    return json(res, 500, { error: error?.message || 'Database request failed' });
  }
}
