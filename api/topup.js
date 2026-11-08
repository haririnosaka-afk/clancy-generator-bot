const crypto = require('crypto');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MIDTRANS_KEY = process.env.MIDTRANS_SERVER_KEY || '';
const production = process.env.MIDTRANS_IS_PRODUCTION === 'true';
const MIDTRANS_BASE = production ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';

async function supabase(path, options = {}, userToken) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(options.headers || {}) }
  });
  const raw = await r.text();
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + raw.slice(0, 300));
  return raw ? JSON.parse(raw) : [];
}
async function getUser(req, res) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Silakan login terlebih dahulu.' }); return null; }
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + token } });
  if (!r.ok) { res.status(401).json({ error: 'Sesi login tidak valid.' }); return null; }
  return r.json();
}
module.exports = async (req, res) => {
  try {
    if (!SUPABASE_URL || !SERVICE_KEY || !MIDTRANS_KEY) return res.status(503).json({ error: 'Konfigurasi Supabase atau Midtrans belum lengkap.' });
    const user = await getUser(req, res);
    if (!user) return;
    if (req.method === 'GET') {
      const rows = await supabase('wallet_topups?user_id=eq.' + encodeURIComponent(user.id) + '&select=id,amount_idr,status,order_id,redirect_url,created_at&order=created_at.desc&limit=30');
      return res.status(200).json({ topups: rows });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const amount = Number(req.body?.amount_idr);
    const allowed = [10000, 20000, 50000, 100000, 200000];
    if (!allowed.includes(amount)) return res.status(400).json({ error: 'Pilih nominal top up Rp10.000, Rp20.000, Rp50.000, Rp100.000, atau Rp200.000.' });
    const orderId = 'CLY-' + user.id.slice(0, 8) + '-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
    const inserted = await supabase('wallet_topups', { method: 'POST', body: JSON.stringify({ user_id: user.id, order_id: orderId, amount_idr: amount, status: 'pending' }) });
    const topup = inserted[0];
    try {
      const auth = Buffer.from(MIDTRANS_KEY + ':').toString('base64');
      const r = await fetch(MIDTRANS_BASE + '/snap/v1/transactions', {
        method: 'POST',
        headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          transaction_details: { order_id: orderId, gross_amount: amount },
          item_details: [{ id: 'clancy-wallet', price: amount, quantity: 1, name: 'Top up saldo CLANCY' }],
          customer_details: { email: user.email || undefined },
          enabled_payments: ['qris']
        })
      });
      const data = await r.json();
      if (!r.ok || !data.token || !data.redirect_url) throw new Error(data.error_messages?.join(', ') || 'Midtrans gagal membuat tagihan.');
      await supabase('wallet_topups?id=eq.' + encodeURIComponent(topup.id), { method: 'PATCH', body: JSON.stringify({ snap_token: data.token, redirect_url: data.redirect_url }) });
      return res.status(201).json({ ok: true, topup_id: topup.id, order_id: orderId, amount_idr: amount, snap_token: data.token, redirect_url: data.redirect_url });
    } catch (e) {
      await supabase('wallet_topups?id=eq.' + encodeURIComponent(topup.id), { method: 'PATCH', body: JSON.stringify({ status: 'failed', failure_reason: e.message }) });
      throw e;
    }
  } catch (e) {
    console.error('CLANCY topup:', e.message);
    return res.status(502).json({ error: e.message || 'Gagal membuat tagihan.' });
  }
};
