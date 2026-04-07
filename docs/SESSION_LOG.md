# Kolasys AI — Session Log

Running record of all build sessions: what was built, decisions made, and current state.

---

## Session 1 — 2026-04-03

**Machine:** Mac Studio  
**Goal:** Take the blank `create-next-app` scaffold to a complete Phase 1 foundation.

### What was built

**Full Phase 1 project scaffold — 34 files created or replaced.**

**Schema & config (4 files)**
- `prisma/schema.prisma` — 11 models, 9 enums, Prisma v7 `prisma-client` provider, output to `src/generated/prisma`
- `.env.example` — 19 environment variable placeholders
- `next.config.ts` — S3 image patterns, `serverExternalPackages` for ioredis/bullmq
- `tsconfig.json` — `@/*` path alias mapped to `./src/*`

**Infrastructure libraries (6 files)**
- `src/lib/db.ts` — Prisma singleton (wrong constructor — fixed Session 2)
- `src/lib/redis.ts` — two IORedis clients (general + BullMQ-dedicated)
- `src/lib/storage.ts` — S3 upload, download, presigned URLs, delete
- `src/lib/queues.ts` — BullMQ queue definitions (transcription, summarization)
- `src/lib/trpc.ts` — `createTRPCReact<AppRouter>()` (missing `'use client'` — fixed Session 2)
- `src/lib/utils.ts` — `cn`, `formatDuration`, `formatFileSize`, `slugify`, `relativeTime`

**tRPC API layer (4 files)**
- `src/providers/trpc-provider.tsx` — React Query + tRPC provider (client component)
- `src/server/trpc.ts` — tRPC init, context factory, procedure tiers
- `src/server/root.ts` — combined `appRouter` and `AppRouter` type
- `src/server/routers/recordings.router.ts` — recordings CRUD + upload flow

**Services (3 files)**
- `src/services/transcription.service.ts` — OpenAI Whisper wrapper with segment extraction
- `src/services/summarization.service.ts` — Anthropic Claude structured JSON output
- `src/services/meetingbot.service.ts` — Recall.ai REST client

**Workers (1 file)**
- `src/workers/transcription.worker.ts` — BullMQ: download → transcribe → persist → enqueue
- *(summarization.worker.ts not yet written — queue wired but nothing consuming it)*

**Components (3 files)**
- `src/components/status-badge.tsx` — enum-mapped coloured badge
- `src/components/browser-recorder.tsx` — MediaRecorder API component
- `src/components/new-recording-modal.tsx` — 3-tab modal (upload / record / bot)

**App pages (9 files)**
- `src/app/layout.tsx` — root layout with ClerkProvider + TRPCReactProvider
- `src/app/page.tsx` — root redirect
- `src/app/globals.css` — Tailwind v4 with `@theme {}`
- `src/app/dashboard/layout.tsx` — sidebar + org switcher
- `src/app/dashboard/page.tsx` — overview stats
- `src/app/dashboard/recordings/page.tsx` — infinite scroll list
- `src/app/dashboard/recordings/[id]/page.tsx` — recording detail
- `src/app/api/trpc/[trpc]/route.ts` — tRPC handler
- `src/app/api/webhooks/clerk/route.ts` — Clerk org/membership sync
- `src/app/api/webhooks/recall/route.ts` — Recall.ai bot events

**Auth proxy + seed + docs (9 files)**
- `src/proxy.ts` — Clerk middleware
- `prisma/seed.ts` — 4 built-in note templates
- `docs/` — README, SETUP, ARCHITECTURE, COMPLIANCE, PHASE1, PHASE2, SESSION_LOG

**Total: 34 files created or modified**

### Key decisions made

| Decision | Rationale |
|---|---|
| `src/` directory structure | Standard for larger Next.js apps; keeps config at root clean |
| Direct-to-S3 upload via presigned URLs | Vercel 4.5 MB body limit — presigned URLs bypass the server entirely |
| BullMQ + separate worker process | AI processing exceeds Vercel function timeout; workers run on Railway |
| Two Redis connections | BullMQ requires `maxRetriesPerRequest: null`; sharing one client would break general use |
| `fetchRequestHandler` for tRPC | Required for Next.js 16 App Router (not legacy `nextjs/adapter`) |
| `await params` everywhere | Next.js 16 breaking change: `params` and `searchParams` are Promises |
| Tailwind v4 CSS config | v4 uses `@theme {}` in CSS — no `tailwind.config.js` needed |
| `superjson` transformer | Handles Date, BigInt, undefined through tRPC automatically |
| `claude-sonnet-4-6` | Best balance of quality/cost/speed for structured JSON output |
| `timingSafeEqual` for Recall.ai webhooks | Prevents timing attacks; uses built-in `crypto` module |
| `svix` for Clerk webhooks | Clerk's official library; handles header parsing + HMAC |

### Open questions at end of session

