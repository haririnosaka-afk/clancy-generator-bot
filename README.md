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
