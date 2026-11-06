# CLANCY GENERATOR 0.3 — SunnySide-style workspace

This version adds the website Studio UI, a persistent job schema, job submission/status endpoints, and a secured provider callback boundary. It does **not** claim SunnySide is connected.

## Current truth
- Website Studio: implemented.
- Seedance 2.0 / 2.5 choices, 720p/1080p, 10/20/30s, aspect ratio, prompt: UI implemented.
- Job persistence: Supabase schema + REST adapter included; requires configuration.
- SunnySide Telegram automation: NOT connected. No public SunnySide generation API has been verified.
- Photo upload/storage and Gallery playback: next integration stage; file picker is UI-only at this version.
- Generate endpoint refuses to pretend success. Without an authorized bridge, it records a job then reports that the connector is missing.

## Deploy
1. Upload the **contents** of this ZIP to the existing private GitHub repository `clancy-generator-bot` (not the ZIP itself).
2. Import/redeploy the repository in Vercel.
3. In Supabase, create a project and run `sql/schema.sql` in SQL Editor.
4. Add Vercel environment variables from `.env.example`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only; never put in browser code)
   - `SUPABASE_BUCKET` (reserved for media storage)
5. Redeploy. Open `/api/health`; `database_configured` should be true.

## API
- `GET /api/health`
- `POST /api/jobs` with `{model,resolution,duration,aspectRatio,prompt,referenceFiles}`
- `GET /api/jobs?id=<uuid>`
- `POST /api/provider-callback` with header `x-clancy-callback-secret`

Callback payload:
`{ "jobId":"...", "status":"processing|succeeded|failed", "providerTaskId":"...", "resultUrl":"https://...", "errorMessage":"..." }`

## SunnySide bridge — important
The bridge is deliberately an adapter, not a scraper. It accepts a job at `CLANCY_BRIDGE_URL` with `x-clancy-bridge-secret`. A separately operated worker must implement an integration method that SunnySide permits, then call `/api/provider-callback` when the result arrives.

Telegram Bot API cannot control a personal Telegram account or read another bot's private conversation. A user-account MTProto worker may be technically possible, but it requires careful account-security handling and may be restricted by Telegram or SunnySide. Do not put Telegram OTP, password, session string, API hash, cookies, or bot token in this repository or in frontend code. Never share them in chat. Prefer a provider-approved API or written permission for automation.

## Existing bot token
A token previously pasted into chat should be revoked in BotFather and replaced only in Vercel Environment Variables. Do not commit it.
