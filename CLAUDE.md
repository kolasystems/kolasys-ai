# Kolasys AI Web — Claude Reference

> Quick-start for a new Claude Code session on the web repo.

**Repo:** https://github.com/kolasystems/kolasys-ai  
**Production:** https://app.kolasys.ai  
**tRPC API:** `https://app.kolasys.ai/api/trpc`  
**Mobile repo:** `~/Desktop/kolasys-ai-mobile` · `github.com/kolasystems/kolasys-ai-mobile`  
**Last updated:** 2026-06-03

---

## What This Is

Next.js 16.2 web application for Kolasys AI — Claude-powered meeting intelligence platform. Transcribes, summarizes, and surfaces action items from recorded meetings. Workers run on Railway 24/7 and handle all async processing.

---

## Quick Start

```bash
cd ~/Desktop/kolasys-ai
npm run dev          # Next.js on localhost:3000
```

**Local dev needs 3 terminals:**
- Terminal 1: `npm run dev`
- Terminal 2: `npx tsx src/workers/transcription.worker.ts`
- Terminal 3: `npx tsx src/workers/summarization.worker.ts`

Workers also run on Railway 24/7 — local workers only needed for debugging the pipeline.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16.2 (App Router) |
| API | tRPC 11 + `@trpc/react-query` |
| Database | Neon (PostgreSQL) via Prisma 7 |
| Auth | Clerk 7 |
| Queue | Upstash Redis |
| Storage | AWS S3 |
| AI | Anthropic Claude (claude-sonnet-4-6 for AskAI, Claude Opus for Refine Summary) |
| Embeddings | OpenAI text-embedding-3-small (pgvector on Neon) |
| Email | Resend |
| Deployment | Vercel (web) + Railway (workers) |

---

## Critical Rules

### Clerk Keys — NEVER mix test/live
- Local `.env`: `pk_test_` + `sk_test_` (must match)
- Railway + Vercel: `pk_live_` + `sk_live_`
- Error when mixed: `Clerk: Handshake token verification failed: jwk-kid-mismatch`

### Prisma v7
- **No `$transaction`** — not supported in v7
- **No nested creates** — sequential calls only
- **Schema changes:** `npx prisma db push` (not `migrate dev`)
- **Client:** `npx prisma generate` after schema changes

### Branch Strategy
`feat/*` → test locally → merge to main → Vercel auto-deploys

### tRPC Root File
Root router is `src/server/root.ts` — **not** `src/server/routers/index.ts`. Register new routers here.

### Public Routes (Clerk Middleware)
Add new public routes to `src/proxy.ts`. Currently public:
- `/sign-in(.*)`, `/sign-up(.*)`
- `/pricing(.*)`
- `/share/(.*)` — public recording share pages (no auth)
- `/api/webhooks/(.*)`
- `/api/v1/(.*)` — bearer-token authenticated REST API
- `/api/stripe/(.*)` — Stripe webhook is signature-verified; checkout +
  portal route handlers gate themselves via `auth({ acceptsToken: 'session_token' })`
  so they accept both browser cookies and mobile Bearer tokens
- `/api/push/(.*)` — vapid-public-key is a public value; subscribe self-gates via `auth()`

---

## Project Structure

```
src/
├── app/
│   ├── admin/page.tsx                Internal cross-tenant dashboard (gated by AdminUser table)
│   ├── dashboard/
│   │   ├── page.tsx                  Overview — gradient stat cards
│   │   ├── layout.tsx                TrialBanner + WebPushRegistrar mounted here
│   │   ├── recordings/page.tsx       Meetings list + semantic search (route stays /recordings; UI label = "Meetings")
│   │   ├── recordings/[id]/page.tsx  Split-pane recording detail
│   │   ├── action-items/page.tsx     Action items across all recordings
│   │   ├── analytics/page.tsx        Conversation intelligence
│   │   ├── contacts/page.tsx         Auto-extracted contacts
│   │   ├── knowledge/page.tsx        Personal knowledge graph (people / topics / projects)
│   │   ├── soundbites/page.tsx       Cross-recording soundbites browser
│   │   ├── search/page.tsx           Global Ask AI (uses /api/ai/ask SSE)
│   │   ├── calendar/page.tsx         Calendar + Google OAuth
│   │   ├── billing/page.tsx          Stripe billing — plan, usage, manage subscription
│   │   ├── settings/page.tsx         All settings sections
│   │   └── settings/templates/       Template management
│   ├── api/
│   │   ├── ai/ask/route.ts           POST — SSE stream (Anthropic + pgvector)
│   │   ├── ai/suggestions/route.ts   POST — post-meeting analysis
│   │   ├── admin/export/[orgId]/     GET — admin-gated full org JSON dump
│   │   ├── auth/google/              Google OAuth for calendar
│   │   ├── cron/daily-digest/        8 AM cron
│   │   ├── cron/weekly-digest/       Weekly recap
│   │   ├── push/
│   │   │   ├── subscribe/            POST — saves PushSubscription to WebPushSubscription
│   │   │   └── vapid-public-key/     GET — public VAPID key for SW subscribe
│   │   ├── stripe/
│   │   │   ├── checkout/route.ts     POST — Checkout session (Bearer-token compatible)
│   │   │   ├── portal/route.ts       POST — Billing Portal session (Bearer-token compatible)
│   │   │   └── webhook/route.ts      POST — signature-verified Stripe events
│   │   ├── trpc/[trpc]/route.ts      tRPC HTTP handler
│   │   ├── webhooks/clerk/route.ts   Clerk org/user sync (svix HMAC) + welcome email
│   │   ├── webhooks/recall/route.ts  Recall.ai bot status events
│   │   └── v1/                       Public REST API (bearer-token auth)
│   │       └── recordings/
│   │           ├── route.ts          GET list / POST create (desktop app)
│   │           └── [id]/
│   │               ├── confirm/      POST — desktop app confirms upload
│   │               ├── transcript/   GET — transcript segments
│   │               └── actions/      GET — action items
│   ├── pricing/page.tsx              Public pricing page (no auth required)
│   ├── share/[slug]/page.tsx         Public share page — respects sharePermissions + shareExpiresAt
│   └── layout.tsx                    Pre-hydration dark mode script in <head>
├── server/
│   ├── root.ts                       Root tRPC router — register all routers here
│   └── routers/
│       ├── recordings.router.ts      List/get/create/update/delete + share + retry-stuck + regenerate-title
│       ├── search.router.ts          search.askAI — global vector search
│       ├── settings.router.ts
│       ├── apikeys.router.ts         API key generation + revocation
│       ├── analytics.router.ts
│       ├── contacts.router.ts
│       ├── knowledge.router.ts
│       ├── templates.router.ts
│       ├── billing.router.ts         getSubscription / createCheckoutSession / createPortalSession
│       └── soundbites.router.ts      Soundbites list / create / delete
├── workers/
│   ├── transcription.worker.ts       Upstash Redis queue consumer
│   └── summarization.worker.ts       Steps 5–8.6: summary, AI-title (8.4), push (8.5), knowledge (8.6)
├── services/
│   ├── push.service.ts               sendExpoPush() — Expo Push API, no SDK
│   └── summarization.service.ts      summarizeTranscript / generateAiMeetingTitle / formatTitleWithDate
├── lib/
│   ├── db.ts                         Prisma client
│   ├── api-auth.ts                   Bearer token auth for /api/v1/ routes (skips suspended orgs)
│   ├── stripe.ts                     Lazy Stripe SDK + checkout/portal helpers + planForPriceId
│   ├── web-push.ts                   sendWebPush / sendWebPushToMember (auto-prunes 404/410)
│   ├── speaker-substitute.ts         applySpeakerLabels — render-time SPEAKER_N → name
│   └── trpc.ts                       tRPC context + middleware
├── components/
│   ├── share-recording-button.tsx    Plaud-style share modal (link tab + invite tab)
│   ├── soundbite-capture.tsx         Selection-driven soundbite creator overlay
│   ├── soundbites-panel.tsx          Soundbites tab content
│   ├── editable-recording-title.tsx  Click-to-edit title on detail page
│   ├── editable-speaker-label.tsx    Click-to-rename speaker in transcript
│   ├── quick-voice-upload-button.tsx One-tap voice memo upload (XHR with progress)
│   ├── trial-banner.tsx              Sticky banner in dashboard layout
│   ├── web-push-registrar.tsx        Registers /sw.js + subscribes to push on mount
│   ├── api-keys-section.tsx          API Keys UI in Settings
│   ├── audio-retention-toggle.tsx
│   ├── post-meeting-email-toggle.tsx
│   ├── daily-digest-toggle.tsx
│   ├── default-language-selector.tsx
│   ├── bot-display-name-input.tsx
│   ├── sso-settings.tsx
│   └── dark-mode-toggle.tsx
└── public/
    └── sw.js                         Web Push service worker (push + notificationclick)
```

