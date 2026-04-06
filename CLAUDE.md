@AGENTS.md

# Kolasys AI — Project Reference

> A new developer or Claude session should be able to get up to speed in ~10 minutes from this file.

**GitHub:** https://github.com/kolasystems/kolass-ai

---

## 0. Project History (Day 1 → Today)

### How this project started

Kolasys AI began from a blank `create-next-app` scaffold on **2026-04-03**. The initial commit contained only the Next.js boilerplate — no schema, no workers, no API layer. Everything was built from scratch in three focused sessions across two machines.

### Development machines

| Machine | When used | Notes |
|---|---|---|
| **Mac Studio** (primary) | Session 1 + Session 2 | First build; slow Turbopack compile due to memory pressure on initial cold build |
| **Mac Mini** | Session 3 | Cloned repo fresh; needed to re-install Node 22, copy `.env`, run `npm install` |

---

### Session 1 — 2026-04-03: Full scaffold (34 files)

The entire Phase 1 foundation was written in one session on the Mac Studio:
- Prisma schema (11 models, 9 enums), seed data, `prisma.config.ts`
- All infrastructure: `db.ts`, `redis.ts`, `queues.ts`, `storage.ts`, `trpc.ts`, `utils.ts`
- tRPC API layer: server init, root router, recordings router
- Services: transcription (Whisper), summarisation (Claude), meeting bot (Recall.ai)
- Transcription BullMQ worker
- All UI pages: dashboard, recordings list, recording detail, auth pages
- Components: new-recording-modal, browser-recorder, status-badge
- Webhooks: Clerk org sync, Recall.ai bot events
- All 7 docs files

**Immediate blockers discovered after writing:**
- Legacy `app/` directory conflicted with `src/app/` — routing broken
- `svix` package missing from `package.json`
- Summarisation worker not yet written (queue wired but nothing consuming it)
- Prisma v7 constructor API was wrong in `db.ts`

---

### Session 2 — 2026-04-04: Bug fixing, first successful upload, pipeline tested

Still on Mac Studio. AWS credentials configured, workers running, first end-to-end test completed.

**Bug 1 — Prisma v7 constructor**
`db.ts` used `new PrismaNeon(Pool)` which is the Prisma v6 WebSocket adapter API.
Prisma v7 renamed it to `PrismaNeonHttp(connectionString)` with a different constructor signature.
Fix: `const adapter = new PrismaNeonHttp(process.env.DATABASE_URL!)` then `new PrismaClient({ adapter })`.

**Bug 2 — Prisma enums in client components**
`new-recording-modal.tsx`, `status-badge.tsx`, and `recordings/page.tsx` imported `RecordingStatus`, `RecordingSource` from `@/generated/prisma/client`. Prisma uses Node.js-only APIs — importing it in a `'use client'` component crashes the client bundle.
Fix: replaced all Prisma enum imports in client files with local string union types (`type RecordingStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED'`).

**Bug 3 — tRPC type leak (missing 'use client')**
`src/lib/trpc.ts` was missing the `'use client'` directive. Without it, the `import type { AppRouter }` chain pulled the entire server module graph — including Prisma — into the client bundle, causing a build failure.
Fix: added `'use client'` at the top of `src/lib/trpc.ts`.

**Bug 4 — Missing server-only guards**
`db.ts`, `server/trpc.ts`, `server/root.ts`, and `storage.ts` could theoretically be imported from client code. Adding `import 'server-only'` makes Next.js fail fast with a clear error if any of these are ever accidentally imported client-side.

**Bug 5 — Next.js 16 async params**
`app/dashboard/recordings/[id]/page.tsx` used `params.id` directly. In Next.js 16, `params` is a `Promise<{ id: string }>` — you must `await params` before accessing fields. Also applies to `generateMetadata`.
Fix: `const { id } = await params` in both the page and its metadata function.

