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
| 7 | Stall/ghosting detection cron | ✅ Done |
| 8 | Polish & demo prep | ✅ Done |
| 9 | Client-driven QoL pass — legacy import, institution profiles, reports, calendar | ✅ Done |

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
- Nightly stall-detection cron (`GET /api/v1/cron/detect-stalled`, `vercel.json`): tier-aware decay scoring per the PRD's business rules, auto-creates `is_stalled_reengagement` follow-up tasks, idempotent across runs.
- `institutions.ownership_type` / `partnership_finalized`: two client Excel columns that had no home in the schema before, now flow through create/update/CSV import-export and the institutions table UI.
- Basic Graph retry/backoff (`lib/graph/withRetry.ts`) wraps the calendar-push call — honors `Retry-After`, exponential backoff with jitter on 429/5xx.
- `scripts/seed-demo-stalled.mjs` / `delete-demo-stalled.mjs`: adds/removes one clearly-labeled `[DEMO]` stalled institution so "Needs Attention" has something to show live — real client data has nothing past 30 days inactive yet.

### Phase 9 additions (client feedback after first demo prep pass)

- **Legacy spreadsheet import, rebuilt**: `/dashboard/institutions` → "Import Spreadsheet" now has two paths. A **named exact path** recognizes Julian's real "Korea Interactions" sheet by its actual headers (no guessing) and turns `Last Meeting`/`Last Contact`/`Next Steps` columns into real `interactions` and `tasks_followups` rows — not flattened notes — so `last_interaction_at`/health status are correct on day one instead of every import defaulting to stalled_cold. The preview screen also reports any column in the file the system doesn't recognize, so nothing is silently dropped. A **generic fuzzy-matched path** (with a mapping-confirmation screen, unmapped columns default to appending into Notes) handles any other sheet shape. The old exact-header-only CSV importer is removed entirely (was a strict subset of the new flow).
- **Institution profile pages** (`/dashboard/institutions/[id]`): full record (address/notes, which the directory table doesn't show), contacts, complete interaction history, follow-ups. Editable in place (Edit button → Save via `PATCH`). Delete (single, with confirm) and bulk delete (checkboxes + toolbar) from the directory table. Table itself trimmed from 8 columns to 5 (Name/Location/Tier/Health/Last Interaction) — everything else lives on the profile instead of a wide scrolling table.
- **Log Interaction directly from the dashboard**: profile page has its own "Log Interaction" form (channel/date/contact/subject/notes) hitting the same `/api/v1/interactions` endpoint the add-in uses — closes the gap where logging an in-person meeting required opening an unrelated email just to get the add-in's context card to appear.
- **Reports** (`/dashboard/reports`): AI-generated (`gpt-4o-mini`) plain-language activity digest for leadership — headline, highlights, narrative, watch-list — grounded in real stats (new institutions, interactions by channel, follow-up completion, health distribution), not a raw export. Date-range presets + tier/country filters, always-visible stat tiles, in-place editing before copying, persists across refresh (localStorage).
- **Calendar** (`/dashboard/calendar`): read-only week view of the real Outlook calendar via Graph (`Calendars.ReadWrite`, already-consented scope) — fetched live, not a stored copy. Events created via Set Follow-Up are labeled with the institution.
- **Pipeline**: colored stage badges, CSV export of the current snapshot, an explanatory subtitle (it's every institution grouped by pipeline stage — confirmed, not something else).
- **Purge**: self-serve "Clear all data…" on the institutions page (type-to-confirm), scoped to the signed-in user only — for re-testing an import from a clean slate without asking a developer to run a script.
- **Nav**: shared `DashboardNav` across every dashboard page (was asymmetric back-links only), with Sign Out reachable from anywhere instead of only the home page.
- Follow-up creation in the add-in now shows an explicit green success confirmation (previously silent — looked broken, matched a real client-reported pain point).

## Known Deviations From the Literal PRD (flagged, not silent)

1. **API layer**: Next.js Route Handlers instead of a separate Fastify gateway — same endpoint paths/shapes, fewer moving parts for a solo MVP build. Easily split out later.
2. ~~**Interactive sign-in bypass (temporary, dev-only)**~~ — resolved. The Office-dialog MSAL flow was unreliable in Chrome (Korean banking-security software intercepting local TLS) and Safari (dialog-navigation domain restrictions), so a dev-only token-paste bypass unblocked feature testing. Confirmed working via the real `Sign in` button in desktop Outlook (dialog runs on Edge WebView2, sidestepping the Chrome-specific interception) — bypass code removed from `taskpane.ts`/`taskpane.html`.
3. **`pipeline_stage` column**: PRD's Kanban view (FR-5.2) has no backing column in its own DDL — this is a gap in the spec, not a redesign. Added via `0002_pipeline_stage.sql`, applied manually through the Supabase SQL Editor (no CLI/DB connection available in this environment).
4. **Stall-detection threshold source**: the PRD's `detectStalledPartnerships` reads a per-institution `reengagement_threshold_days` column, but nothing populates it away from the DB default of 14 for every tier. The cron computes the threshold from tier directly (10/18/30 days) instead of trusting that column — avoids silently applying the wrong urgency threshold to every institution.

## Environment Notes (for resuming this project)

- Local dev requires HTTPS on both the Next.js app (`:3000`) and the add-in webpack-dev-server (`:3001`) — mixed-content and Office dialog restrictions require it. `npm run dev` at repo root already wires the office-addin-dev-certs cert.
- Real Exchange mailbox required for sideloading — consumer Outlook.com does not support custom add-ins.
- Azure app registration is multi-tenant; admin consent was granted via the sandbox tenant's Global Admin visiting the `/adminconsent` URL directly (new orgs can't self-consent to unverified multi-tenant apps).
- `Calendars.ReadWrite` is a separate incremental consent from `User.Read` — Azure disallows mixing resources' scopes in one interactive request, so the dashboard has a distinct "Grant Calendar Access" button.

## Next Up

All phases done. Known open items, lowest priority first:

- Contacts are not part of any import path yet (institutions/interactions/
  follow-ups only) — a client whose sheet has real contact rows would need
  that added.
- No calendar-history backfill (only forward push + live read exist; past
  events not already logged as interactions aren't pulled in).
- No true report history (last report persists per-browser via
  localStorage, not a shared/cross-device DB record).
- Domain isn't editable from the dashboard (deliberately, since it drives
  email auto-matching) — would need its own confirmation flow if requested.

Otherwise: demo rehearsal / client-facing polish, not build items.

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
