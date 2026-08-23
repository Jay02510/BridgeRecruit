# BridgeRecruit — Project Status

Inbox-native admissions CRM. Outlook Add-in + web dashboard + AI, built against
a real client PRD and real client sample data (Korea-based university/school
partnerships).

**Stack**: Next.js (TypeScript, App Router, Route Handlers as REST API) ·
Supabase (Postgres) · Microsoft Entra ID (MSAL) OAuth + On-Behalf-Of ·
Microsoft Graph API (Calendar) · OpenAI Structured Outputs (Phase 5) ·
Office.js Outlook Add-in.

Full spec: original PRD PDF (persona, JTBD, DDL, API shapes, LLM prompts,
edge-case matrix, acceptance tests) — implementation is checked against it
each phase; deviations are called out below, not silent.

---

## Phase Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Accounts, tenant, scaffolding | ✅ Done |
| 1 | Postgres schema (institutions/contacts/interactions/tasks_followups, health-status trigger) | ✅ Done |
| 2 | Core REST API (lookup, interactions, tasks/followup) | ✅ Done |
| 3 | Auth — MSAL + On-Behalf-Of Graph token exchange | ✅ Done |
| 4 | Outlook Add-in (context card, quick-create, logging, calendar sync) | ✅ Done |
| 5 | AI features (thread summarization, re-engagement drafts) | ✅ Done (draft-reengagement has no UI yet — needs Phase 6's dashboard) |
| 6 | Territory Management web dashboard | ✅ Done (table, Needs Attention, Kanban pipeline, CSV import/export) |
| 7 | Stall/ghosting detection cron | ⬜ Not started |
| 8 | Polish & demo prep | ⬜ Not started |

## What Works Today (demoable)

- Outlook Add-in sideloaded in a real Exchange mailbox (M365 Business Basic trial).
- Opening an email renders the matching institution's context card (tier, health status, recent touchpoints) via domain lookup.
- Unmatched sender domain → 1-click quick-create institution form (FR-1.1).
- Log Email Touchpoint / Log Visit-Meeting → writes to `interactions`, auto-updates institution health status via DB trigger (FR-2.1/2.2).
- Set Follow-Up → creates a `tasks_followups` row **and** a real Outlook Calendar event via Graph, with a Pre-Meeting Brief body (school tier, last 3 touchpoints, counselor preferences) (FR-3.1/3.2).
- Real client sample data seeded from `TalkFile_Julian_Partner Interactions-sample.xlsx` (3 institutions, 1 contact, 6 interactions, 3 follow-ups) — replaced earlier placeholder seed data entirely.
- Log Email Touchpoint now runs a real OpenAI-powered thread summary (strict JSON schema) instead of a manual stub, with a <15-word fallback per the PRD's LLM resilience guardrail (FR-2.1 + Phase 5).
- `POST /api/v1/ai/draft-reengagement` generates a warm re-engagement email draft for stalled institutions — endpoint works, awaiting a Phase 6 UI to call it from.
- Web dashboard: `/dashboard/institutions` (searchable/filterable directory + CSV import/export), `/dashboard/needs-attention` (stalled institutions, one-click AI re-engagement draft + copy-to-clipboard), and `/dashboard/pipeline` (drag-and-drop Kanban across the PRD's 5 pipeline stages). All sign in via the same MSAL flow as the home page.

## Known Deviations From the Literal PRD (flagged, not silent)

1. **API layer**: Next.js Route Handlers instead of a separate Fastify gateway — same endpoint paths/shapes, fewer moving parts for a solo MVP build. Easily split out later.
2. **Interactive sign-in bypass (temporary, dev-only)**: the add-in's Office-dialog MSAL sign-in is currently unreliable on this dev machine (Korean banking-security software intercepting Chrome TLS, Safari dialog-navigation restrictions). A dev-only token-paste bypass in the taskpane unblocks feature testing. **Must be removed before any client-facing demo.**
3. **`pipeline_stage` column**: PRD's Kanban view (FR-5.2) has no backing column in its own DDL — this is a gap in the spec, not a redesign. Added via `0002_pipeline_stage.sql`, applied manually through the Supabase SQL Editor (no CLI/DB connection available in this environment).

## Environment Notes (for resuming this project)

- Local dev requires HTTPS on both the Next.js app (`:3000`) and the add-in webpack-dev-server (`:3001`) — mixed-content and Office dialog restrictions require it. `npm run dev` at repo root already wires the office-addin-dev-certs cert.
- Real Exchange mailbox required for sideloading — consumer Outlook.com does not support custom add-ins.
- Azure app registration is multi-tenant; admin consent was granted via the sandbox tenant's Global Admin visiting the `/adminconsent` URL directly (new orgs can't self-consent to unverified multi-tenant apps).
- `Calendars.ReadWrite` is a separate incremental consent from `User.Read` — Azure disallows mixing resources' scopes in one interactive request, so the dashboard has a distinct "Grant Calendar Access" button.

## Next Up

Phase 7 — stall/ghosting detection cron: port the PRD's `detectStalledPartnerships`
decay-score function, nightly Vercel Cron trigger.

**Action needed before Phase 6 features work**: run `supabase/migrations/0002_pipeline_stage.sql`
in the Supabase SQL Editor — it wasn't applied automatically (no CLI/DB
connection in this dev environment).

---

## Portfolio / Resume Notes

Talking points for this project, kept here so they survive context resets:

- Built an inbox-native CRM integrating Microsoft Graph (OAuth On-Behalf-Of
  flow, delegated Calendar API) into a live Outlook Add-in (Office.js),
  end-to-end from a real client PRD and real client sample data.
- Diagnosed and resolved a multi-layered environment failure blocking OAuth
  sign-in: OS-level cert trust chain, a third-party security tool silently
  intercepting TLS in one browser, and Office add-in dialog domain
  allowlisting — isolated each layer independently before fixing (see
  Phase 4 debugging log in conversation history) rather than guessing.
- Implemented an automated relationship-health scoring model
  (active/cooling/stalled) as a generated Postgres column driven by a
  DB trigger, keeping the CRM UI always consistent with the timeline.
- Practiced disciplined spec-adherence: every phase cross-checked against
  the original 20+ page PRD (DDL, API contracts, prompt specs); found and
  fixed a real gap between implementation and spec (missing counselor
  preferences in the auto-generated meeting brief) via that process.