---

## tRPC Routers — All Procedures

### recordings.router.ts
```
recordings.list              GET    { limit?: number } — includes nested actionItems[]
recordings.get               GET    { id }
recordings.create            POST   — enforces FREE-tier 3/month + admin maxRecordingsPerMonth cap
recordings.delete            POST   { id } — deletes row + S3 audio
recordings.updateTitle       POST   { id, title } — refines that title.trim().length >= 1
recordings.regenerateTitle   POST   { recordingId } — Haiku regenerates "Mon D — title"
recordings.updateActionItem  POST   { id, status?, priority? }
                                    status: OPEN | IN_PROGRESS | COMPLETED | CANCELLED
                                    priority: LOW | MEDIUM | HIGH | URGENT
recordings.refineSummary     POST   { id } — calls Claude Opus, returns refined markdown
recordings.confirmUpload     POST   { id } — after S3 upload, triggers transcription queue
recordings.retryStuck        POST   { recordingId } — clears failed jobs, resets PENDING, re-queues
recordings.nameSpeakers      POST   { recordingId, speakerMappings[] } — used by EditableSpeakerLabel
recordings.makePublic        POST   { recordingId, permissions?, expiresAt? }
                                    Mints (or reuses) 8-char publicSlug; idempotent for save semantics
recordings.makePrivate       POST   { recordingId } — flips isPublic=false (slug retained)
recordings.getShareState     GET    { recordingId } — hydrates the share modal
recordings.addShareInvite    POST   { recordingId, email } — audit-trail only (no enforcement yet)
recordings.removeShareInvite POST   { id }
recordings.listShareInvites  GET    { recordingId }
```

### search.router.ts
```
search.askAI                 POST/mutation  { question: string, recordingId?: string }
  Returns: { answer: string, sources: Source[] }
  Source: { index, recordingId, recordingTitle, chunkText, startTime: number|null, similarity }
  Behavior: embeds question → pgvector similarity search (top 6) → Claude → answer + citations
  Note: /api/ai/ask is a SEPARATE SSE endpoint for streaming chat. search.askAI is one-shot.
```

### settings.router.ts
```
settings.getOrgSettings      GET    — returns all org toggles + config
settings.updateOrgSettings   POST   partial: { deleteAudioAfterTranscription?, postMeetingEmail?,
                                    dailyDigest?, defaultTranscriptionLanguage?,
                                    botDisplayName?, ssoEnabled?, ssoDomain?, samlMetadataUrl? }
settings.updatePushToken     POST   { token: string } — stores Expo push token on OrgMember
```

### apikeys.router.ts
```
apiKeys.list                 GET    — returns active (non-revoked) keys, never raw key
apiKeys.create               POST   { name: string }
                                    Returns: { id, name, keyPreview, createdAt, rawKey }
                                    rawKey returned ONCE — never stored, never returned again
apiKeys.revoke               POST   { id: string } — soft delete (revokedAt = now())
```

### billing.router.ts
```
billing.getSubscription      GET    — { plan, stripeCustomerId, stripeSubscriptionId,
                                          trialEndsAt, maxRecordingsPerMonth,
                                          recordingsThisMonth }
billing.createCheckoutSession POST  { priceId, seats? } — wraps the same helper as /api/stripe/checkout
billing.createPortalSession   POST  — wraps the same helper as /api/stripe/portal
```

### soundbites.router.ts
```
soundbites.list              GET    { recordingId? } — per-recording or whole-org browser
soundbites.create            POST   { recordingId, title, startSeconds, endSeconds, transcript? }
soundbites.delete            POST   { id }
```

### analytics.router.ts
```
analytics.get                GET    — talk time, sentiment, meeting stats
```

