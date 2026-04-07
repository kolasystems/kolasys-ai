@AGENTS.md

# Kolasys AI — Project Reference

> A new developer or Claude session should be able to get up to speed in ~10 minutes from this file.

**GitHub:** https://github.com/kolasystems/kolasys-ai  
**Live app:** https://app.kolasys.ai  
**Domains:** `kolasys.ai` (marketing), `kolasys.com` (redirect), `app.kolasys.ai` (product)

---

## 0. Project History (Day 1 → Today)

### How this project started

Kolasys AI began from a blank `create-next-app` scaffold on **2026-04-03**. Everything was built from scratch in three focused sessions across two machines (Mac Studio + Mac Mini).

See `docs/FULL_PROJECT_HISTORY.md` for the complete timeline and `docs/SESSION_LOG.md` for per-session narrative.

### Summary of what was built

| Session | Date | Machine | What happened |
|---|---|---|---|
| 1 | 2026-04-03 | Mac Studio | Full Phase 1 scaffold — 34 files, schema, workers, API, UI |
| 2 | 2026-04-04 | Mac Studio | Bug fixes, summarisation worker, first end-to-end pipeline test |
| 3 | 2026-04-06 | Mac Mini | All P0/P1 bugs fixed, Phase 2 features built, Sentry+PostHog+Resend added, deployed to Vercel |

---

## 1. What Is Kolasys AI?

Kolasys AI is an **AI-powered meeting notes product**. It records, transcribes, summarises, and extracts action items from meetings — automatically, with no manual effort.

**Core philosophy:**
- **Invisible AI** — the AI works in the background; the user never has to prompt it
- **No-bot-first** — prefer local/native recording over deploying a meeting bot when possible
- **Privacy-focused** — audio files are deleted from S3 immediately after transcription completes
- **Structured output** — Claude returns JSON so notes are machine-readable, not just text blobs

**Inspiration:** Granola AI, Jamie AI, Fireflies, Otter.ai, Notion AI, PLAUD hardware recorder

---

## 2. Tech Stack

### Core Framework
| Technology | Version | Why |
|---|---|---|
| **Next.js** | 16.2.2 | App Router, RSC, Turbopack. **BREAKING CHANGES** — see AGENTS.md |
| **React** | 19.2.4 | Required by Next.js 16 |
| **TypeScript** | 5.x | Strict mode throughout |

### Database & ORM
| Technology | Version | Why |
|---|---|---|
| **Prisma** | 7.6.0 | ORM. **v7 has breaking changes** — see §11 |
| **@prisma/adapter-neon** | 7.6.0 | HTTP adapter for Neon (no WebSocket needed) |
| **@neondatabase/serverless** | 1.0.2 | Neon connection primitives |

### Auth
| Technology | Version | Why |
|---|---|---|
| **Clerk** | 7.x | Auth + organisations. v7: `auth()` is async |
| **svix** | 1.x | Clerk webhook HMAC verification |

### API Layer
| Technology | Version | Why |
|---|---|---|
| **tRPC** | 11.x | Type-safe API between client and server |
| **TanStack Query** | 5.x | Client-side data fetching, via tRPC |
| **superjson** | 2.x | Serialiser for tRPC (handles Date, BigInt, etc.) |
| **Zod** | 4.x | Schema validation for tRPC inputs |

### Async Processing
| Technology | Version | Why |
|---|---|---|
| **BullMQ** | 5.x | Job queue for transcription + summarisation workers |
| **IORedis** | 5.x | Redis client for BullMQ (Upstash) |

### AI Services
| Technology | Version | Why |
|---|---|---|
| **OpenAI SDK** | 6.x | Whisper `whisper-1` transcription + `text-embedding-3-small` embeddings |
| **Anthropic SDK** | 0.81.x | Claude `claude-sonnet-4-6` for summarisation |
| **@deepgram/sdk** | latest | Speaker diarization (optional — gracefully degraded) |

### Storage
| Technology | Version | Why |
|---|---|---|
| **AWS SDK v3** | 3.x | S3 for audio file storage + pre-signed URLs |

