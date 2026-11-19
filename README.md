# CLANCY GENERATOR — MODE PRIBADI

CLANCY is configured as a personal Seedance video studio using RelayRouter.ai. No customer sales, wallet charging, top-ups, Midtrans checkout, or public registration UI.

## Models in the interface
- Seedance 2.0 Standard
- Seedance 2.0 Fast
- Seedance 2.0 Mini
- Seedance 2.5

The model IDs and duration/resolution options are configured in `api/jobs.js` and `public/index.html`. Provider account access and actual limits remain subject to RelayRouter.ai.

## Required Vercel environment variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret)
- `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`
- `RELAYROUTER_API_KEY` (secret)
- `CLANCY_OWNER_EMAIL` (the exact email address used by the owner's Supabase login)

Optional:
- `RELAYROUTER_BASE_URL` (defaults to `https://api.relayrouter.ai`)

The API rejects every logged-in account except the email configured in `CLANCY_OWNER_EMAIL`. The signup button is removed from the interface. Keep the Supabase project and Vercel project private; do not share the owner account or API token.

## Supabase setup
Run `sql/clancy-personal-mode.sql` in Supabase SQL Editor. This adds user ownership and provider usage columns and prepares the reference-image storage bucket.

## Deploy
1. Run the personal-mode SQL migration.
2. Set the environment variables above in Vercel.
3. Redeploy the project.
4. Open `/api/health`; verify `database_configured`, `relayrouter_api_configured`, `owner_lock_configured`, and `supabase_auth_configured` are all true.
5. Sign in using the owner email.
6. Test a short 5-second 720p generation first. Provider usage and billing are charged directly by RelayRouter to the owner's API balance.

## Important
The web UI currently supports up to 9 reference images, but the provider may impose lower limits or different input schemas per model. Actual model availability, token usage, and cost must be checked in RelayRouter.ai.