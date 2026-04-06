# Kolasys AI — Session Log

Running record of all build sessions: what was built, decisions made, open questions, and next steps.

---

## Session 1 — 2026-04-03

**Machine:** Mac Studio
**Goal:** Take the blank `create-next-app` scaffold to a complete, deployable Phase 1 foundation.

### What was built

**Full Phase 1 project scaffold** — 34 files created or replaced.

#### Files created / replaced

**Schema & config (4 files)**
- `prisma/schema.prisma` — complete data model: 11 models, 9 enums, Prisma v7 `prisma-client` provider, output to `src/generated/prisma`
- `.env.example` — 19 environment variable placeholders across 6 service categories
- `next.config.ts` — S3 image patterns, `serverExternalPackages` for ioredis/bullmq
- `tsconfig.json` — updated `@/*` path alias from `./*` to `./src/*`

**Infrastructure libraries (6 files)**
- `src/lib/db.ts` — Prisma singleton
- `src/lib/redis.ts` — two IORedis clients (general + BullMQ-dedicated)
- `src/lib/storage.ts` — S3 upload, download, presigned URLs, delete helpers
- `src/lib/queues.ts` — BullMQ queue definitions (transcription, summarization)
- `src/lib/trpc.ts` — `createTRPCReact<AppRouter>`
- `src/lib/utils.ts` — `cn`, `formatDuration`, `formatFileSize`, `slugify`, `relativeTime`

**tRPC API layer (4 files)**
- `src/providers/trpc-provider.tsx` — React Query + tRPC provider tree (client component)
- `src/server/trpc.ts` — tRPC initialisation, context factory, procedure tiers
- `src/server/root.ts` — combined `appRouter` and `AppRouter` type export
- `src/server/routers/recordings.router.ts` — recordings CRUD + upload flow

**Services (3 files)**
- `src/services/transcription.service.ts` — OpenAI Whisper wrapper with segment extraction
- `src/services/summarization.service.ts` — Anthropic Claude structured JSON output
- `src/services/meetingbot.service.ts` — Recall.ai REST client

**Worker (1 file)**
- `src/workers/transcription.worker.ts` — BullMQ worker: download → transcribe → persist → enqueue

**Components (3 files)**
- `src/components/status-badge.tsx` — enum-mapped coloured badge
- `src/components/browser-recorder.tsx` — MediaRecorder API component
- `src/components/new-recording-modal.tsx` — 3-tab modal (upload / record / bot)

**App pages & routes (9 files)**
- `src/app/layout.tsx` — root layout with ClerkProvider + TRPCReactProvider
- `src/app/page.tsx` — root redirect (→ dashboard or sign-in)
- `src/app/globals.css` — Tailwind v4 with `@theme {}` brand palette
- `src/app/dashboard/layout.tsx` — sidebar + org switcher
- `src/app/dashboard/page.tsx` — overview stats + recent recordings
- `src/app/dashboard/recordings/page.tsx` — infinite scroll list
- `src/app/dashboard/recordings/[id]/page.tsx` — recording detail with transcript + notes
- `src/app/api/trpc/[trpc]/route.ts` — tRPC fetchRequestHandler
- `src/app/api/webhooks/clerk/route.ts` — Clerk org/membership sync
- `src/app/api/webhooks/recall/route.ts` — Recall.ai bot status events

**Auth proxy (1 file)**
- `src/proxy.ts` — Clerk middleware (Next.js 16 renamed from `middleware.ts`)

**Seed (1 file)**
- `prisma/seed.ts` — 4 built-in note templates (Standard, One-on-One, Product Review, Sales Call)

**Documentation (7 files)**
- `docs/README.md` — project overview, architecture diagram, repo layout, getting started
- `docs/SETUP.md` — service-by-service setup guide (Clerk, Neon, S3, Redis, Recall.ai, OpenAI, Anthropic)
- `docs/ARCHITECTURE.md` — full system architecture deep-dive
- `docs/COMPLIANCE.md` — recording consent laws, GDPR/CCPA/HIPAA, data retention
- `docs/PHASE1.md` — file-by-file description of everything built
- `docs/PHASE2.md` — planned features: real-time transcription, calendar sync, vector search, integrations
- `docs/SESSION_LOG.md` — this file

**Total: 34 files created or modified**

---

### Key decisions made

