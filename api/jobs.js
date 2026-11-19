const BASE=(process.env.RELAYROUTER_BASE_URL||'https://api.relayrouter.ai').replace(/\/$/,'');
const API_KEY=process.env.RELAYROUTER_API_KEY||'';
const SUPABASE_URL=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const OWNER_EMAIL=(process.env.CLANCY_OWNER_EMAIL||'').trim().toLowerCase();
const MODELS={
 'doubao-seedance-2-0-260128':{label:'Seedance 2.0',max:15,maxResolution:'4k'},
 'doubao-seedance-2-0-fast-260128':{label:'Seedance 2.0 Fast',max:15,maxResolution:'720p'},
 'doubao-seedance-2-0-mini-260615':{label:'Seedance 2.0 Mini',max:15,maxResolution:'720p'},
 'doubao-seedance-2-5-260628':{label:'Seedance 2.5',max:30,maxResolution:'1080p'}
};
function fail(res,status,error){return res.status(status).json({error});}
async function authUser(req){const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)return null;const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+token}});if(!r.ok)return null;const user=await r.json();if(!OWNER_EMAIL||String(user.email||'').toLowerCase()!==OWNER_EMAIL)return null;return user;}
async function db(path,options={}){const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{...options,headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});const raw=await r.text();if(!r.ok)throw new Error('Database '+r.status+': '+raw.slice(0,250));return raw?JSON.parse(raw):[];}
async function rpc(name,body){const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});const raw=await r.text();if(!r.ok)throw new Error('Wallet '+r.status+': '+raw.slice(0,250));return raw?JSON.parse(raw):null;}
async function relay(path,options={}){if(!API_KEY)throw new Error('RELAYROUTER_API_KEY belum dipasang di Vercel.');const r=await fetch(BASE+path,{...options,headers:{Authorization:'Bearer '+API_KEY,'Content-Type':'application/json',...(options.headers||{})}});const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{};}catch(_){data={message:raw};}if(!r.ok)throw new Error('RelayRouter '+r.status+': '+(data.error?.message||data.message||data.error||raw||'Provider gagal'));return data;}
async function updateJob(id,userId,patch){const rows=await db('generation_jobs?id=eq.'+encodeURIComponent(id)+'&user_id=eq.'+encodeURIComponent(userId),{method:'PATCH',body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});return rows[0]||null;}
async function uploadReference(dataUrl,userId,jobId,index){const m=String(dataUrl).match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!m)throw new Error('Format gambar referensi tidak valid.');const ext=m[1]==='jpeg'?'jpg':m[1],bytes=Buffer.from(m[2],'base64');if(bytes.length>700000)throw new Error('Ukuran setiap gambar maksimal 700 KB.');const path=userId+'/'+jobId+'/ref-'+(index+1)+'.'+ext;const r=await fetch(SUPABASE_URL+'/storage/v1/object/clancy-references/'+path,{method:'POST',headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,'Content-Type':'image/'+(ext==='jpg'?'jpeg':ext),'x-upsert':'true'},body:bytes});const raw=await r.text();if(!r.ok)throw new Error('Upload gambar gagal: '+raw.slice(0,180));return SUPABASE_URL+'/storage/v1/object/public/clancy-references/'+path;}
function extractVideo(data){return data?.content?.video_url||data?.content?.url||data?.video_url||data?.output?.video_url||data?.outputs?.[0]?.url||data?.data?.content?.video_url||null;}
module.exports=async(req,res)=>{
 try{
  if(!SUPABASE_URL||!SERVICE_KEY)return fail(res,503,'Database belum dikonfigurasi.');
  if(!OWNER_EMAIL)return fail(res,503,'Tambahkan CLANCY_OWNER_EMAIL di Vercel untuk mengunci aplikasi pribadi.');
  if(!API_KEY)return fail(res,503,'Tambahkan RELAYROUTER_API_KEY di Vercel terlebih dahulu.');
  const user=await authUser(req);if(!user)return fail(res,401,'Silakan login terlebih dahulu.');
  if(req.method==='POST'){
   let job;
   try{
    const b=req.body||{},model=String(b.model||'doubao-seedance-2-0-260128'),cfg=MODELS[model],prompt=String(b.prompt||'').trim(),images=Array.isArray(b.images)?b.images:[];
    if(!cfg)return fail(res,400,'Model Seedance tidak dikenal.');
    if(!prompt&&!images.length)return fail(res,400,'Isi prompt atau unggah gambar referensi.');
    if(prompt.length>5000)return fail(res,400,'Prompt maksimal 5.000 karakter.');
    if(images.length>9)return fail(res,400,'Maksimal 9 gambar referensi untuk antarmuka CLANCY.');
    if(images.some(x=>typeof x!=='string'||x.length>1000000||!/^data:image\\/(png|jpeg|jpg|webp);base64,/.test(x)))return fail(res,400,'Gambar tidak valid atau terlalu besar.');
    const seconds=Number(b.seconds||5),ratio=String(b.aspect_ratio||'16:9'),resolution=String(b.resolution||'720p').toLowerCase();
    if(!Number.isInteger(seconds)||seconds<4||seconds>cfg.max)return fail(res,400,cfg.label+' mendukung durasi 4–'+cfg.max+' detik.');
    if(!['16:9','9:16','1:1','4:3','3:4','21:9'].includes(ratio))return fail(res,400,'Rasio video tidak valid.');
    const allowed=cfg.maxResolution==='4k'?['480p','720p','1080p','4k']:cfg.maxResolution==='1080p'?['480p','720p','1080p']:['480p','720p'];
    if(!allowed.includes(resolution))return fail(res,400,'Resolusi '+resolution+' tidak tersedia untuk '+cfg.label+'. Pilih '+allowed.join(', ')+'.');
    const created=await db('generation_jobs',{method:'POST',body:JSON.stringify({user_id:user.id,provider:'relayrouter',model,resolution,duration_seconds:seconds,aspect_ratio:ratio,prompt,reference_files:[],status:'queued'})});job=created[0];
    const refs=[];for(let i=0;i<images.length;i++){const url=await uploadReference(images[i],user.id,job.id,i);refs.push({type:'image_url',role:'reference_image',image_url:{url}});}
    const content=[];if(prompt)content.push({type:'text',text:prompt});content.push(...refs);
    const payload={model,content,resolution,ratio,duration:seconds,generate_audio:b.generate_audio!==false,watermark:b.watermark===true};
    const data=await relay('/api/v3/contents/generations/tasks',{method:'POST',body:JSON.stringify(payload)});
    const taskId=data.id||data.task_id||data.taskId||data.data?.id||data.data?.task_id;
    if(!taskId)throw new Error('RelayRouter tidak mengembalikan ID tugas: '+JSON.stringify(data).slice(0,300));
    await updateJob(job.id,user.id,{provider:'relayrouter',model,resolution,duration_seconds:seconds,provider_task_id:String(taskId),status:'submitted',reference_files:refs.map(x=>x.image_url.url),error_message:null});
    return res.status(202).json({ok:true,job:{id:job.id,status:'submitted'},provider:{task_id:String(taskId),model,label:cfg.label}});
   }catch(e){if(job?.id){try{await updateJob(job.id,user.id,{status:'failed',error_message:String(e.message||'Provider error').slice(0,500)});}catch(x){console.error('Job failure update:',x.message);}}throw e;}
  }
  if(req.method==='GET'){
   const id=String(req.query.id||'');if(!id)return fail(res,400,'ID pekerjaan wajib diisi.');
   const rows=await db('generation_jobs?id=eq.'+encodeURIComponent(id)+'&user_id=eq.'+encodeURIComponent(user.id)+'&select=*');const job=rows[0];if(!job)return fail(res,404,'Pekerjaan tidak ditemukan.');
   if(job.provider!=='relayrouter'||!job.provider_task_id)return res.status(200).json({job});
   if(req.query.download==='1'){if(job.status!=='succeeded'||!job.result_url)return fail(res,409,'Video belum selesai.');const file=await fetch(job.result_url);if(!file.ok)throw new Error('Video tidak dapat diunduh.');const bytes=Buffer.from(await file.arrayBuffer());res.setHeader('Content-Type',file.headers.get('content-type')||'video/mp4');res.setHeader('Content-Length',String(bytes.length));res.setHeader('Content-Disposition','attachment; filename="clancy-seedance.mp4"');res.setHeader('Cache-Control','private, no-store');return res.status(200).send(bytes);}
   if(['succeeded','failed'].includes(job.status))return res.status(200).json({job,provider_status:job.status});
   const data=await relay('/api/v3/contents/generations/tasks/'+encodeURIComponent(job.provider_task_id));
   const state=String(data.status||data.data?.status||'processing').toLowerCase(),done=['succeeded','completed','success'].includes(state),failed=['failed','error','cancelled','expired'].includes(state);
   const videoUrl=extractVideo(data),usage=data.usage||data.data?.usage||{},tokens=Number(usage.total_tokens||usage.completion_tokens||0)||null;
   if(done&&!videoUrl)throw new Error('Tugas selesai tetapi URL video belum tersedia. Coba refresh lagi.');
   const updated=await updateJob(job.id,user.id,{status:failed?'failed':done?'succeeded':state==='queued'?'submitted':'processing',result_url:done?videoUrl:null,provider_usage_tokens:tokens,provider_usage:usage,error_message:failed?String(data.error?.message||data.error||'Generate gagal').slice(0,500):null});
   
   return res.status(200).json({job:updated||job,provider_status:state,usage:done?usage:null,download_url:done?'/api/jobs?id='+encodeURIComponent(job.id)+'&download=1':null});
  }
  return fail(res,405,'Method tidak diizinkan.');
 }catch(e){console.error('CLANCY RelayRouter jobs:',e.message);return fail(res,502,String(e.message||'Generate gagal').slice(0,250));}
};