### Observability
| Technology | Version | Why |
|---|---|---|
| **@sentry/nextjs** | 10.x | Error tracking — browser, server, edge, workers |
| **posthog-js + posthog-node** | latest | Product analytics — client and server-side events |

### Email
| Technology | Version | Why |
|---|---|---|
| **resend** | latest | Transactional email (notes-ready, weekly digest, welcome) |
| **@react-email/components** | latest | JSX email templates with Resend |

### Integrations
| Technology | Version | Why |
|---|---|---|
| **@notionhq/client** | latest | Notion page creation after meeting notes generated |

### UI
| Technology | Version | Why |
|---|---|---|
| **Tailwind CSS** | 4.x | No `tailwind.config.js` — configured via `@theme {}` in CSS |
| **Radix UI** | various | Accessible headless components (Dialog, Dropdown, Toast, Tabs, Tooltip) |
| **lucide-react** | 1.x | Icons |
| **react-dropzone** | 15.x | File drag-and-drop in upload modal |
| **nanoid** | 5.x | Short unique IDs |
| **dotenv** | 16.x | Env var loading in worker scripts (outside Next.js) |

---

## 3. Architecture

### Data flow — upload path
```
Browser (drag-drop file)
  → tRPC recordings.create        — creates DB record (status: PENDING)
  → tRPC recordings.getUploadUrl  — generates S3 pre-signed PUT URL (1h expiry)
  → fetch(s3Url, PUT, file)       — browser uploads directly to S3 (bypasses Vercel 4.5MB limit)
  → tRPC recordings.confirmUpload — updates DB (PROCESSING), enqueues transcription job
  → BullMQ transcriptionQueue
      → Worker downloads audio from S3
      → Calls OpenAI Whisper → full transcript + timestamps
      → If DEEPGRAM_API_KEY set: speaker diarization → assigns speaker IDs to segments
      → Saves Transcript + TranscriptSegment[] records (sequential, no transactions)
      → Deletes S3 audio file (privacy by design)
      → Enqueues summarizationQueue
  → BullMQ summarizationQueue
      → Worker fetches transcript + NoteTemplate
      → Calls Claude in parallel: structured summary + action items extraction
      → Saves Note + NoteSection[] + ActionItem[]
      → If Slack webhook configured: posts formatted summary
      → If Notion configured: creates Notion page
      → Sets Recording.status = READY
      → Sends transactional email via Resend
      → Fires PostHog event: recording_ready
```

### Data flow — meeting bot path
```
Browser → tRPC recordings.create (source: MEETING_BOT, meetingUrl)
  → Recall.ai REST API: deploy bot to Zoom/Meet/Teams meeting
  → POST /api/webhooks/recall — Recall.ai calls back with bot events
  → On bot.done: same transcription → summarisation pipeline as above
```

### Multi-tenant structure
```
Organization (Clerk org)
  └── OrgMember[] (Clerk user IDs + roles, optional Google OAuth tokens)
  └── Recording[]
        └── Transcript → TranscriptSegment[] (with optional speaker IDs)
        └── SpeakerLabel[] (user-editable "SPEAKER_0" → "John Smith")
        └── Note → NoteSection[], ActionItem[], NoteComment[]
        └── ProcessingJob[] (audit trail)
  └── NoteTemplate[] (org-specific or null = global built-in)
  └── ApiKey[]
```

### Worker processes (separate from Next.js)
- `src/workers/transcription.worker.ts` — concurrency 3, Whisper + diarization
- `src/workers/summarization.worker.ts` — concurrency 2, Claude + integrations + email

---

## 4. Project Structure

