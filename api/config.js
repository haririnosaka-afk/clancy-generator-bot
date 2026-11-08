module.exports=async(_req,res)=>{
 const url=process.env.SUPABASE_URL||'';
 const key=process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||'';
 if(!url||!key) return res.status(503).json({error:'Konfigurasi Supabase publik belum lengkap'});
 return res.status(200).json({supabase_url:url,supabase_anon_key:key});
};
