# Kolasys AI — Status 2026-06-04

## System Health
| Component | Status |
|---|---|
| Vercel (web) | ✅ Online |
| Railway transcription-worker | ✅ Online, lockDuration 5min |
| Railway summarization-worker | ✅ Online |
| Railway calendar-bot-worker | ✅ Online — **now operational** |
| Neon (DB) | ✅ Online |
| Upstash Redis | ✅ Online |
| Recall.ai | ✅ Bot avatar updated to PNG |

## Calendar Bot — Now Operational
Previously: calendar-bot-worker was missing MICROSOFT_CLIENT_ID / SECRET / TENANT_ID
and GOOGLE_CLIENT_ID / SECRET. makeMicrosoftCca() returned null silently.
Worker polled 878+ times without ever querying a calendar.

Fixed 2026-06-04: All 5 env vars set on Railway calendar-bot-worker service.
Microsoft Graph API now authenticates and returns events.
Deploy window: -2 min to +8 min from meeting start.

## Visual Design System (all platforms)
- Background: #EEEAE3 (warm greige)
- Cards: white with cardShadow
- Accent: #CA2625 (brand red)
- Date tiles: Granola-style (red month abbrev + bold day number)
- Greetings: 20-item humorous pool, time-of-day bucketed (morning/afternoon/evening)

## Active Workers (Railway — glorious-serenity, US East)
- transcription-worker: Whisper pipeline, lockDuration 300s, stalledInterval 60s
- summarization-worker: Claude summaries, push notifications, series detection
- calendar-bot-worker: Polls every 60s, 35min lookahead, deploys Recall.ai bots

## REST API (app.kolasys.ai/api/v1)
| Endpoint | Status |
|---|---|
| GET /recordings | ✅ includes importPlatform |
| POST /recordings | ✅ |
| POST /recordings/{id}/confirm | ✅ |
| PATCH /recordings/{id}/notes | ✅ accepts personalNotes |
| DELETE /api/v1/calendar | ✅ fixed (findFirst+update, not updateMany) |
| GET /api/v1/premeet-brief | ✅ |
| POST /api/v1/import | ✅ Fireflies/Otter/Fathom/ReadAI |
| GET /api/trpc/settings.getOrgSettings | ✅ returns memberId |

## Open Items (Priority Order)
1. **OAuth secrets rotation** — MICROSOFT_CLIENT_SECRET and GOOGLE_CLIENT_SECRET were exposed in session chat. Rotate in Azure + GCP and update Railway + Vercel.
2. **Sign-in "You are signed out" bug** — Build 35 has diagnostic logging, needs Xcode console check during repro
3. **Desktop code sign + DMG** — distribution not set up
4. **Billing dunning** — invoice.payment_failed logs only; no Resend email
5. **Soundbites on mobile** — web-only currently
6. **Mobile in-app file picker** — Share Extension workaround only
7. **CRM integration** — not started
8. **Apple Watch Phase 3** — Force Touch bookmark not built
