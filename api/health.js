module.exports = async (_req, res) => {
  const dbReady = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const nexabotReady = Boolean(process.env.NEXABOT_API_KEY);
  return res.status(200).json({
    ok: true, app: 'CLANCY GENERATOR', version: '0.4.0',
    database_configured: dbReady, nexabot_api_configured: nexabotReady,
    provider_status: nexabotReady ? 'configured' : 'not_connected'
  });
};
