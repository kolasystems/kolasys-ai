# Kolasys AI Web — Claude Reference

> Quick-start for a new Claude Code session on the web repo.

**Repo:** https://github.com/kolasystems/kolasys-ai  
**Production:** https://app.kolasys.ai  
**tRPC API:** `https://app.kolasys.ai/api/trpc`  
**Mobile repo:** `~/Desktop/kolasys-ai-mobile` · `github.com/kolasystems/kolasys-ai-mobile`  
**Last updated:** 2026-04-27

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
- `/api/webhooks/(.*)`
- `/api/v1/(.*)` — bearer-token authenticated REST API

---

## Project Structure

```
src/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx                  Overview — gradient stat cards
│   │   ├── recordings/page.tsx       Recordings list + semantic search
│   │   ├── action-items/page.tsx     Action items across all recordings
│   │   ├── analytics/page.tsx        Conversation intelligence
│   │   ├── contacts/page.tsx         Auto-extracted contacts
│   │   ├── ask-ai/page.tsx           Global Ask AI (uses /api/ai/ask SSE)
│   │   ├── calendar/page.tsx         Calendar + Google OAuth
│   │   ├── settings/page.tsx         All settings sections
│   │   ├── settings/templates/       Template management
│   │   └── recordings/[id]/page.tsx  Split-pane recording detail
│   ├── api/
│   │   ├── ai/ask/route.ts           POST — SSE stream (Anthropic + pgvector)
│   │   ├── ai/suggestions/route.ts   POST — post-meeting analysis
│   │   ├── auth/google/              Google OAuth for calendar
│   │   ├── cron/daily-digest/        8 AM cron
│   │   ├── cron/weekly-digest/       Weekly recap
│   │   ├── trpc/[trpc]/route.ts      tRPC HTTP handler
│   │   ├── webhooks/clerk/route.ts   Clerk org/user sync (svix HMAC)
│   │   ├── webhooks/recall/route.ts  Recall.ai bot status events
│   │   └── v1/                       Public REST API (bearer-token auth)
│   │       └── recordings/
│   │           ├── route.ts          GET /api/v1/recordings
│   │           └── [id]/
│   │               ├── transcript/   GET /api/v1/recordings/{id}/transcript
│   │               └── actions/      GET /api/v1/recordings/{id}/actions
│   ├── pricing/page.tsx              Public pricing page (no auth required)
│   └── layout.tsx                    Pre-hydration dark mode script in <head>
├── server/
│   ├── root.ts                       Root tRPC router — register all routers here
│   └── routers/
│       ├── recordings.router.ts
│       ├── search.router.ts          search.askAI — global vector search
│       ├── settings.router.ts
│       ├── apikeys.router.ts         API key generation + revocation
│       ├── analytics.router.ts
│       ├── contacts.router.ts
│       ├── knowledge.router.ts
│       └── templates.router.ts (or similar)
├── workers/
│   ├── transcription.worker.ts       Upstash Redis queue consumer
│   └── summarization.worker.ts       Upstash Redis queue consumer + Expo push
├── services/
│   └── push.service.ts               sendExpoPush() — Expo Push API, no SDK
├── lib/
│   ├── db.ts                         Prisma client
│   ├── api-auth.ts                   Bearer token auth for /api/v1/ routes
│   └── trpc.ts                       tRPC context + middleware
└── components/
    ├── api-keys-section.tsx          API Keys UI in Settings
    ├── audio-retention-toggle.tsx
    ├── post-meeting-email-toggle.tsx
    ├── daily-digest-toggle.tsx
    ├── default-language-selector.tsx
    ├── bot-display-name-input.tsx
    ├── sso-settings.tsx
    └── dark-mode-toggle.tsx
```

---

## tRPC Routers — All Procedures

### recordings.router.ts
```
recordings.list              GET    { limit?: number } — includes nested actionItems[]
recordings.get               GET    { id }
recordings.updateActionItem  POST   { id, status?, priority? }
                                    status: OPEN | IN_PROGRESS | COMPLETED | CANCELLED
                                    priority: LOW | MEDIUM | HIGH | URGENT
recordings.refineSummary     POST   { id } — calls Claude Opus, returns refined markdown
recordings.confirmUpload     POST   { id } — after S3 upload, triggers transcription queue
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
| Billing | Coming soon stub | Not yet built |

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
