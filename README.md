# CLANCY GENERATOR — Omni Flash 1.2

CLANCY submits video jobs through the NexaBot REST API and charges each customer through a personal wallet.

## Current generation integration
- Provider: NexaBot REST API v1 (`https://nexabot.id/api/v1`).
- Model: Omni Flash 1.2 only.
- Submit: `POST /api/v1/api` with `mode: "omni"`.
- Poll: `GET /api/v1/jobs/:id`.
- Download: `GET /api/v1/jobs/:id/download`.
- Resolution: 720p or 1080p; ratio 16:9 or 9:16.
- Media: one optional image start frame.
- Duration: fixed 10 seconds in the current connector; do not advertise custom duration.
- Customer price: Rp2.000 for a successful video. A hold is created before provider submission, captured only on success, and released on provider failure.

## Database setup (Supabase SQL Editor)
Run these scripts in this order:
1. `sql/schema.sql` (skip only if `generation_jobs` already exists with the expected columns).
2. `sql/wallet-sales.sql`.
3. `sql/midtrans-wallet.sql`.
4. `sql/wallet-secure-jobs.sql`.

The final script adds the atomic wallet reservation/job-creation function and creates profiles/wallets for new and existing Auth users. Do not run only the Midtrans script: the other scripts are dependencies.

## Vercel environment variables
Required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — secret, server-side only.
- `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY` — public Supabase Auth key used by the browser.
- `NEXABOT_API_KEY` — secret, server-side only.
- `MIDTRANS_SERVER_KEY` — secret, server-side only.
- `MIDTRANS_IS_PRODUCTION=false` while testing in Midtrans Sandbox; use `true` only after the merchant is approved for production.

After changing environment variables, redeploy Vercel. Never commit secret keys or put them in browser code.

## Midtrans QRIS
- Top-up endpoint: `POST /api/topup`, requires a logged-in Supabase Auth access token.
- Supported top-ups: Rp10.000, Rp20.000, Rp50.000, Rp100.000, Rp200.000.
- Customers are redirected to the Midtrans Snap payment page.
- Notification endpoint: `POST /api/midtrans-notification`.
- Configure the notification URL in Midtrans MAP:
  `https://clancy-generator-bot.vercel.app/api/midtrans-notification`.
- The webhook validates the SHA-512 signature and re-queries Midtrans transaction status before crediting a wallet. Duplicate notifications do not credit the same top-up twice.

## Admin
The admin endpoint is `GET /api/admin`; it requires a signed-in user whose `profiles.is_admin` is true. After creating your own account, set your own user UUID as admin from Supabase SQL Editor, for example:

```sql
update public.profiles
set is_admin = true
where user_id = 'YOUR-SUPABASE-AUTH-USER-UUID';
```

Never make a customer an admin. The admin API is read-only in this initial phase.

## Important launch checks
- Test with Midtrans Sandbox before switching production on.
- Confirm the webhook is configured and delivered successfully.
- Confirm a settled payment credits exactly once.
- Confirm an expired/failed payment does not credit the wallet.
- Confirm a successful video deducts exactly Rp2.000.
- Confirm a failed provider job releases the Rp2.000 hold.
- The website must not be marketed as ready for public payments until these tests pass on the deployed Vercel and Supabase projects.

## Security
Never expose `MIDTRANS_SERVER_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `NEXABOT_API_KEY`. Revoke and replace any secret previously shared in chat or committed to a public repository.