```
kolasys-ai/
├── prisma/
│   ├── schema.prisma          Prisma v7 schema (11 models, 9 enums + SpeakerLabel)
│   ├── seed.ts                Seeds 4 global NoteTemplates
│   └── prisma.config.ts       Prisma v7 config (schema path + datasource URL)
├── src/
│   ├── app/
│   │   ├── layout.tsx         Root — ClerkProvider + TRPCReactProvider + PostHogProvider
│   │   ├── page.tsx           Root redirect → /dashboard or /sign-in
│   │   ├── globals.css        Tailwind v4 @theme + global styles
│   │   ├── instrumentation.ts Sentry init hook (Next.js 16 pattern)
│   │   ├── global-error.tsx   Sentry error boundary
│   │   ├── proxy.ts           Clerk middleware (Next.js 16: renamed from middleware.ts)
│   │   ├── dashboard/
│   │   │   ├── layout.tsx     Shell — sidebar, org switcher, nav
│   │   │   ├── page.tsx       Overview — stat cards + recent recordings (RSC)
│   │   │   ├── action-items/page.tsx  Action items management
│   │   │   ├── calendar/page.tsx      Calendar sync (upcoming meetings)
│   │   │   ├── search/page.tsx        Full-text search across recordings
│   │   │   ├── settings/
│   │   │   │   ├── page.tsx           Org settings, templates, API keys
│   │   │   │   └── integrations/page.tsx  Slack, Notion, calendar connections
│   │   │   └── recordings/
│   │   │       ├── page.tsx           Recordings list (infinite scroll)
│   │   │       └── [id]/page.tsx      Recording detail — transcript + notes + actions
│   │   ├── sign-in/[[...sign-in]]/page.tsx   Clerk SignIn (catch-all required)
│   │   ├── sign-up/[[...sign-up]]/page.tsx   Clerk SignUp (catch-all required)
│   │   └── api/
│   │       ├── trpc/[trpc]/route.ts   tRPC HTTP handler
│   │       ├── ai/ask/route.ts        Ask AI endpoint (vector search + Claude)
│   │       ├── auth/google/
│   │       │   ├── route.ts           Google OAuth initiation
│   │       │   └── callback/route.ts  Google OAuth callback
│   │       ├── cron/weekly-digest/route.ts  Vercel cron for weekly email
│   │       └── webhooks/
│   │           ├── clerk/route.ts     Clerk org/membership sync (svix)
│   │           └── recall/route.ts    Recall.ai bot status events (HMAC)
│   ├── components/
│   │   ├── new-recording-modal.tsx    3-tab modal: upload / record / bot
│   │   ├── browser-recorder.tsx       MediaRecorder API component
│   │   ├── status-badge.tsx           Status pill (PENDING/PROCESSING/READY/FAILED)
│   │   ├── recording-status-poller.tsx Auto-refreshes recording page while processing
│   │   ├── ask-ai-panel.tsx           AI Q&A sidebar (semantic search over transcript)
│   │   ├── editable-note-section.tsx  Inline note section editor
│   │   ├── editable-action-item.tsx   Inline action item status/priority editor
│   │   ├── speaker-label-editor.tsx   Rename "SPEAKER_0" → real name
│   │   ├── transcript-paginated.tsx   Paginated transcript viewer with speaker labels
│   │   ├── calendar-meetings-list.tsx Upcoming meetings from Google Calendar
│   │   └── delete-recording-button.tsx Confirmation + delete mutation
│   ├── emails/
│   │   ├── notes-ready.tsx    Transactional: notes are ready (sent after summarisation)
│   │   ├── weekly-digest.tsx  Weekly meeting recap email
│   │   └── welcome.tsx        Onboarding email for new users
│   ├── generated/
│   │   └── prisma/            Auto-generated Prisma client (never edit)
│   ├── hooks/
│   │   └── use-ai-chat.ts     React hook for Ask AI streaming responses
│   ├── lib/
│   │   ├── db.ts              Prisma singleton — PrismaNeonHttp (NO server-only)
│   │   ├── redis.ts           Two IORedis clients (general + BullMQ)
│   │   ├── queues.ts          BullMQ queue definitions + job data types
│   │   ├── storage.ts         S3: upload, download, delete, pre-sign (NO server-only)
│   │   ├── trpc.ts            tRPC React client ('use client' required)
│   │   ├── email.ts           Resend client singleton
│   │   ├── posthog.ts         PostHog server-side singleton
│   │   ├── db-vector.ts       pgvector helpers (Phase 2)
│   │   └── utils.ts           cn(), formatDuration(), formatFileSize(), relativeTime()
│   ├── providers/
│   │   ├── trpc-provider.tsx  QueryClient + tRPC.Provider ('use client')
│   │   └── posthog-provider.tsx PostHog client-side provider
│   ├── server/
│   │   ├── trpc.ts            tRPC init, context, procedures (server-only)
│   │   ├── root.ts            Root router (server-only)
│   │   └── routers/
│   │       ├── recordings.router.ts  All recording CRUD + upload + search
│   │       ├── calendar.router.ts    Google Calendar integration
│   │       ├── integrations.router.ts Slack/Notion connection management
│   │       └── search.router.ts      Vector + full-text search
│   ├── services/
│   │   ├── transcription.service.ts   OpenAI Whisper wrapper
│   │   ├── summarization.service.ts   Anthropic Claude (summary + action items JSON)
│   │   ├── meetingbot.service.ts      Recall.ai REST client
│   │   ├── diarization.service.ts     Deepgram speaker diarization (optional)
│   │   ├── embeddings.service.ts      OpenAI text-embedding-3-small + chunking
│   │   └── integrations/
│   │       ├── slack.service.ts       Slack incoming webhook (post summary)
│   │       └── notion.service.ts      Notion API (create page from notes)
│   └── workers/
│       ├── transcription.worker.ts    BullMQ: Whisper + diarization + S3 cleanup
│       └── summarization.worker.ts    BullMQ: Claude + Slack + Notion + email + PostHog
├── sentry.server.config.ts    Sentry Node.js runtime config
├── sentry.client.config.ts    Sentry browser config
├── sentry.edge.config.ts      Sentry edge runtime config
├── vercel.json                Vercel deployment config + cron schedule
├── next.config.ts             Sentry plugin + serverExternalPackages
├── prisma.config.ts           Prisma v7 datasource URL config
├── tsconfig.json              isolatedModules: true, @/* alias
├── .env                       Real credentials (git-ignored)
└── .env.example               All 26 required variable names
```

