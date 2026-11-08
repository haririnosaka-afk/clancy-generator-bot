const { createJob, getJob, updateJobFromProvider } = require('../src/store');
const BASE = 'https://nexabot.id/api/v1';
function apiKey() { const key = process.env.NEXABOT_API_KEY || ''; if (!key) throw new Error('API NexaBot belum diatur. Tambahkan NEXABOT_API_KEY di Vercel.'); return key; }
async function nexabot(path, options = {}) {
  const response = await fetch(BASE + path, { ...options, headers: { 'x-api-key': apiKey(), ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  if (!response.ok) { const raw = await response.text(); let message = raw; try { const parsed = JSON.parse(raw); message = parsed.error || parsed.message || raw; } catch (_) {} throw new Error(`NexaBot API error ${response.status}: ${message}`); }
  return response;
}
const allowedModes = ['omni'];
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    let localJob;
    try {
      const body = req.body || {}, mode = String(body.mode || 'omni'), prompt = String(body.prompt || '').trim();
      if (!allowedModes.includes(mode)) return res.status(400).json({ error: 'Mode video tidak valid.' });
      if (!prompt) return res.status(400).json({ error: 'Prompt wajib diisi.' });
      if (prompt.length > 5000) return res.status(400).json({ error: 'Prompt maksimal 5.000 karakter.' });
      const media = Array.isArray(body.media) ? body.media : [];
      const maxMedia = 1;
      if (media.length > maxMedia) return res.status(400).json({ error: `Mode ini maksimal menerima ${maxMedia} file media.` });
      if (media.some(x => typeof x !== 'string' || !/^data:(image|video)\/[a-zA-Z0-9.+-]+;base64,/.test(x))) return res.status(400).json({ error: 'File media harus berupa gambar/video yang valid.' });
      
      
      const resolution = Number(body.resolution || 720), duration = Number(body.duration || 10), ratio = Number(body.ratio || 1);
      if (![720,1080].includes(resolution)) return res.status(400).json({ error: 'Resolusi harus 720 atau 1080.' });
      if (duration < 3 || duration > 15) return res.status(400).json({ error: 'Omni 1.2 mendukung durasi 3 sampai 15 detik.' });
      if (!Number.isInteger(duration) || duration < 1 || duration > 60) return res.status(400).json({ error: 'Durasi harus 1–60 detik.' });
      if (![1,2].includes(ratio)) return res.status(400).json({ error: 'Rasio video tidak valid.' });
      localJob = await createJob({ provider: 'nexabot', model: mode, resolution: `${resolution}p`, duration, aspectRatio: ratio === 1 ? '16:9' : '9:16', prompt, referenceFiles: [] });
      const response = await nexabot('/api', { method: 'POST', body: JSON.stringify({ mode, prompt, ratio, resolution, duration, media }) });
      const result = await response.json();
      await updateJobFromProvider({ jobId: localJob.id, status: 'submitted', providerTaskId: result.job_id, errorMessage: null });
      return res.status(202).json({ ok: true, job: { ...localJob, status: 'submitted', provider_task_id: result.job_id }, provider: result });
    } catch (e) {
      if (localJob) { try { await updateJobFromProvider({ jobId: localJob.id, status: 'failed', errorMessage: e.message }); } catch (_) {} }
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
        const file = await nexabot(`/jobs/${encodeURIComponent(job.provider_task_id)}/download`);
        const bytes = Buffer.from(await file.arrayBuffer());
        res.setHeader('Content-Type', file.headers.get('content-type') || 'video/mp4');
        res.setHeader('Content-Length', String(bytes.length));
        res.setHeader('Content-Disposition', 'attachment; filename="clancy-result.mp4"');
        return res.status(200).send(bytes);
      }
      const response = await nexabot(`/jobs/${encodeURIComponent(job.provider_task_id)}`);
      const data = await response.json(), providerStatus = data.job?.status || 'processing';
      const map = { queued: 'submitted', processing: 'processing', done: 'succeeded', failed: 'failed' };
      const status = map[providerStatus] || 'processing';
      const updated = await updateJobFromProvider({ jobId: job.id, status, providerTaskId: job.provider_task_id, resultUrl: status === 'succeeded' ? `/api/jobs?id=${encodeURIComponent(job.id)}&download=1` : null, errorMessage: data.job?.error || null });
      return res.status(200).json({ job: { ...(updated || job), provider_status: providerStatus, progress: data.job?.progress || null, download_url: status === 'succeeded' ? `/api/jobs?id=${encodeURIComponent(job.id)}&download=1` : null } });
    } catch (e) { return res.status(502).json({ error: e.message || 'Gagal memeriksa status NexaBot.' }); }
  }
  return res.status(405).json({ error: 'Method not allowed' });
};