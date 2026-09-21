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
    if (!collection || !/^[a-zA-Z0-9_-]+$/.test(collection)) return res.status(400).json({ error: 'Invalid collection' });
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const rows = await supabase(`star_stream_documents?select=id,data,updated_at&collection=eq.${encodeURIComponent(collection)}&order=updated_at.desc`);
    return res.status(200).json({ docs: rows || [] });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Database request failed' });
  }
}