---

## 5. Database Schema

### Enums (9)

| Enum | Values |
|---|---|
| `Plan` | FREE, PRO, ENTERPRISE |
| `MemberRole` | OWNER, ADMIN, MEMBER |
| `RecordingSource` | UPLOAD, BROWSER, MEETING_BOT |
| `RecordingStatus` | PENDING, PROCESSING, TRANSCRIBING, SUMMARIZING, READY, FAILED |
| `MeetingPlatform` | ZOOM, GOOGLE_MEET, MICROSOFT_TEAMS, WEBEX, OTHER |
| `JobType` | TRANSCRIPTION, SUMMARIZATION, ACTION_ITEMS |
| `JobStatus` | QUEUED, PROCESSING, COMPLETED, FAILED |
| `ActionItemStatus` | OPEN, IN_PROGRESS, COMPLETED, CANCELLED |
| `Priority` | LOW, MEDIUM, HIGH, URGENT |

### Models (12)

| Model | Key fields | Notes |
|---|---|---|
| `Organization` | id, name, slug, plan, clerkOrgId, slackWebhookUrl, notionApiKey, notionDatabaseId | Root tenant; Slack/Notion stored here |
| `OrgMember` | orgId, userId (Clerk), role, googleRefreshToken | googleRefreshToken for calendar sync |
| `Recording` | orgId, userId, title, source, status, s3Key, botId, duration, fileSize | Central entity |
| `Transcript` | recordingId (unique), text, language, confidence | One-to-one with Recording |
| `TranscriptSegment` | transcriptId, speaker, text, startTime, endTime, confidence | speaker = "SPEAKER_0" from diarization |
| `SpeakerLabel` | recordingId, speakerId, displayName | User renames "SPEAKER_0" → "John Smith" |
| `Note` | recordingId, orgId, userId, summary, templateId, isPublic | AI-generated notes |
| `NoteSection` | noteId, title, content, order | Structured sections from Claude |
| `ActionItem` | noteId, orgId, title, priority, status, assignee, dueDate | Extracted tasks |
| `NoteComment` | noteId, userId, content | Human comments on notes |
| `NoteTemplate` | orgId (null=global), name, structure (JSON), isDefault | Section definitions for Claude |
| `ProcessingJob` | recordingId, type, status, attempts, error, result | Audit trail for all worker jobs |
| `ApiKey` | orgId, keyHash, lastUsed, expiresAt | Future public API |

