# CLANCY GENERATOR

Existing Clancy UI with video generation routed to Agnes Video 2.5 Flash.

## Provider integration
- Provider: Agnes AI API.
- Model: `agnes-video-2.5-flash`.
- Create: `POST https://apihub.agnes-ai.com/v1/videos`.
- Poll: `GET https://apihub.agnes-ai.com/agnesapi?video_id=VIDEO_ID&model_name=agnes-video-2.5-flash`.
- Auth: `Authorization: Bearer AGNES_API_KEY`.
- Generation: 720P, 4-12 seconds, selectable aspect ratio.
- Text-only uses `mode: "text"`; image references use `mode: "reference"` and up to 5 images.
- Wallet: Rp2.000 reserved before submission, charged only after success; failed provider jobs release the hold.
- The browser keeps the same Clancy layout; provider calls and API secrets remain server-side.

## Supabase SQL setup
Run the existing SQL scripts in their documented order:
1. `sql/schema.sql`
2. `sql/wallet-sales.sql`
3. `sql/midtrans-wallet.sql`
4. `sql/wallet-secure-jobs.sql`
5. `sql/agnes-video-wallet.sql` (new Agnes-specific secure job creation RPC)

## Vercel environment variables
Required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret)
- `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`
- `AGNES_API_KEY` (secret API key for Agnes)
- `MIDTRANS_SERVER_KEY` (secret)
- `MIDTRANS_IS_PRODUCTION=false` while testing in Midtrans Sandbox; set true only after production approval.

Optional:
- `AGNES_BASE_URL` (defaults to `https://apihub.agnes-ai.com`)

Set environment variables in Vercel and redeploy. Never put provider/service-role secrets in frontend code or commit them to Git.

## Midtrans QRIS
- Top-up endpoint: `POST /api/topup`.
- Notification endpoint: `POST /api/midtrans-notification`.
- Configure the Midtrans notification URL to the deployed `/api/midtrans-notification` endpoint.
- Test QRIS in Sandbox and verify duplicate notifications cannot credit the same top-up twice.

## Launch checklist
- Run all Supabase SQL scripts above.
- Add `AGNES_API_KEY` to Vercel and redeploy.
- Verify `/api/health` reports `agnes_api_configured: true`.
- Test text-only generation and image-reference generation (up to five images).
- Verify successful video playback/download.
- Verify failed generation releases the Rp2.000 wallet hold.
- Verify successful generation captures exactly Rp2.000.
- Verify Midtrans top-up and webhook in Sandbox before production.
- Confirm Agnes account/API quota and pricing before offering generation to customers. Availability, free promotions, quotas and queue times can change.

Never expose `AGNES_API_KEY`, `MIDTRANS_SERVER_KEY`, or `SUPABASE_SERVICE_ROLE_KEY`. Rotate any secret previously exposed publicly.
