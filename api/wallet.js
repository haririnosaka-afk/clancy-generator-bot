const SUPABASE_URL=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
async function authUser(req){
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!token)return null;
 const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+token}});
 if(!r.ok)return null;return r.json();
}
async function db(path,options={}){
 const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{...options,headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}});
 const raw=await r.text();if(!r.ok)throw new Error('Database '+r.status);return raw?JSON.parse(raw):[];
}
async function rpc(name,body){
 const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const raw=await r.text();if(!r.ok)throw new Error('Wallet settlement '+r.status);return raw?JSON.parse(raw):null;
}
async function reconcile(userId){
 const key=process.env.NEXABOT_API_KEY||'';if(!key)return;
 const jobs=await db('generation_jobs?user_id=eq.'+encodeURIComponent(userId)+'&status=in.(submitted,processing)&provider=eq.nexabot&select=id,provider_task_id,status&limit=10');
 for(const job of jobs){
  if(!job.provider_task_id)continue;
  try{
   const r=await fetch('https://nexabot.id/api/v1/jobs/'+encodeURIComponent(job.provider_task_id),{headers:{'x-api-key':key}});
   if(!r.ok)continue;
   const data=await r.json(),s=data.job?.status||'processing';
   const mapped={queued:'submitted',processing:'processing',done:'succeeded',failed:'failed'}[s]||'processing';
   if(mapped===job.status)continue;
   await db('generation_jobs?id=eq.'+encodeURIComponent(job.id)+'&user_id=eq.'+encodeURIComponent(userId),{method:'PATCH',body:JSON.stringify({status:mapped,result_url:mapped==='succeeded'?'/api/jobs?id='+encodeURIComponent(job.id)+'&download=1':null,error_message:data.job?.error||null,updated_at:new Date().toISOString()})});
   if(mapped==='succeeded'||mapped==='failed')await rpc('clancy_settle_wallet',{p_job_id:job.id,p_success:mapped==='succeeded'});
  }catch(e){console.error('job reconcile:',job.id,e.message);}
 }
}
module.exports=async(req,res)=>{
 try{
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!SUPABASE_URL||!SERVICE_KEY)return res.status(503).json({error:'Database belum dikonfigurasi'});
  const user=await authUser(req);if(!user)return res.status(401).json({error:'Silakan login terlebih dahulu'});
  await reconcile(user.id);
  const uid=encodeURIComponent(user.id);
  const [wallets,ledger,profile]=await Promise.all([
   db('wallets?user_id=eq.'+uid+'&select=balance_idr,reserved_idr,updated_at&limit=1'),
   db('wallet_ledger?user_id=eq.'+uid+'&select=amount_idr,entry_type,note,created_at&order=created_at.desc&limit=20'),
   db('profiles?user_id=eq.'+uid+'&select=is_admin&limit=1')
  ]);
  return res.status(200).json({ok:true,balance_idr:wallets[0]?.balance_idr||0,reserved_idr:wallets[0]?.reserved_idr||0,is_admin:profile[0]?.is_admin===true,ledger});
 }catch(e){console.error('wallet:',e.message);return res.status(500).json({error:'Gagal mengambil saldo'});}
};