### contacts.router.ts
```
contacts.list                GET    — auto-extracted from meeting participants
```

### knowledge.router.ts
```
knowledge.getTopEntities     GET    { limit: 50 }
                                    types: PERSON | TOPIC | PROJECT (NOT COMPANY)
                                    Returns: { id, type, name, mentions, firstSeen, lastSeen, recordingLinks }
```

### templates.router.ts
```
templates.list               GET    — org + global templates
                                    Fields: id, name, description, prompt (NOT promptText),
                                    category, structure, autoApplyRules, isDefault, isGlobal, orgId
                                    No usageCount field.
```

---

## Prisma Schema — Key Models

```prisma
model Organization {
  id                            String   @id @default(cuid())
  // Settings
  deleteAudioAfterTranscription Boolean  @default(false)
  postMeetingEmail              Boolean  @default(true)
  dailyDigest                   Boolean  @default(true)
  defaultTranscriptionLanguage  String   @default("auto")
  botDisplayName                String   @default("Kolasys AI")
  ssoEnabled                    Boolean  @default(false)
  ssoDomain                     String?
  samlMetadataUrl               String?
  expoPushToken                 String?  // org-level (deprecated — use OrgMember.expoPushToken)
}

model OrgMember {
  expoPushToken   String?  // per-user Expo push token
}

model ApiKey {
  id          String    @id @default(cuid())
  orgId       String
  name        String
  keyHash     String    @unique   // SHA-256 of raw key
  keyPreview  String    @default("") // last 4 chars, shown as kol_…XXXX
  lastUsedAt  DateTime?
  revokedAt   DateTime?            // soft-delete for audit trail
  expiresAt   DateTime?
  createdAt   DateTime  @default(now())
}

model TranscriptSegment {
  wordsJson  String?  // JSON: [{word: string; start: number; end: number}]
                      // Stored when Whisper returns word-level granularity
                      // Old recordings without wordsJson gracefully fall back to plain text
}
```

---

## Public REST API

Base URL: `https://app.kolasys.ai/api/v1/`  
Auth: `Authorization: Bearer kol_<64-hex-chars>`

Key generation: `kol_` + 64 hex chars (32 random bytes), SHA-256 hashed for storage.  
Auth middleware: `src/lib/api-auth.ts` — hashes incoming key, looks up in DB, checks `revokedAt`, updates `lastUsedAt` fire-and-forget.

```
GET /api/v1/recordings              List recordings for org (?limit= up to 200)
GET /api/v1/recordings/{id}/transcript   Transcript segments
GET /api/v1/recordings/{id}/actions      Action items
```

---

## AI/Ask Endpoints — Two Separate Systems

**1. `search.askAI` tRPC mutation** — one-shot, non-streaming, global across all recordings
- Used by: mobile AskAIScreen, any programmatic use
- Input: `{ question, recordingId? }`
- Requires embeddings to be generated on recordings

**2. `/api/ai/ask` HTTP route** — SSE streaming, per-recording or global
- Used by: web Ask AI page, web recording detail AskAI tab, mobile AskAITab (SSE)
- Input: `{ messages, recordingId? }`
- Parse SSE for streaming text output

Do NOT confuse these two systems.

---

## Workers

Both run on Railway `glorious-serenity` (us-west2) 24/7. Heartbeat every 60s.

### transcription.worker.ts
- Consumes from Upstash Redis queue
- Downloads audio from S3
- Calls Whisper with `['segment', 'word']` granularity
- Stores segments + `wordsJson` per segment
- Enqueues summarization job

### calendar-bot.worker.ts
- Poll-based (no queue) — `setInterval(pollCalendars, 60_000)`
- Walks every Org with `autoRecordMeetings=true` + `suspended=false` + at
  least one OrgMember with a Google or Microsoft refresh token
- Pulls events 0–15 min out; for each event 4–6 min from start with a
  Zoom/Teams/Meet URL, calls `deployBot` (meetingbot.service) so the same
  `webhook_url` wiring as the manual /dashboard/calendar deploy path is
  used → Recall `bot.done` → `botIngestionQueue` → bot-ingest service
- Dedupes by `(orgId, meetingUrl, status ∈ active, createdAt > now-30min)`
  so re-deliveries / Google+Microsoft dual-surfacing don't double-deploy
- Bumps `Organization.lastCalendarBotRun` per org on each successful poll
- Heartbeat: `[calendar-bot] alive — processed N polls` every 60s

**Railway deployment:**
| Setting | Value |
|---|---|
| Repo | `kolasys-ai` (web) |
| Start command | `npx tsx src/workers/calendar-bot.worker.ts` |
| Service name | `calendar-bot-worker` |
| Region | US East (Virginia) — same as the other workers |
| Env | Copy all env vars from `summarization-worker` (~30) — needs `DATABASE_URL`, `REDIS_URL`, `NEXT_PUBLIC_APP_URL=https://app.kolasys.ai`, `RECALLAI_API_KEY`, `GOOGLE_CLIENT_ID`/`SECRET`, `MICROSOFT_CLIENT_ID`/`SECRET`/`TENANT_ID`, `SENTRY_DSN` |

### summarization.worker.ts
- Calls Claude to generate structured notes (markdown)
- Extracts action items, contacts, knowledge entities
- Marks recording READY
- Step 8.5: fetches `OrgMember.expoPushToken` for recording owner
- Sends Expo push via `src/services/push.service.ts` (`sendExpoPush()`)
- Push payload: `{ title: recordingTitle, body: 3 bullet points, data: { recordingId }, sound: 'default' }`
- Push failure never fails the job (wrapped in try/catch)

**Railway env vars:** `NEXT_PUBLIC_APP_URL=https://app.kolasys.ai`  
**Local env:** `NEXT_PUBLIC_APP_URL=http://localhost:3000`  
Never mix — workers call tRPC API to update recording status.

---

## Settings Page — All Sections

Current sections in `src/app/dashboard/settings/page.tsx`:

