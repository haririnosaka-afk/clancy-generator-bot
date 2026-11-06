// Adapter boundary: never scrape private endpoints or bypass provider access controls.
// The bridge must be an authorized integration/worker operated by the account owner.
async function dispatchJob(job) {
  const url = process.env.CLANCY_BRIDGE_URL;
  const secret = process.env.CLANCY_BRIDGE_SECRET;
  if (!url || !secret) {
    return {
      accepted: false,
      status: 'blocked',
      message: 'Permintaan tersimpan, tetapi konektor SunnySide belum dipasang. Tidak ada generate atau pemotongan kredit.'
    };
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-clancy-bridge-secret': secret },
    body: JSON.stringify({ jobId: job.id, model: job.model, resolution: job.resolution,
      duration: job.duration_seconds, aspectRatio: job.aspect_ratio, prompt: job.prompt,
      referenceFiles: job.reference_files })
  });
  if (!response.ok) throw new Error(`Bridge menolak permintaan (${response.status}).`);
  return { accepted: true, status: 'submitted', message: 'Permintaan diteruskan ke konektor.' };
}
module.exports = { dispatchJob };
