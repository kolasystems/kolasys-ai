# Kolasys AI — Setup Guide

Step-by-step instructions for provisioning every external service Kolasys AI depends on.
Follow these in order before running the app locally or deploying.

---

## Table of Contents

1. [Clerk (Auth)](#1-clerk-auth)
2. [Neon (PostgreSQL)](#2-neon-postgresql)
3. [AWS S3 (File Storage)](#3-aws-s3-file-storage)
4. [Redis / Upstash (Queue)](#4-redis--upstash-queue)
5. [Recall.ai (Meeting Bots)](#5-recallai-meeting-bots)
6. [OpenAI (Transcription)](#6-openai-transcription)
7. [Anthropic (Summarisation)](#7-anthropic-summarisation)
8. [Local Development Checklist](#8-local-development-checklist)
9. [Production / Vercel Deployment](#9-production--vercel-deployment)

---

## 1. Clerk (Auth)

Clerk handles authentication, organisation management, and session tokens for Kolasys AI.

### Create an application

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com) and sign up.
2. Click **"Create application"**.
3. Name it **Kolasys AI**.
4. Choose sign-in methods: **Email** + **Google** (recommended).
5. Click **Create application**.

### Copy API keys

In **API Keys** on the left sidebar:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

### Enable Organisations

1. Go to **Organizations** → **Settings**.
2. Enable **Organizations**.
3. Set **Max organizations per user** to your preference (5 for free tier).

### Configure redirect URLs

In **Paths** → **URL and Redirects**:

```env
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

### Set up Webhooks

Clerk webhooks keep your PostgreSQL database in sync with Clerk's org/membership state.

1. Go to **Webhooks** → **Add Endpoint**.
2. **URL**: `https://your-app.vercel.app/api/webhooks/clerk`
   - For local dev: use [ngrok](https://ngrok.com) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/): `npx ngrok http 3000`
3. **Subscribe to events**:
   - `organization.created`
   - `organization.updated`
   - `organization.deleted`
   - `organizationMembership.created`
   - `organizationMembership.deleted`
4. Copy the **Signing Secret**:

```env
CLERK_WEBHOOK_SECRET=whsec_...
```

### Install the svix package

The webhook handler uses `svix` for signature verification:

```bash
npm install svix
```

---

## 2. Neon (PostgreSQL)

Neon provides serverless PostgreSQL with free tier.

### Create a database

1. Go to [neon.tech](https://neon.tech) and sign up.
2. Click **New project**.
3. Name it `kolasys-ai`, choose region **US East** (or nearest to you).
4. Click **Create project**.

### Get the connection string

1. In your project dashboard, click **Connection Details**.
2. Select the **Pooled connection** tab (recommended for Next.js serverless).
3. Copy the connection string:

```env
DATABASE_URL=postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
```

### Run migrations

```bash
npx prisma generate     # Generate Prisma client into src/generated/prisma
npx prisma db push      # Push schema (no migration files, good for early dev)
npx prisma db seed      # Seed built-in note templates
```

> **Tip:** Switch to `prisma migrate dev` once the schema stabilises to get proper migration history.

---

## 3. AWS S3 (File Storage)

S3 stores uploaded audio/video files and bot recordings.

### Create an S3 bucket

1. Go to [AWS Console → S3](https://s3.console.aws.amazon.com/s3).
2. Click **Create bucket**.
3. **Bucket name**: `kolasys-ai-recordings` (must be globally unique — add a random suffix).
4. **Region**: `us-east-1` (or your preferred region).
5. **Block all public access**: ✅ Enabled (files are served via pre-signed URLs).
6. Click **Create bucket**.

### Configure CORS (required for browser uploads)

In the bucket → **Permissions** → **Cross-origin resource sharing (CORS)**:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": ["http://localhost:3000", "https://your-app.vercel.app"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### Create an IAM user

1. Go to **IAM → Users → Create user**.
2. Name: `kolasys-ai-s3`.
3. **Attach policies directly** → search and attach **AmazonS3FullAccess** (or create a scoped policy — see below).
4. Click through to **Create user**.
5. Click the user → **Security credentials** → **Create access key**.
6. Choose **Application running outside AWS**.
7. Copy the keys:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_NAME=kolasys-ai-recordings-xxxxx
```

### Recommended scoped IAM policy

Replace `kolasys-ai-recordings-xxxxx` with your actual bucket name:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::kolasys-ai-recordings-xxxxx/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::kolasys-ai-recordings-xxxxx"
    }
  ]
}
```

---

## 4. Redis / Upstash (Queue)

BullMQ uses Redis for the job queue. Upstash provides a serverless Redis free tier.

### Option A — Upstash (recommended for Vercel)

1. Go to [upstash.com](https://upstash.com) and sign up.
2. Click **Create database**.
3. Name: `kolasys-ai`, region: closest to your Vercel region.
4. Click **Create**.
5. Copy the **Redis URL** (format: `redis://default:password@host:port`):

```env
REDIS_URL=rediss://default:...@...upstash.io:6379
```

> **Note:** Upstash uses TLS (`rediss://`). If you see connection errors, ensure your Redis client supports TLS. IORedis handles this automatically when the URL starts with `rediss://`.

### Option B — Local Redis

```bash
# macOS
brew install redis
brew services start redis

# or Docker
docker run -d -p 6379:6379 redis:alpine
```

```env
REDIS_URL=redis://localhost:6379
```

---

## 5. Recall.ai (Meeting Bots)

Recall.ai deploys bots to Zoom, Google Meet, and Microsoft Teams to record meetings.

### Create an account

1. Go to [recall.ai](https://www.recall.ai) and request access (there is an approval process for new accounts).
2. Once approved, log in to the [Recall.ai dashboard](https://api.recall.ai).

### Get your API key

1. Go to **Settings → API Keys**.
2. Create a new key and copy it:

```env
RECALLAI_API_KEY=...
```

### Configure webhooks

1. Go to **Webhooks → Add Endpoint**.
2. **URL**: `https://your-app.vercel.app/api/webhooks/recall`
3. Subscribe to:
   - `bot.status_change`
   - `transcript.ready`
4. Copy the **signing secret**:

```env
RECALLAI_WEBHOOK_SECRET=...
```

### Supported platforms

| Platform | Meeting URL format |
|---|---|
| Zoom | `https://zoom.us/j/...` |
| Google Meet | `https://meet.google.com/...` |
| Microsoft Teams | `https://teams.microsoft.com/l/meetup-join/...` |
| Webex | `https://webex.com/meet/...` |

---

## 6. OpenAI (Transcription)

Kolasys AI uses OpenAI Whisper (`whisper-1`) for audio transcription.

### Get an API key

1. Go to [platform.openai.com](https://platform.openai.com).
2. Sign in → **API Keys** (top right) → **Create new secret key**.
3. Name it `kolasys-ai`.

```env
OPENAI_API_KEY=sk-...
```

### Billing

Whisper pricing: **$0.006 / minute** of audio (as of 2025).
A 1-hour meeting costs ~$0.36 to transcribe.

Add a billing limit in **Settings → Limits** to avoid surprise charges.

### File size limits

Whisper accepts files up to **25 MB**. For larger files, the transcription service will need to be extended to chunk the audio. This is a known limitation to address in Phase 2.

---

## 7. Anthropic (Summarisation)

Kolasys AI uses Claude Sonnet to generate structured meeting notes from transcripts.

### Get an API key

1. Go to [console.anthropic.com](https://console.anthropic.com).
2. Sign in → **API Keys** → **Create Key**.
3. Name it `kolasys-ai`.

```env
ANTHROPIC_API_KEY=sk-ant-...
```

### Model used

`claude-sonnet-4-6` — a good balance of quality and cost for structured output generation.

### Billing

Claude Sonnet pricing (as of 2025): ~$3 / MTok input, ~$15 / MTok output.
A typical meeting summary uses ~2K–5K tokens, costing under $0.05.

---

## 8. Local Development Checklist

```
[ ] npm install
[ ] cp .env.example .env.local  →  fill in all values
[ ] npx prisma generate
[ ] npx prisma db push
[ ] npx prisma db seed
[ ] npm run dev                             →  Terminal 1: Next.js on :3000
[ ] npx tsx src/workers/transcription.worker.ts   →  Terminal 2
[ ] npx tsx src/workers/summarization.worker.ts   →  Terminal 3
[ ] ngrok http 3000             →  expose for Clerk + Recall.ai webhooks (optional for local)
```

---

## 9. Production / Vercel Deployment

### Deploy to Vercel

```bash
npm install -g vercel
vercel --prod
```

### Environment variables

Add all variables from `.env.example` in **Vercel → Project → Settings → Environment Variables**.

Set `NEXT_PUBLIC_APP_URL` to your production URL:

```env
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### Workers

BullMQ workers cannot run on Vercel (serverless). Deploy the transcription worker to:

- **Railway** — `railway up` with a `Dockerfile` or nixpacks
- **Render** — background worker service
- **Fly.io** — `fly launch` with a `Dockerfile`

Minimal `Dockerfile` for the worker:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npx tsx --version  # confirm tsx is available
CMD ["npx", "tsx", "src/workers/transcription.worker.ts"]
```

### Update webhook URLs

After deploying, update Clerk and Recall.ai webhook endpoints to point to your production domain.
