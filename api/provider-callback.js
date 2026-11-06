const crypto = require('crypto');
const { updateJobFromProvider } = require('../src/store');

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.CLANCY_CALLBACK_SECRET || '';
  if (!secret || !safeEqual(req.headers['x-clancy-callback-secret'], secret))
    return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { jobId, status, providerTaskId, resultUrl, errorMessage } = req.body || {};
    if (!jobId || !['submitted','processing','succeeded','failed'].includes(status))
      return res.status(400).json({ error: 'Payload tidak valid.' });
    if (status === 'succeeded' && (!resultUrl || !/^https:\/\//i.test(resultUrl)))
      return res.status(400).json({ error: 'resultUrl HTTPS wajib untuk status succeeded.' });
    const job = await updateJobFromProvider({ jobId, status, providerTaskId, resultUrl, errorMessage });
    return res.status(200).json({ ok: true, job });
  } catch (e) { return res.status(500).json({ error: e.message }); }
};
