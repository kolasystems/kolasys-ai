# Kolasys AI — Phase 1: What Was Built

Phase 1 establishes the full project foundation: schema, infrastructure wiring, core recording pipeline, and a functional dashboard. The goal was to go from a blank Next.js scaffold to a working end-to-end flow where a user can upload a recording (or send a bot), get it transcribed, and view AI-generated notes.

---

## Scope of Phase 1

| Category | Status |
|---|---|
| Database schema (all models + enums) | ✅ Complete |
| Clerk auth + multi-org support | ✅ Complete |
| tRPC API layer | ✅ Complete |
| Direct-to-S3 file upload pipeline | ✅ Complete |
| BullMQ queue infrastructure | ✅ Complete |
| OpenAI Whisper transcription | ✅ Complete |
| Anthropic Claude summarisation | ✅ Complete |
| Recall.ai meeting bot integration | ✅ Complete |
| Webhook handlers (Clerk + Recall.ai) | ✅ Complete |
| Dashboard UI (overview + recordings) | ✅ Complete |
| Browser recorder component | ✅ Complete |
| New recording modal | ✅ Complete |
| Built-in note templates (seed data) | ✅ Complete |
| Documentation | ✅ Complete |

---

## File-by-File Descriptions

### Configuration & Root

#### `prisma/schema.prisma`
The complete Kolasys AI data model. Defines all 11 models and 9 enums. Uses Prisma v7's `prisma-client` provider with output to `src/generated/prisma`. Key design decisions:
- All data scoped to `Organization` with cascading deletes
- `Recording` is the central entity connecting transcripts, notes, and jobs
- `ProcessingJob` provides an audit trail for all async operations
- `NoteTemplate` supports global built-in and org-specific custom templates
- `ApiKey` stores only hashed keys, never raw secrets

#### `prisma/seed.ts`
Seeds 4 built-in global note templates with deterministic IDs so re-runs are idempotent:
- **Standard Meeting Notes** — the default general-purpose template
- **One-on-One** — structured for 1:1s with career/growth sections
- **Product Review** — captures feature feedback, bugs, and prioritisation
- **Sales Call** — pain points, objections, and next steps in the sales process

#### `next.config.ts`
Updated with:
- `images.remotePatterns` for S3 image serving
- `serverExternalPackages: ['ioredis', 'bullmq']` to prevent bundling issues with these native Node packages in Next.js

#### `tsconfig.json`
Path alias updated: `"@/*": ["./src/*"]`. This means all `@/` imports resolve from the `src/` directory, which is where the entire application lives.

#### `.env.example`
Documents all 19 required environment variables across 6 categories: database, auth (Clerk), AI (OpenAI + Anthropic + Deepgram), storage (AWS S3), queue (Redis), and meeting bots (Recall.ai).

#### `src/proxy.ts`
The Clerk authentication proxy. In Next.js 16, `middleware.ts` was renamed to `proxy.ts`. Uses `clerkMiddleware` with `createRouteMatcher` to protect all routes except sign-in/sign-up pages and webhook endpoints. Auth is enforced before any page or API handler runs.

---

### `src/lib/`

#### `src/lib/db.ts`
Prisma client singleton using the `globalThis` pattern. Prevents multiple PrismaClient instances during Next.js hot module replacement in development, which would exhaust database connections. Production always creates a fresh instance.

