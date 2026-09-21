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

  if (lastError?.name === 'AbortError') throw new Error('Supabase request timed out after 15 seconds');
  throw lastError || new Error('Supabase request failed');
}

function validCollection(value: string) {
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

function validId(value: string) {
  return /^[a-zA-Z0-9_.:-]+$/.test(value);
}

export default async function handleDb(req: any, res: any) {
  try {
    // Explicit dynamic routes provide these values as req.query params.
    const rawCollection = req.query?.collection;
    const rawId = req.query?.id;
    const collection = Array.isArray(rawCollection) ? String(rawCollection[0] || '') : String(rawCollection || '');
    const id = Array.isArray(rawId) ? String(rawId[0] || '') : String(rawId || '');

    if (!collection || !validCollection(collection)) {
      return res.status(400).json({ error: 'Invalid collection' });
    }
    if (id && !validId(id)) {
      return res.status(400).json({ error: 'Invalid document reference' });
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
