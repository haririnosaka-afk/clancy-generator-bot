const BASE='https://nexabot.id/api/v1';
const SUPABASE_URL=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
function apiKey(){const k=process.env.NEXABOT_API_KEY||'';if(!k)throw new Error('API NexaBot belum dikonfigurasi');return k;}
async function authUser(req){
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!token) return null;
 const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+token}});
 if(!r.ok) return null;
 return r.json();
}
async function db(path,options={}){
 const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{...options,headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});
 const raw=await r.text();if(!r.ok)throw new Error('Database '+r.status+': '+raw.slice(0,200));return raw?JSON.parse(raw):[];
}
async function rpc(name,body){
 const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const raw=await r.text();if(!r.ok)throw new Error('Wallet '+r.status+': '+raw.slice(0,250));return raw?JSON.parse(raw):null;
}
async function nexabot(path,options={}){
 const r=await fetch(BASE+path,{...options,headers:{'x-api-key':apiKey(),...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
 if(!r.ok){const raw=await r.text();let msg=raw;try{const j=JSON.parse(raw);msg=j.error||j.message||raw;}catch(_){}throw new Error('NexaBot '+r.status+': '+msg);}
 return r;
}
async function updateJob(id,userId,patch){
 const rows=await db('generation_jobs?id=eq.'+encodeURIComponent(id)+'&user_id=eq.'+encodeURIComponent(userId),{method:'PATCH',body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});
 return rows[0]||null;
}
async function settle(id,success){return rpc('clancy_settle_wallet',{p_job_id:id,p_success:success});}
module.exports=async(req,res)=>{
 try{
  if(!SUPABASE_URL||!SERVICE_KEY) return res.status(503).json({error:'Database belum dikonfigurasi'});
  const user=await authUser(req);
  if(!user) return res.status(401).json({error:'Silakan login terlebih dahulu.'});
  if(req.method==='POST'){
   let job;
   try{
    const body=req.body||{},mode=String(body.mode||'omni'),prompt=String(body.prompt||'').trim();
    if(mode!=='omni')return res.status(400).json({error:'Mode tidak valid.'});
    if(!prompt&&!(Array.isArray(body.media)&&body.media.length===1))return res.status(400).json({error:'Prompt wajib diisi, kecuali memakai start frame.'});
    if(prompt.length>5000)return res.status(400).json({error:'Prompt maksimal 5.000 karakter.'});
    const media=Array.isArray(body.media)?body.media:[];
    if(media.length>1)return res.status(400).json({error:'Omni Flash 1.2 saat ini dibatasi satu gambar referensi.'});
    if(media.some(x=>typeof x!=='string'||x.length>12*1024*1024||!/^data:image\/(png|jpeg|jpg|webp);base64,/.test(x)))return res.status(400).json({error:'Gambar referensi tidak valid atau terlalu besar.'});
    const resolution=Number(body.resolution||720),ratio=Number(body.ratio||1);
    if(![720,1080].includes(resolution))return res.status(400).json({error:'Resolusi harus 720p atau 1080p.'});
    if(![1,2].includes(ratio))return res.status(400).json({error:'Rasio video tidak valid.'});
    job=await rpc('clancy_create_paid_job',{p_user_id:user.id,p_prompt:prompt,p_resolution:resolution+'p',p_aspect_ratio:ratio===1?'16:9':'9:16',p_reference_files:[]});
    const response=await nexabot('/api',{method:'POST',body:JSON.stringify({mode:'omni',prompt,ratio,resolution,...(media.length?{media}:{})})});
    const result=await response.json();
    if(!result.job_id)throw new Error('NexaBot tidak mengembalikan job_id.');
    await updateJob(job.id,user.id,{status:'submitted',provider_task_id:result.job_id,error_message:null});
    return res.status(202).json({ok:true,job:{id:job.id,status:'submitted'},provider:{job_id:result.job_id,est_seconds:result.est_seconds||null}});
   }catch(e){
    if(job?.id){try{await updateJob(job.id,user.id,{status:'failed',error_message:String(e.message||'Provider error').slice(0,500)});await settle(job.id,false);}catch(refundError){console.error('Wallet release failed:',refundError.message);}}
    const msg=String(e.message||'Gagal membuat video');
    const status=msg.includes('Saldo tidak cukup')?402:400;
    return res.status(status).json({error:msg});
   }
  }
  if(req.method==='GET'){
   const id=String(req.query.id||'');if(!id)return res.status(400).json({error:'ID pekerjaan wajib diisi'});
   const rows=await db('generation_jobs?id=eq.'+encodeURIComponent(id)+'&user_id=eq.'+encodeURIComponent(user.id)+'&select=*');
   const job=rows[0];if(!job)return res.status(404).json({error:'Pekerjaan tidak ditemukan'});
   if(job.provider!=='nexabot'||!job.provider_task_id)return res.status(200).json({job});
   if(req.query.download==='1'){
    if(job.status!=='succeeded')return res.status(409).json({error:'Video belum selesai'});
    const file=await nexabot('/jobs/'+encodeURIComponent(job.provider_task_id)+'/download');
    const bytes=Buffer.from(await file.arrayBuffer());
    res.setHeader('Content-Type',file.headers.get('content-type')||'video/mp4');
    res.setHeader('Content-Length',String(bytes.length));
    res.setHeader('Content-Disposition','attachment; filename="clancy-result.mp4"');
    return res.status(200).send(bytes);
   }
   if(['succeeded','failed'].includes(job.status))return res.status(200).json({job,provider_status:job.status==='succeeded'?'done':'failed'});
   const response=await nexabot('/jobs/'+encodeURIComponent(job.provider_task_id));
   const data=await response.json(),providerStatus=data.job?.status||'processing';
   const map={queued:'submitted',processing:'processing',done:'succeeded',failed:'failed'};
   const status=map[providerStatus]||'processing';
   const updated=await updateJob(job.id,user.id,{status,result_url:status==='succeeded'?'/api/jobs?id='+encodeURIComponent(job.id)+'&download=1':null,error_message:data.job?.error?String(data.job.error).slice(0,500):null});
   if(status==='succeeded')await settle(job.id,true);
   if(status==='failed')await settle(job.id,false);
   return res.status(200).json({job:updated||job,provider_status:providerStatus,progress:data.job?.progress||null,download_url:status==='succeeded'?'/api/jobs?id='+encodeURIComponent(job.id)+'&download=1':null});
  }
  return res.status(405).json({error:'Method not allowed'});
 }catch(e){console.error('CLANCY jobs:',e.message);return res.status(502).json({error:'Permintaan gagal diproses. '+String(e.message||'').slice(0,180)});}
};
