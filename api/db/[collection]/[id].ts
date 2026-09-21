function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value.replace(/\/$/, '');
}
async function supabase(path: string, init: RequestInit = {}) {
  const base = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${base}/rest/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Supabase error ${res.status}`);
  return text ? JSON.parse(text) : null;
}
export default async function handler(req: any, res: any) {
  try {
    const collection = String(req.query.collection || '');
    const id = String(req.query.id || '');
    if (!collection || !id || !/^[a-zA-Z0-9_-]+$/.test(collection)) return res.status(400).json({ error: 'Invalid document reference' });
    const filter = `collection=eq.${encodeURIComponent(collection)}&id=eq.${encodeURIComponent(id)}`;
    if (req.method === 'GET') {
      const rows = await supabase(`star_stream_documents?select=id,data,updated_at&${filter}`);
      if (!rows?.length) return res.status(404).json({ error: 'Document not found' });
      return res.status(200).json(rows[0]);
    }
    if (req.method === 'PUT') {
      await supabase('star_stream_documents', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ collection, id, data: req.body?.data, updated_at: Date.now() }) });
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'PATCH') {
      const data = req.body?.data || {};
      const current = await supabase(`star_stream_documents?select=data&${filter}`);
      if (!current?.length) return res.status(404).json({ error: 'Document not found' });
      await supabase(`star_stream_documents?${filter}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ data: { ...(current[0].data || {}), ...data }, updated_at: Date.now() }) });
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      await supabase(`star_stream_documents?${filter}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Database request failed' });
  }
}