**Bug 6 — Clerk catch-all route structure**
Sign-in and sign-up pages were at `app/sign-in/page.tsx`. Clerk requires the catch-all folder structure `[[...sign-in]]/page.tsx` to handle all Clerk-internal sub-routes (e.g. `/sign-in/factor-one`).
Fix: moved pages to `src/app/sign-in/[[...sign-in]]/page.tsx` and `src/app/sign-up/[[...sign-up]]/page.tsx`.

**Bug 7 — Next.js 16 middleware path**
Next.js 16 renamed `middleware.ts` → `proxy.ts`. The file was already named correctly but the Clerk import path needed updating to match the v7 API (`clerkMiddleware` from `@clerk/nextjs/server`).

**Bug 8 — Legacy app/ directory**
The `create-next-app` scaffold left an `app/` directory at the root alongside `src/app/`. Next.js tried to merge both, causing route conflicts and build errors.
Fix: deleted `app/` entirely.

**Bug 9 — Slow compile / memory pressure (Mac Studio)**
Turbopack (default in Next.js 16 `next dev`) hit memory spikes during initial compilation.
Workaround: let Turbopack's incremental cache warm up over 2–3 reloads; use `--port 3001` if 3000 is stuck from a previous crashed process.

**Summarisation worker written:**
`src/workers/summarization.worker.ts` — mirrors the transcription worker structure. Reads transcript from DB, loads the org's preferred NoteTemplate, calls Claude with structured JSON prompt, saves `Note` + `NoteSection[]` + `ActionItem[]`, sets `Recording.status = READY`.

**First successful pipeline test:** Upload → Whisper → Claude → notes all working end-to-end on Mac Studio.

---

### Session 3 — 2026-04-06: Move to Mac Mini, P0 audit, all blockers fixed

Moved development to the Mac Mini. Cloned the repo fresh from GitHub. Ran into new environment-specific issues, then completed a full P0 security/correctness audit.

**Setup on Mac Mini:**
1. Installed Node.js 22 (matched Mac Studio)
2. `git clone https://github.com/kolasystems/kolass-ai`
3. Copied `.env` from Mac Studio (contains all credentials)
4. `npm install && npx prisma generate`
5. Workers failed to start — see bugs below

**Bug 10 — `server-only` import blocking workers**
The workers (`transcription.worker.ts`, `summarization.worker.ts`) both import `src/lib/db.ts` and `src/lib/storage.ts`. These files have `import 'server-only'` at the top, which is a Next.js build-time guard. In a standalone `tsx` process (outside of Next.js), `server-only` throws `Error: This module cannot be imported from a Client Component module`.
Fix: removed `import 'server-only'` from `db.ts` and `storage.ts`. The guard is enforced by the build-time bundler, not needed in worker scripts which are never bundled by Next.js.

**Bug 11 — `$transaction` not supported in Prisma HTTP mode**
The transcription worker used `prisma.$transaction([...])` to atomically save the `Transcript` and `TranscriptSegment` records.
The `PrismaNeonHttp` adapter uses HTTP (not WebSocket), which does not support interactive transactions.
Fix: replaced all `$transaction` calls with sequential individual `prisma.create()` / `prisma.update()` calls. Acceptable because these operations are within a BullMQ job that can be retried on failure.

**Bug 12 — `upsert` not supported in Prisma HTTP mode**
The summarisation worker used `prisma.note.upsert(...)` to handle re-runs of the same job.
Prisma HTTP adapter does not support `upsert`.
Fix: replaced with `findUnique` → `create` or `update` pattern:
```typescript
const existing = await prisma.note.findUnique({ where: { recordingId } });
if (existing) {
  await prisma.note.update({ where: { id: existing.id }, data: { ... } });
} else {
  await prisma.note.create({ data: { ... } });
}
```

**Bug 13 — Nested writes causing implicit transaction errors**
Both workers used nested creates like `prisma.transcript.create({ data: { ..., segments: { create: [...] } } })`. This is sugar for an implicit transaction which is also unsupported in HTTP mode.
Fix: broke all nested creates into explicit sequential creates (create parent, then create children with the parent ID).

