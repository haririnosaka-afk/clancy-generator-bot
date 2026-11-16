const BASE=(process.env.AGNES_BASE_URL||'https://apihub.agnes-ai.com').replace(/\/$/,'');
const MODEL='agnes-video-2.5-flash';
const SUPABASE_URL=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
function apiKey(){const k=process.env.AGNES_API_KEY||'';if(!k)throw new Error('AGNES_API_KEY belum dikonfigurasi di Vercel');return k;}
async function authUser(req){const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)return null;const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+token}});if(!r.ok)return null;return r.json();}
async function db(path,options={}){const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{...options,headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});const raw=await r.text();if(!r.ok)throw new Error('Database '+r.status+': '+raw.slice(0,200));return raw?JSON.parse(raw):[];}
async function rpc(name,body){const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});const raw=await r.text();if(!r.ok)throw new Error('Wallet '+r.status+': '+raw.slice(0,250));return raw?JSON.parse(raw):null;}
async function agnes(path,options={}){const r=await fetch(BASE+path,{...options,headers:{Authorization:'Bearer '+apiKey(),...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{};}catch(_){data={message:raw};}if(!r.ok)throw new Error('Agnes '+r.status+': '+(data.error?.message||data.message||data.error||raw||'Permintaan provider gagal'));return {response:r,data};}
async function updateJob(id,userId,patch){const rows=await db('generation_jobs?id=eq.'+encodeURIComponent(id)+'&user_id=eq.'+encodeURIComponent(userId),{method:'PATCH',body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});return rows[0]||null;}
async function settle(id,success){return rpc('clancy_settle_wallet',{p_job_id:id,p_success:success});}
module.exports=async(req,res)=>{
 try{
  if(!SUPABASE_URL||!SERVICE_KEY)return res.status(503).json({error:'Database belum dikonfigurasi'});
  const user=await authUser(req);if(!user)return res.status(401).json({error:'Silakan login terlebih dahulu.'});
  if(req.method==='POST'){
   let job;
   try{
    const b=req.body||{},prompt=String(b.prompt||'').trim(),images=Array.isArray(b.images)?b.images:[];
    if(!prompt&&!images.length)return res.status(400).json({error:'Isi prompt atau unggah gambar referensi.'});
    if(prompt.length>5000)return res.status(400).json({error:'Prompt maksimal 5.000 karakter.'});
    if(images.length>5)return res.status(400).json({error:'Maksimal 5 gambar referensi.'});
    if(images.some(x=>typeof x!=='string'||x.length>900000||!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(x)))return res.status(400).json({error:'Gambar tidak valid atau terlalu besar. Maksimal sekitar 650 KB per gambar.'});
    const seconds=Number(b.seconds||5),ratio=String(b.aspect_ratio||'16:9');
    if(!Number.isInteger(seconds)||seconds<4||seconds>12)return res.status(400).json({error:'Durasi harus 4 sampai 12 detik.'});
    if(!['16:9','9:16','1:1','4:3','3:4','21:9'].includes(ratio))return res.status(400).json({error:'Rasio video tidak valid.'});
    const mode=images.length?'reference':'text';
    job=await rpc('clancy_create_agnes_job',{p_user_id:user.id,p_prompt:prompt,p_duration_seconds:seconds,p_aspect_ratio:ratio});
    const payload={model:MODEL,prompt,mode,seconds:String(seconds),size:'720P',aspect_ratio:ratio,n:1,...(images.length?{images}:{})};
    const {data}=await agnes('/v1/videos',{method:'POST',body:JSON.stringify(payload)});
    const videoId=data.video_id||data.id||data.task_id;
    if(!videoId)throw new Error('Agnes tidak mengembalikan video_id. '+JSON.stringify(data).slice(0,250));
    await updateJob(job.id,user.id,{provider:'agnes',model:MODEL,status:'submitted',provider_task_id:String(videoId),error_message:null});
    return res.status(202).json({ok:true,job:{id:job.id,status:'submitted'},provider:{video_id:String(videoId),model:MODEL}});
   }catch(e){if(job?.id){try{await updateJob(job.id,user.id,{status:'failed',error_message:String(e.message||'Provider error').slice(0,500)});await settle(job.id,false);}catch(x){console.error('Wallet release failed:',x.message);}}const msg=String(e.message||'Gagal membuat video');return res.status(msg.includes('Saldo tidak cukup')?402:400).json({error:msg});}
  }
  if(req.method==='GET'){
   const id=String(req.query.id||'');if(!id)return res.status(400).json({error:'ID pekerjaan wajib diisi'});
   const rows=await db('generation_jobs?id=eq.'+encodeURIComponent(id)+'&user_id=eq.'+encodeURIComponent(user.id)+'&select=*');const job=rows[0];if(!job)return res.status(404).json({error:'Pekerjaan tidak ditemukan'});
   if(job.provider!=='agnes'||!job.provider_task_id)return res.status(200).json({job});
   if(req.query.download==='1'){
    if(job.status!=='succeeded'||!job.result_url)return res.status(409).json({error:'Video belum selesai'});
    const file=await fetch(job.result_url);if(!file.ok)throw new Error('File hasil video tidak dapat diunduh: '+file.status);
    const bytes=Buffer.from(await file.arrayBuffer());res.setHeader('Content-Type',file.headers.get('content-type')||'video/mp4');res.setHeader('Content-Length',String(bytes.length));res.setHeader('Content-Disposition','attachment; filename="clancy-agnes-video.mp4"');res.setHeader('Cache-Control','private, no-store');return res.status(200).send(bytes);
   }
   if(['succeeded','failed'].includes(job.status)){await settle(job.id,job.status==='succeeded');return res.status(200).json({job,provider_status:job.status==='succeeded'?'completed':'failed'});}
   const {data}=await agnes('/agnesapi?video_id='+encodeURIComponent(job.provider_task_id)+'&model_name='+encodeURIComponent(MODEL));
   const state=String(data.status||data.data?.status||'processing').toLowerCase();
   const failed=['failed','error','cancelled'].includes(state),done=['completed','succeeded','success','done'].includes(state);
   const status=failed?'failed':done?'succeeded':state==='queued'?'submitted':'processing';
   const videoUrl=data.url||data.data?.url||data.video_url||data.data?.video_url||null;
   const error=data.error?.message||data.error||data.message||null;
   if(done&&!videoUrl)throw new Error('Agnes menyatakan selesai tetapi URL video belum tersedia. Coba refresh beberapa saat lagi.');
   const updated=await updateJob(job.id,user.id,{status,result_url:done?videoUrl:null,error_message:failed?String(error||'Generate gagal').slice(0,500):null});
   if(done)await settle(job.id,true);if(failed)await settle(job.id,false);
   return res.status(200).json({job:updated||job,provider_status:state,progress:data.progress||null,download_url:done?'/api/jobs?id='+encodeURIComponent(job.id)+'&download=1':null});
  }
  return res.status(405).json({error:'Method not allowed'});
 }catch(e){console.error('CLANCY Agnes jobs:',e.message);return res.status(502).json({error:'Permintaan gagal diproses. '+String(e.message||'').slice(0,180)});}
};