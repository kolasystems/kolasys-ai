# Kolasys AI — Session Log

Running record of all build sessions: what was built, decisions made, open questions, and next steps.

---

## Session 1 — 2026-04-01

### What was built

**Full Phase 1 project scaffold** — taking the app from a blank `create-next-app` scaffold to a complete, runnable foundation.

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

### Open questions / TODOs

- [ ] **Summarisation worker** — not yet written. The queue is wired but nothing consumes summarisation jobs. Priority P0 before public launch.
- [ ] **Old `app/` directory** — must be manually deleted (`rm -rf app/`) to avoid routing conflict with `src/app/`.
- [ ] **`npm install svix`** — Clerk webhook handler imports `svix` which is not in `package.json` yet.
- [ ] **Recording detail: async params type** — `generateMetadata` and the page component both use `Promise<{ id: string }>`. Confirm this type compiles correctly after `npx prisma generate`.
- [ ] **Transcription worker: audio > 25 MB** — Whisper's 25 MB limit will fail silently for long meetings. Needs chunking logic.
- [ ] **Meeting bot video download** — the Recall.ai webhook marks recording as PROCESSING but doesn't yet download the video from Recall.ai to S3. The `getBotVideoUrl` service function exists but isn't called. Phase 2 work.
- [ ] **Neon connection pooling** — `prisma.config.ts` uses pooled connection URL. Verify the DATABASE_URL in `.env.local` uses the pooled endpoint (port 6432), not the direct connection.
- [ ] **Worker deployment** — no Dockerfile or Railway/Render config yet for the transcription worker process.

---

### Next session priorities

1. Write `src/workers/summarization.worker.ts`
2. Delete legacy `app/` directory
3. Run `npm install svix` and `npx prisma generate`
4. Test the full upload → transcription → summarisation pipeline end-to-end locally
5. Add polling to the recording detail page for live status updates
6. Build the action items management page (`/dashboard/action-items`)

---

*Add new sessions below this line as development continues.*

---

<!-- Template for new sessions:

## Session N — YYYY-MM-DD

### What was built

### Key decisions made

| Decision | Rationale |
|---|---|

### Open questions / TODOs

### Next session priorities

-->