| Section | Component | Status |
|---|---|---|
| Workspace | inline | Read-only: name, slug, plan, member count |
| Account | inline | Clerk user name + email |
| Audio retention | `AudioRetentionToggle` | Toggle — delete audio after transcription |
| Post-meeting email | `PostMeetingEmailToggle` | Toggle — send summary when notes ready |
| Daily digest | `DailyDigestToggle` | Toggle — 8 AM morning recap |
| Recording capture / bot name | `BotDisplayNameInput` | Editable bot display name |
| Single Sign-On | `SsoSettings` | Enterprise plan gate, SAML metadata URL |
| Default language | `DefaultLanguageSelector` | 16 languages + auto-detect |
| AI Skills & Templates | link | → /dashboard/settings/templates |
| API Keys | `ApiKeysSection` | Live — generate/revoke, show once |
| Billing | link | → `/dashboard/billing` (live) |

---

## Design System

### Colors
- **Brand red:** `#CA2625` — primary accent, buttons, icons
- **Error red:** `#EF4444` — errors only. NEVER use for brand elements.
- **Dark theme bg:** `#0F0F13`
- **Dark theme surface:** `#1A1A24`
- **Dark theme border:** `rgba(255,255,255,0.08)`
- **Light content bg:** `#F8F9FC`

### Dashboard Stat Cards (Gradient)
| Card | Gradient |
|---|---|
| Total Recordings | `#667eea` → `#764ba2` (purple) |
| Meeting Notes | `#f093fb` → `#f5576c` (pink/red) |
| Open Action Items | `#4facfe` → `#00f2fe` (blue/cyan) |
| Completed Tasks | `#43e97b` → `#38f9d7` (green/teal) |

### Font
Geist — npm package, bundled (not Google Fonts). Pre-hydration dark mode script in `src/app/layout.tsx` prevents flash on hard reload.

---

## Apple Watch Integration

### Phase 1 ✅ (April 22)
- SwiftUI WatchOS target in mobile Expo project
- WatchConnectivity bridge → React Native JS (`src/lib/watchBridge.ts` in mobile repo)
- Tap mic on wrist → iPhone starts recording
- Live MM:SS timer, haptic on start/stop
- Bundle IDs: iPhone `com.kolasystems.kolasysai`, Watch `com.kolasystems.kolasysai.watchkitapp`

### Phase 2 ✅ (April 27)
- Push token stored on `OrgMember.expoPushToken` (per-user, not per-org)
- `settings.updatePushToken` mutation saves token for `(orgId, userId)`
- Summarization worker sends Expo push on completion
- Notification body = 3 bullet points from summary sections
- WatchOS mirrors iPhone notification to wrist automatically

### Phase 3 ❌ (not built)
- Force Touch to bookmark a transcript moment

---

## Commit History (April 2026)

| Hash | Description |
|---|---|
| `0dd8809` | Brand identity — logo mark, brand red, sidebar, sign-in |
| `3c3ecf2` | Multi-language transcription — 16 languages, org default |
| `9c18e58` | Tier 1: SSO, custom bot name, Ask Kolasys prompts, desktop capture tab (UI only) |
| `ba154b2` | Public pricing page at /pricing |
| `dd59497` | Fix: /pricing added to public routes in Clerk middleware |
| word sync | Word-level audio sync — click word to seek audio (wordsJson on TranscriptSegment) |
| `341e872` | Apple Watch Phase 2 — push token + Expo push on summarization complete |
| `18ab7b8` | API keys — generate/revoke, REST v1 endpoints, Settings UI |
| `1b56be1` | Admin portal v3 — admin management, trial controls, org notes, members viewer |
| `5c78b22` | Admin portal phase 2 — usage limits, send email to org, export org data |
| `fd6f396` | Admin portal phase 3 — stripe billing IDs, audit log, org suspension |
| `9706898` | Fix: removed `import 'server-only'` from `template-matcher.service.ts` (was crashing the Railway summarization worker) |
| `5997f2c` | Stripe billing — checkout, portal, webhook, billing page, updated pricing |

---

## Known Issues / Gotchas

| Issue | Detail |
|---|---|
| Desktop capture | UI tab exists in New Recording modal but actual Mac app is NOT built. It's a Coming Soon placeholder. |
| Embeddings required for AskAI | `search.askAI` returns empty sources if recordings haven't had embeddings generated. Users must click "Generate Embeddings" on Recording Detail page. |
| Prisma v7 no transactions | Use sequential DB calls only. No `$transaction`. |
| tRPC root file | `src/server/root.ts` not `index.ts` — easy to confuse |
| Clerk middleware public routes | Any new public route must be added to `src/proxy.ts` isPublicRoute array |
| Worker NEXT_PUBLIC_APP_URL | Railway must have `https://app.kolasys.ai` — never localhost. Workers call tRPC to update status. |

---

## Admin Portal (April 29, 2026)

`/admin` — internal cross-tenant dashboard. Hard-gated by the `AdminUser`
table (Clerk session + email lookup). On first hit when the table is
empty, `paul@kolasystems.com` is auto-seeded as `SUPER_ADMIN`.

Built across three phases. **All 12 server actions write to
`AdminAuditLog`** via a small `audit(ctx, action, fields)` helper that
catches its own write failures so a flaky audit insert never breaks a
successful mutation.

### Phase 1 — Admin management + trial / notes / members
- Admin Users panel: roster + add/remove forms (SUPER_ADMIN only).
  Refuses to delete the last SUPER_ADMIN; can't remove self.
- Trial controls per org card: Set 14d / Extend +7 / Expire (red),
  with "X days left" / "Expired" / "No trial" badge.
- Notes — collapsible, inline-editable textarea per org card.
- Members panel — collapsible list of `OrgMember` rows + a placeholder
  Transfer Ownership button (single tiny client component).

### Phase 2 — Usage limits, email blast, JSON export
- `Organization.maxRecordingsPerMonth` (0 = unlimited). Per-card usage
  meter ("12 / 100 this month") with green/amber/red threshold.
- Send Message to org — resolves every `OrgMember.userId` to a primary
  email via `clerkClient().users.getUser()`, fans out via Resend with
  subject `"Message from Kolasys AI"`. Per-card success/error banner
  via redirect search params.
- `GET /api/admin/export/[orgId]` — admin-gated JSON dump of org meta +
  members + recordings (with transcripts, segments, notes, sections,
  action items). Streamed as a `Content-Disposition: attachment`
  download.

### Phase 3 — Stripe billing fields, audit log, suspension
- Per-card Billing row: read/write `stripeCustomerId` and
  `stripeSubscriptionId` directly from the admin UI.
