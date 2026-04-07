# Kolasys AI — Complete Project History

Full timeline from blank scaffold to deployed product.

---

## Day 1 — April 3, 2026 (Mac Studio)

### Starting point

A blank `create-next-app` scaffold. No schema, no API layer, no workers. The scaffold left a root-level `app/` directory that would later cause route conflicts with `src/app/`.

### Environment setup

- **Machine:** Mac Studio (primary dev machine)
- **Node.js:** 22 (installed fresh)
- **Package manager:** npm
- **Editor:** VS Code + Claude Code CLI

### What was built — 34 files in one session

Everything for Phase 1 was designed and written in a single session. The goal was a deployable foundation, not a prototype.

#### Infrastructure

**`prisma/schema.prisma`** — Complete data model on first write:
- 11 models: Organization, OrgMember, Recording, Transcript, TranscriptSegment, Note, NoteSection, ActionItem, NoteComment, NoteTemplate, ProcessingJob, ApiKey
- 9 enums: Plan, MemberRole, RecordingSource, RecordingStatus, MeetingPlatform, JobType, JobStatus, ActionItemStatus, Priority
- Prisma v7 generator: `provider = "prisma-client"` (not `prisma-client-js`)
- Output path: `src/generated/prisma`

**`prisma.config.ts`** — Prisma v7 config. The database URL moves out of `schema.prisma` and into this file (v7 breaking change).

**`prisma/seed.ts`** — Seeds 4 built-in note templates:
1. Standard Meeting Notes (Overview, Key Points, Decisions, Action Items, Next Steps)
2. One-on-One (Progress Update, Goals Review, Blockers, Feedback, Action Items)
3. Product Review (Product Demo, Feedback Received, Priority Changes, Next Milestone)
4. Sales Call (Prospect Overview, Pain Points, Demo Sections, Objections, Follow-up Actions)

#### Infrastructure libraries

**`src/lib/db.ts`** — Prisma singleton. Initially wrote `new PrismaNeon(Pool)` — this was the Prisma v6 API and broke in Session 2.

**`src/lib/redis.ts`** — Two separate IORedis connections:
- `redis` — general purpose
- `bullmqRedis` — dedicated BullMQ connection with `maxRetriesPerRequest: null` (required by BullMQ)
Both point to `REDIS_URL` (Upstash).

**`src/lib/storage.ts`** — AWS S3 helpers using `@aws-sdk/client-s3`:
- `uploadToS3(key, buffer, mimeType)` — server-side upload
- `downloadFromS3(key)` — returns buffer (used by workers)
- `deleteFromS3(key)` — called after transcription for privacy
- `getPresignedUploadUrl(key, contentType)` — 1h pre-signed PUT URL for direct browser upload
- `getPresignedDownloadUrl(key)` — 1h pre-signed GET URL

**`src/lib/queues.ts`** — BullMQ queue definitions:
- `transcriptionQueue` — jobs from `confirmUpload` and Recall.ai webhook
- `summarizationQueue` — jobs from transcription worker on completion

**`src/lib/trpc.ts`** — `createTRPCReact<AppRouter>()`. Missing `'use client'` on first write — caused a build failure caught in Session 2.

**`src/lib/utils.ts`** — Utility functions: `cn()` (tailwind-merge), `formatDuration()`, `formatFileSize()`, `slugify()`, `relativeTime()`.

#### tRPC API layer

**`src/server/trpc.ts`** — tRPC initialisation:
- Context factory: extracts `userId` and `orgId` from Clerk `auth()`
- `publicProcedure` — no auth
- `protectedProcedure` — requires `userId`
- `orgProcedure` — requires `userId` + `orgId` + looks up org in DB

**`src/server/root.ts`** — Combined `appRouter` with all sub-routers.

**`src/server/routers/recordings.router.ts`** — All recording operations:
- `list` — cursor pagination, org-scoped, optional status filter
- `get` — by ID with full includes (initially not org-scoped — security bug fixed in Session 3)
- `create` — creates DB record + optionally deploys Recall.ai bot
- `getUploadUrl` — generates S3 pre-signed PUT URL
- `confirmUpload` — marks PROCESSING, enqueues transcription job

#### Services