---

## 6. Environment Variables

All 26 variables must be set in both `.env` (local) and Vercel dashboard (production).

### Required — App will not start without these
| Variable | Service | What breaks |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL | Everything — Prisma won't connect |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk | Auth broken, can't sign in |
| `CLERK_SECRET_KEY` | Clerk | Server-side auth broken |
| `CLERK_WEBHOOK_SECRET` | Clerk | Org/membership sync to DB fails silently |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Clerk | `/sign-in` redirect broken |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Clerk | `/sign-up` redirect broken |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Clerk | Wrong redirect post-login |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Clerk | Wrong redirect post-signup |
| `NEXT_PUBLIC_APP_URL` | tRPC | tRPC requests go to wrong URL |
| `REDIS_URL` | Upstash Redis | BullMQ fails, workers can't connect |
| `OPENAI_API_KEY` | OpenAI | Transcription + embeddings fail |
| `ANTHROPIC_API_KEY` | Anthropic | Summarisation fails |
| `AWS_REGION` | AWS S3 | Upload URL generation fails |
| `AWS_ACCESS_KEY_ID` | AWS S3 | Upload URL generation fails |
| `AWS_SECRET_ACCESS_KEY` | AWS S3 | Upload URL generation fails |
| `S3_BUCKET_NAME` | AWS S3 | Upload URL generation fails |

### Required — Features break without these
| Variable | Service | What breaks |
|---|---|---|
| `RECALLAI_API_KEY` | Recall.ai | Meeting bot deployment fails |
| `RECALLAI_WEBHOOK_SECRET` | Recall.ai | Webhook HMAC verification fails |
| `RESEND_API_KEY` | Resend | Transactional emails not sent |
| `RESEND_FROM_EMAIL` | Resend | Email "from" address — e.g. `notes@kolasys.ai` |

### Optional — Gracefully degraded if missing
| Variable | Service | What degrades |
|---|---|---|
| `DEEPGRAM_API_KEY` | Deepgram | Speaker diarization skipped; transcript still saved |
| `SENTRY_DSN` | Sentry | Server-side errors not tracked |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry | Client-side errors not tracked |
| `SENTRY_AUTH_TOKEN` | Sentry | Source maps not uploaded at build time |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog | Analytics events not sent |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog | Defaults to US cloud if missing |

**Tip:** SENTRY_ORG and SENTRY_PROJECT are also needed for source map uploads during `next build`.

---

## 7. How to Run

### New machine setup
```bash
# 1. Clone
git clone https://github.com/kolasystems/kolasys-ai
cd kolasys-ai

# 2. Install deps
npm install

# 3. Copy .env (from another machine or fill in .env.example)
cp .env.example .env  # then fill in all values

# 4. Generate Prisma client
npx prisma generate

# 5. Sync schema to DB (first time only)
npx prisma db push

# 6. Seed note templates (first time only)
npx prisma db seed
```

### Development — 3 terminals required

**Terminal 1 — Next.js app**
```bash
npm run dev
# → http://localhost:3000
# If port 3000 is taken: npm run dev -- --port 3001
```

**Terminal 2 — Transcription worker**
```bash
npx tsx src/workers/transcription.worker.ts
```

**Terminal 3 — Summarisation worker**
```bash
npx tsx src/workers/summarization.worker.ts
```

**Optional: Terminal 4 — ngrok** (required for Clerk + Recall.ai webhooks in dev)
```bash
ngrok http 3000
# Copy the https URL and update:
# 1. Clerk dashboard → Webhooks → endpoint URL
# 2. Recall.ai dashboard → webhook URL
# ⚠ URL changes every ngrok restart — must update both services each time
```

### Webhook endpoints to register
- **Clerk:** `https://<ngrok-url>/api/webhooks/clerk`
  - Events: `user.created`, `organization.created`, `organization.updated`, `organization.deleted`, `organizationMembership.*`
