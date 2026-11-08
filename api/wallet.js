const SUPABASE_URL=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
async function authUser(req){
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!token)return null;
 const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+token}});
 if(!r.ok)return null;
 return r.json();
}
async function db(path){
 const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY}});
 const raw=await r.text();if(!r.ok)throw new Error('Database '+r.status);
 return raw?JSON.parse(raw):[];
}
module.exports=async(req,res)=>{
 try{
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!SUPABASE_URL||!SERVICE_KEY)return res.status(503).json({error:'Database belum dikonfigurasi'});
  const user=await authUser(req);if(!user)return res.status(401).json({error:'Silakan login terlebih dahulu'});
  const uid=encodeURIComponent(user.id);
  const [wallets,ledger,profile]=await Promise.all([
   db('wallets?user_id=eq.'+uid+'&select=balance_idr,reserved_idr,updated_at&limit=1'),
   db('wallet_ledger?user_id=eq.'+uid+'&select=amount_idr,entry_type,note,created_at&order=created_at.desc&limit=20'),
   db('profiles?user_id=eq.'+uid+'&select=is_admin&limit=1')
  ]);
  return res.status(200).json({ok:true,balance_idr:wallets[0]?.balance_idr||0,reserved_idr:wallets[0]?.reserved_idr||0,is_admin:profile[0]?.is_admin===true,ledger});
 }catch(e){console.error('wallet:',e.message);return res.status(500).json({error:'Gagal mengambil saldo'});}
};
