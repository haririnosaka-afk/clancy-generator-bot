const { createJob, getJob } = require('../src/store');
const { dispatchJob } = require('../src/bridge');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const allowedModels = ['Seedance 2.0', 'Seedance 2.5'];
      if (!allowedModels.includes(body.model)) return res.status(400).json({ error: 'Model belum didukung.' });
      if (!['720p','1080p'].includes(body.resolution)) return res.status(400).json({ error: 'Resolusi tidak valid.' });
      if (![10,20,30].includes(Number(body.duration))) return res.status(400).json({ error: 'Durasi harus 10, 20, atau 30 detik.' });
      if (!['16:9','9:16','1:1'].includes(body.aspectRatio)) return res.status(400).json({ error: 'Rasio tidak valid.' });
      if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 5000)
        return res.status(400).json({ error: 'Prompt wajib diisi (maksimal 5.000 karakter).' });
      const job = await createJob({
        model: body.model, resolution: body.resolution, duration: Number(body.duration),
        aspectRatio: body.aspectRatio, prompt: body.prompt.trim(),
        referenceFiles: Array.isArray(body.referenceFiles) ? body.referenceFiles.slice(0, 30) : []
      });
      const dispatched = await dispatchJob(job);
      return res.status(202).json({ job, dispatch: dispatched });
    } catch (e) {
      console.error('create job:', e.message);
      return res.status(500).json({ error: e.message || 'Gagal membuat pekerjaan.' });
    }
  }
  if (req.method === 'GET') {
    try {
      const id = String(req.query.id || '');
      if (!id) return res.status(400).json({ error: 'ID pekerjaan wajib diisi.' });
      const job = await getJob(id);
      return job ? res.status(200).json({ job }) : res.status(404).json({ error: 'Pekerjaan tidak ditemukan.' });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }
  return res.status(405).json({ error: 'Method not allowed' });
};