- [ ] Summarisation worker not written
- [ ] Root `app/` directory must be deleted (conflicts with `src/app/`)
- [ ] `svix` missing from `package.json`
- [ ] Prisma constructor API wrong in `db.ts`
- [ ] `'use client'` missing from `trpc.ts`

---

## Session 2 — 2026-04-04

**Machine:** Mac Studio  
**Goal:** Fix all Session 1 blockers, get end-to-end pipeline working.

### Setup

Configured AWS credentials in `.env`. Created S3 bucket `kolasys-ai-recordings` in `us-east-1`.

### Bugs fixed

| # | Bug | Root cause | Fix |
|---|---|---|---|
| 1 | Prisma v7 constructor | Used v6 `PrismaNeon(Pool)` API | `PrismaNeonHttp(process.env.DATABASE_URL!)` |
| 2 | Prisma enums in client components | Prisma uses Node.js APIs — crashes client bundle | Replace with local string union types |
| 3 | Missing `'use client'` in `trpc.ts` | `import type { AppRouter }` pulled Prisma into client bundle | Added `'use client'` as first line |
| 4 | Missing `server-only` guards | Server files could be accidentally imported client-side | Added to `server/trpc.ts`, `server/root.ts`, `db.ts`, `storage.ts` (db.ts/storage.ts reverted in Session 3) |
| 5 | Next.js 16 async `params` | `params` is now `Promise<{}>` | `const { id } = await params` in page + `generateMetadata` |
| 6 | Clerk catch-all routes | Clerk sub-routes need `[[...sign-in]]` folder structure | Moved to `[[...sign-in]]/page.tsx` and `[[...sign-up]]/page.tsx` |
| 7 | Next.js 16 middleware | Needed Clerk v7 import path | Updated to `@clerk/nextjs/server` |
| 8 | Legacy `app/` directory | Scaffold left root `app/` conflicting with `src/app/` | `rm -rf app/` |
| 9 | Missing `svix` | Clerk webhook handler imported svix but it wasn't installed | `npm install svix` |
| 9b | Port conflict + slow compile | Crashed process left port 3000 bound | `--port 3001` workaround; Turbopack warms up after 2–3 reloads |

### New: summarization.worker.ts

Written and tested. Flow: fetch transcript → load NoteTemplate → call Claude → save Note + NoteSection[] + ActionItem[] → status = READY.

### Milestone: First successful end-to-end test

Upload → S3 → Whisper → Claude → notes saved. All working on Mac Studio 2026-04-04.

### Open questions at end of session

- [ ] Configure `CLERK_WEBHOOK_SECRET` + ngrok for org sync
- [ ] Configure `RECALLAI_API_KEY` + test meeting bot
- [ ] Real-time processing status polling (P1)
- [ ] Action items page (P1)
- [ ] Settings page (P1)
- [ ] Worker Dockerfile for Railway/Render (P1)

---

## Session 3 — 2026-04-06

**Machine:** Mac Mini (first time using this machine — fresh clone)  
**Goal:** Get running on Mac Mini, fix all P0/P1 issues, build Phase 2, deploy to Vercel.

### Mac Mini setup

1. Installed Node.js 22
2. `git clone https://github.com/kolasystems/kolasys-ai`
3. Copied `.env` from Mac Studio
4. `npm install && npx prisma generate`
5. Started workers — both crashed immediately → see Bug 10

### Bugs fixed

| # | Bug | Root cause | Fix |
|---|---|---|---|
| 10 | `server-only` blocking workers | `db.ts` + `storage.ts` had `server-only`; throws outside Next.js bundler | Removed `server-only` from those two files |
| 11 | `$transaction` unsupported in HTTP mode | PrismaNeonHttp is stateless — can't hold transaction state | Sequential individual Prisma calls |
| 12 | `upsert` unsupported in HTTP mode | Not supported by HTTP adapter | `findUnique` → `create` or `update` |
| 13 | Nested writes (implicit transactions) | `{ segments: { create: [...] } }` = implicit transaction | Explicit parent create then `Promise.all(segments.map(...))` |
| 14 | Org FK constraint on first recording | Clerk webhook not configured locally; org row missing from DB | `orgProcedure` auto-provisions org from Clerk `auth()` context |
| 15 | `recordings.get` not org-scoped | Any authenticated user could read any recording by UUID | `recording.orgId !== ctx.orgId` check + `FORBIDDEN` error |
| 16 | S3 files never deleted | Deletion was in silent `try/catch` | Moved after transcript commit; errors logged explicitly |
| 17 | Worker env vars not loading | `process.env` empty in standalone `tsx` — Next.js injection doesn't apply | `import 'dotenv/config'` as first line in both workers |

### P0 audit completed

Full security and correctness audit. All 10 P0 items confirmed fixed. See `docs/PHASE2.md` for the audit list.

### Phase 1 — fully resolved

All P0 bugs fixed. Pipeline confirmed working on Mac Mini.

