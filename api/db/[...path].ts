function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value.replace(/\/$/, '');
}

async function supabase(path: string, init: RequestInit = {}) {
  const base = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  let lastError: any = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(base + '/rest/v1/' + path, {
        ...init,
        signal: controller.signal,
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
          ...(init.headers || {}),
        },
      });
      const text = await res.text();
      if (!res.ok) {
        let detail = text;
        try {
          const parsed = text ? JSON.parse(text) : null;
          detail = parsed?.message || parsed?.hint || parsed?.details || parsed?.error || text;
        } catch {}
        throw new Error('Supabase ' + res.status + ': ' + (detail || 'request failed'));
      }
      return text ? JSON.parse(text) : null;
    } catch (error: any) {
      lastError = error;
      const message = String(error?.message || '');
      const retryable = error?.name === 'AbortError'
        || /^Supabase 5/.test(message)
        || /fetch|network|ECONN|ETIMEDOUT/i.test(message);
      if (!retryable || attempt === 2) break;
      await new Promise(resolve => setTimeout(resolve, 350));
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastError?.name === 'AbortError') {
    throw new Error('Supabase request timed out after 15 seconds');
  }
  throw lastError || new Error('Supabase request failed');
}

function getPath(req: any): string[] {
  // Vercel normally exposes a catch-all route as req.query.path, but this can
  // be absent depending on the runtime/router. Fall back to the actual URL so
  // /api/db/characters/... is still resolved correctly.
  const raw = req.query?.path;
  let parts = Array.isArray(raw) ? raw : raw ? [raw] : [];

  if (!parts.length) {
    const rawUrl = String(req.url || '');
    const pathname = rawUrl.split('?')[0];
    const marker = '/api/db/';
    const index = pathname.indexOf(marker);
    if (index >= 0) {
      const remainder = pathname.slice(index + marker.length);
      parts = remainder.split('/').filter(Boolean);
    }
  }

  return parts.map((part: any) => {
    try { return decodeURIComponent(String(part)); }
    catch { return String(part); }
  });
}

export default async function handler(req: any, res: any) {
  try {
    const parts = getPath(req);
    const collection = parts[0] || '';
    const id = parts.length > 1 ? parts[1] : '';

    if (!collection || !/^[a-zA-Z0-9_-]+$/.test(collection)) {
      return res.status(400).json({ error: 'Invalid collection', path: parts });
    }
    if (parts.length > 2 || (id && !/^[a-zA-Z0-9_.:-]+$/.test(id))) {
      return res.status(400).json({ error: 'Invalid document reference', path: parts });
    }

    // Batch/transaction writes used by the game services.
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
