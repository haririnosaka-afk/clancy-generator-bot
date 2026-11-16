module.exports=async(_req,res)=>{
 const dbReady=Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);
 const agnesReady=Boolean(process.env.AGNES_API_KEY);
 const midtransReady=Boolean(process.env.MIDTRANS_SERVER_KEY);
 const authReady=Boolean(process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY);
 return res.status(200).json({ok:true,app:'CLANCY GENERATOR',version:'0.6.0',database_configured:dbReady,agnes_api_configured:agnesReady,midtrans_configured:midtransReady,supabase_auth_configured:authReady,provider:'agnes-video-2.5-flash',provider_status:agnesReady?'configured':'not_connected'});
};
