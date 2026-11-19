module.exports = async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    app: "CLANCY GENERATOR",
    version: "1.0.0",
    mode: "personal-no-database",
    access_code_configured: Boolean(process.env.CLANCY_ACCESS_CODE),
    relayrouter_api_configured: Boolean(process.env.RELAYROUTER_API_KEY),
    provider: "RelayRouter",
    models: [
      "doubao-seedance-2-0-260128",
      "doubao-seedance-2-0-fast-260128",
      "doubao-seedance-2-0-mini-260615",
      "doubao-seedance-2-5-260628"
    ]
  });
};
