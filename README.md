# CLANCY GENERATOR

CLANCY web app with RelayRouter.ai Seedance video generation.

## RelayRouter.ai provider
- Base URL: `https://api.relayrouter.ai`
- Create task: `POST /api/v3/contents/generations/tasks`
- Query task: `GET /api/v3/contents/generations/tasks/{id}`
- API key: create an API Token in RelayRouter.ai and save it as the Vercel environment variable `RELAYROUTER_API_KEY`.
- Never expose the API key in browser code or commit it to GitHub.

## Supported Seedance models
- `doubao-seedance-2-0-260128` — Seedance 2.0, 4–15 seconds
- `doubao-seedance-2-0-fast-260128` — Seedance 2.0 Fast, 4–15 seconds
- `doubao-seedance-2-0-mini-260615` — Seedance 2.0 Mini, 4–15 seconds
- `doubao-seedance-2-5-260628` — Seedance 2.5, 4–30 seconds

The UI offers model-specific duration and resolution choices. RelayRouter remains the authority on model/group access and actual upstream parameter limits.

## Supabase migration
Run `sql/relayrouter-seedance-wallet.sql` in Supabase SQL Editor after the existing wallet setup scripts. It adds usage fields, a public reference-image bucket, and the secure wallet-backed Seedance job RPC.

## Vercel environment variables
Required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret)
- `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`
- `RELAYROUTER_API_KEY` (secret API token from RelayRouter.ai)
- `MIDTRANS_SERVER_KEY` (secret)
- `MIDTRANS_IS_PRODUCTION=false` while testing in Midtrans Sandbox.

Optional:
- `RELAYROUTER_BASE_URL` (defaults to `https://api.relayrouter.ai`)

The current wallet hold/capture remains Rp2,000 per successful video as a temporary test price. Confirm RelayRouter token usage and update the CLANCY customer price before opening paid generation to customers. Failed tasks release the wallet hold; successful tasks capture it. Provider usage tokens are stored on the job for later cost reconciliation.

## Deploy checklist
1. Run the new Supabase SQL migration.
2. Add `RELAYROUTER_API_KEY` to Vercel Production (and Preview if needed).
3. Redeploy Vercel.
4. Open `/api/health`; verify `relayrouter_api_configured: true`.
5. Test one short 720p video with a small prompt and check wallet settlement and provider usage.