**Bug 14 — Org foreign key constraint on first recording**
When a Clerk user signs up and creates their first org, the Clerk webhook fires `organization.created`. The webhook handler (Clerk route) creates the `Organization` row in the DB. But if the webhook hasn't fired yet (e.g., `CLERK_WEBHOOK_SECRET` not set), the `Organization` row doesn't exist.
When `orgProcedure` tries to look up the org via `clerkOrgId`, it returns null → the subsequent `recordings.create` mutation inserts a recording with a null `orgId`, violating the foreign key constraint.
Fix: added org auto-provisioning in `orgProcedure` — if the org is not found in the DB, create it on-demand using the Clerk org data from `auth()`. This makes the app resilient to missed webhooks.

**Bug 15 — `recordings.get` not org-scoped (security)**
The `recordings.get` tRPC procedure fetched a recording by ID with no org check:
```typescript
// Before — insecure
return prisma.recording.findUnique({ where: { id: input.id } });
```
Any authenticated user who guessed a recording UUID could read recordings from another org.
Fix: added `orgId` to the where clause and threw `FORBIDDEN` if the recording's orgId doesn't match the caller's active org:
```typescript
const recording = await prisma.recording.findUnique({ where: { id: input.id } });
if (!recording || recording.orgId !== ctx.orgId) throw new TRPCError({ code: 'FORBIDDEN' });
```

**Bug 16 — S3 audio files never deleted**
The transcription worker called `deleteFromS3(job.data.s3Key)` but this was done inside a try/catch that silently swallowed the error. S3 files were being accumulated indefinitely.
Fix: moved S3 deletion to after `Transcript` + `TranscriptSegment` are committed. Added explicit error logging so deletion failures are visible. Audio privacy: files are deleted immediately after transcription regardless of failure.

**Bug 17 — Worker env vars not loading**
On Mac Mini, `tsx src/workers/transcription.worker.ts` did not automatically load `.env`. Environment variables were undefined — Prisma and Redis connections failed immediately.
Fix: added `import 'dotenv/config'` at the top of both worker files, and confirmed `dotenv` is in `package.json` dependencies.

**Current state as of 2026-04-06:**
Full pipeline works on both machines. Upload → Whisper → Claude → notes tested end-to-end on Mac Mini. All P0 security and correctness bugs fixed. P1 items in progress.

---

## 1. What Is Kolasys AI?

Kolasys AI is an **AI-powered meeting notes product**. It records, transcribes, summarises, and extracts action items from meetings — automatically, with no manual effort.

**Core philosophy:**
- **Invisible AI** — the AI works in the background; the user never has to prompt it
- **No-bot-first** — prefer local/native recording over deploying a meeting bot when possible
- **Privacy-focused** — audio files are deleted from S3 after transcription completes
- **Structured output** — Claude returns JSON so notes are machine-readable, not just text blobs

**Inspiration:** Granola AI, Jamie AI, Fireflies, Otter.ai, Notion AI, PLAUD hardware recorder

**Target platforms (roadmap):**
- Phase 1 (current): Web app
- Phase 2: Real-time transcription, calendar sync, vector search, team folders
- Phase 3: Mac menu bar app, Windows app, iOS / Android
- Phase 4: Hardware integrations (PLAUD NotePin), CRM sync, analytics

---

## 2. Tech Stack

