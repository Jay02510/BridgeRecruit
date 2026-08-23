# BridgeRecruit

Inbox-native admissions CRM for international-recruitment teams: an Outlook
Add-in that surfaces institution context inline in email, logs every
touchpoint (email/visit/fair/call), and pushes follow-ups straight to the
recruiter's Outlook Calendar with an auto-generated Pre-Meeting Brief.

See [PROGRESS.md](./PROGRESS.md) for phase status, architecture notes,
known deviations from the spec, and portfolio/resume talking points.

## Stack

Next.js (TypeScript, App Router) · Supabase (Postgres) · Microsoft Entra ID
(MSAL) + On-Behalf-Of · Microsoft Graph API · Office.js Outlook Add-in ·
OpenAI Structured Outputs.

## Local development

Requires HTTPS on both the app and the add-in dev server (mixed-content and
Office dialog restrictions require it):

```bash
npm run dev          # Next.js app, https://localhost:3000
cd addin && npm run dev-server   # Outlook add-in, https://localhost:3001
```

Certs come from `office-addin-dev-certs` — see `~/.office-addin-dev-certs/`.
Sideloading the add-in requires a real Exchange/M365 mailbox (consumer
Outlook.com does not support custom add-ins).

Env vars: see `.env.example`.