- `Organization.suspended Boolean` + `suspendedReason String?`. Card
  turns red-bordered with a SUSPENDED pill in the header. **Visual
  only — `orgProcedure` and `/api/v1` do NOT yet enforce this. A
  suspended org's users can still upload, transcribe, and use the app.**
- Global Audit Log table at the bottom — last 50 entries with When /
  Admin / Action (mono code badge) / Target (org name resolved when
  `targetOrgId` is set) / Details. Note bodies and emailed message
  payloads are recorded as `len=N` / `msgLen=N` to avoid leaking
  sensitive content into the log.

### Roles
- `SUPER_ADMIN` — everything (incl. AdminUser CRUD)
- `ADMIN` — every org-level mutation, no AdminUser CRUD
- `SUPPORT` — read-only; mutating controls hidden or no-op

### Files
- `src/app/admin/page.tsx` — every section, every action, every helper
- `src/app/api/admin/export/[orgId]/route.ts` — JSON export
- `src/components/admin-transfer-ownership-button.tsx` — client placeholder

---

## Stripe Billing (April 29, 2026)

End-to-end subscription billing — Checkout, Customer Portal, webhook,
and an in-app billing page. **`stripe` v22.x installed.**

### Files
- `src/lib/stripe.ts` — lazy SDK singleton (Proxy defers
  instantiation past the build's "collect page data" phase),
  `PRICES` map, `ensureStripeCustomer`, `createOrgCheckoutSession`,
  `createOrgPortalSession`, `planForPriceId`.
- `src/app/api/stripe/checkout/route.ts` — POST, Clerk session.
  Bootstraps the org row if missing, returns `{ url }`.
- `src/app/api/stripe/portal/route.ts` — POST, Clerk session.
  400 if no Stripe customer.
- `src/app/api/stripe/webhook/route.ts` — POST, signature-verified
  via `stripe-signature` + `STRIPE_WEBHOOK_SECRET`. Reads raw body
  with `await request.text()`. Pages-Router `bodyParser: false`
  config does nothing in App Router.
- `src/server/routers/billing.router.ts` — `getSubscription` query,
  `createCheckoutSession` + `createPortalSession` mutations.
- `src/app/dashboard/billing/page.tsx` — current plan badge, trial
  banner with days left, usage meter, Pro/Team upgrade cards on FREE
  (with seat input for Team), Manage Subscription button on paid plans.

### Env vars
| Variable | Notes |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` locally, `sk_live_…` on Vercel + Railway |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Reserved for future Stripe.js Elements use; not consumed by current code |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → endpoint signing secret |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | `price_1TReH9CSoXibpWfNkXad6PaK` (test) |
| `STRIPE_PRO_YEARLY_PRICE_ID` | `price_1TReKGCSoXibpWfNx6C1HT1T` (test) |
| `STRIPE_TEAM_MONTHLY_PRICE_ID` | `price_1TReOnCSoXibpWfNUod8NeTK` (test) |

### Web Push (VAPID) env vars
| Variable | Notes |
|---|---|
| `VAPID_PUBLIC_KEY` | Generated 2026-04-30 via `npx web-push generate-vapid-keys`. Same value local + Vercel + Railway. |
| `VAPID_PRIVATE_KEY` | Server-only; never exposed to the client. |
| `VAPID_SUBJECT` | `mailto:hi@kolasys.ai` — required by RFC 8292. |

### Plans
- **Pro** — $9.99/month or $99/year (save 17%). 14-day trial.
- **Team** — $8.99/seat/month, min 3 seats. 14-day trial.
- **Enterprise** — `mailto:` only.

### Webhook events handled
| Event | Behavior |
|---|---|
| `checkout.session.completed` | Reads `metadata.orgId`, retrieves the subscription, sets `stripeCustomerId` + `stripeSubscriptionId` + `plan` (via `planForPriceId`) + `trialStartedAt`/`trialEndsAt` |
| `customer.subscription.updated` | Finds org by `stripeCustomerId`. Active or trialing → plan from price; anything else → drops to FREE. Trial end synced. |
| `customer.subscription.deleted` | Sets plan = FREE, clears subscriptionId + trialEndsAt |
| `invoice.payment_failed` | Logs to console for now (TODO: dunning email via Resend) |

### Webhook setup
Stripe Dashboard → Developers → Webhooks → Add endpoint
- URL: `https://app.kolasys.ai/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_failed`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET`

### Known issues / followups
- ✅ **Resolved 2026-04-30**: `Plan` enum now has `TEAM` between `PRO` and
  `ENTERPRISE`. `planForPriceId` returns `'TEAM'` for `team_monthly` (no
  longer aliased to ENTERPRISE). `PLAN_CYCLE` in /admin cycles
  FREE → PRO → TEAM → ENTERPRISE → FREE.
- **`apiVersion: '2025-01-27.acacia'`** is older than Stripe v22's
  pinned `'2026-04-22.dahlia'`. Per Stripe docs we suppress the
  literal-narrowing error with `@ts-expect-error`. If the account is
  upgraded, drop the suppression and switch to `'2026-04-22.dahlia'`.
- **`bodyParser: false` is App-Router-irrelevant.** `await request.text()`
  is sufficient for `stripe.webhooks.constructEvent`.
- **`current_period_end` moved off Subscription onto subscription items**
  in dahlia. Billing page reads from `sub.items.data[0].current_period_end`
  with fallback to the legacy top-level field.

### Mobile Bearer-token compat (2026-05-04)
Both `/api/stripe/checkout` and `/api/stripe/portal` use
`auth({ acceptsToken: 'session_token' })` so they accept both the
browser session cookie AND `Authorization: Bearer <session-jwt>`
from the mobile app's `getToken()`. Without it Clerk only inspects
the cookie and 401s a header-only request.

---

## Railway Workers — operational notes (April 29, 2026)

- Both workers (`transcription` + `summarization`) **migrated to US
  East (Virginia)** for proximity to Neon.
- **Account upgraded to Hobby plan** so the workers can run 24/7
  without the free-tier sleep timeout.
- **Summarization worker crash root-caused.** Symptom: worker died
  on startup with `"You're importing a component that needs
  server-only..."` and 5 jobs piled up in `summarizationQueue.waiting`
  while `active=0`. Cause: `import 'server-only'` in
  `src/services/template-matcher.service.ts` — added defensively when
  auto-apply templates shipped, but the package throws unconditionally
  outside a Next.js bundle. **Fixed in `9706898`** by removing the
  marker; client safety is enforced anyway because the file imports
  `@/lib/db` (Prisma is Node-only). Verified locally with
  `npx tsx -e "import('./src/workers/summarization.worker.ts')"`.

### Worker health visibility
- Heartbeat: each worker logs `[<name>] alive — processed N jobs,
  last job: <id>` every 60 s. Gaps >60 s = the worker is hung in a
  Claude/Whisper call or has crashed silently.
- The /admin Worker Health card pulls `getJobCounts()` from BullMQ
  live on every page load. `Healthy` = waiting≤5 + failed≤10,
  `Degraded` = waiting>5, `Down` = failed>10.

---

## Schema changes (April 29, 2026)

Pushed via `npx prisma db push` (no formal migrations — Neon
schema-first workflow).

### New enum
```prisma
enum AdminRole {
  SUPER_ADMIN
  ADMIN
  SUPPORT
}
```

### New models
```prisma
model AdminUser {
  id        String    @id @default(cuid())
  email     String    @unique
  role      AdminRole @default(ADMIN)
  addedBy   String?
  createdAt DateTime  @default(now())
}

model AdminAuditLog {
  id          String   @id @default(cuid())
  adminEmail  String
  action      String
  targetOrgId String?
  targetEmail String?
  details     String?
  createdAt   DateTime @default(now())

  @@index([createdAt(sort: Desc)])
  @@index([targetOrgId])
}
```

### New `Organization` columns
- `trialStartedAt DateTime?`
- `trialEndsAt DateTime?`
- `notes String?`
- `maxRecordingsPerMonth Int @default(0)` (0 = unlimited)
- `stripeCustomerId String?`
- `stripeSubscriptionId String?`
- `suspended Boolean @default(false)`
- `suspendedReason String?`

---

## Plan enforcement (2026-04-30)

The free-tier cap and admin-set per-org cap are checked on **both**
ingress paths so the desktop app can't bypass them.

- `recordings.create` (tRPC) — counts recordings since the 1st of the
  current calendar month. Throws `FORBIDDEN` if the org is on `FREE`
  with no active trial AND has 3+ recordings already, with message:
  `"Free plan limit reached. Upgrade to Pro for unlimited recordings."`.
  Independently throws if `Organization.maxRecordingsPerMonth > 0` and
  the count exceeds it (regardless of plan).
- `POST /api/v1/recordings` (REST, bearer-token) — same logic, returns
  HTTP 403 with `{ error, message }`.

## Suspension enforcement (2026-04-30)

Previously visual-only — now hard-gated everywhere user code can hit:

- `orgProcedure` (`src/server/trpc.ts`) — after resolving the
  Organization row, throws `FORBIDDEN` with
  `"Your account has been suspended. Contact support@kolasys.ai."` if
  `org.suspended === true`. Sits between org-resolve and member-resolve
  so suspended orgs can't auto-bootstrap membership rows either.
- `authenticateApiKey` (`src/lib/api-auth.ts`) — same check, but
  returns `null` (treats the key as if revoked → 401 at the route).
  Avoids leaking the underlying reason to external integrations.

## "Meetings" rename (2026-05-04)

User-facing label flip — the URL still resolves at `/dashboard/recordings`
so existing bookmarks and share links continue to work.

- Sidebar (`src/components/sidebar.tsx`) — "Recordings" → "Meetings"
- Mobile drawer (`src/components/mobile-nav.tsx`) — same
- Page heading (`src/app/dashboard/recordings/page.tsx`) — H1 + subtitle

The Prisma `Recording` model and the `recordings` tRPC router are
unchanged — this is pure UI copy.

## AI-generated meeting titles (2026-05-04)

Replaces the generic `"Recording – Apr 29 10:39 AM"` default with
something topical like `"May 4 — Q3 budget alignment"`.

### Worker step 8.4 (in `summarization.worker.ts`)
Runs after the recording is marked `READY`, before push notifications
fire so the notification body shows the new title. Skips silently if the
title doesn't match the default-title detector. Failures are logged but
never fail the job.

### Default-title detector (broadened 2026-05-05)
A title is considered "default" (and thus eligible for AI rewrite) when:
```ts
!recording.title?.trim()
  || /^Recording\s*[–-]/i.test(recording.title)
  || /^Shared\s/i.test(recording.title)
  || /^audio$/i.test(recording.title.trim())
  || /^voice\s*memo/i.test(recording.title)
  || /^untitled/i.test(recording.title)
  || /^\d{4}[-_]\d{2}[-_]\d{2}/.test(recording.title)   // YYYY-MM-DD prefix
```

### Helpers in `src/services/summarization.service.ts`
- `generateAiMeetingTitle({ summary, transcriptText })` — Claude
  `claude-haiku-4-5-20251001`, `max_tokens: 50`. Cleans surrounding
  quotes and trailing punctuation, caps at 120 chars.
- `formatTitleWithDate(date, aiTitle)` — `"${monthDay} — ${aiTitle}"`
  (e.g. `"May 4 — Q3 budget alignment"`).

### On-demand regeneration
- `recordings.regenerateTitle({ recordingId })` — same Haiku call
  regardless of current title. Surfaced in the recording detail
  "..." menu as **Regenerate title** with the Wand2 icon. Disabled
  until a transcript exists; surfaces inline error on Haiku failure;
  `router.refresh()` on success.

## Shareable recording links (2026-04-30, expanded 2026-05-01)

Public `/share/{slug}` page rendered with no auth. Audio is intentionally
omitted — S3 stays private.

### Schema (Recording)
- `isPublic Boolean @default(false)`
- `publicSlug String? @unique` — 8-char URL-safe (alphabet drops
  ambiguous chars 0/O/1/l). Retained even after Make Private so the
  same URL re-activates if re-shared.
- `sharePermissions Json?` — `{ transcript, summary, actionItems }`
  booleans. `null` = legacy all-on.
- `shareExpiresAt DateTime?` — null = never expires.

### Plaud-style modal (`src/components/share-recording-button.tsx`)
- Trigger button flips to a green "Sharing" pill with globe icon when
  public.
- Tab 1 — Share link: toggle, copyable URL, three permission
  checkboxes, expiry dropdown (Never / 7d / 14d / 30d), Save button.
  Calling `makePublic` again with new settings is the Save path —
  idempotent on the slug.
- Tab 2 — Invite: email input + invitee list + remove. Stored in
  `SharedInvite` table for audit. **Access enforcement is not yet
  wired** — invitee emails don't gate `/share/{slug}` (the link is
  still open to anyone who has it). Modal surfaces this warning.