| Technology | Version | Why |
|---|---|---|
| **Next.js** | 16.2.2 | App Router, RSC, Turbopack. NOTE: breaking changes — see AGENTS.md |
| **React** | 19.2.4 | Required by Next.js 16 |
| **TypeScript** | 5.x | Strict mode throughout |
| **Prisma** | 7.6.0 | ORM. v7 has breaking changes — see §10 |
| **@prisma/adapter-neon** | 7.6.0 | HTTP adapter for Neon (no WebSocket needed) |
| **@neondatabase/serverless** | 1.0.2 | Neon connection primitives |
| **Clerk** | 7.x | Auth + organisations. v7: `auth()` is async |
| **tRPC** | 11.x | Type-safe API layer between client and server |
| **TanStack Query** | 5.x | Client-side data fetching, used via tRPC |
| **superjson** | 2.x | Serialiser for tRPC (handles Date, BigInt, etc.) |
| **BullMQ** | 5.x | Job queue for async processing (transcription, summarisation) |
| **IORedis** | 5.x | Redis client for BullMQ (Upstash) |
| **OpenAI SDK** | 6.x | Whisper `whisper-1` for transcription |
| **Anthropic SDK** | 0.81.x | Claude `claude-sonnet-4-6` for summarisation |
| **AWS SDK v3** | 3.x | S3 for audio file storage + pre-signed URLs |
| **Tailwind CSS** | 4.x | No `tailwind.config.js` — configured via `@theme {}` in CSS |
| **Radix UI** | various | Accessible headless components (Dialog, Dropdown, Toast, etc.) |
| **Zod** | 4.x | Schema validation for tRPC inputs |
| **Svix** | 1.x | Clerk webhook verification |
| **dotenv** | 16.x | Env var loading in worker scripts (outside Next.js) |
| **lucide-react** | 1.x | Icons |
| **react-dropzone** | 15.x | File drag-and-drop in upload modal |
| **nanoid** | 5.x | Short unique IDs |

---

## 3. Architecture

### Data flow — upload path
```
Browser (drag-drop file)
  → tRPC recordings.create       — creates DB record (status: PENDING)
  → tRPC recordings.getUploadUrl — generates S3 pre-signed PUT URL
  → fetch(s3Url, PUT, file)      — browser uploads directly to S3
  → tRPC recordings.confirmUpload — updates DB, enqueues transcription job
  → BullMQ transcriptionQueue
      → Worker: downloads from S3, calls Whisper, saves Transcript + segments
      → Deletes S3 file (privacy)
      → Enqueues summarizationQueue
  → BullMQ summarizationQueue
      → Worker: calls Claude (summary + action items in parallel)
      → Saves Note + NoteSection[] + ActionItem[]
      → Sets recording.status = READY
```

### Data flow — meeting bot path
```
Browser → tRPC recordings.create (source: MEETING_BOT, meetingUrl)
  → POST api/webhooks/recall — Recall.ai calls back with bot events
  → On bot.done: same transcription → summarisation pipeline
```

### Multi-tenant structure
```
Organization (Clerk org)
  └── OrgMember[] (Clerk user IDs + roles)
  └── Recording[]
        └── Transcript → TranscriptSegment[]
        └── Note → NoteSection[], ActionItem[], NoteComment[]
        └── ProcessingJob[]
  └── NoteTemplate[] (org-specific or null = global)
  └── ApiKey[]
```

### Worker processes (run separately from Next.js)
- `src/workers/transcription.worker.ts` — concurrency 3, calls Whisper
- `src/workers/summarization.worker.ts` — concurrency 2, calls Claude

---

## 4. Project Structure

