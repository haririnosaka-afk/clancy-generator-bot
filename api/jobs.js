const { createJob, getJob, updateJobFromProvider } = require('../src/store');

const BASE = 'https://nexabot.id/api/v1';
function apiKey() {
  const key = process.env.NEXABOT_API_KEY || '';
  if (!key) throw new Error('API NexaBot belum diatur. Tambahkan NEXABOT_API_KEY di Vercel.');
  return key;
}
async function nexabot(path, options = {}) {
  const response = await fetch(BASE + path, {
    ...options,
    headers: {
      'x-api-key': apiKey(),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const type = response.headers.get('content-type') || '';
  if (!response.ok) {
    const detail = type.includes('json') ? await response.json() : await response.text();
    throw new Error(detail.error || detail.message || `NexaBot API error ${response.status}`);
  }
  return { response, type };
}
const allowedModes = ['t2v','sfv','i2v','r2v','extend','omni','nexadance'];
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    let localJob;
    try {
      const body = req.body || {};
      const mode = String(body.mode || 'omni');
      if (!allowedModes.includes(mode)) return res.status(400).json({ error: 'Mode video tidak valid.' });
      const prompt = String(body.prompt || '').trim();
      if (!prompt && !(mode === 'extend')) return res.status(400).json({ error: 'Prompt wajib diisi.' });
      if (prompt.length > 5000) return res.status(400).json({ error: 'Prompt maksimal 5.000 karakter.' });
      const media = Array.isArray(body.media) ? body.media : [];
      const maxMedia = mode === 'i2v' ? 3 : (mode === 'r2v' ? 2 : (mode === 'sfv' || mode === 'omni' ? 1 : 1));
      if (media.length > maxMedia) return res.status(400).json({ error: `Mode ini maksimal menerima ${maxMedia} file media.` });
      if (media.some(x => typeof x !== 'string' || !/^data:(image|video)\/[a-zA-Z0-9.+-]+;base64,/.test(x))) {
        return res.status(400).json({ error: 'File media harus berupa gambar/video yang valid.' });
      }
      const resolution = Number(body.resolution || 720);
      if (![720,1080].includes(resolution)) return res.status(400).json({ error: 'Resolusi harus 720 atau 1080.' });
      const duration = Number(body.duration || 15);
      if (!Number.isInteger(duration) || duration < 1 || duration > 60) return res.status(400).json({ error: 'Durasi harus 1–60 detik untuk mode yang mendukungnya.' });
      const ratio = Number(body.ratio || 1);
      if (![1,2].includes(ratio)) return res.status(400).json({ error: 'Rasio video tidak valid.' });
      localJob = await createJob({
        provider: 'nexabot', model: body.model || mode, mode, resolution: `${resolution}p`,
        duration, aspectRatio: ratio === 1 ? '16:9' : '9:16', prompt, referenceFiles: []
      });
      const payload = { mode, prompt, ratio, resolution, duration, media };
      if (body.model) payload.model = body.model;
      const { response } = await nexabot('/api', { method: 'POST', body: JSON.stringify(payload) });
      const result = await response.json();
      await updateJobFromProvider({
        jobId: localJob.id, status: result.status === 'failed' ? 'failed' : 'submitted',
        providerTaskId: result.job_id, resultUrl: null, errorMessage: null
      });
      return res.status(202).json({
        ok: true, job: { ...localJob, status: result.status || 'queued', provider_task_id: result.job_id },
        provider: { job_id: result.job_id, status: result.status, model: result.model_label || result.model, credit_cost: result.credit_cost, credit_balance: result.credit_balance, est_seconds: result.est_seconds }
      });
    } catch (e) {
      if (localJob) {
        try { await updateJobFromProvider({ jobId: localJob.id, status: 'failed', errorMessage: e.message }); } catch (_) {}
      }
      console.error('NexaBot submit:', e.message);
      return res.status(502).json({ error: e.message || 'Gagal mengirim ke NexaBot.' });
    }
  }
  if (req.method === 'GET') {
    try {
      const id = String(req.query.id || '');
      if (!id) return res.status(400).json({ error: 'ID pekerjaan wajib diisi.' });
      const job = await getJob(id);
      if (!job) return res.status(404).json({ error: 'Pekerjaan tidak ditemukan.' });
      if (job.provider !== 'nexabot' || !job.provider_task_id) return res.status(200).json({ job });
      if (req.query.download === '1') {
        const { response } = await nexabot(`/jobs/${encodeURIComponent(job.provider_task_id)}/download`);
        const bytes = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
        res.setHeader('Content-Length', String(bytes.length));
        res.setHeader('Content-Disposition', 'attachment; filename="clancy-result.mp4"');
        return res.status(200).send(bytes);
      }
      const { response } = await nexabot(`/jobs/${encodeURIComponent(job.provider_task_id)}`);
      const data = await response.json();
      const providerStatus = data.job?.status || data.status || 'processing';
      const map = { queued: 'submitted', processing: 'processing', done: 'succeeded', failed: 'failed' };
      const status = map[providerStatus] || 'processing';
      const updated = await updateJobFromProvider({
        jobId: job.id, status, providerTaskId: job.provider_task_id,
        resultUrl: status === 'succeeded' ? `/api/jobs?id=${encodeURIComponent(job.id)}&download=1` : null,
        errorMessage: data.job?.error || data.error || null
      });
      return res.status(200).json({ job: { ...(updated || job), provider_status: providerStatus, progress: data.job?.progress || null, download_url: status === 'succeeded' ? `/api/jobs?id=${encodeURIComponent(job.id)}&download=1` : null } });
    } catch (e) {
      return res.status(502).json({ error: e.message || 'Gagal memeriksa status NexaBot.' });
    }
  }
  return res.status(405).json({ error: 'Method not allowed' });
};
