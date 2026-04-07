# Kolasys AI — Deployment Guide

How to deploy and operate Kolasys AI in production.

**Current production setup:**
- **App:** Vercel → https://app.kolasys.ai
- **DNS:** Cloudflare
- **Workers:** NOT YET DEPLOYED — see §4

---

## 1. Vercel Deployment (Next.js App)

### First-time setup

1. Push code to GitHub: `https://github.com/kolasystems/kolasys-ai`
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
3. Select the `kolasys-ai` repository
4. Framework preset: **Next.js** (auto-detected)
5. Root directory: leave as `/` (project root)
6. Set all environment variables (see §2)
7. Click **Deploy**

### Subsequent deploys

Every push to `main` triggers an automatic Vercel deployment. No manual action needed.

To deploy a specific branch: Vercel auto-deploys all branches as preview deployments.

### Update environment variables

1. Go to Vercel dashboard → `kolasys-ai` project → Settings → Environment Variables
2. Add/edit values
3. **Redeploy** the project (env vars only take effect on new deployments)

---

## 2. Environment Variables (All 26)

Set all of these in Vercel → Settings → Environment Variables.  
Production, Preview, and Development scopes should all have the same values unless noted.

### Database & Auth
| Variable | Value / Where to find |
|---|---|
| `DATABASE_URL` | Neon dashboard → project → connection string (pooled, HTTP) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard → API Keys → Publishable key |
| `CLERK_SECRET_KEY` | Clerk dashboard → API Keys → Secret key |
| `CLERK_WEBHOOK_SECRET` | Clerk dashboard → Webhooks → endpoint → signing secret |

### Clerk Routing (required values for production)
| Variable | Production value |
|---|---|
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/dashboard` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/dashboard` |

### App
| Variable | Production value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://app.kolasys.ai` |

### Redis
| Variable | Value |
|---|---|
| `REDIS_URL` | Upstash dashboard → database → REST URL (with `rediss://` scheme) |

### AI Services
| Variable | Where to find |
|---|---|
| `OPENAI_API_KEY` | platform.openai.com → API keys |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys |

### AWS S3
| Variable | Value |
|---|---|
| `AWS_REGION` | `us-east-1` (or whichever region the bucket is in) |
| `AWS_ACCESS_KEY_ID` | IAM → kolasys-ai-worker user → access keys |
| `AWS_SECRET_ACCESS_KEY` | IAM → kolasys-ai-worker user → access keys |
| `S3_BUCKET_NAME` | `kolasys-ai-recordings` (or your bucket name) |

### Meeting Bot
| Variable | Where to find |
|---|---|
| `RECALLAI_API_KEY` | recall.ai dashboard → API key |
| `RECALLAI_WEBHOOK_SECRET` | recall.ai dashboard → webhook signing secret |

### Email
| Variable | Value |
|---|---|
| `RESEND_API_KEY` | resend.com → API Keys |
| `RESEND_FROM_EMAIL` | `notes@kolasys.ai` (must be from a verified domain in Resend) |

### Optional — Diarization
| Variable | Value |
|---|---|
| `DEEPGRAM_API_KEY` | console.deepgram.com → API keys |

### Optional — Observability
| Variable | Value |
|---|---|
| `SENTRY_DSN` | sentry.io → project → Client Keys → DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | Same as `SENTRY_DSN` (exposed to browser) |
| `SENTRY_AUTH_TOKEN` | sentry.io → Settings → Auth Tokens → create one |
| `NEXT_PUBLIC_POSTHOG_KEY` | posthog.com → project settings → Project API Key |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` (US) or `https://eu.i.posthog.com` (EU) |

---

## 3. Custom Domain (Cloudflare DNS)

### app.kolasys.ai → Vercel

1. In Vercel: project → Settings → Domains → Add `app.kolasys.ai`
2. Vercel shows a CNAME target (something like `cname.vercel-dns.com`)
3. In Cloudflare: kolasys.ai zone → DNS → Add record:
   - Type: `CNAME`
   - Name: `app`
   - Target: the value Vercel provided
   - Proxy status: **DNS only** (grey cloud) — Vercel needs to see the real IP for SSL provisioning

