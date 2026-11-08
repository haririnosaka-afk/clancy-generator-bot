# CLANCY GENERATOR — Omni Flash 1.2

CLANCY submits video jobs through the NexaBot REST API.

## Current integration
- Provider: NexaBot REST API v1 (`https://nexabot.id/api/v1`).
- Model: Omni Flash 1.2 only. NexaDance and other modes are excluded.
- Submit: `POST /api/v1/api` with `mode: "omni"`.
- Poll: `GET /api/v1/jobs/:id` every 4 seconds.
- Download: `GET /api/v1/jobs/:id/download`.
- Resolution: 720p or 1080p.
- Ratio: landscape 16:9 or portrait 9:16.
- Media: one optional image as a start frame; no ingredient/reference-image mode.
- Duration: fixed at 10 seconds according to the current NexaBot API documentation; no custom duration field is sent.
- Price shown in the API docs: 0.4 credit per video, subject to account plan/balance.

## Required Vercel environment variables
- `NEXABOT_API_KEY`: NexaBot key; server-side only.
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`: server-side only.

After changing environment variables, redeploy Vercel.

Never put API keys in browser code, chat, or this public repository. Revoke and replace any key that is exposed.


## Midtrans QRIS wallet top-up (new)
- API route: `POST /api/topup` (requires a Supabase Auth access token in `Authorization: Bearer <token>`).
- Top-up choices: Rp10.000, Rp20.000, Rp50.000, Rp100.000, Rp200.000.
- The response includes a Midtrans Snap `redirect_url`; customers complete QRIS payment there.
- Notification endpoint: `POST /api/midtrans-notification`.
- Configure the notification URL in Midtrans MAP as:
  `https://clancy-generator-bot.vercel.app/api/midtrans-notification`.
- Webhook signature is checked and transaction status is re-verified with Midtrans before crediting the wallet.
- Run `sql/midtrans-wallet.sql` in Supabase SQL Editor to create the payment table and idempotent wallet-credit functions. It depends on `sql/wallet-sales.sql` being run first.

## Additional Vercel environment variables
- `MIDTRANS_SERVER_KEY`: confidential Midtrans Server Key; server-side only.
- `MIDTRANS_IS_PRODUCTION`: set to `false` while testing with Midtrans Sandbox; set to `true` only after production activation.
- Existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required.
- The current frontend still needs customer authentication, wallet display, and top-up UI integration before this API can be used by customers.