### Public page (`src/app/share/[slug]/page.tsx`)
- Returns `<ExpiredView />` if `shareExpiresAt < now`.
- Each section gates on its permission flag (Sections inherit Summary).
- Tracks no view count yet.

## Soundbites (2026-04-30)

Virtual clip ranges over the parent recording's audio — no audio is
duplicated.

### Schema
```prisma
model Soundbite {
  id           String   @id @default(cuid())
  recordingId  String
  orgId        String
  title        String
  startSeconds Float
  endSeconds   Float
  transcript   String?  // captured snippet
  createdAt    DateTime @default(now())
  @@index([recordingId, startSeconds])
  @@index([orgId, createdAt(sort: Desc)])
}
```

### Capture flow
- `transcript-paginated.tsx` annotates every word button (and the
  plain-text fallback for old recordings) with `data-sb-start` and
  `data-sb-end` attributes.
- `<SoundbiteCapture>` overlay in `recording-split-view.tsx` watches
  `selectionchange`, derives the time range from the first/last
  annotated DOM elements in the selection, and shows a floating
  "Create soundbite" button positioned via `getBoundingClientRect`.
  Click → prompts for a title → calls `soundbites.create`.

### UI surfaces
- New **Soundbites** tab on the recording split view (mobile + desktop).
  Shows a persistent banner with an "Open transcript" button so users
  who land on this tab can find the create-soundbite flow.