- **Recall.ai:** `https://<ngrok-url>/api/webhooks/recall`

---

## 8. Current Status (2026-04-06)

### Deployed
- **Production URL:** https://app.kolasys.ai
- **Host:** Vercel (Next.js app)
- **DNS:** Cloudflare — `app.kolasys.ai` CNAME → Vercel deployment URL
- **Workers:** Not yet deployed to production (Railway/Fly.io — see docs/DEPLOYMENT.md)

### Phase 1 — Complete
- Dashboard: stat cards, recent recordings
- Recordings list with infinite scroll
- Recording detail: paginated transcript, AI notes, action items
- New Recording modal: upload / browser-record / bot-deploy tabs
- Clerk auth: sign in, sign up, org switcher
- tRPC API layer fully typed with superjson
- Prisma schema synced to Neon, 4 templates seeded
- Both BullMQ workers running
- Full pipeline: upload → Whisper → Claude → notes ✅
- S3 audio deletion after transcription (privacy)
- Org-scoped security on all recording reads
- Org auto-provisioning (resilient to missed webhooks)

### Phase 2 — Complete
- **Speaker diarization** — Deepgram labels speakers; editor lets users rename them
- **Ask AI** — semantic search + Claude Q&A over transcript content
- **Vector search** — embeddings generated via `text-embedding-3-small`
- **Calendar sync** — Google Calendar OAuth, upcoming meetings list
- **Slack integration** — post formatted summary to configured channel
- **Notion integration** — create Notion page from meeting notes
- **Sentry** — error tracking across browser, server, and workers
- **PostHog** — product analytics: uploads, views, completions
- **Resend** — transactional email: notes-ready, welcome, weekly digest
- **Real-time status polling** — `recording-status-poller.tsx` refetches while processing
- **Action items page** — list, filter, update status
- **Settings page** — org settings, integrations, note templates
- **Inline editing** — note sections and action items editable in UI
- **Delete recording** — with S3 cleanup

### Still TODO
- Deploy workers to Railway or Fly.io (blocking: production pipeline)
- Configure `RECALLAI_API_KEY` + test meeting bot end-to-end
- Set up Clerk org webhook with production URL (not ngrok)
- Weekly digest cron job (Vercel cron configured, needs testing)

---

## 9. Phase Roadmap

| Phase | Status | Features |
|---|---|---|
| **1 — Web** | ✅ Complete | Upload / browser record / bot → Whisper → Claude → notes + action items |
| **2 — Intelligence** | ✅ Complete | Speaker diarization, Ask AI, vector search, calendar sync, Slack, Notion, email, Sentry, PostHog |
| **3 — Native** | Next | Worker deployment (Railway), Google/Microsoft OAuth polish, iOS app, Android app |
| **4 — Desktop** | Future | Mac menu bar app (Swift), Windows app |
| **5 — Ecosystem** | Future | PLAUD NotePin hardware, CRM sync (Salesforce/HubSpot), white labeling, enterprise |

See `docs/ROADMAP.md` for the full product roadmap.

---

## 10. Key Decisions & Rationale

**Direct-to-S3 upload** — Vercel has a 4.5 MB body limit. Pre-signed PUT URLs let the browser upload directly to S3, bypassing the Next.js server entirely. Workers download from S3 via a separate pre-signed GET URL.

**BullMQ + separate worker processes** — Whisper transcription takes 5–60s; Claude summarisation takes 10–30s. Both exceed Vercel's function timeout. Workers run as long-lived Node.js processes on Railway/Fly.io.

**Prisma v7 + PrismaNeonHttp** — v7 HTTP adapter works in all Next.js server environments without persistent connections. **Critical:** HTTP mode does NOT support `$transaction`, `upsert`, or nested writes. All must be replaced with sequential operations. URL moves from `schema.prisma` → `prisma.config.ts`.

**No `server-only` on db.ts / storage.ts** — These files are imported by BullMQ workers (standalone `tsx` processes outside Next.js). The `server-only` guard throws unconditionally outside the Next.js bundler. Only `server/trpc.ts` and `server/root.ts` keep `server-only` — workers never import those.