```
kolasys-ai/
├── prisma/
│   ├── schema.prisma          Prisma schema (11 models, 9 enums)
│   └── seed.ts                Seeds 4 global NoteTemplates
├── prisma.config.ts           Prisma v7 config (schema path, datasource URL)
├── src/
│   ├── app/
│   │   ├── layout.tsx         Root layout — ClerkProvider + TRPCReactProvider
│   │   ├── page.tsx           Landing / redirect to /dashboard
│   │   ├── globals.css        Tailwind v4 theme + global styles
│   │   ├── dashboard/
│   │   │   ├── layout.tsx     Dashboard shell — sidebar, org switcher, nav
│   │   │   ├── page.tsx       Overview — stat cards + recent recordings (server component)
│   │   │   └── recordings/
│   │   │       ├── page.tsx   Recordings list (client, tRPC infinite query)
│   │   │       └── [id]/page.tsx  Recording detail — transcript + notes (server component)
│   │   ├── sign-in/[[...sign-in]]/page.tsx   Clerk SignIn component
│   │   ├── sign-up/[[...sign-up]]/page.tsx   Clerk SignUp component
│   │   └── api/
│   │       ├── trpc/[trpc]/route.ts   tRPC HTTP handler
│   │       └── webhooks/
│   │           ├── clerk/route.ts     Clerk user/org sync webhook
│   │           └── recall/route.ts    Recall.ai meeting bot events webhook
│   ├── components/
│   │   ├── new-recording-modal.tsx  Upload / browser record / bot deploy modal
│   │   ├── browser-recorder.tsx     MediaRecorder API component
│   │   └── status-badge.tsx         Recording status pill (PENDING/PROCESSING/READY/FAILED)
│   ├── generated/
│   │   └── prisma/             Auto-generated Prisma client (never edit)
│   ├── lib/
│   │   ├── db.ts              Prisma client singleton (NO server-only — used by workers too)
│   │   ├── redis.ts           IORedis clients — general + BullMQ-dedicated
│   │   ├── queues.ts          BullMQ Queue instances + job data types
│   │   ├── storage.ts         AWS S3 helpers — upload, download, delete, pre-sign
│   │   ├── trpc.ts            tRPC React client ('use client')
│   │   └── utils.ts           cn(), formatDuration(), formatFileSize(), relativeTime()
│   ├── providers/
│   │   └── trpc-provider.tsx  QueryClient + tRPC.Provider wrapper ('use client')
│   ├── proxy.ts               Clerk middleware (replaces middleware.ts in Next.js 16)
│   ├── server/
│   │   ├── trpc.ts            tRPC init, context, procedures (server-only)
│   │   ├── root.ts            Root router — combines all sub-routers (server-only)
│   │   └── routers/
│   │       └── recordings.router.ts  All recording CRUD + upload URL + confirm
│   ├── services/
│   │   ├── transcription.service.ts   Whisper wrapper
│   │   └── summarization.service.ts   Claude wrapper (summary + action items)
│   └── workers/
│       ├── transcription.worker.ts    BullMQ worker — Whisper transcription
│       └── summarization.worker.ts    BullMQ worker — Claude summarisation
├── .env                       Real credentials (git-ignored)
├── .env.example               Template with all required variables
├── next.config.ts             serverExternalPackages: [ioredis, bullmq]
├── tsconfig.json              isolatedModules: true, moduleResolution: bundler
└── CLAUDE.md                  This file
```

---

## 5. Database Schema

### Enums (9)

| Enum | Values |
|---|---|
| `Plan` | FREE, PRO, ENTERPRISE |
| `MemberRole` | OWNER, ADMIN, MEMBER |
| `RecordingSource` | UPLOAD, BROWSER, MEETING_BOT |
| `RecordingStatus` | PENDING, PROCESSING, READY, FAILED |
| `MeetingPlatform` | ZOOM, GOOGLE_MEET, MICROSOFT_TEAMS, WEBEX, OTHER |
| `JobType` | TRANSCRIPTION, SUMMARIZATION, ACTION_ITEMS |
| `JobStatus` | QUEUED, PROCESSING, COMPLETED, FAILED |
| `ActionItemStatus` | OPEN, IN_PROGRESS, COMPLETED, CANCELLED |
| `Priority` | LOW, MEDIUM, HIGH, URGENT |

### Models (11)

