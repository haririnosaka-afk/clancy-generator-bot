const crypto = require('crypto');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MIDTRANS_KEY = process.env.MIDTRANS_SERVER_KEY || '';
const production = process.env.MIDTRANS_IS_PRODUCTION === 'true';
const MIDTRANS_BASE = production ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';

async function rpc(name, body) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const raw = await r.text();
  if (!r.ok) throw new Error('Supabase RPC ' + r.status + ': ' + raw.slice(0, 300));
  return raw ? JSON.parse(raw) : null;
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (!SUPABASE_URL || !SERVICE_KEY || !MIDTRANS_KEY) return res.status(503).json({ error: 'Webhook belum dikonfigurasi.' });
    const n = req.body || {};
    const expected = crypto.createHash('sha512').update(String(n.order_id || '') + String(n.status_code || '') + String(n.gross_amount || '') + MIDTRANS_KEY).digest('hex');
    const received = String(n.signature_key || '');
    if (!received || expected.length !== received.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) return res.status(401).json({ error: 'Signature Midtrans tidak valid.' });
    const auth = Buffer.from(MIDTRANS_KEY + ':').toString('base64');
    const check = await fetch(MIDTRANS_BASE + '/v2/' + encodeURIComponent(n.order_id) + '/status', { headers: { Authorization: 'Basic ' + auth, Accept: 'application/json' } });
    const status = await check.json();
    if (!check.ok) throw new Error('Verifikasi status transaksi ke Midtrans gagal.');
    const settled = status.transaction_status === 'settlement' || (status.transaction_status === 'capture' && status.fraud_status === 'accept');
    if (settled) {
      const result = await rpc('clancy_midtrans_settle', { p_order_id: n.order_id, p_transaction_id: status.transaction_id || null, p_paid_amount: Math.round(Number(status.gross_amount)) });
      return res.status(200).json({ ok: true, credited: result?.credited === true });
    }
    if (['expire', 'cancel', 'deny'].includes(status.transaction_status)) {
      await rpc('clancy_midtrans_fail', { p_order_id: n.order_id, p_status: status.transaction_status });
    }
    return res.status(200).json({ ok: true, transaction_status: status.transaction_status });
  } catch (e) {
    console.error('Midtrans notification:', e.message);
    return res.status(500).json({ error: 'Gagal memproses notifikasi pembayaran.' });
  }
};