**Sentry in workers** — Workers init Sentry before all other imports so errors in any phase (S3 download, Whisper, Claude, DB writes, integrations) are captured with full context (jobId, recordingId, attempt count).

**Non-fatal integrations** — Slack, Notion, email, and diarization failures never fail the main job. The core pipeline (transcript → notes → DB) always succeeds or retries. Integrations are fire-and-forget.

**Speaker labels as separate model** — Users can rename "SPEAKER_0" → "John Smith" without modifying the immutable transcript. Labels are joined on display.

**Org auto-provisioning** — `orgProcedure` creates the DB `Organization` row on-demand if the Clerk webhook hasn't synced it yet. Resilient to local dev environments where webhook isn't configured.

---

## 11. Known Issues & Gotchas

### Prisma v7 breaking changes
- Generator: `provider = "prisma-client"` (NOT `prisma-client-js`)
- No `url =` in `datasource db {}` — URL lives in `prisma.config.ts`
- Import path: `from '@/generated/prisma/client'`
- Constructor: `new PrismaClient({ adapter })` — adapter is required
- HTTP mode: no `$transaction`, no `upsert`, no nested creates — use sequential calls

### Client components cannot import Prisma
Prisma uses Node.js-only APIs. Never import from `@/generated/prisma/client` or `@/lib/db` in any `'use client'` file. Use local string union types for enum equivalents.

### tRPC type leak prevention
`src/lib/trpc.ts` must have `'use client'` as its first line. Without it, `import type { AppRouter }` pulls the entire server module graph (including Prisma) into the client bundle.

### Workers need dotenv
`import 'dotenv/config'` must be the **first** import in both worker files. Next.js env injection doesn't apply to standalone `tsx` processes. Without it, all `process.env.*` values are undefined.

### Workers need to be deployed separately
If workers are not running, uploads appear to succeed (file reaches S3) but recordings stay `PENDING` forever. In production, workers must run on Railway or Fly.io — Vercel does not support long-running processes.

### Next.js 16 specifics
- `params` / `searchParams` in page components are `Promise<{}>` — always `await params`
- Middleware lives in `src/proxy.ts` (not `middleware.ts`)
- Turbopack is default for `next dev`; webpack used for `next build`

### ngrok URL changes
Every ngrok restart generates a new URL. Update both Clerk dashboard and Recall.ai dashboard after each restart. Use a paid ngrok fixed domain in dev to avoid this friction.

### orgProcedure requires active Clerk org
All recording mutations are `orgProcedure`. Users must have an active org (via `OrganizationSwitcher`) before any mutation works. `orgProcedure` auto-provisions if the Clerk webhook hasn't synced yet.

---

## 12. Services & Credentials Reference

| Service | Purpose | Where to find credentials |
|---|---|---|
| **Neon** | PostgreSQL database | neon.tech → project → connection string |
| **Clerk** | Auth + organisations | clerk.com → API Keys (publishable + secret) |
| **Upstash** | Redis for BullMQ | upstash.com → database → REST URL |
| **AWS S3** | Audio file storage | IAM console → kolasys-ai-worker user → access keys |
| **OpenAI** | Whisper transcription + embeddings | platform.openai.com → API keys |
| **Anthropic** | Claude summarisation | console.anthropic.com → API keys |
| **Deepgram** | Speaker diarization (optional) | console.deepgram.com → API keys |
| **Recall.ai** | Meeting bot API | recall.ai → dashboard → API key |
| **Resend** | Transactional email | resend.com → API Keys |
| **Sentry** | Error tracking | sentry.io → project → DSN |
| **PostHog** | Product analytics | posthog.com → project → project API key |
| **Vercel** | Hosting + deployment | vercel.com → kolasys-ai project |
| **Cloudflare** | DNS management | cloudflare.com → kolasys.ai zone |
| **GitHub** | Source control | https://github.com/kolasystems/kolasys-ai |
| **ngrok** | Local webhook tunnel | ngrok.com (URL changes each restart) |

See `docs/SERVICES.md` for full setup instructions for each service.
See `docs/DEPLOYMENT.md` for production deployment guide.
