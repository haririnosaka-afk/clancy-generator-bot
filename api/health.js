module.exports = async (_req, res) => {
  const dbReady = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const bridgeReady = Boolean(process.env.CLANCY_BRIDGE_URL && process.env.CLANCY_BRIDGE_SECRET);
  return res.status(200).json({
    ok: true,
    app: 'CLANCY GENERATOR',
    version: '0.3.0',
    database_configured: dbReady,
    telegram_bridge_configured: bridgeReady,
    provider_status: bridgeReady ? 'bridge_configured_not_verified' : 'not_connected'
  });
};
