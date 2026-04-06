# Kolasys AI — Architecture

A deep-dive into every layer of the system: how data moves from an audio capture event all the way to a finished set of meeting notes with action items.

---

## Table of Contents

1. [High-Level Overview](#1-high-level-overview)
2. [Database Schema](#2-database-schema)
3. [Authentication & Multi-Tenancy](#3-authentication--multi-tenancy)
4. [API Layer (tRPC)](#4-api-layer-trpc)
5. [File Upload Pipeline](#5-file-upload-pipeline)
6. [Queue Pipeline](#6-queue-pipeline)
7. [Transcription Service](#7-transcription-service)
8. [Summarisation Service](#8-summarisation-service)
9. [Meeting Bot Integration](#9-meeting-bot-integration)
10. [Webhook Handlers](#10-webhook-handlers)
11. [Frontend Architecture](#11-frontend-architecture)
12. [Data Flow: Audio → Notes](#12-data-flow-audio--notes)
13. [Key Design Decisions](#13-key-design-decisions)

---

## 1. High-Level Overview

Kolasys AI is a multi-tenant SaaS application. The concept of an **Organisation** is central — all recordings, notes, and action items belong to an org. A user can belong to multiple orgs (via Clerk's organisation feature) and switch between them using the sidebar org switcher.

The system has three distinct compute environments:

| Environment | Hosts | Constraints |
|---|---|---|
| Vercel (serverless) | Next.js pages, tRPC API, webhook handlers | Max 60s execution, no persistent connections |
| Worker process | BullMQ workers (transcription, summarisation) | Long-running, stateful, needs raw Node.js |
| External services | Clerk, Neon, S3, Recall.ai, OpenAI, Anthropic | Managed, accessed via HTTP/SDK |

---

## 2. Database Schema

### Entity Relationship Diagram

```
Organization ──< OrgMember
     │
     ├──< Recording ──── Transcript ──< TranscriptSegment
     │         │
     │         └──< Note ──< NoteSection
     │                  ├──< ActionItem
     │                  └──< NoteComment
     │
     ├──< ApiKey
     └──< NoteTemplate ─────────────── Note (templateId)

Recording ──< ProcessingJob
```

### Model Descriptions

#### `Organization`
The root tenant entity. Every piece of data is scoped to an org. `clerkOrgId` ties the local record to Clerk's organisation system. `plan` controls feature gating.

#### `OrgMember`
Represents a Clerk user's membership in an org. Synced from Clerk via webhook. Roles: `OWNER`, `ADMIN`, `MEMBER`.

#### `Recording`
The core entity. Represents a meeting recording in any state. Key fields:
- `source` — how it was captured (`UPLOAD`, `BROWSER`, `MEETING_BOT`)
- `status` — lifecycle state (`PENDING` → `PROCESSING` → `READY` / `FAILED`)
- `s3Key` — location of the audio/video file in S3
- `botId` — Recall.ai bot ID (only for `MEETING_BOT` recordings)
- `duration`, `fileSize`, `mimeType` — metadata filled in after upload/capture

#### `Transcript`
One-to-one with `Recording`. Stores the full concatenated text of the transcript plus language and overall confidence.

#### `TranscriptSegment`
One-to-many from `Transcript`. Each segment is a timestamped chunk of speech with an optional speaker label. Indexed on `(transcriptId, startTime)` for fast ordered access.

#### `Note`
AI-generated structured meeting notes for a recording. A recording can have multiple notes (e.g. different templates applied). References an optional `NoteTemplate`.

#### `NoteSection`
An ordered section within a `Note` (e.g. "Key Discussion Points"). Content is markdown text. The `order` field controls display sequence.

#### `ActionItem`
Extracted to-do items from the meeting. Has priority, due date, and an optional assignee (Clerk user ID).

#### `NoteComment`
Free-text comments left on a note by team members.

#### `NoteTemplate`
Defines the section structure used when generating notes. `orgId = null` means it is a global built-in template. Orgs can create custom templates. The `structure` JSON field is an array of `{ title, prompt }` objects.

#### `ProcessingJob`
Tracks every async job (transcription, summarisation, action item extraction) for a recording. Provides a full audit trail and enables retries.

#### `ApiKey`
Hashed API keys for programmatic access. `keyHash` is stored (not the raw key) so that even a database breach does not expose usable keys.

---

## 3. Authentication & Multi-Tenancy

### Clerk Integration

Authentication is fully delegated to Clerk. Kolasys AI does not store passwords or manage sessions.

The Clerk proxy (Next.js 16 renamed `middleware.ts` → `proxy.ts`) runs on every request. It:
1. Validates the Clerk session cookie
2. Attaches `userId` and `orgId` to the request context
3. Redirects unauthenticated requests to `/sign-in`

```
Request
  → src/proxy.ts (clerkMiddleware)
    → auth.protect() if not a public route
      → tRPC context: createTRPCContext
        → await auth() → { userId, orgId }
```

### Why Clerk for Organisations?

Rather than building organisation management from scratch (invites, roles, RBAC), Clerk provides it out of the box. The `OrgMember` table in PostgreSQL is a read-model synced from Clerk via webhooks — it is used for efficient database-level queries without hitting Clerk's API on every request.

---

## 4. API Layer (tRPC)

### Route: `src/app/api/trpc/[trpc]/route.ts`

All client-server data fetching and mutations go through tRPC. The handler uses `fetchRequestHandler` from `@trpc/server/adapters/fetch`, which is compatible with Next.js App Router's route handlers.

### Procedure Tiers

| Procedure | Auth Required | Org Required |
|---|---|---|
| `publicProcedure` | No | No |
| `protectedProcedure` | Yes (userId) | No |
| `orgProcedure` | Yes (userId) | Yes (orgId) |

Most recording operations use `orgProcedure` because recordings are org-scoped.

### Context

```typescript
{
  userId: string | null      // Clerk user ID
  orgId: string | null       // Clerk org ID (active org)
  db: PrismaClient           // Database client
  headers: Headers           // Request headers
}
```

### Current Routers

| Router | Procedures |
|---|---|
| `recordings` | `list`, `get`, `create`, `delete`, `getUploadUrl`, `confirmUpload` |

Phase 2 will add: `notes`, `actionItems`, `templates`, `analytics`.

### Transformer

`superjson` is used as the tRPC transformer on both server and client, enabling serialisation of `Date` objects, `undefined`, and `BigInt` without manual conversion.

---

## 5. File Upload Pipeline

Direct-to-S3 upload via pre-signed URLs avoids routing large audio files through the Next.js server (which has a 4.5 MB body limit on Vercel).

```
1. Client calls trpc.recordings.create
   → Creates Recording record (status: PENDING)

2. Client calls trpc.recordings.getUploadUrl
   → Server generates a pre-signed PUT URL (expires 1h)
   → Persists s3Key on the Recording

3. Client PUTs the file directly to S3
   → No server involvement, no bandwidth cost

4. Client calls trpc.recordings.confirmUpload
   → Updates Recording (status: PROCESSING, fileSize, mimeType)
   → Enqueues transcription job to BullMQ
```

This pattern supports files up to 5 GB (S3 single-object PUT limit) without any streaming complexity on the server.

---

## 6. Queue Pipeline

BullMQ is used for all async processing. Two queues are defined:

### `transcription` queue

Triggered by:
- `confirmUpload` tRPC mutation (after file upload)
- Recall.ai webhook (when bot finishes recording)

Job payload: `{ recordingId, orgId, s3Key }`

On completion: enqueues `summarization` job.

### `summarization` queue

Triggered by: successful completion of a `transcription` job.

Job payload: `{ recordingId, transcriptId, templateId? }`

### Job retry strategy

```typescript
{
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 }
  // 1st retry: 5s, 2nd: 10s, 3rd: 20s
}
```

### ProcessingJob table

Every BullMQ job has a corresponding `ProcessingJob` row in the database. This provides:
- Visibility in the UI (status, errors)
- Audit trail for debugging
- Persistence across worker restarts (BullMQ jobs live in Redis, but the DB record survives Redis flushes)

---

## 7. Transcription Service

**File:** `src/services/transcription.service.ts`

Uses OpenAI Whisper (`whisper-1`) with `verbose_json` response format.

```
Audio buffer (from S3)
  → openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment']
    })
  → TranscriptionResult {
      text: string          // full concatenated text
      language: string      // detected language
      duration?: number     // seconds
      segments: [{
        text, startTime, endTime, confidence
      }]
    }
```

**Confidence mapping:** Whisper returns `avg_logprob` per segment (range ≈ [-1, 0]). We map this to [0, 1] via `1 + avg_logprob`.

**Known limitation:** Whisper accepts files up to 25 MB. Meetings longer than ~90 minutes in MP3 format may exceed this. Phase 2 will add audio chunking.

---

## 8. Summarisation Service

**File:** `src/services/summarization.service.ts`

Uses Anthropic Claude (`claude-sonnet-4-6`) with structured JSON output.

```
Transcript text + NoteTemplate sections
  → System prompt: structured JSON response format
  → User prompt: transcript + per-section instructions
  → Claude response: JSON {
      summary: string,
      sections: [{ title, content }]
    }
  → Parsed into Note + NoteSection records
```

### Template system

Each `NoteTemplate` has a `structure` JSON field:

```json
[
  { "title": "Meeting Overview", "prompt": "Summarize what the meeting was about..." },
  { "title": "Action Items", "prompt": "List action items with owners..." }
]
```

These prompts are injected into Claude's user message, giving Kolasys AI users the ability to customise how notes are generated per org.

---

## 9. Meeting Bot Integration

**File:** `src/services/meetingbot.service.ts`

Recall.ai is a third-party service that provides cloud-hosted bots capable of joining Zoom, Google Meet, and Microsoft Teams meetings.

### Bot lifecycle

```
1. User submits meeting URL in NewRecordingModal
2. trpc.recordings.create → Recording { source: MEETING_BOT, status: PENDING }
3. meetingbot.service.deployBot(meetingUrl, recordingId, webhookUrl)
   → POST https://us-west-2.recall.ai/api/v1/bot/
   → Returns botId → stored on Recording
4. Bot joins meeting, records audio/video
5. Recall.ai sends webhook events:
   - bot.status_change: in_call_recording → Recording { status: PROCESSING }
   - bot.status_change: done → triggers transcription queue
   - bot.status_change: fatal → Recording { status: FAILED }
6. Video file downloaded from Recall.ai → uploaded to S3
7. Normal transcription → summarisation pipeline runs
```

---

## 10. Webhook Handlers

### Clerk webhook (`/api/webhooks/clerk`)

Maintains the local `Organization` and `OrgMember` tables as a read-model of Clerk's state.

| Clerk event | Database action |
|---|---|
| `organization.created` | `Organization.upsert` |
| `organization.updated` | `Organization.update` |
| `organization.deleted` | `Organization.delete` (cascades to all data) |
| `organizationMembership.created` | `OrgMember.upsert` |
| `organizationMembership.deleted` | `OrgMember.delete` |

**Verification:** Uses `svix` library with `CLERK_WEBHOOK_SECRET` to verify the HMAC signature on every request.

### Recall.ai webhook (`/api/webhooks/recall`)

Handles bot status lifecycle events.

**Verification:** HMAC-SHA256 with `RECALLAI_WEBHOOK_SECRET` using Node's built-in `crypto` module, with constant-time comparison (`timingSafeEqual`) to prevent timing attacks.

---

## 11. Frontend Architecture

### Provider tree

```
ClerkProvider                    (auth session)
  └── TRPCReactProvider
        ├── QueryClientProvider  (React Query)
        └── trpc.Provider        (tRPC client)
              └── App
```

### Data fetching patterns

| Pattern | Used for |
|---|---|
| Server Components + direct Prisma | Dashboard stats, recording detail (static-ish data) |
| tRPC `useInfiniteQuery` | Recordings list (cursor pagination) |
| tRPC `useMutation` | Create, delete, upload confirm |
| tRPC `useUtils().invalidate()` | Cache invalidation after mutations |

### Key design: hybrid rendering

Recording detail pages (`/dashboard/recordings/[id]`) are **server-rendered** — they fetch directly from the database via Prisma in a Server Component. This avoids a client-side loading state for the initial render and is better for SEO.

The recordings list page is a **Client Component** using `useInfiniteQuery` to support infinite scroll with live status updates.

---

## 12. Data Flow: Audio → Notes

The complete journey from an audio file to finished meeting notes:

```
[User uploads file]
       │
       ▼
POST /api/trpc → recordings.create
       │  Creates Recording { status: PENDING }
       ▼
POST /api/trpc → recordings.getUploadUrl
       │  Generates S3 pre-signed URL
       ▼
PUT https://s3.amazonaws.com/...
       │  File uploaded directly to S3
       ▼
POST /api/trpc → recordings.confirmUpload
       │  Updates Recording { status: PROCESSING }
       │  Creates ProcessingJob { type: TRANSCRIPTION, status: QUEUED }
       │  Pushes job to BullMQ "transcription" queue
       ▼
[Transcription Worker picks up job]
       │  Downloads audio from S3 (pre-signed URL)
       │  Calls OpenAI Whisper API
       │  Creates Transcript + TranscriptSegments
       │  Updates ProcessingJob { status: COMPLETED }
       │  Pushes job to BullMQ "summarization" queue
       ▼
[Summarization Worker picks up job]
       │  Reads Transcript from DB
       │  Loads NoteTemplate (default or org-specific)
       │  Calls Anthropic Claude API
       │  Creates Note + NoteSections
       │  Extracts ActionItems
       │  Updates Recording { status: READY }
       │  Updates ProcessingJob { status: COMPLETED }
       ▼
[User views /dashboard/recordings/:id]
       │  Server Component fetches Recording + Transcript + Note
       │  Renders notes, transcript, action items
```

End-to-end latency (typical 1-hour meeting):
- Upload: depends on user connection
- Transcription: ~2–4 minutes (Whisper)
- Summarisation: ~10–20 seconds (Claude)
- **Total server-side processing: ~2–5 minutes**

---

## 13. Key Design Decisions

### Why tRPC over REST or GraphQL?

tRPC gives end-to-end type safety without a code generation step. Since both client and server are TypeScript in the same repo, the router type flows directly to the client. This eliminates an entire class of runtime errors from API contract mismatches.

### Why not use Server Actions for mutations?

Server Actions are appropriate for form submissions, but tRPC gives us structured error handling, optimistic updates, automatic cache invalidation via React Query, and a unified pattern for both queries and mutations. For a data-heavy app like Kolasys AI, this consistency outweighs the simplicity of Server Actions.

### Why direct-to-S3 upload?

Next.js serverless functions on Vercel have a 4.5 MB request body limit and a 60-second execution limit. Meeting recordings are often 50–500 MB. Pre-signed S3 URLs let the browser upload directly to S3 with no server intermediary.

### Why BullMQ over Vercel background functions?

Transcription and summarisation can take 2–5 minutes. Vercel's max execution time for background functions is 15 minutes on the Pro plan but zero on the free tier. BullMQ + a persistent worker process gives reliable, retryable job processing independent of Vercel's limits.

### Why Prisma over Drizzle?

Prisma v7 with the new `prisma-client` provider has first-class support for Neon's serverless driver, strong TypeScript types, and a rich relation API that makes complex joins readable. Drizzle is faster but requires more boilerplate for complex queries. The trade-off favours developer experience at this stage.

### Why not use the Vercel AI SDK?

The Vercel AI SDK is optimised for streaming chat UIs. Kolasys AI's AI usage is batch-oriented (transcription, structured summary generation) and runs in workers, not in route handlers. Using the Anthropic SDK and OpenAI SDK directly gives more control over prompts and response parsing.
