function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value.replace(/\/$/, '');
}

async function supabase(path: string, init: RequestInit = {}) {
  const base = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(text || `Supabase error ${res.status}`);
    return text ? JSON.parse(text) : null;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Supabase request timed out after 8 seconds');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getPath(req: any): string[] {
  const raw = req.query?.path;
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return parts.map((part: any) => decodeURIComponent(String(part)));
}

export default async function handler(req: any, res: any) {
  try {
    const parts = getPath(req);
    const collection = parts[0] || '';
    const id = parts.length > 1 ? parts[1] : '';
    if (!collection || !/^[a-zA-Z0-9_-]+$/.test(collection)) {
      return res.status(400).json({ error: 'Invalid collection' });
    }
    if (parts.length > 2 || (id && !/^[a-zA-Z0-9_.:-]+$/.test(id))) {
      return res.status(400).json({ error: 'Invalid document reference' });
    }

    // Batch/transaction writes used by the game services.
    // The frontend sends these to /api/db/transaction. Handle them explicitly
    // instead of treating "transaction" as a normal collection name.
    if (req.method === 'POST' && collection === 'transaction' && !id) {
      const operations = Array.isArray(req.body?.operations) ? req.body.operations : [];
      if (!operations.length) return res.status(400).json({ error: 'No database operations supplied' });
      if (operations.length > 100) return res.status(400).json({ error: 'Too many database operations' });

      for (const operation of operations) {
        const op = operation?.op;
        const targetCollection = String(operation?.collection || '');
        const targetId = String(operation?.id || '');
        if (!['set', 'update', 'delete'].includes(op)) {
          return res.status(400).json({ error: 'Invalid database operation' });
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(targetCollection) || !/^[a-zA-Z0-9_.:-]+$/.test(targetId)) {
          return res.status(400).json({ error: 'Invalid document reference in transaction' });
        }

        const filter = `collection=eq.${encodeURIComponent(targetCollection)}&id=eq.${encodeURIComponent(targetId)}`;
        if (op === 'set') {
          await supabase('star_stream_documents', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({
              collection: targetCollection,
              id: targetId,
              data: operation?.data,
              updated_at: Date.now(),
            }),
          });
        } else if (op === 'update') {
          const current = await supabase(`star_stream_documents?select=data&${filter}`);
          if (!current?.length) return res.status(404).json({ error: `Document not found: ${targetCollection}/${targetId}` });
          await supabase(`star_stream_documents?${filter}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              data: { ...(current[0].data || {}), ...(operation?.data || {}) },
              updated_at: Date.now(),
            }),
          });
        } else {
          await supabase(`star_stream_documents?${filter}`, {
            method: 'DELETE',
            headers: { Prefer: 'return=minimal' },
          });
        }
      }
      return res.status(200).json({ ok: true, count: operations.length });
    }

    if (req.method === 'GET' && !id) {
      const rows = await supabase(
        `star_stream_documents?select=id,data,updated_at&collection=eq.${encodeURIComponent(collection)}&order=updated_at.desc`
      );
      return res.status(200).json({ docs: rows || [] });
    }

    if (req.method === 'GET' && id) {
      const rows = await supabase(
        `star_stream_documents?select=id,data,updated_at&collection=eq.${encodeURIComponent(collection)}&id=eq.${encodeURIComponent(id)}`
      );
      if (!rows?.length) return res.status(404).json({ error: 'Document not found' });
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'PUT' && id) {
      await supabase('star_stream_documents', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          collection,
          id,
          data: req.body?.data,
          updated_at: Date.now(),
        }),
      });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'PATCH' && id) {
      const filter = `collection=eq.${encodeURIComponent(collection)}&id=eq.${encodeURIComponent(id)}`;
      const current = await supabase(`star_stream_documents?select=data&${filter}`);
      if (!current?.length) return res.status(404).json({ error: 'Document not found' });
      await supabase(`star_stream_documents?${filter}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          data: { ...(current[0].data || {}), ...(req.body?.data || {}) },
          updated_at: Date.now(),
        }),
      });
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE' && id) {
      const filter = `collection=eq.${encodeURIComponent(collection)}&id=eq.${encodeURIComponent(id)}`;
      await supabase(`star_stream_documents?${filter}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Database request failed' });
  }
}
