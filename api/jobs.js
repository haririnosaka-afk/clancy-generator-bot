const BASE = (process.env.RELAYROUTER_BASE_URL || "https://api.relayrouter.ai").replace(/\/$/, "");
const KEY = process.env.RELAYROUTER_API_KEY || "";
const MODELS = {
  "doubao-seedance-2-0-260128": { name: "Seedance 2.0", max: 15, api: "legacy", resolutions: ["480p","720p","1080p","4k"] },
  "doubao-seedance-2-0-fast-260128": { name: "Seedance 2.0 Fast", max: 15, api: "legacy", resolutions: ["480p","720p"] },
  "doubao-seedance-2-0-mini-260615": { name: "Seedance 2.0 Mini", max: 15, api: "legacy", resolutions: ["480p","720p"] },
  "doubao-seedance-2-5-260628": { name: "Seedance 2.5", max: 30, api: "v3", resolutions: ["480p","720p","1080p"] }
};
const send = (res, code, body) => res.status(code).json(body);
async function relay(path, init = {}) {
  if (!KEY) throw new Error("RELAYROUTER_API_KEY belum dipasang di Vercel.");
  const response = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
  if (!response.ok) {
    const message = data.error?.message || data.message || data.error || raw || "Provider error";
    throw new Error("RelayRouter " + response.status + ": " + String(message).slice(0, 350));
  }
  return data;
}
function getTaskId(data) {
  return data.id || data.task_id || data.taskId || data.data?.id || data.data?.task_id || data.data?.taskId;
}
function getStatus(data) {
  return String(data.status || data.data?.status || data.task_status || data.data?.task_status || data.state || data.data?.state || "processing").toLowerCase();
}
function getVideo(data) {
  const candidates = [
    data.content?.video_url, data.content?.video_url?.url, data.content?.url,
    data.video_url, data.video_url?.url, data.output?.video_url, data.output?.url,
    data.outputs?.[0]?.url, data.data?.content?.video_url, data.data?.content?.video_url?.url,
    data.data?.video_url, data.data?.output?.video_url, data.data?.output?.url,
    data.output?.video_url, data.output?.url,
    data.output?.videos?.[0]?.url, data.output?.result?.video_url,
    data.metadata?.video_url, data.metadata?.url,
    data.data?.metadata?.video_url, data.data?.metadata?.url,
    data.result?.video_url, data.result?.url
  ];
  return candidates.find(v => typeof v === "string" && /^https?:\/\//i.test(v)) || null;
}
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!KEY) return send(res, 503, { error: "Tambahkan RELAYROUTER_API_KEY di Vercel." });
  try {
    if (req.method === "POST") {
      const body = req.body || {};
      const model = String(body.model || "");
      const cfg = MODELS[model];
      if (!cfg) return send(res, 400, { error: "Model Seedance tidak dikenali." });
      const prompt = String(body.prompt || "").trim();
      const images = Array.isArray(body.images) ? body.images : [];
      if (!prompt && !images.length) return send(res, 400, { error: "Masukkan prompt atau gambar referensi." });
      if (prompt.length > 7000) return send(res, 400, { error: "Prompt maksimal 7.000 karakter." });
      if (images.length > 9) return send(res, 400, { error: "Maksimal 9 gambar referensi." });
      if (images.some(x => typeof x !== "string" || !/^data:image\/(png|jpeg|jpg|webp);base64,/.test(x) || x.length > 1400000) || images.reduce((n, x) => n + (typeof x === "string" ? x.length : 0), 0) > 3500000) return send(res, 400, { error: "Total ukuran gambar terlalu besar. Kurangi jumlah atau ukuran gambar." });
      const seconds = Number(body.seconds || 5);
      const ratio = String(body.ratio || "16:9");
      const resolution = String(body.resolution || "720p").toLowerCase();
      if (!Number.isInteger(seconds) || seconds < 4 || seconds > cfg.max) return send(res, 400, { error: cfg.name + " mendukung durasi 4–" + cfg.max + " detik." });
      if (!["16:9","9:16","1:1","4:3","3:4","21:9"].includes(ratio)) return send(res, 400, { error: "Rasio video tidak valid." });
      if (!cfg.resolutions.includes(resolution)) return send(res, 400, { error: "Resolusi tidak tersedia untuk " + cfg.name + "." });
      const content = [];
      if (prompt) content.push({ type: "text", text: prompt });
      for (const image of images) content.push({ type: "image_url", role: "reference_image", image_url: { url: image } });
      const payload = {
        model, content, duration: seconds, ratio, resolution,
        generate_audio: body.generate_audio !== false,
        watermark: body.watermark === true
      };
      if (cfg.api === "v3") {
        payload.output_format = "mp4";
        payload.omni_reference_task_type = "reference";
      }
      const path = cfg.api === "v3" ? "/api/v3/contents/generations/tasks" : "/volc/v1/contents/generations/tasks";
      const data = await relay(path, { method: "POST", body: JSON.stringify(payload) });
      const taskId = getTaskId(data);
      if (!taskId) return send(res, 502, { error: "RelayRouter tidak mengembalikan task ID.", provider: data });
      return send(res, 202, { ok: true, task_id: String(taskId), model, model_name: cfg.name, api_version: cfg.api });
    }
    if (req.method === "GET") {
      const taskId = String(req.query.task_id || "");
      const model = String(req.query.model || "");
      const cfg = MODELS[model];
      if (!taskId || !cfg) return send(res, 400, { error: "task_id dan model wajib diisi." });
      const path = cfg.api === "v3"
        ? "/api/v3/contents/generations/tasks/" + encodeURIComponent(taskId)
        : "/volc/v1/contents/generations/tasks/" + encodeURIComponent(taskId);
      const data = await relay(path);
      const status = getStatus(data);
      const done = ["succeeded","completed","success","finished"].includes(status);
      const failed = ["failed","error","cancelled","canceled","expired"].includes(status);
      const videoUrl = getVideo(data);
      return send(res, 200, {
        ok: true, task_id: taskId, status: done && videoUrl ? "succeeded" : failed ? "failed" : status,
        video_url: videoUrl, error: failed ? (data.error?.message || data.error || data.message || "Generate gagal") : null,
        provider: data
      });
    }
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "Method tidak diizinkan." });
  } catch (error) {
    console.error("CLANCY:", error);
    return send(res, 502, { error: String(error.message || "Permintaan gagal").slice(0, 450) });
  }
};


// Allow reference-image JSON payloads within Vercel request limits.
module.exports.config = { api: { bodyParser: { sizeLimit: "4mb" } } };
