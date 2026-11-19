module.exports=async(_req,res)=>{
 const dbReady=Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);
 const relayReady=Boolean(process.env.RELAYROUTER_API_KEY);
 const authReady=Boolean(process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY);
 const ownerReady=Boolean(process.env.CLANCY_OWNER_EMAIL);
 return res.status(200).json({ok:true,app:'CLANCY GENERATOR',version:'0.8.0',mode:'personal-only',database_configured:dbReady,relayrouter_api_configured:relayReady,owner_lock_configured:ownerReady,supabase_auth_configured:authReady,provider:'relayrouter-seedance',provider_status:relayReady?'configured':'not_connected',models:['doubao-seedance-2-0-260128','doubao-seedance-2-0-fast-260128','doubao-seedance-2-0-mini-260615','doubao-seedance-2-5-260628']});
};
