# Portfolio Demo Checklist

Updated after the Phase 9 QoL pass (import overhaul, institution profiles, reports, calendar).

## Must do before the demo

- [ ] **Decide on demo data** — `node scripts/seed-demo-stalled.mjs` adds a labeled `[DEMO]` stalled institution so Needs Attention has something to show. `node scripts/clean-all-data.mjs` wipes everything (all users, dev-only script) if you want a clean slate instead — or use the in-app "Clear all data…" on the Institutions page to wipe just the signed-in account.
- [ ] **Confirm both dev servers running** — `:3000` (dashboard) and `:3001` (add-in).
- [ ] **Trust the dev HTTPS cert in the demo browser/profile** — `npx office-addin-dev-certs verify`; re-trust if using a fresh profile or Incognito.
- [ ] **Have a sample `.xlsx` on hand** (any "Korea Interactions"-style partner-tracking sheet, or a generic one to show the fuzzy-match path) and run it through Import Spreadsheet live. Confirm the "Recognized this as your Partner Interactions sheet" card appears for the named-format sheet, and check the unrecognized-columns line.
- [ ] **Walk the full happy path once end-to-end**: email in → context card → Log Email Touchpoint (AI summary) → Set Follow-Up (green success + calendar event) → check Calendar tab shows it, labeled with the institution → open the institution's profile page → confirm the interaction and follow-up appear there.
- [ ] **Grant Calendar Access** if not already done for the signed-in account (needed for both Set Follow-Up's push and the new Calendar tab's read) — button lives on the home page and calendar page will prompt inline if missing.

## Suggested walkthrough order

1. Sign in → Institutions (search/filter/sort live)
2. Import a sample spreadsheet → jump to a school's profile, show real health status (not stalled) from imported meeting history
3. Outlook add-in → context card → Log Email Touchpoint → Set Follow-Up (green confirmation)
4. Calendar tab → show the follow-up event, labeled
5. Needs Attention → AI re-engagement draft
6. Pipeline → drag a card, colored stages, export snapshot
7. Reports → generate one live, this is the "for my boss" answer — mention Edit before copying
8. If asked: Log Interaction on a profile page (for an in-person meeting logged without an email)

## Known gaps — explainable if asked, not worth fixing before demo

- **No contacts in any import path** — institutions/interactions/follow-ups only. A client whose sheet has real contact/counselor rows would need that added separately.
- **No calendar-history backfill** — only forward push (Set Follow-Up → Outlook) and live read exist; past Outlook events that were never logged as interactions won't retroactively appear as history.
- **Reports persist per-browser only** (localStorage), not a shared cross-device history — refreshing the same browser keeps the last report, a different device won't see it.
- **Domain isn't editable** from the institution profile (deliberate — it drives email auto-matching; changing it needs its own confirmation flow, not a quick-edit field).
- **No pagination** on the institutions table — invisible at demo volume, will matter as real data grows past ~1 screen.
- `pipeline_stage` was added manually via Supabase SQL Editor (no CLI/DB connection in this environment) — a PRD DDL gap, not a redesign.
- Stall-detection threshold computed from tier (10/18/30 days) rather than the PRD's unpopulated `reengagement_threshold_days` column — deliberate.
- A handful of dashboard pages share a pre-existing React lint warning (`set-state-in-effect`) — cosmetic, doesn't affect runtime behavior.

## Already done (this pass)

- [x] Removed dev-token sign-in bypass — real MSAL/Office-dialog flow only.
- [x] Follow-up creation shows a clear success confirmation.
- [x] Real landing page (was a debug/auth-test screen).
- [x] Shared nav (incl. Sign Out) across every dashboard page.
- [x] Legacy spreadsheet import rebuilt: named exact path for a "Korea Interactions"-style sheet (creates real interactions/follow-ups, not notes), fuzzy fallback for anything else, unrecognized-column warning, single unified "Import Spreadsheet" button (old strict CSV importer removed).
- [x] Institution profile pages: full detail, in-place edit, delete (single + bulk), Log Interaction without needing an email open.
- [x] Institutions table trimmed to 5 glanceable columns; rest lives on the profile.
- [x] Reports: AI-generated leadership digest, filters, stat tiles, editable, persists across refresh.
- [x] Calendar: read-only live view of the real Outlook calendar, labeled BridgeRecruit events.
- [x] Pipeline: colored stages, CSV export, explanatory subtitle.
- [x] Self-serve data purge (type-to-confirm), scoped to the signed-in user.