**`src/services/transcription.service.ts`** — OpenAI Whisper wrapper:
- Accepts audio buffer + filename
- Calls `whisper-1` via `openai.audio.transcriptions.create`
- Returns: full text, language, duration, segments with timestamps and confidence scores
- Confidence mapped from Whisper's `avg_logprob` ([-1, 0] → [0, 1])

**`src/services/summarization.service.ts`** — Anthropic Claude wrapper:
- Takes transcript text + optional custom section definitions
- Calls `claude-sonnet-4-6` with structured JSON prompt
- Returns: executive summary + ordered sections array
- Extracts action items: title, description, assignee, priority, dueDate
- Handles markdown code fence stripping (Claude sometimes wraps JSON in ```json blocks)

**`src/services/meetingbot.service.ts`** — Recall.ai REST client:
- `deployBot(recordingId, meetingUrl)` — deploys bot, returns bot ID
- `removeBot(botId)` — removes bot from meeting
- `getBotStatus(botId)` — polls bot state
- `getBotVideoUrl(botId)` — gets video URL after meeting

#### Workers

**`src/workers/transcription.worker.ts`** — BullMQ worker, concurrency 3:
1. Update ProcessingJob → PROCESSING
2. Update Recording.status → TRANSCRIBING (not in initial schema — added in Phase 2)
3. Download audio from S3
4. Call Whisper
5. Save Transcript + TranscriptSegment records
6. Delete S3 file
7. Update Recording.duration
8. Mark ProcessingJob → COMPLETED
9. Enqueue summarizationQueue

**`src/workers/summarization.worker.ts`** — Not written in Session 1. Queue was wired but nothing consumed it. Written in Session 2.

#### UI

**`src/app/layout.tsx`** — Root layout with ClerkProvider + TRPCReactProvider.

**`src/app/page.tsx`** — Root redirect: signed-in users → `/dashboard`, others → `/sign-in`.

**`src/app/globals.css`** — Tailwind v4 with `@theme {}` for brand colors. No `tailwind.config.js` needed in v4.

**`src/app/dashboard/layout.tsx`** — Dashboard shell: sidebar nav, `OrganizationSwitcher` (Clerk), user menu.

**`src/app/dashboard/page.tsx`** — Overview: total recordings, total notes, action items stats, recent recordings list. Server component using tRPC server caller.

**`src/app/dashboard/recordings/page.tsx`** — Recordings list with infinite scroll via `trpc.recordings.list.useInfiniteQuery`.

**`src/app/dashboard/recordings/[id]/page.tsx`** — Recording detail: transcript display, AI notes, action items, processing status. Server component.

**`src/app/sign-in/page.tsx` + `src/app/sign-up/page.tsx`** — Initially wrong path. Corrected in Session 2 to `[[...sign-in]]/` catch-all folders.

**`src/components/new-recording-modal.tsx`** — 3-tab modal:
- Upload tab: react-dropzone file picker
- Record tab: triggers `browser-recorder.tsx`
- Bot tab: meeting URL input, deploys Recall.ai bot

**`src/components/browser-recorder.tsx`** — MediaRecorder API component. Captures audio from `getUserMedia()`, records in chunks, produces a Blob for upload.

**`src/components/status-badge.tsx`** — Coloured status pill. Uses local string unions (not Prisma enums) to avoid client bundle issues.

**`src/proxy.ts`** — Clerk middleware (Next.js 16 renamed from `middleware.ts`). Validates session, redirects unauthenticated, exempts public routes and webhook paths.

**`src/app/api/trpc/[trpc]/route.ts`** — tRPC `fetchRequestHandler` for App Router.

**`src/app/api/webhooks/clerk/route.ts`** — Org + membership sync. Uses `svix` for HMAC verification. Handles: `organization.created`, `organization.updated`, `organization.deleted`, `organizationMembership.created`, `organizationMembership.deleted`.

**`src/app/api/webhooks/recall/route.ts`** — Recall.ai bot events. Uses `timingSafeEqual` HMAC verification. On `bot.done`: enqueues transcription job.

**Documentation (7 files):** README.md, SETUP.md, ARCHITECTURE.md, COMPLIANCE.md, PHASE1.md, PHASE2.md, SESSION_LOG.md.

### Configuration files

**`next.config.ts`** — S3 hostname in `images.remotePatterns`, `serverExternalPackages: ['ioredis', 'bullmq']` to prevent Next.js from trying to bundle them.

**`tsconfig.json`** — `isolatedModules: true`, `moduleResolution: bundler`, `@/*` maps to `./src/*`.

### Blockers discovered (not yet fixed)

1. `app/` at repo root conflicts with `src/app/`
2. `svix` missing from `package.json`
3. Summarisation worker not written
4. Prisma v7 constructor API wrong in `db.ts`
5. `'use client'` missing from `trpc.ts`

---

## Day 2 — April 4, 2026 (Mac Studio)

### Goal

Fix all Session 1 blockers, get the full pipeline running end-to-end.

### AWS setup

Configured AWS credentials in `.env`. Created S3 bucket `kolasys-ai-recordings` in `us-east-1`. IAM user with scoped S3 policy.

### Bugs fixed

**Bug 1 — Prisma v7 constructor**
- Old: `new PrismaNeon(Pool)` (v6 WebSocket API)
- New: `new PrismaNeonHttp(process.env.DATABASE_URL!)` (v7 HTTP API)

**Bug 2 — Prisma enums in client components**
- `new-recording-modal.tsx`, `status-badge.tsx`, `recordings/page.tsx` imported enums from `@/generated/prisma/client`
- Fix: local string union types in client files

**Bug 3 — Missing `'use client'` in `trpc.ts`**
- Added `'use client'` as first line

**Bug 4 — Missing `server-only` guards**
- Added `import 'server-only'` to `server/trpc.ts` and `server/root.ts`
- Also added to `db.ts` and `storage.ts` — this was reverted in Session 3 when workers broke

**Bug 5 — Next.js 16 async `params`**
- Added `await params` in `[id]/page.tsx` and its `generateMetadata`

**Bug 6 — Clerk catch-all route structure**
- Moved: `sign-in/page.tsx` → `sign-in/[[...sign-in]]/page.tsx`
- Moved: `sign-up/page.tsx` → `sign-up/[[...sign-up]]/page.tsx`

**Bug 7 — Next.js 16 middleware**
- `src/proxy.ts` already correctly named
- Updated Clerk import to `@clerk/nextjs/server` (v7 path)

**Bug 8 — Legacy `app/` directory**
- `rm -rf app/` — all routes live in `src/app/` only

**Bug 9 — Missing `svix`**
- `npm install svix`

**Bug 9b — Port conflict + slow compile**
- Workaround: `npm run dev -- --port 3001`; Turbopack warms up after 2–3 reloads

### Summarisation worker written

`src/workers/summarization.worker.ts`:
1. Fetch transcript from DB
2. Load NoteTemplate sections (org-specific or global default)
3. Call Claude: structured summary + action items extraction (parallel)
4. Save Note + NoteSection[] + ActionItem[]
5. Update Recording.status → READY

### First successful end-to-end test

Upload → S3 → Whisper → Claude → notes saved → status READY. All working on Mac Studio.

---

## Day 3 — April 6, 2026 (Mac Mini)

### Environment setup on new machine

1. Installed Node.js 22
2. `git clone https://github.com/kolasystems/kolasys-ai`
3. Copied `.env` from Mac Studio (all credentials)
4. `npm install && npx prisma generate`
5. Started workers — both crashed immediately

### Bugs fixed (Session 3)

**Bug 10 — `server-only` blocking workers**
- `db.ts` and `storage.ts` had `import 'server-only'` (added in Session 2)
- Workers are standalone `tsx` processes — `server-only` throws unconditionally outside Next.js bundler
- Fix: removed `server-only` from `db.ts` and `storage.ts`

**Bug 11 — `$transaction` unsupported in Prisma HTTP mode**
- `PrismaNeonHttp` uses HTTP — stateless, cannot hold transaction state
- Fix: replaced all `$transaction([...])` with sequential individual calls

**Bug 12 — `upsert` unsupported in Prisma HTTP mode**
- Fix: `findUnique` → conditional `create` or `update`

**Bug 13 — Nested writes (implicit transactions)**
- `prisma.transcript.create({ data: { segments: { create: [...] } } })` = implicit transaction
- Fix: explicit parent create, then `Promise.all(segments.map(seg => prisma.transcriptSegment.create(...)))`

**Bug 14 — Org FK constraint on first recording**
- Clerk webhook not configured locally → org row didn't exist in DB
- Fix: `orgProcedure` auto-provisions the org using Clerk's `auth()` context if not found in DB

**Bug 15 — `recordings.get` not org-scoped (security)**
- Any authenticated user could read any recording by guessing the UUID
- Fix: `if (!recording || recording.orgId !== ctx.orgId) throw new TRPCError({ code: 'FORBIDDEN' })`

**Bug 16 — S3 files never deleted (privacy)**
- Deletion was inside a silent `try/catch`
- Fix: moved deletion to after transcript committed; errors logged explicitly

**Bug 17 — Worker env vars not loading**
- `process.env` empty in standalone `tsx` processes
- Fix: `import 'dotenv/config'` as first line in both worker files

### P0 audit completed — all 10 P0 items fixed

After bugs 10–17 were fixed, a full security and correctness audit was run. All P0 issues resolved.

### P1 features built

- `recording-status-poller.tsx` — polls every 5s while recording is PROCESSING/PENDING
- `editable-note-section.tsx` — inline editor for AI-generated note sections
- `editable-action-item.tsx` — inline status/priority editor for action items
- `/dashboard/action-items` page — list, filter, update action items
- `/dashboard/settings` page — org settings, note templates, integrations tab
- `delete-recording-button.tsx` — with S3 cleanup

### Phase 2 features built

**Speaker diarization:**
- `src/services/diarization.service.ts` — Deepgram API with `diarize=true`
- Assigns speaker IDs to TranscriptSegment records
- `SpeakerLabel` model added to schema
- `speaker-label-editor.tsx` component — rename "SPEAKER_0" → "John Smith"
- `transcript-paginated.tsx` — paginated viewer with speaker name display

**Ask AI:**
- `src/services/embeddings.service.ts` — OpenAI `text-embedding-3-small` chunking + embedding
- `src/lib/db-vector.ts` — pgvector helpers
- `src/app/api/ai/ask/route.ts` — vector search + Claude Q&A
- `ask-ai-panel.tsx` + `src/hooks/use-ai-chat.ts`

**Calendar sync:**
- `src/app/api/auth/google/` — Google OAuth flow
- `calendar-meetings-list.tsx` — upcoming meetings from Google Calendar
- `/dashboard/calendar` page
- `src/server/routers/calendar.router.ts`

**Slack + Notion integrations:**
- `src/services/integrations/slack.service.ts` — formats notes as Slack blocks
- `src/services/integrations/notion.service.ts` — creates Notion page from notes
- Both integrated into summarization worker (non-fatal, fire-and-forget)
- Settings UI for entering Slack webhook URL + Notion credentials

**Sentry:**
- `sentry.server.config.ts`, `sentry.client.config.ts`, `sentry.edge.config.ts`
- `src/app/instrumentation.ts` — Next.js 16 Sentry init hook
- `src/app/global-error.tsx` — Sentry error boundary
- Workers init Sentry before all other imports
- All errors tagged with worker name, jobId, recordingId, attempt count

**PostHog:**
- `src/lib/posthog.ts` — server-side singleton (serverless mode)
- `src/providers/posthog-provider.tsx` — client-side provider
- Events: `recording_uploaded`, `note_viewed`, `action_item_completed`, `recording_ready`

**Resend + email templates:**
- `src/lib/email.ts` — Resend client
- `src/emails/notes-ready.tsx` — sent by summarization worker when READY
- `src/emails/weekly-digest.tsx` — Vercel cron weekly recap
- `src/emails/welcome.tsx` — new user onboarding
- `src/app/api/cron/weekly-digest/route.ts` — Vercel cron endpoint

### Deployed to Vercel

1. Pushed to GitHub
2. Imported project in Vercel dashboard
3. Set all 26 environment variables in Vercel
4. Deployed — build succeeded
5. Added custom domain `app.kolasys.ai` in Vercel
6. Added Cloudflare CNAME record: `app` → Vercel deployment URL
7. SSL auto-provisioned by Vercel

**Result:** https://app.kolasys.ai live as of 2026-04-06.

### Still outstanding

- Workers not deployed (Railway/Fly.io — needed for production pipeline)
- Recall.ai meeting bot not end-to-end tested (needs `RECALLAI_API_KEY`)
- Clerk org webhook needs production URL (not ngrok)