| Model | Key fields | Notes |
|---|---|---|
| `Organization` | id, name, slug, plan, clerkOrgId | clerkOrgId maps Clerk org to DB row |
| `OrgMember` | orgId, userId (Clerk), role | unique(orgId, userId) |
| `Recording` | orgId, userId, title, source, status, s3Key, botId | central entity |
| `Transcript` | recordingId (unique), text, language, confidence | one-to-one with Recording |
| `TranscriptSegment` | transcriptId, speaker, text, startTime, endTime | Whisper segments |
| `Note` | recordingId, orgId, userId, summary, templateId | AI-generated notes |
| `NoteSection` | noteId, title, content, order | structured sections from Claude |
| `ActionItem` | noteId, orgId, title, priority, status, assignee, dueDate | extracted tasks |
| `NoteComment` | noteId, userId, content | human comments on notes |
| `NoteTemplate` | orgId (null=global), name, structure (JSON) | section definitions for Claude |
| `ProcessingJob` | recordingId, type, status, attempts, error, result | audit trail for workers |
| `ApiKey` | orgId, keyHash, lastUsed | for future public API |

---

## 6. Environment Variables

| Variable | Service | Breaks without it |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL | Everything — app won't start |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk auth | Auth broken, can't sign in |
| `CLERK_SECRET_KEY` | Clerk auth | Auth broken server-side |
| `CLERK_WEBHOOK_SECRET` | Clerk webhooks | User/org sync to DB fails silently |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Clerk routing | Redirects to wrong path |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Clerk routing | Redirects to wrong path |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Clerk routing | Wrong redirect after login |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Clerk routing | Wrong redirect after signup |
| `NEXT_PUBLIC_APP_URL` | tRPC provider | tRPC requests go to wrong URL |
| `REDIS_URL` | Upstash Redis | BullMQ fails, workers can't connect |
| `OPENAI_API_KEY` | OpenAI Whisper | Transcription fails |
| `ANTHROPIC_API_KEY` | Claude | Summarisation fails |
| `AWS_REGION` | AWS S3 | Upload URL generation fails |
| `AWS_ACCESS_KEY_ID` | AWS S3 | Upload URL generation fails |
| `AWS_SECRET_ACCESS_KEY` | AWS S3 | Upload URL generation fails |
| `S3_BUCKET_NAME` | AWS S3 | Upload URL generation fails |
| `RECALLAI_API_KEY` | Recall.ai | Meeting bot deploy fails |
| `RECALLAI_WEBHOOK_SECRET` | Recall.ai webhooks | Webhook HMAC verification fails |

**Currently set:** DATABASE_URL, Clerk keys + webhook secret, NEXT_PUBLIC vars, REDIS_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY, AWS_*, S3_BUCKET_NAME

**Not yet configured:** RECALLAI_API_KEY, RECALLAI_WEBHOOK_SECRET

---

## 7. How to Run

### New machine setup
```bash
# 1. Clone
git clone https://github.com/kolasystems/kolass-ai
cd kolass-ai

# 2. Install deps
npm install

# 3. Copy .env from another machine (contains all credentials)
# OR fill in .env.example and rename to .env

# 4. Generate Prisma client
npx prisma generate

# 5. Sync schema (first time only)
npx prisma db push

# 6. Seed note templates (first time only)
npx prisma db seed
```

### Development — 3 terminals

**Terminal 1 — Next.js**
```bash
npm run dev
# → http://localhost:3000
# If 3000 is stuck from a crashed process: npm run dev -- --port 3001
```

**Terminal 2 — Transcription worker**
```bash
npx tsx src/workers/transcription.worker.ts
```

**Terminal 3 — Summarisation worker**
```bash
npx tsx src/workers/summarization.worker.ts
```

**Optional: Terminal 4 — ngrok** (needed for webhooks in dev)
```bash
ngrok http 3000
# Copy https URL → update Clerk webhook + Recall.ai webhook
# ⚠ URL changes every restart — update both services each time
```

### Webhook endpoints to register
- Clerk: `https://<ngrok>/api/webhooks/clerk` — events: `user.created`, `organization.*`, `organizationMembership.*`
- Recall.ai: `https://<ngrok>/api/webhooks/recall`

