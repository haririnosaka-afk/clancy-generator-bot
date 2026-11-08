module.exports=async(_req,res)=>{
 const dbReady=Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);
 const nexabotReady=Boolean(process.env.NEXABOT_API_KEY);
 const midtransReady=Boolean(process.env.MIDTRANS_SERVER_KEY);
 const authReady=Boolean(process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY);
 return res.status(200).json({ok:true,app:'CLANCY GENERATOR',version:'0.5.0',database_configured:dbReady,nexabot_api_configured:nexabotReady,midtrans_configured:midtransReady,supabase_auth_configured:authReady,provider_status:nexabotReady?'configured':'not_connected'});
};