| Decision | Rationale |
|---|---|
| `src/` directory structure | Standard for larger Next.js apps; keeps config files at root clean |
| Prisma v7 `prisma-client` provider | Already in project's package.json; required for Prisma v7 |
| Output to `src/generated/prisma` | Consistent with `src/` structure; avoids touching legacy `app/` |
| Direct-to-S3 upload via presigned URLs | Vercel 4.5 MB body limit; S3 pre-signed URLs handle large files without routing through Next.js |
| BullMQ + separate worker process | AI processing can exceed Vercel's function timeout; worker runs on Railway/Render |
| Two Redis connections | BullMQ requires `maxRetriesPerRequest: null`; sharing one connection would break general usage |
| `fetchRequestHandler` for tRPC | Required for Next.js 16 App Router route handlers (not the legacy `nextjs/adapter`) |
| `await params` everywhere | Next.js 16 breaking change: `params` and `searchParams` are Promises |
| `src/proxy.ts` (not `middleware.ts`) | Next.js 16 renamed middleware files to `proxy.ts` |
| Tailwind v4 CSS config (no `tailwind.config.js`) | v4 uses `@theme {}` in CSS; no JS config file needed |
| `superjson` transformer | Enables Date, undefined, BigInt serialisation through tRPC without manual conversion |
| Anthropic `claude-sonnet-4-6` | Best balance of quality/cost/speed for structured JSON output generation |
| HMAC-SHA256 for Recall.ai webhooks | Built-in `crypto` module, no extra dependency; `timingSafeEqual` prevents timing attacks |
| `svix` for Clerk webhooks | Clerk's official library; handles header parsing and HMAC verification |

---

### Open questions / TODOs at end of session

- [ ] **Summarisation worker** — not yet written. The queue is wired but nothing consumes summarisation jobs.
- [ ] **Old `app/` directory** — must be manually deleted (`rm -rf app/`) to avoid routing conflict with `src/app/`.
- [ ] **`npm install svix`** — Clerk webhook handler imports `svix` which is not in `package.json` yet.
- [ ] **Transcription worker: audio > 25 MB** — Whisper's 25 MB limit will fail silently for long meetings. Needs chunking logic.
- [ ] **Worker deployment** — no Dockerfile or Railway/Render config yet for the transcription worker process.

---

## Session 2 — 2026-04-04

**Machine:** Mac Studio
**Goal:** Fix all blockers from Session 1, get end-to-end pipeline working.

### What was fixed

This session focused entirely on making the Session 1 scaffold actually run. Nine separate bugs were diagnosed and fixed, and the missing summarisation worker was written. AWS credentials were configured and the first successful end-to-end test was completed.

**Bug 1 — Prisma v7 constructor (`src/lib/db.ts`)**
- Symptom: `TypeError: PrismaNeon is not a constructor` on startup.
- Root cause: Session 1 used `new PrismaNeon(Pool)` — the v6 API. v7 uses `PrismaNeonHttp(connectionString)`.
- Fix: `const adapter = new PrismaNeonHttp(process.env.DATABASE_URL!)` then `new PrismaClient({ adapter })`.

**Bug 2 — Prisma enums in client components**
- Symptom: Build error on client components importing from `@/generated/prisma/client`.
- Root cause: Prisma client uses Node.js-only APIs; importing it client-side crashes the bundle.
- Affected: `new-recording-modal.tsx`, `status-badge.tsx`, `recordings/page.tsx`
- Fix: replaced all Prisma enum imports with local string union types.

**Bug 3 — Missing `'use client'` in `src/lib/trpc.ts`**
- Symptom: Build error — Prisma leaking into client bundle.
- Root cause: Without `'use client'`, `import type { AppRouter }` pulled the entire server module graph into the client bundle.
- Fix: Added `'use client'` at the top of `src/lib/trpc.ts`.

**Bug 4 — Missing `server-only` guards**
- Affected: `db.ts`, `server/trpc.ts`, `server/root.ts`, `storage.ts`
- Fix: Added `import 'server-only'` to all server-only files.
- Note: `server-only` on `db.ts` and `storage.ts` was later removed in Session 3 when workers failed.

**Bug 5 — Next.js 16 async `params`**
- Symptom: TypeScript error on `params.id` in recording detail page and `generateMetadata`.
- Fix: `const { id } = await params` in both page component and `generateMetadata`.

**Bug 6 — Clerk catch-all folder structure**
- Symptom: Clerk auth sub-routes returned 404.
- Fix: Moved pages to `sign-in/[[...sign-in]]/page.tsx` and `sign-up/[[...sign-up]]/page.tsx`.

**Bug 7 — Legacy `app/` directory**
- Symptom: Route conflicts and 404s on `/dashboard`.
- Fix: Deleted `app/` entirely.

**Bug 8 — Missing `svix` package**
- Fix: `npm install svix`.

**Bug 9 — Port conflict & slow Turbopack compile**
- Symptom: `EADDRINUSE :::3000` when restarting. First compile 45–90 seconds.
- Workaround: `npm run dev -- --port 3001`. Turbopack warms up over 2–3 reloads.

### New file: `src/workers/summarization.worker.ts`
Written and tested. Reads transcript → calls Claude → saves Note + NoteSection[] + ActionItem[] → sets status = READY.

### Milestone: First successful end-to-end test
Upload → Whisper transcription → Claude summarisation → notes saved to DB. Confirmed working on Mac Studio.

---

### Current state at end of session

- `npm run dev` compiles cleanly
- Dashboard loads, Clerk auth works
- Both BullMQ workers running
- Full pipeline tested end-to-end (upload → notes)
- AWS S3 credentials configured

---

### Open questions / TODOs at end of session

