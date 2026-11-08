const URL=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
async function query(path){
 const r=await fetch(URL+'/rest/v1/'+path,{headers:{apikey:KEY,Authorization:'Bearer '+KEY,Prefer:'count=exact'}});
 const raw=await r.text();if(!r.ok)throw new Error('Database '+r.status);
 const range=r.headers.get('content-range')||'*/0';
 return {rows:raw?JSON.parse(raw):[],count:Number(range.split('/')[1]||0)};
}
module.exports=async(req,res)=>{
 try{
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)return res.status(401).json({error:'Login wajib'});
  const u=await fetch(URL+'/auth/v1/user',{headers:{apikey:KEY,Authorization:'Bearer '+token}});
  if(!u.ok)return res.status(401).json({error:'Sesi tidak valid'});
  const user=await u.json();
  const p=await query('profiles?user_id=eq.'+encodeURIComponent(user.id)+'&select=is_admin&limit=1');
  if(!p.rows[0]?.is_admin)return res.status(403).json({error:'Akses admin ditolak'});
  const [users,topups,jobs,ledger]=await Promise.all([
   query('profiles?select=user_id,display_name,is_admin,created_at&order=created_at.desc&limit=100'),
   query('wallet_topups?select=order_id,user_id,amount_idr,status,created_at,paid_at&order=created_at.desc&limit=100'),
   query('generation_jobs?select=id,user_id,status,customer_price_idr,created_at,updated_at&order=created_at.desc&limit=100'),
   query('wallet_ledger?select=user_id,amount_idr,entry_type,reference_id,created_at&order=created_at.desc&limit=100')
  ]);
  return res.status(200).json({ok:true,counts:{users:users.count,topups:topups.count,jobs:jobs.count},users:users.rows,topups:topups.rows,jobs:jobs.rows,ledger:ledger.rows});
 }catch(e){console.error('admin dashboard:',e.message);return res.status(500).json({error:'Gagal memuat dashboard admin'});}
};
