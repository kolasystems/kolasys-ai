# Kolasys AI — Third-Party Services Registry

Every external service used by Kolasys AI: purpose, credentials location, setup notes, and status.

---

## 1. Neon — PostgreSQL Database

**Purpose:** Primary database. All application data lives here.  
**URL:** https://neon.tech  
**Dashboard:** https://console.neon.tech

**Credentials:**
- `DATABASE_URL` — connection string from Neon console → project → connection string
- Use the **pooled** HTTP connection string (not the direct connection string)

**Setup notes:**
- One project: `kolasys-ai`
- Default branch: `main`
- Schema managed by Prisma v7 (`prisma.config.ts`)
- First time: `npx prisma db push` to sync schema, `npx prisma db seed` for templates
- Production: use `prisma migrate dev` before Phase 3 to establish migration baseline

**Prisma v7 gotchas:**
- URL goes in `prisma.config.ts` datasource config, NOT in `schema.prisma`
- Generator: `provider = "prisma-client"` (not `prisma-client-js`)
- No `$transaction`, no `upsert`, no nested creates in HTTP mode

---

## 2. Clerk — Auth + Organisations

**Purpose:** User authentication, session management, multi-org support.  
**URL:** https://clerk.com  
**Dashboard:** https://dashboard.clerk.com

**Credentials:**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — public key for client-side
- `CLERK_SECRET_KEY` — secret key for server-side
- `CLERK_WEBHOOK_SECRET` — signing secret for webhook verification (svix)

**Dev vs Production keys:**
- Clerk provides separate key sets for development and production
- Dev keys: start with `pk_test_` and `sk_test_`
- Production keys: start with `pk_live_` and `sk_live_`
- Use dev keys locally; production keys in Vercel

**Webhook setup:**
1. Dashboard → Webhooks → Add Endpoint
2. URL: `https://app.kolasys.ai/api/webhooks/clerk` (or ngrok URL for dev)
3. Events to subscribe: `user.created`, `organization.*`, `organizationMembership.*`
4. Copy signing secret → set as `CLERK_WEBHOOK_SECRET`

**Important:** Org auto-provisioning in `orgProcedure` handles missed webhooks in dev. But production must have the webhook configured to keep org data in sync.

---

## 3. Upstash — Redis (BullMQ)

**Purpose:** Redis backend for BullMQ job queues (transcription + summarisation).  
**URL:** https://upstash.com  
**Dashboard:** https://console.upstash.com

**Credentials:**
- `REDIS_URL` — REST URL from database overview (use `rediss://` TLS URL)

**Setup notes:**
- One database: `kolasys-ai`
- Region: same as or closest to Vercel deployment
- BullMQ uses two IORedis connections — both point to the same `REDIS_URL`
- BullMQ connection requires `maxRetriesPerRequest: null` (set in `src/lib/redis.ts`)
- Upstash free tier: 10,000 commands/day — sufficient for early-stage

---

## 4. AWS S3 — Audio File Storage

**Purpose:** Temporary storage for audio files during transcription. Files are deleted after Whisper processes them.  
**URL:** https://aws.amazon.com/s3/  
**Dashboard:** https://console.aws.amazon.com

**Credentials:**
- `AWS_REGION` — e.g. `us-east-1`
- `AWS_ACCESS_KEY_ID` — IAM user access key
- `AWS_SECRET_ACCESS_KEY` — IAM user secret
- `S3_BUCKET_NAME` — bucket name (e.g. `kolasys-ai-recordings`)