- [ ] Configure `CLERK_WEBHOOK_SECRET` + ngrok for org sync webhook
- [ ] Configure `RECALLAI_API_KEY` + test meeting bot
- [ ] Add real-time processing status polling to recording detail page
- [ ] Build action items page (`/dashboard/action-items`)
- [ ] Build settings page (`/dashboard/settings`)
- [ ] Write worker Dockerfile for Railway/Render deployment

---

## Session 3 — 2026-04-06

**Machine:** Mac Mini (new machine — first time cloning the repo here)
**Goal:** Get running on Mac Mini, investigate worker failures, complete P0 audit.

### Setup on Mac Mini

1. Installed Node.js 22 (matched Mac Studio version)
2. `git clone https://github.com/kolasystems/kolass-ai`
3. Copied `.env` from Mac Studio (all credentials)
4. `npm install && npx prisma generate`
5. Started workers — both failed immediately

### Bug fixes

**Bug 10 — `server-only` import blocking workers**
- Symptom: Workers crash on startup with `Error: This module cannot be imported from a Client Component module`.
- Root cause: `db.ts` and `storage.ts` had `import 'server-only'`. This guard throws unconditionally when outside the Next.js bundler (i.e., in `tsx` worker processes).
- Fix: Removed `import 'server-only'` from `db.ts` and `storage.ts`. Kept it on `server/trpc.ts` and `server/root.ts` (workers never import these).

**Bug 11 — `$transaction` not supported in Prisma HTTP mode**
- Symptom: Worker crashes with `Error: Transaction API not supported with HTTP adapter`.
- Root cause: `PrismaNeonHttp` uses HTTP, which does not support interactive transactions.
- Fix: Replaced all `prisma.$transaction([...])` with sequential individual Prisma calls.

**Bug 12 — `upsert` not supported in Prisma HTTP mode**
- Symptom: Summarisation worker crashes on the `prisma.note.upsert(...)` call.
- Root cause: `upsert` is not supported by the HTTP adapter.
- Fix: Replaced with `findUnique` → then `create` or `update` depending on whether record exists.

**Bug 13 — Nested writes causing implicit transaction errors**
- Symptom: `prisma.transcript.create({ data: { ..., segments: { create: [...] } } })` crashed.
- Root cause: Nested creates are sugar for implicit transactions — also unsupported in HTTP mode.
- Fix: Broke into explicit sequential creates (parent first, then children with parent ID).

**Bug 14 — Org foreign key constraint on first recording**
- Symptom: First recording upload fails with Prisma foreign key constraint error on `orgId`.
- Root cause: The Clerk org sync webhook hadn't fired (no `CLERK_WEBHOOK_SECRET` set locally), so the `Organization` row didn't exist in the DB when `orgProcedure` tried to look it up.
- Fix: Added org auto-provisioning in `orgProcedure` — if org not found in DB, create it on-demand from Clerk's `auth()` context. App is now resilient to missed webhooks.

**Bug 15 — `recordings.get` not org-scoped (security issue)**
- Symptom/discovery: During P0 audit, found that `recordings.get` fetched by ID with no orgId check.
- Impact: Any authenticated user who knew or guessed a recording UUID could read another org's recording.
- Fix: Added `recording.orgId !== ctx.orgId` check and throws `FORBIDDEN` if mismatch.

**Bug 16 — S3 audio files never deleted**
- Symptom/discovery: During P0 audit, found S3 deletion was inside a `try/catch` that swallowed errors.
- Impact: Audio files were accumulating in S3 indefinitely. Privacy violation risk.
- Fix: Moved deletion to after transcript is committed to DB. Added explicit error logging.

**Bug 17 — Worker env vars not loading**
- Symptom: On Mac Mini (clean environment), all `process.env.*` values were undefined in workers.
- Root cause: Next.js automatically injects `.env` during `next dev`. Workers run outside Next.js — they don't get this injection.
- Fix: Added `import 'dotenv/config'` as the very first line of both worker files.

### Milestone: Full pipeline working on Mac Mini

After all fixes, tested upload → Whisper → Claude → notes end-to-end on Mac Mini. All working.

### P0 audit completed

Ran a full audit of all P0 issues. All critical bugs fixed. See `docs/BUGS_AND_FIXES.md` for the complete catalogue.

---

### Current state at end of session

- Full pipeline working on both Mac Studio and Mac Mini
- All P0 bugs fixed
- All P0 security issues fixed
- P1 work (status polling, action items page, settings page) in progress

### Open questions / TODOs

- [ ] Add real-time processing status polling to recording detail page (P1)
- [ ] Build action items page (`/dashboard/action-items`) (P1)
- [ ] Build settings page (`/dashboard/settings`) (P1)
- [ ] Configure `RECALLAI_API_KEY` + test meeting bot
- [ ] Set up `CLERK_WEBHOOK_SECRET` with ngrok — org auto-provisioning is a workaround, not a replacement
- [ ] Write worker Dockerfile for Railway/Render deployment
- [ ] Consider a `concurrently` or `pm2` setup to start all 3 processes from one command

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

### Open questions / TODOs at end of session

### Next session priorities

-->