### P1 features built

- `recording-status-poller.tsx` — polls `recordings.get` every 5s while PROCESSING
- `editable-note-section.tsx` — inline editor with `trpc.recordings.updateNoteSection`
- `editable-action-item.tsx` — inline status/priority editor
- `/dashboard/action-items` — list, filter by status, update inline
- `/dashboard/settings` — org name, note templates, integrations tab
- `delete-recording-button.tsx` — confirmation dialog + S3 + DB cleanup
- `transcript-paginated.tsx` — paginated transcript viewer

### Phase 2 features built

**Speaker diarization**
- `src/services/diarization.service.ts` — Deepgram `diarize=true` API
- Maps Deepgram word timestamps to TranscriptSegment records by overlap voting
- `SpeakerLabel` model added to schema
- `speaker-label-editor.tsx` — rename speaker IDs to real names
- Transcript viewer shows speaker names when available
- Non-fatal: diarization failure doesn't prevent transcript from saving

**Ask AI / vector search**
- `src/services/embeddings.service.ts` — `text-embedding-3-small`, 500-char chunks, 100-char overlap
- `src/lib/db-vector.ts` — pgvector helpers for cosine similarity search
- `src/app/api/ai/ask/route.ts` — vector search → context assembly → Claude answer
- `ask-ai-panel.tsx` + `use-ai-chat.ts` — streaming Q&A UI in recording detail

**Calendar sync**
- `src/app/api/auth/google/route.ts` + `callback/route.ts` — Google OAuth
- `OrgMember.googleRefreshToken` field stores refresh token
- `calendar-meetings-list.tsx` — upcoming meetings with conference links
- `/dashboard/calendar` page
- "Record this meeting" button pre-fills recording modal

**Slack integration**
- `src/services/integrations/slack.service.ts`
- Posts formatted Slack blocks after notes generated: header, summary, action items, link
- `Organization.slackWebhookUrl` field in schema
- Settings UI: paste incoming webhook URL, enable/disable

**Notion integration**
- `src/services/integrations/notion.service.ts`
- Creates Notion page: callout summary, heading_2 sections, to-do action items, link back
- `Organization.notionApiKey` + `Organization.notionDatabaseId` fields
- Settings UI: connect Notion workspace

**Sentry**
- `sentry.server.config.ts`, `sentry.client.config.ts`, `sentry.edge.config.ts`
- Workers init Sentry before all other imports
- `next.config.ts` wrapped with `withSentryConfig`
- 20% trace sampling in prod, 100% dev
- Session replay: 10% sessions, 100% on error
- Tags: `worker`, `jobId`, `recordingId`, `attempt`

**PostHog**
- `src/lib/posthog.ts` — server-side, serverless mode (flushAt=1)
- `posthog-provider.tsx` — client-side pageview tracking
- Events: `recording_uploaded`, `note_viewed`, `action_item_completed`, `recording_ready`

**Resend + email templates**
- `src/lib/email.ts` — Resend client
- `src/emails/notes-ready.tsx` — meeting summary with sections + action items
- `src/emails/weekly-digest.tsx` — weekly meeting recap
- `src/emails/welcome.tsx` — new user onboarding
- Summarization worker sends notes-ready email on completion

### Deployed to production

1. `git push` to GitHub (`kolasystems/kolasys-ai`)
2. Vercel: import project → set all 26 env vars → deploy
3. Custom domain `app.kolasys.ai` added in Vercel
4. Cloudflare DNS: CNAME `app` → Vercel deployment URL
5. SSL provisioned automatically by Vercel

**Live: https://app.kolasys.ai**

### Current state at end of session

- All P0 + P1 bugs fixed
- Phase 1 + Phase 2 complete
- Deployed to https://app.kolasys.ai
- Workers NOT yet deployed (blocking: production pipeline needs Railway/Fly.io)
- Recall.ai not yet tested end-to-end (needs `RECALLAI_API_KEY`)
- Clerk webhook needs production URL update in Clerk dashboard

### Next priorities

- [ ] Deploy workers to Railway or Fly.io (P0 for production pipeline)
- [ ] Update Clerk webhook URL to `https://app.kolasys.ai/api/webhooks/clerk`
- [ ] Update Recall.ai webhook URL to `https://app.kolasys.ai/api/webhooks/recall`
- [ ] Test meeting bot end-to-end after `RECALLAI_API_KEY` configured
- [ ] Test weekly digest cron (Vercel cron configured)
- [ ] iOS app development (Phase 3)

---

*Add new sessions below this line as development continues.*

---

<!-- Template for new sessions:

## Session N — YYYY-MM-DD

**Machine:**
**Goal:**

### What was built / fixed

### Key decisions made

| Decision | Rationale |
|---|---|

### Bugs fixed

| # | Bug | Root cause | Fix |
|---|---|---|---|

### Open questions / TODOs at end of session

### Next session priorities

-->