- `/dashboard/soundbites` global page — cross-recording browser.
- Sidebar + mobile-nav links.

## Web Push (2026-04-30)

Mounts on every dashboard page. Browser → backend → service worker →
desktop notification.

### Schema
```prisma
model WebPushSubscription {
  id          String   @id @default(cuid())
  orgMemberId String
  endpoint    String   @unique
  p256dh      String
  auth        String
  createdAt   DateTime @default(now())
  @@index([orgMemberId])
}
```

### Pieces
- `public/sw.js` — service worker. Handles `push` (renders system
  notification from `{ title, body, url, icon }`) and
  `notificationclick` (focuses an existing tab + navigates, or opens
  new).
- `src/lib/web-push.ts` — lazy VAPID config (defers reading env until
  first send so build's "collect page data" pass doesn't trip).
  `sendWebPushToMember(orgMemberId, payload)` fans out to every
  subscription, auto-prunes 404/410 (Gone) responses.
- `src/app/api/push/vapid-public-key/route.ts` — GET. Returns
  `{ publicKey }` from `VAPID_PUBLIC_KEY`.
- `src/app/api/push/subscribe/route.ts` — POST. Saves the
  PushSubscription against the active OrgMember.
- `src/components/web-push-registrar.tsx` — mounted in
  `dashboard/layout.tsx`. Registers `/sw.js`, requests permission
  (skips if previously denied or this-session-declined), subscribes,
  POSTs to `/api/push/subscribe`.

### Worker integration
Step 8.5 (push) now fires Expo push (iPhone + Apple Watch) AND web
push to every browser the recording's owner has subscribed in. Each
send is independently non-fatal — failures log but never fail the job.

---

## Commit history — May 2026

| Hash | Description |
|---|---|
| `f8307b2` | Free-tier cap on REST `POST /api/v1/recordings` (desktop app path) |
| `9706898` | Removed `import 'server-only'` crashing the Railway summarization worker |
| `5997f2c` | Stripe billing — checkout, portal, webhook, billing page, updated pricing |
| `e49530f` | TEAM plan enum + suspension enforcement + free-tier cap (tRPC) |
| `b454c66` | Voice memo upload, onboarding email, trial banner, billing portal section |
| `5a28238` | Shareable links + Soundbites + Web Push (3 features at once) |
| `194f9ec` | Plaud-style share modal — permissions, expiry, invites |
| `130be9e` | Edit title, speaker rename, retry stuck (10m threshold) |
| `e55375f` | AI-generated meeting titles with date prefix |
| `36a4791` | Billing page trial copy — clearer free trial messaging |
| `68cdb0c` | AI-title regex broadened (Shared / audio / voice memo / untitled / YYYY-MM-DD) |
| `83ef4d4` | "Recordings" → "Meetings" rename (sidebar + mobile + heading) |
| `5d6bf01` | Stripe checkout accepts Bearer tokens from mobile |
| `6f51991` | Stripe portal accepts Bearer tokens from mobile |
| `c6706ca` | api-auth — Clerk session JWTs accepted alongside kol_ API keys |

## Commit history — June 2026