**Setup notes:**
- IAM user: `kolasys-ai-worker` with policy scoped to S3 bucket only:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::kolasys-ai-recordings/*"
    }]
  }
  ```
- Bucket CORS (allow PUT from app):
  ```json
  [{"AllowedHeaders": ["*"], "AllowedMethods": ["PUT", "GET"], "AllowedOrigins": ["https://app.kolasys.ai", "http://localhost:3000"], "ExposeHeaders": []}]
  ```
- Recommended: S3 lifecycle rule to delete objects older than 1 day (safety net for failed deletions)
- File path pattern: `recordings/{orgId}/{recordingId}.{ext}`

**Privacy note:** Audio files are deleted from S3 immediately after Whisper transcription completes. The transcription worker explicitly deletes the file and logs any failure.

---

## 5. OpenAI — Transcription + Embeddings

**Purpose:** Whisper `whisper-1` for audio transcription. `text-embedding-3-small` for vector search embeddings.  
**URL:** https://platform.openai.com  
**Dashboard:** https://platform.openai.com/api-keys

**Credentials:**
- `OPENAI_API_KEY` — API key

**Models used:**
- `whisper-1` — transcription. 25 MB file size limit. Supports MP3, WAV, M4A, WebM, OGG, MP4.
- `text-embedding-3-small` — embeddings. 1536 dimensions. Used for Ask AI semantic search.

**Setup notes:**
- Whisper returns: full text, detected language, duration, per-segment timestamps + confidence
- Confidence mapped from `avg_logprob` ([-1, 0] → [0, 1])
- For files > 25 MB: need chunking logic (Phase 3 improvement)

---

## 6. Anthropic — Claude Summarisation

**Purpose:** `claude-sonnet-4-6` generates meeting notes and extracts action items.  
**URL:** https://console.anthropic.com  
**Dashboard:** https://console.anthropic.com/api-keys

**Credentials:**
- `ANTHROPIC_API_KEY` — API key

**How it's used:**
- Called in the summarisation worker after transcription completes
- Prompt includes the full transcript + NoteTemplate section definitions
- Returns structured JSON: executive summary + sections array + action items array
- Action items include: title, description, assignee name, priority, dueDate (ISO string)
- Claude occasionally wraps JSON in ```json code fences — service strips these

---

## 7. Recall.ai — Meeting Bot API

**Purpose:** Unified API to deploy a recording bot into Zoom, Google Meet, and Microsoft Teams meetings.  
**URL:** https://recall.ai  
**Dashboard:** https://recall.ai/dashboard

**Credentials:**
- `RECALLAI_API_KEY` — API key
- `RECALLAI_WEBHOOK_SECRET` — webhook HMAC signing secret

**Status:** Not yet configured. `RECALLAI_API_KEY` needs to be set before meeting bot feature is usable.

**Setup notes:**
- Bot name shown to meeting participants: "Kolasys AI"
- Bot passes `recordingId` as metadata to identify the recording in webhook callbacks
- Webhook endpoint: `https://app.kolasys.ai/api/webhooks/recall`
- On `bot.done` event: triggers the same transcription → summarisation pipeline as file uploads
- Recall.ai requires a verified domain for production bots (may need approval process)

---

## 8. Deepgram — Speaker Diarization

**Purpose:** Speaker identification — assigns "SPEAKER_0", "SPEAKER_1" labels to transcript segments.  
**URL:** https://console.deepgram.com  
**Dashboard:** https://console.deepgram.com

**Credentials:**
- `DEEPGRAM_API_KEY` — API key (optional — diarization degrades gracefully if missing)

**How it's used:**
- Called in the transcription worker after Whisper
- If `DEEPGRAM_API_KEY` not set: skipped, segments saved without speaker IDs
- If diarization fails: error logged, transcript still saved
- Maps Deepgram word-level timestamps to TranscriptSegment records via overlap voting
- Users can rename "SPEAKER_0" → real name via `speaker-label-editor.tsx`

---

## 9. Sentry — Error Tracking

**Purpose:** Capture and alert on exceptions in the browser, server, edge runtime, and worker processes.  
**URL:** https://sentry.io  
**Dashboard:** https://sentry.io → kolasys-ai project

**Credentials:**
- `SENTRY_DSN` — server-side DSN (from project → Client Keys)
- `NEXT_PUBLIC_SENTRY_DSN` — same value, exposed to browser bundle
- `SENTRY_AUTH_TOKEN` — for source map upload at build time
- `SENTRY_ORG` — Sentry org slug (used in `next.config.ts` `withSentryConfig`)
- `SENTRY_PROJECT` — Sentry project slug

**Config files:**
- `sentry.server.config.ts` — Node.js runtime (API routes, tRPC, workers)
- `sentry.client.config.ts` — browser (React components)
- `sentry.edge.config.ts` — edge runtime (unused currently)
- `src/app/instrumentation.ts` — Next.js 16 hook that inits Sentry

**Sampling:**
- Dev: 100% traces
- Prod: 20% traces, 100% on error
- Session replay: 10% sessions, 100% on error
- Text/media masked for privacy

**Worker integration:**
Both workers init Sentry before all other imports. Errors tagged with: `worker`, `jobId`, `recordingId`, `attempt`.

---

## 10. PostHog — Product Analytics

**Purpose:** Track user behaviour: recordings uploaded, notes viewed, action items completed.  
**URL:** https://posthog.com  
**Dashboard:** https://app.posthog.com

**Credentials:**
- `NEXT_PUBLIC_POSTHOG_KEY` — project API key
- `NEXT_PUBLIC_POSTHOG_HOST` — `https://us.i.posthog.com` (US) or `https://eu.i.posthog.com` (EU)

**Events tracked:**
| Event | Where fired | Properties |
|---|---|---|
| `recording_uploaded` | tRPC `confirmUpload` | fileSize, mimeType, source |
| `note_viewed` | tRPC `get` | recordingId |
| `action_item_completed` | tRPC `updateActionItem` | actionItemId |
| `recording_ready` | summarisation worker | wordCount, sectionCount, duration |

**Server-side:** `posthog-node` singleton in `src/lib/posthog.ts` (serverless mode: flushAt=1, immediate flush)  
**Client-side:** `posthog-js` via `posthog-provider.tsx` (pageview tracking)

---

## 11. Resend — Transactional Email

**Purpose:** Send transactional emails: meeting notes ready, weekly digest, welcome.  
**URL:** https://resend.com  
**Dashboard:** https://resend.com/emails

**Credentials:**
- `RESEND_API_KEY` — API key
- `RESEND_FROM_EMAIL` — verified sender address (e.g. `notes@kolasys.ai`)

**Setup notes:**
- Must verify `kolasys.ai` domain in Resend before production use
- Sandbox mode (without domain verification) only allows sending to your own email
- Email templates in `src/emails/` use `@react-email/components`

**Emails sent:**
| Email | Trigger | Template |
|---|---|---|
| Notes ready | Summarisation worker completes | `notes-ready.tsx` |
| Weekly digest | Vercel cron every Monday 9AM UTC | `weekly-digest.tsx` |
| Welcome | New user created (Clerk webhook) | `welcome.tsx` |

---

## 12. Vercel — Hosting + Deployment

**Purpose:** Host the Next.js application. Automatic deployments from GitHub.  
**URL:** https://vercel.com  
**Dashboard:** https://vercel.com/kolasystems

**Project:** `kolasys-ai`  
**Production URL:** https://app.kolasys.ai  
**GitHub:** Auto-deploy on push to `main`

**Setup notes:**
- Workers CANNOT run on Vercel (serverless only) — must deploy to Railway or Fly.io
- Cron jobs configured in `vercel.json` (requires Pro plan)
- All env vars set in Vercel → Settings → Environment Variables

See `docs/DEPLOYMENT.md` for full setup guide.

---

## 13. Cloudflare — DNS + Domain Management

**Purpose:** DNS management for `kolasys.ai` and `kolasys.com`.  
**URL:** https://cloudflare.com  
**Dashboard:** https://dash.cloudflare.com

**DNS records:**
| Name | Type | Target | Notes |
|---|---|---|---|
| `app` | CNAME | Vercel deployment URL | DNS only (grey cloud) |
| `@` | A/CNAME | Marketing site | TBD |

**Domain portfolio:**
- `kolasys.ai` — primary brand + marketing site
- `kolasys.com` — redirect to `kolasys.ai`
- `app.kolasys.ai` — product (Vercel)

---

## 14. GitHub — Source Control

**Purpose:** Source control, collaboration.  
**URL:** https://github.com/kolasystems/kolasys-ai  
**Organization:** `kolasystems`

Main branch: `main`. Auto-deploys to Vercel on push.

---

## 15. Apple Developer — iOS App (Pending)

**Purpose:** Distribute iOS app via App Store.  
**Status:** Pending Apple Developer account approval.  
**URL:** https://developer.apple.com

Required for Phase 3 iOS app. Apply for developer account before starting iOS development.

---

## 16. Google Play — Android App (Pending)

**Purpose:** Distribute Android app via Google Play Store.  
**Status:** Not yet applied.  
**URL:** https://play.google.com/console

Required for Phase 3 Android app. $25 one-time registration fee.

---

## Quick Reference — Credentials Locations

| Service | Where to find keys |
|---|---|
| Neon | console.neon.tech → project → connection string |
| Clerk | dashboard.clerk.com → API Keys |
| Upstash | console.upstash.com → database → REST URL |
| AWS | IAM console → Users → `kolasys-ai-worker` → Security credentials |
| OpenAI | platform.openai.com → API keys |
| Anthropic | console.anthropic.com → API keys |
| Deepgram | console.deepgram.com → API keys |
| Recall.ai | recall.ai/dashboard → API key |
| Resend | resend.com → API Keys |
| Sentry | sentry.io → project → Client Keys → DSN |
| PostHog | app.posthog.com → project settings → Project API Key |
| Vercel | vercel.com → project → Settings → Environment Variables |
| Cloudflare | dash.cloudflare.com → kolasys.ai zone → DNS |
