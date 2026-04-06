@AGENTS.md

# Kolasys AI — Project Reference

> A new developer or Claude session should be able to get up to speed in ~10 minutes from this file.

---

## 0. Project History (Day 1 → Today)

### How this project started

Kolasys AI began from a blank `create-next-app` scaffold on **2026-04-01**. The initial commit contained only the Next.js boilerplate — no schema, no workers, no API layer. Everything was built from scratch in two focused sessions.

### Session 1 — 2026-04-01: Full scaffold (34 files)

The entire Phase 1 foundation was written in one session:
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

### Session 2 — 2026-04-04 → 2026-04-06: Bug fixing + summarisation worker

Everything needed to make the app actually run was fixed:

**Bug 1 — Prisma v7 constructor**
`db.ts` used `new PrismaNeon(Pool)` which is the Prisma v6 WebSocket adapter API.
Prisma v7 renamed it to `PrismaNeonHttp(connectionString)` with a different constructor signature.
Fix: updated `db.ts` to `new PrismaNeonHttp(process.env.DATABASE_URL!)` and `new PrismaClient({ adapter })`.

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

**Bug 9 — Slow compile / memory pressure**
Turbopack (default in Next.js 16 `next dev`) hit memory spikes during initial compilation on the M-series Mac. Workaround: use `next dev --port 3001` if port 3000 is already bound from a previous crashed process, and let Turbopack's incremental cache warm up over 2–3 reloads.

**Summarisation worker written:**
`src/workers/summarization.worker.ts` — mirrors the transcription worker structure. Reads transcript from DB, loads the org's preferred NoteTemplate, calls Claude with structured JSON prompt, saves `Note` + `NoteSection[]` + `ActionItem[]`, sets `Recording.status = READY`.

**Current state as of 2026-04-06:**
All code compiles. Dashboard loads. Clerk auth works. Both BullMQ workers are implemented. The end-to-end pipeline (upload → transcribe → summarise) will be fully functional once AWS S3 credentials are added. See §8 for the complete status breakdown.

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
│   │   ├── db.ts              Prisma client singleton (server-only)
│   │   ├── redis.ts           IORedis clients — general + BullMQ-dedicated
│   │   ├── queues.ts          BullMQ Queue instances + job data types
│   │   ├── storage.ts         AWS S3 helpers — upload, download, delete, pre-sign (server-only)
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

**Currently set:** DATABASE_URL, Clerk keys (no webhook secret), NEXT_PUBLIC vars, REDIS_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY

**Not yet configured:** CLERK_WEBHOOK_SECRET, AWS_*, RECALLAI_*

---

## 7. How to Run

### First time setup
```bash
npm install
npx prisma db push        # sync schema to Neon
npx prisma db seed        # seed 4 default note templates
```

### Development (3 terminals)

**Terminal 1 — Next.js**
```bash
npm run dev
# → http://localhost:3000
```

**Terminal 2 — Workers** (needed for file processing)
```bash
npx tsx src/workers/transcription.worker.ts
# separate tab:
npx tsx src/workers/summarization.worker.ts
```

**Terminal 3 — ngrok** (needed for webhooks)
```bash
ngrok http 3000
# Copy https URL → update Clerk webhook + Recall.ai webhook
# ⚠ URL changes every restart — update both services each time
```

### Webhook endpoints to register
- Clerk: `https://<ngrok>/api/webhooks/clerk` — events: `user.created`, `organization.*`
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
- Both BullMQ workers implemented (transcription + summarisation)
- All build errors resolved — `npm run dev` compiles cleanly

### Fixed issues (full history — see §0 for details)
- Prisma v7: `PrismaNeon(Pool)` → `PrismaNeonHttp(connectionString)` (different constructor)
- Prisma enums removed from all client components (use local string unions instead)
- `src/lib/trpc.ts` missing `'use client'` — caused Prisma to leak into client bundle
- `server-only` added to `db.ts`, `server/trpc.ts`, `server/root.ts`, `storage.ts`
- Next.js 16: `params` must be `await`ed in both page + `generateMetadata`
- Next.js 16: middleware lives in `proxy.ts` not `middleware.ts`
- Clerk: sign-in/up pages require `[[...sign-in]]` / `[[...sign-up]]` catch-all structure
- Legacy `app/` directory deleted (conflicted with `src/app/`)
- `svix` added to `package.json`
- Summarisation worker written (`src/workers/summarization.worker.ts`)

### Not yet working (requires external credentials)
- End-to-end upload → transcription → summarisation (needs `AWS_*` env vars)
- Meeting bot (needs `RECALLAI_API_KEY`)
- Clerk org webhook sync (needs `CLERK_WEBHOOK_SECRET` + running ngrok)

### Remaining TODO
- Action items management page (`/dashboard/action-items`)
- Settings page (`/dashboard/settings`)
- Real-time processing status polling on recording detail page
- Worker Dockerfile for Railway/Render deployment

---

## 9. Phase Roadmap

| Phase | Features |
|---|---|
| **1 — Web** (current) | Upload / browser record / bot → Whisper → Claude → notes + action items |
| **2 — Intelligence** | Real-time transcription, calendar sync, vector search, team folders, email digest |
| **3 — Native** | Mac menu bar app, Windows app, iOS/iPad, Android |
| **4 — Ecosystem** | PLAUD NotePin hardware, CRM sync (Salesforce/HubSpot), analytics, public API |

---

## 10. Key Decisions & Rationale

**Prisma v7 + PrismaNeonHttp** — v7 splits the Neon adapter into WebSocket (`PrismaNeon`) and HTTP (`PrismaNeonHttp`). We use HTTP because it works in all Next.js server environments without the `ws` package. The `url` field moves out of `schema.prisma` into `prisma.config.ts`.

**BullMQ** — Transcription (5–60s) and summarisation must be async. BullMQ gives retries, concurrency control, and a `ProcessingJob` audit trail. Workers are separate Node.js processes.

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

**Client components cannot import Prisma**
Prisma uses Node.js-only APIs. Never import from `@/generated/prisma/client` or `@/lib/db` in a `'use client'` component. Use local string union types for enums.

**tRPC type leak prevention**
`src/lib/trpc.ts` must have `'use client'`. Without it, the `import type { AppRouter }` chain pulls the entire server module graph (including Prisma) into the client bundle. The `server-only` guards on server files make this fail fast if violated.

**orgProcedure requires an active Clerk org**
All recording mutations are `orgProcedure`. Users must create or join an organisation via the `OrganizationSwitcher` before any mutation will work. Without an org, every mutation returns `FORBIDDEN: An active organization is required`.

**Workers are separate processes**
If workers are not running, uploads appear to succeed (file reaches S3) but the recording stays `PENDING` forever — no transcription, no notes.

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