#### `src/lib/redis.ts`
Two separate IORedis client instances:
- `redis` — general-purpose client (caching, pub/sub) with standard retry settings
- `bullmqConnection` — dedicated BullMQ client with `maxRetriesPerRequest: null` (required by BullMQ's blocking queue operations)

#### `src/lib/storage.ts`
AWS S3 helper functions:
- `uploadToS3` — buffer/stream upload
- `getSignedDownloadUrl` — generate pre-signed GET URL (1-hour default expiry)
- `getSignedUploadUrl` — generate pre-signed PUT URL for direct browser upload
- `deleteFromS3` — object deletion
- `generateRecordingKey` — consistent key format: `recordings/{orgId}/{recordingId}.{ext}`

#### `src/lib/queues.ts`
BullMQ queue definitions for `transcription` and `summarization`. Both queues share the same default job options: 3 attempts with exponential backoff, 24-hour retention for completed jobs, and 7-day retention for failed jobs (to allow inspection). Exports typed job data interfaces.

#### `src/lib/trpc.ts`
A single line: `createTRPCReact<AppRouter>()`. The `trpc` export is used throughout the client to call procedures with full type inference.

#### `src/lib/utils.ts`
Utility functions:
- `cn(...)` — Tailwind class merging via `tailwind-merge`
- `formatDuration(seconds)` — `"m:ss"` or `"h:mm:ss"` format
- `formatFileSize(bytes)` — human-readable size
- `slugify(text)` — URL-safe slug generation
- `relativeTime(date)` — `"3 minutes ago"` style labels

---

### `src/providers/`

#### `src/providers/trpc-provider.tsx`
Client component that provides the full tRPC + React Query context tree. Uses the singleton `QueryClient` pattern (creates a new client per server render, reuses a browser-level singleton). `httpBatchStreamLink` is used for request batching with `superjson` serialisation.

---

### `src/server/`

#### `src/server/trpc.ts`
The tRPC server initialisation. Key exports:
- `createTRPCContext` — async context factory that calls `await auth()` (async in Next.js 16) to get `userId` and `orgId` from Clerk
- `publicProcedure` — no auth required
- `protectedProcedure` — requires `userId`; throws `UNAUTHORIZED` if not signed in
- `orgProcedure` — extends `protectedProcedure`; additionally requires `orgId`; throws `FORBIDDEN` if no active org

#### `src/server/root.ts`
Combines all routers into `appRouter`. Exports `AppRouter` type for end-to-end type inference.

#### `src/server/routers/recordings.router.ts`
The recordings tRPC router. Procedures:
- `list` — paginated (cursor-based) list of org recordings with status filter support
- `get` — full recording with transcript segments, notes, and processing jobs
- `create` — creates a new recording record (does not yet handle the file)
- `delete` — validates org ownership before deleting
- `getUploadUrl` — generates S3 pre-signed URL and persists `s3Key` to DB
- `confirmUpload` — marks recording as `PROCESSING` and enqueues transcription

---

### `src/services/`

#### `src/services/transcription.service.ts`
Wraps the OpenAI Whisper API. Accepts an audio buffer and filename, returns a `TranscriptionResult` with full text, detected language, duration, and per-segment data. Maps Whisper's `avg_logprob` to a [0, 1] confidence score. Handles MIME type detection from file extension.

#### `src/services/summarization.service.ts`
Wraps the Anthropic Claude API with a structured JSON output contract. Accepts a transcript and an array of `SectionDefinition` objects (title + prompt). Sends a system prompt instructing Claude to respond only with JSON, then parses the response. Falls back gracefully by stripping markdown code fences before parsing. Built-in default sections can be overridden by org templates.

#### `src/services/meetingbot.service.ts`
REST client for Recall.ai's bot API. Functions:
- `deployBot` — creates a bot with the Kolasys AI name, configures real-time transcription webhook
- `removeBot` — removes a bot from a meeting early
- `getBotStatus` — polls current bot state
- `getBotVideoUrl` — retrieves the video download URL after the meeting ends

---

### `src/workers/`

#### `src/workers/transcription.worker.ts`
A long-running Node.js process (not a serverless function). Uses BullMQ's `Worker` class with concurrency 3 (processes up to 3 transcriptions in parallel). For each job:
1. Updates `ProcessingJob` to `PROCESSING`
2. Downloads audio from S3 via pre-signed URL
3. Calls `transcribeAudio` (OpenAI Whisper)
4. Persists `Transcript` + `TranscriptSegment` rows in a database transaction
5. Updates recording duration if returned by Whisper
6. Updates `ProcessingJob` to `COMPLETED`
7. Enqueues a `summarization` job

On failure: marks `ProcessingJob` as `FAILED` with error message; marks `Recording` as `FAILED`. Handles `SIGTERM` for graceful shutdown.

---

### `src/components/`

#### `src/components/status-badge.tsx`
A small presentational component mapping `RecordingStatus` enum values to coloured badges. `PROCESSING` shows an animated pulse dot. Accepts a `className` prop for layout overrides.

#### `src/components/browser-recorder.tsx`
Client component using the browser's `MediaRecorder` API. Records audio from the microphone (prefers `audio/webm;codecs=opus`). Features:
- Three states: `idle`, `recording`, `stopped`
- Live elapsed time counter
- Animated waveform bars while recording
- Collects chunks every 1 second (`recorder.start(1_000)`)
- Releases microphone on stop
- Calls `onRecordingComplete(blob, mimeType)` callback

#### `src/components/new-recording-modal.tsx`
A Radix UI `Dialog` with three tabs:
- **Upload File** — drag-and-drop (react-dropzone) for audio/video up to 500 MB
- **Record Now** — embeds `BrowserRecorder`
- **Meeting Bot** — URL input for Recall.ai bot deployment

Handles the full upload flow: create recording → get upload URL → PUT to S3 → confirm upload. Shows errors inline and invalidates the React Query recordings cache on success.

---

### `src/app/`

#### `src/app/layout.tsx`
Root layout wrapping all pages with `ClerkProvider` (for auth UI + session) and `TRPCReactProvider` (for data fetching). Sets up Geist font variables and default metadata.

#### `src/app/page.tsx`
Root page. Server component that checks `auth()` and redirects to `/dashboard` if signed in, or `/sign-in` if not. No visible UI.

#### `src/app/globals.css`
Tailwind v4 CSS. Uses `@import "tailwindcss"` and configures a custom `@theme {}` block with:
- `--color-brand-*` — a blue-indigo brand palette (10 shades)
- `--font-sans` and `--font-mono` wired to Geist font CSS variables
- Border radius tokens

#### `src/app/dashboard/layout.tsx`
Server component layout for all dashboard pages. Redirects to `/sign-in` if not authenticated. Renders a 60px sidebar with:
- Kolasys AI logo mark + name
- `OrganizationSwitcher` (Clerk component for switching between orgs)
- Navigation links: Overview, Recordings, Action Items, Settings
- `UserButton` (Clerk component) at the bottom

#### `src/app/dashboard/page.tsx`
Dashboard overview. Fetches stats (recording count, note count, open action items) and recent recordings directly via Prisma in a server component. Renders stat cards with icons and a recent recordings list. Shows an empty state with a CTA when no recordings exist.

#### `src/app/dashboard/recordings/page.tsx`
Client component. Uses `trpc.recordings.list.useInfiniteQuery` for cursor-based pagination with a "Load more" button. Shows skeleton loading state, empty state, and the recordings list with status badges, duration, note count, and relative timestamps. Opens `NewRecordingModal` when the "New Recording" button is clicked.

#### `src/app/dashboard/recordings/[id]/page.tsx`
Server component. Awaits `params` (required in Next.js 16 where params is a Promise). Fetches full recording detail via Prisma: transcript with segments, notes with sections and action items, and processing jobs. Renders:
- Recording metadata header with status badge
- Processing indicator if still transcribing
- Meeting notes with summary, sections, and action items (colour-coded by priority)
- Full transcript with timestamps and optional speaker labels
- Empty state while pending

#### `src/app/api/trpc/[trpc]/route.ts`
tRPC route handler. Uses `fetchRequestHandler` with `runtime = 'nodejs'`. Handles both GET (for tRPC queries via GET) and POST (for mutations and batch queries). Logs errors in development only.

#### `src/app/api/webhooks/clerk/route.ts`
Clerk webhook handler. Verifies `svix` HMAC signature. Syncs org creation/update/deletion and membership events to the local `Organization` and `OrgMember` tables.

#### `src/app/api/webhooks/recall/route.ts`
Recall.ai webhook handler. Verifies HMAC-SHA256 signature using `crypto.timingSafeEqual`. Handles `bot.status_change` events: starts recording tracking, triggers transcription on meeting end, and marks recordings as failed on bot errors.

---

## Notable Omissions (Deferred to Phase 2)

The following features are intentionally out of scope for Phase 1:

- **Summarisation worker** — the queue is set up; the worker process is not yet written (transcription worker enqueues summarisation jobs but no consumer runs yet)
- **Custom org note templates** — schema supports it; UI not built
- **Action item management UI** — schema and extraction built; standalone action items page not built
- **Real-time status updates** — UI does not yet poll or use WebSockets to show live transcription progress
- **Sharing / public notes** — `isPublic` field exists on `Note`; UI not built
- **Search** — no full-text or vector search
- **Analytics** — no usage dashboards
- **API keys UI** — schema built; no UI for creating/revoking keys
