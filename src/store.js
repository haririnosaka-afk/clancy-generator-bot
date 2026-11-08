function config() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Database belum diatur. Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di Vercel.');
  return { url, key };
}
async function db(path, options = {}) {
  const { url, key } = config();
  const r = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(options.headers || {}) }
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`Database error ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
async function createJob(x) {
  const rows = await db('generation_jobs', { method: 'POST', body: JSON.stringify({
    provider: x.provider || 'nexabot', model: x.model, resolution: x.resolution,
    duration_seconds: x.duration, aspect_ratio: x.aspectRatio, prompt: x.prompt,
    reference_files: x.referenceFiles || []
  }) });
  return rows[0];
}
async function getJob(id) {
  const rows = await db(`generation_jobs?id=eq.${encodeURIComponent(id)}&select=*`, { method: 'GET' });
  return rows[0] || null;
}
async function updateJobFromProvider(x) {
  const patch = { status: x.status, provider_task_id: x.providerTaskId || null,
    result_url: x.resultUrl || null, error_message: x.errorMessage || null, updated_at: new Date().toISOString() };
  const rows = await db(`generation_jobs?id=eq.${encodeURIComponent(x.jobId)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return rows[0] || null;
}
module.exports = { createJob, getJob, updateJobFromProvider };