4. SSL is auto-provisioned by Vercel (Let's Encrypt)

### kolasys.ai (marketing site)

- Currently pointing to Cloudflare Pages or wherever the marketing site is hosted
- Not yet built — placeholder

### kolasys.com → kolasys.ai redirect

- In Cloudflare: add a Page Rule on `kolasys.com/*` → Forwarding URL (301) → `https://kolasys.ai/$1`

---

## 4. Webhook URLs to Update After Deployment

After deploying to production, update these in the respective dashboards:

### Clerk webhooks

1. Go to [clerk.com](https://clerk.com) → your application → Webhooks
2. Update or create endpoint: `https://app.kolasys.ai/api/webhooks/clerk`
3. Select events:
   - `user.created`
   - `organization.created`
   - `organization.updated`
   - `organization.deleted`
   - `organizationMembership.created`
   - `organizationMembership.updated`
   - `organizationMembership.deleted`
4. Copy the **Signing Secret** → set as `CLERK_WEBHOOK_SECRET` in Vercel

### Recall.ai webhooks

1. Go to [recall.ai](https://recall.ai) → Dashboard → Webhooks
2. Update endpoint: `https://app.kolasys.ai/api/webhooks/recall`
3. Copy the signing secret → set as `RECALLAI_WEBHOOK_SECRET` in Vercel

### Local dev webhooks (ngrok)

For local development, use ngrok to expose localhost:
```bash
ngrok http 3000
# → https://xxxx.ngrok.io
```
Update Clerk + Recall.ai dashboards with the ngrok URL.
⚠ ngrok URL changes every restart — update both services each time.
Use a paid ngrok fixed domain to avoid this.

---

## 5. Worker Deployment (TODO)

> **Status:** Workers are NOT yet deployed to production. The pipeline only works locally.
> This is the highest-priority infrastructure task before production launch.

Workers are long-running Node.js processes that cannot run on Vercel (which only supports serverless functions). They must be deployed to a platform that supports persistent processes.

### Recommended: Railway

Railway supports Docker containers or Node.js directly.

**Option A: Dockerfile**
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
CMD ["npx", "tsx", "src/workers/transcription.worker.ts"]
```

Create a separate service for each worker:
- `kolasys-ai-transcription-worker` — runs `npx tsx src/workers/transcription.worker.ts`
- `kolasys-ai-summarization-worker` — runs `npx tsx src/workers/summarization.worker.ts`

**Option B: Fly.io**
Similar to Railway. Use `fly.toml` with `[processes]` for each worker.

**Environment variables on Railway/Fly:**
Set all the same env vars as in Vercel (except `NEXT_PUBLIC_*` vars which aren't needed in workers).

**Critical for workers:**
- Workers read `.env` via `import 'dotenv/config'` — on Railway/Fly, set env vars in the platform dashboard instead
- Workers need `DATABASE_URL`, `REDIS_URL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `AWS_*`, `S3_BUCKET_NAME`
- Optional: `DEEPGRAM_API_KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY` (PostHog key is same), `RESEND_API_KEY`

---

## 6. Vercel Cron Jobs

The weekly digest email is scheduled via Vercel cron (configured in `vercel.json`):

```json
{
  "crons": [
    {
      "path": "/api/cron/weekly-digest",
      "schedule": "0 9 * * 1"
    }
  ]
}
```

This fires every Monday at 9:00 AM UTC. The endpoint sends the weekly meeting recap email to all users via Resend.

Vercel cron jobs are available on Pro plan and above.

---

## 7. Production Checklist

Before sharing with external users:

- [ ] Workers deployed to Railway/Fly.io
- [ ] `CLERK_WEBHOOK_SECRET` set + Clerk webhook pointing to production URL
- [ ] `RECALLAI_API_KEY` + `RECALLAI_WEBHOOK_SECRET` set and Recall.ai webhook updated
- [ ] `RESEND_FROM_EMAIL` verified domain in Resend (not the sandbox domain)
- [ ] S3 bucket CORS configured for `https://app.kolasys.ai`
- [ ] Sentry DSN configured — test that errors appear in Sentry dashboard
- [ ] PostHog key set — test that events appear in PostHog
- [ ] Test full pipeline: upload → Whisper → Claude → notes → email notification
- [ ] Test meeting bot: deploy bot → bot joins → transcription triggered
- [ ] Clerk org webhook sync working (not relying on auto-provisioning in production)