---

## 8. Current Status (2026-04-06)

### Working
- Dashboard loads, stat cards, recent recordings
- Recordings list with infinite scroll
- Recording detail — transcript, notes, action items
- New Recording modal — upload / browser record / bot deploy tabs
- Clerk sign in/up/org switcher
- tRPC layer fully typed with superjson
- Prisma schema synced to Neon + 4 templates seeded
- Both BullMQ workers running and tested
- **Full pipeline confirmed working:** Upload → Whisper → Claude → notes (tested on Mac Mini 2026-04-06)
- S3 audio deletion after transcription
- org-scoped security on all recording reads
- Org auto-provisioning in orgProcedure (resilient to missed webhooks)

### All bugs fixed (see §0 for details and docs/BUGS_AND_FIXES.md for full catalogue)
- Prisma v7: `PrismaNeon(Pool)` → `PrismaNeonHttp(connectionString)` (different constructor)
- Prisma enums removed from all client components (use local string unions instead)
- `src/lib/trpc.ts` missing `'use client'` — caused Prisma to leak into client bundle
- `server-only` removed from `db.ts` + `storage.ts` (workers import these outside Next.js)
- Next.js 16: `params` must be `await`ed in both page + `generateMetadata`
- Next.js 16: middleware lives in `proxy.ts` not `middleware.ts`
- Clerk: sign-in/up pages require `[[...sign-in]]` / `[[...sign-up]]` catch-all structure
- Legacy `app/` directory deleted (conflicted with `src/app/`)
- `svix` added to `package.json`
- Summarisation worker written
- `$transaction` removed — not supported by Prisma HTTP adapter
- `upsert` replaced with `findUnique + create/update` — not supported by Prisma HTTP adapter
- Nested creates flattened — implicit transactions not supported by Prisma HTTP adapter
- `dotenv/config` imported at top of both worker files
- Org auto-provisioning guards against missed Clerk webhooks
- `recordings.get` now org-scoped (was a data isolation bug)

### P1 in progress
- Real-time processing status polling on recording detail page
- Action items management page (`/dashboard/action-items`)
- Settings page (`/dashboard/settings`)

### Remaining TODO
- Worker Dockerfile for Railway/Render deployment
- Meeting bot end-to-end (needs `RECALLAI_API_KEY` + ngrok)
- Clerk org webhook sync (needs ngrok running + URL updated in Clerk dashboard)

---

## 9. Phase Roadmap

| Phase | Features |
|---|---|
| **1 — Web** (current) | Upload / browser record / bot → Whisper → Claude → notes + action items |
| **2 — Intelligence** | Real-time transcription, calendar sync, vector search, team folders, email digest |
| **3 — Native** | Mac menu bar app, Windows app, iOS/iPad, Android |
| **4 — Ecosystem** | PLAUD NotePin hardware, CRM sync (Salesforce/HubSpot), analytics, public API |

See `docs/PHASE2.md` for the full 30-item audit list (P0 → P3).

---

## 10. Key Decisions & Rationale

**Prisma v7 + PrismaNeonHttp** — v7 splits the Neon adapter into WebSocket (`PrismaNeon`) and HTTP (`PrismaNeonHttp`). We use HTTP because it works in all Next.js server environments without the `ws` package. The `url` field moves out of `schema.prisma` into `prisma.config.ts`. HTTP mode does NOT support `$transaction`, `upsert`, or nested writes — all must be replaced with explicit sequential operations.

**No `server-only` on db.ts / storage.ts** — These files are imported by BullMQ workers, which are standalone `tsx` processes (not bundled by Next.js). The `server-only` package is a Next.js bundler guard — it throws when the bundler processes the file client-side. Outside Next.js (in workers), it throws unconditionally. Guards on `server/trpc.ts` and `server/root.ts` are still safe because workers don't import tRPC server code.