| Hash | Description |
|---|---|
| `a951643` | fix: api-auth — verifyToken via standalone import (correct Clerk 7 API) |
| `e474977` | fix: PATCH /api/v1/recordings/[id]/notes — body field `notes` → `personalNotes` |
| `ba93043` | fix: series.addRecording — upsert → findUnique+create (Neon HTTP compat) |
| `5cb0012` | feat: pre-meeting intelligence — series-aware brief + Expo push 30 min before |
| `02c64d3` | feat: GET /api/v1/premeet-brief — serve pre-meeting brief from Redis |
| `147fe7f` | feat: org settings schema (internalJargon / companyDescription / autoDeleteTranscriptsDays) |
| `afc5113` | feat: DELETE /api/v1/calendar — disconnect Google/Microsoft calendar via REST |
| `a45fb35` | feat: meeting import tool — Fireflies, Otter.ai, Fathom, Read AI |
| `a8331ec` | feat: dashboard — warm bg (#EEEAE3), white cards, client-side humorous greeting pool |
| `844a946` | fix: import parsers — pdf-parse dynamic import + nodejs runtime (Turbopack compat) |
| `e15db07` | feat: importPlatform in recordings.list, memberId in getOrgSettings, lastMeetingId in premeet brief |
| `871ce9c` | fix: DELETE /api/v1/calendar 500 (updateMany → findFirst+update) + /settings/calendar redirect |
| `a4ed298` | docs: Neon HTTP limitation warning in src/lib/db.ts |

---

## Neon HTTP adapter — safe patterns (2026-06-03)

Comment added to `src/lib/db.ts`. Operations that throw "Transactions are not supported in HTTP mode":
- `prisma.$transaction()`
- `upsert` (in some Prisma/Neon versions)
- `updateMany` (uses implicit interactive transaction internally)

**Instead of upsert:**
```ts
const existing = await db.model.findUnique({ where: {...} })
if (!existing) await db.model.create({ data: {...} })
```

**Instead of updateMany:**
```ts
const record = await db.model.findFirst({ where: {...} })
if (record) await db.model.update({ where: { id: record.id }, data: {...} })
```

Fixed so far: `series.addRecording` (ba93043), `DELETE /api/v1/calendar` (871ce9c).

---

## api-auth — dual Bearer support (2026-06-01)

`src/lib/api-auth.ts` accepts two Bearer formats:

1. `kol_<hex>` — long-lived API key (hash lookup, same as before)
2. `<clerk-session-jwt>` — Clerk session token verified via `verifyToken(token, { secretKey })` from `@clerk/nextjs/server` (standalone export, NOT a method on ClerkClient). On success, resolves org via `db.orgMember.findFirst({ where: { userId: verified.sub } })`.

When a Clerk JWT is used, `auth.userId` is populated and `auth.keyId = \`clerk:${userId}\``.

---

## Pre-meeting intelligence (2026-06-02)

### Calendar-bot worker additions (`src/workers/calendar-bot.ts`)
- `LOOKAHEAD_MS` bumped 15 → 35 min to cover the pre-meeting window
- Member select gains `id` + `expoPushToken`
- **28–32 min window**: `maybeSendPreMeetingBrief()` fires before the 4–6 min deploy window
  - `findMatchingSeriesForEvent()` — queries all org series, runs `titleSimilarity` (0.3 threshold, same as detection)
  - Fetches last meeting in matched series with `notes: { include: { actionItems: true } }`
  - Stores Redis brief at `premeet:{memberId}:{titleSlug}:{YYYY-MM-DD}` (TTL 2 h)
  - Redis dedupe at `premeet-sent:{orgId}:{externalId}` (TTL 90 min) prevents re-fire
  - Sends Expo push: `"📋 [title] starts in 30 min"` + open action item count

### `normalizeTitle` + `titleSimilarity` exported from series-detection.service.ts
Both functions are now `export` so the calendar-bot can import them without duplication.

### GET /api/v1/premeet-brief
Query params: `memberId`, `titleSlug`, `date` (YYYY-MM-DD).
Reads Redis key `premeet:{memberId}:{titleSlug}:{date}` → 200 with parsed JSON or 404.
Brief shape: `{ seriesName, lastMeetingDate, openActionItems[], summary }`.

---

## Org settings — new fields (2026-06-02)

Three new nullable columns on `Organization` (pushed to Neon, Prisma client regenerated):

| Field | Type | Purpose |
|---|---|---|
| `internalJargon` | `String?` | Org-specific terms fed into Claude prompts |
| `companyDescription` | `String?` | Company context for Claude prompts |
| `autoDeleteTranscriptsDays` | `Int?` | Auto-delete transcripts after N days (null = keep forever) |

All three wired through `settings.getOrgSettings` (select + return) and `settings.updateOrgSettings` (zod: jargon/description max 2000 chars nullable, days int 1–3650 nullable).

---

## REST API additions (2026-06-02)

### DELETE /api/v1/calendar
`src/app/api/v1/calendar/route.ts` — disconnects Google and/or Microsoft calendar for the authenticated user. No separate CalendarIntegration model — tokens live on `OrgMember` (`googleRefreshToken`, `microsoftRefreshToken`). Uses `updateMany` so it works with both Clerk JWT auth (scoped to `userId`) and kol_ API keys (org-wide).

Optional query param: `?provider=google|microsoft` — omit to clear both. Returns 404 if no calendar was connected (`result.count === 0`).

### PATCH /api/v1/recordings/[id]/notes
Body field is `{ personalNotes: string }` (NOT `{ notes }`). Writes to `Recording.personalNotes`.

---

## Meeting import tool (2026-06-02)

### Schema
- `RecordingSource` enum gains `IMPORT`
- `Recording` model gains `importPlatform String?` and `importedAt DateTime?`

### Files
- `src/app/dashboard/import/page.tsx` — 4 platform cards + drag-and-drop upload modal. Client component, POSTs to `/api/v1/import`.
- `src/app/api/v1/import/route.ts` — multipart POST (`platform` + `file`). Routes to parser, persists `Recording → Note → Transcript → TranscriptSegment → ActionItem[]` sequentially (no transactions).
- `src/services/import-parsers.ts` — four parsers:
  - **Fireflies** (`fireflies`): ZIP → JSON files. Fields: `title`, `date`, `duration`, `summary`, `transcript[]`, `action_items[]`.
  - **Otter.ai** (`otter`): TXT (speaker + HH:MM lines) or SRT (numbered timestamp blocks).
  - **Fathom** (`fathom`): CSV with inline RFC-4180 parser. Columns: Title, Date, Duration, Summary, Action Items.
  - **Read AI** (`readai`): PDF via `require('pdf-parse/lib/pdf-parse.js')` (avoids Next.js webpack test-file issue). Section extraction by heading regex.

Response: `{ imported: number, skipped: number, meetings: [{ id, title }] }`.

Sidebar: "Import" link with Upload icon added above Templates in Group 3.

---

## Dashboard UI (2026-06-02)

- **Background**: layout `<main>` changed `#F8F9FC` → `#EEEAE3` (warm linen). Dark stays `#0F0F13`.
- **Cards**: stat cards, AI feature cards, recent meetings list, empty state — all now `bg-white shadow-sm border-neutral-100/60`. Stat cards get `hover:shadow-md`.
- **Greeting**: `DashboardGreeting` client component (`src/components/dashboard-greeting.tsx`) replaces server-side `greetingFor(new Date())`. Uses `useEffect` + `new Date().getHours()` for the user's local timezone. 20 humorous greetings in 3 time-of-day pools (morning / afternoon / evening). Renders an invisible placeholder during SSR to prevent layout shift.
