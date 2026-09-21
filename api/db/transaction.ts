function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value.replace(/\/$/, '');
}
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const base = env('SUPABASE_URL');
    const key = env('SUPABASE_SERVICE_ROLE_KEY');
    const operations = Array.isArray(req.body?.operations) ? req.body.operations : [];
    const rpc = await fetch(`${base}/rest/v1/rpc/apply_star_stream_ops`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops: operations })
    });
    const text = await rpc.text();
    if (!rpc.ok) throw new Error(text || `Supabase transaction failed (${rpc.status})`);
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Transaction failed' });
  }
}