**BullMQ** — Transcription (5–60s) and summarisation must be async. BullMQ gives retries, concurrency control, and a `ProcessingJob` audit trail. Workers are separate Node.js processes. Worker env loading requires `import 'dotenv/config'` since Next.js's env injection doesn't apply.

**Recall.ai** — Meeting bot deployment across Zoom/Meet/Teams requires separate developer accounts per platform. Recall.ai provides a unified API for all platforms.

**Whisper + Deepgram (planned)** — Whisper is accurate but has a 25 MB limit. Phase 2 adds Deepgram as a fallback for large files and real-time streaming.

**Claude for summarisation** — Returns reliable structured JSON matching the prompt schema. Notes are stored as machine-readable `NoteSection` rows rather than free text.

**No-bot-first** — Browser `MediaRecorder` recording is invisible to participants, needs no platform approval, and works for any audio source. Bot is opt-in.

---

## 11. Known Issues & Gotchas

**Prisma v7 breaking changes**
- Generator: `provider = "prisma-client"` (NOT `prisma-client-js`)
- No `url =` in `datasource db {}` — URL is in `prisma.config.ts` → `datasource.url`
- Import path: `from '@/generated/prisma/client'`
- Constructor requires adapter: `new PrismaClient({ adapter })`
- HTTP mode: no `$transaction`, no `upsert`, no nested creates

**Client components cannot import Prisma**
Prisma uses Node.js-only APIs. Never import from `@/generated/prisma/client` or `@/lib/db` in a `'use client'` component. Use local string union types for enums.

**tRPC type leak prevention**
`src/lib/trpc.ts` must have `'use client'`. Without it, the `import type { AppRouter }` chain pulls the entire server module graph (including Prisma) into the client bundle. `server-only` guards on `server/trpc.ts` and `server/root.ts` make this fail fast.

**`server-only` and workers**
`db.ts` and `storage.ts` do NOT have `server-only` — they are shared between Next.js server code and worker scripts. Only files that workers will never touch (`server/trpc.ts`, `server/root.ts`) have `server-only`.

**orgProcedure requires an active Clerk org**
All recording mutations are `orgProcedure`. Users must create or join an organisation via the `OrganizationSwitcher` before any mutation will work. `orgProcedure` now auto-provisions the org in the DB if the Clerk webhook hasn't synced it yet.

**Workers are separate processes**
Workers must be started manually with `npx tsx ...`. If workers are not running, uploads appear to succeed (file reaches S3) but the recording stays `PENDING` forever.

**Workers need dotenv**
`import 'dotenv/config'` must be the first import in both worker files. Without it, all `process.env.*` values are undefined and all service connections fail silently.

**ngrok URL changes**
Every ngrok restart produces a new URL. Update Clerk dashboard + Recall.ai dashboard after each restart. Use a paid ngrok fixed domain to avoid this.

**Next.js 16 specifics**
- `params` / `searchParams` are `Promise<{}>` — always `await params`
- Middleware lives in `src/proxy.ts` (not `middleware.ts`)
- Turbopack is default for `next dev`; webpack is used for `next build`

---

## 12. Services & Credentials Reference

| Service | Purpose | URL |
|---|---|---|
| **Neon** | PostgreSQL database | neon.tech |
| **Clerk** | Auth + organisations | clerk.com — set webhook after ngrok |
| **Upstash** | Redis for BullMQ | upstash.com |
| **AWS S3** | Audio file storage | bucket: `kolasys-ai-audio`, region: `us-east-1` |
| **OpenAI** | Whisper transcription (`whisper-1`) | platform.openai.com |
| **Anthropic** | Claude summarisation (`claude-sonnet-4-6`) | console.anthropic.com |
| **Recall.ai** | Meeting bot API | recall.ai — set webhook after ngrok |
| **ngrok** | Local tunnel for webhooks | ngrok.com |
| **GitHub** | Source control | https://github.com/kolasystems/kolass-ai |
