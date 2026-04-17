# Railway Worker Deployment

Kolasys AI ships two long-lived BullMQ workers that can't run on Vercel
(Vercel functions are bounded by short timeouts; Whisper + Claude calls are
not). This doc walks through deploying both workers to Railway from this
repository.

**Host**: https://railway.app  
**Repo**: https://github.com/kolasystems/kolasys-ai  
**What runs here**: `transcription-worker`, `summarization-worker`  
**What does NOT run here**: the Next.js app — that stays on Vercel.

---

## TL;DR

1. Create a new Railway project → add two services from the same GitHub repo.
2. Set each service's **Start Command**:
   - `transcription-worker` → `npx tsx src/workers/transcription.worker.ts`
   - `summarization-worker` → `npx tsx src/workers/summarization.worker.ts`
3. Copy the worker env vars listed below into each service's **Variables** tab.
4. Redeploy. Tail logs. Look for `[worker] alive — processed N jobs` heartbeats.

---

## 1. Create the Railway project

1. Go to https://railway.app/new.
2. Pick **Deploy from GitHub repo** → select `kolasystems/kolasys-ai`.
3. Name the project `kolasys-ai-workers` (or similar).

On first creation Railway will detect this repo's `railway.toml` and create
both services automatically:

- `transcription-worker`
- `summarization-worker`

If you prefer to create them manually via the Dashboard, see section 2a.

### 2a. Adding services manually (one-off)

1. Inside the project, click **+ New → GitHub Repo**.
2. Select `kolasystems/kolasys-ai`. Railway asks for a service name.
3. In **Settings → Deploy**, set the **Start Command**:
   - For `transcription-worker`:
     `npx tsx src/workers/transcription.worker.ts`
   - For `summarization-worker`:
     `npx tsx src/workers/summarization.worker.ts`
4. In **Settings → Restart Policy**, set **Always**.
5. Repeat for the second service.

Both services share this repo. Railway rebuilds them on every push to `main`.

---

## 3. Environment variables

Workers need roughly the same variables as the web app. Copy these into **each
service's Variables tab** (Railway supports "reference another service's
variables" so you only have to type each value once — create them on one
service, then reference from the other).

### Required

| Variable | Used for | Without it |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL | Both workers fail to start |
| `REDIS_URL` | Upstash Redis (BullMQ queue) | Workers can't connect to the queue |
| `OPENAI_API_KEY` | Whisper transcription + embeddings | Transcription jobs fail |
| `ANTHROPIC_API_KEY` | Claude summarisation | Summarisation jobs fail |
| `AWS_REGION` | S3 audio download + delete | Transcription jobs fail |
| `AWS_ACCESS_KEY_ID` | S3 | Transcription jobs fail |
| `AWS_SECRET_ACCESS_KEY` | S3 | Transcription jobs fail |
| `S3_BUCKET_NAME` | S3 | Transcription jobs fail |
| `NEXT_PUBLIC_APP_URL` | Links inside notes-ready email + Slack/Notion pushes | Emails and integration posts contain broken URLs |

### Required for full feature parity

| Variable | Used for | Without it |
|---|---|---|
| `RESEND_API_KEY` | Notes-ready transactional email | Email is skipped (non-fatal) |
| `RESEND_FROM_EMAIL` | Email "from" address | Email is skipped |
| `CLERK_SECRET_KEY` | Looking up the recording creator's email address via Clerk | Notes-ready email is skipped |

### Optional — gracefully degraded if missing

| Variable | Used for | What degrades |
|---|---|---|
| `DEEPGRAM_API_KEY` | Speaker diarization | Transcripts are saved without speaker labels |
| `SENTRY_DSN` | Error tracking | Worker exceptions aren't sent to Sentry |

> **Note:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and the other `NEXT_PUBLIC_*`
> Clerk variables are NOT needed by workers — they're client-side vars for
> the Next.js app on Vercel.

### Which service needs which variable

Both workers need all of the above except for these specifics:

- `OPENAI_API_KEY` is only strictly required by `transcription-worker` (Whisper
  + embeddings). Summarisation doesn't use OpenAI directly. Set it on both to
  keep envs uniform.
- `ANTHROPIC_API_KEY` is only strictly required by `summarization-worker`. Set
  on both for uniformity.
- `AWS_*` and `S3_BUCKET_NAME` are only needed by `transcription-worker` (it
  downloads + deletes the audio). Summarisation only touches the DB.

In practice: **copy every variable into both services.** The cost of an unused
env var is zero, and it keeps the two services interchangeable if you ever
shuffle logic between them.

---

## 4. Deploy

Railway auto-deploys on push to `main` once both services are wired up. To
force a redeploy:

- Dashboard → service → **Deployments** tab → **Redeploy**.

The build runs `npm install` via Nixpacks, then the startCommand runs `tsx`
against the worker entrypoint.

---

## 5. Verify workers are running

Open each service's **Deployments → latest → View Logs**. Expected output
within 2–3 seconds of startup:

```
[transcription] Worker started
```

or

```
[summarization] Worker started
```

Every 60 seconds each worker emits a heartbeat so you can confirm it's still
alive:

```
[transcription] alive — processed 4 jobs, last job: 42
[summarization] alive — processed 4 jobs, last job: 41
```

- `processed N jobs` = total successfully-completed jobs since the worker
  started (resets on restart).
- `last job: X` = the BullMQ job id of the most recent success, or `none` if
  nothing has run yet.

### Sanity-checking a real job

1. Upload a short recording via https://app.kolasys.ai.
2. In the `transcription-worker` logs, look for:
   - `[transcription] Starting job <id> for recording <recordingId>`
   - `[transcription] Completed job <id>. Transcript: <transcriptId>`
3. In the `summarization-worker` logs, look for:
   - `[summarization] Starting job <id> for recording <recordingId>`
   - `[summarization] Completed job <id>. Note: <noteId>`
4. Recording status should transition `PENDING → TRANSCRIBING → SUMMARIZING → READY`.

If the recording sits at `PENDING` forever: workers aren't connected to
Redis. Check `REDIS_URL` on the transcription-worker service.

---

## 6. Graceful shutdown

Railway sends `SIGTERM` when redeploying. Both workers handle this gracefully:

1. Clear the heartbeat interval.
2. Call `worker.close()` — BullMQ waits for any in-flight jobs to complete
   before returning.
3. Log `[worker] shutting down gracefully (SIGTERM)`.
4. `process.exit(0)`.

This means a redeploy will **not** interrupt an in-flight transcription or
summarisation. Jobs drain to completion, then the new build takes over.

`SIGINT` (Ctrl-C during local dev) is handled the same way.

---

## 7. Scaling

Each worker has a built-in concurrency cap:

| Worker | Concurrency | Why |
|---|---|---|
| `transcription-worker` | 3 | Whisper is CPU-light; the bottleneck is the OpenAI API rate limit |
| `summarization-worker` | 2 | Claude calls are slower and more token-heavy; limit to avoid Anthropic rate limits |

For more throughput, scale horizontally (replicas) rather than increasing
in-process concurrency. In Railway: **Settings → Deploy → Replicas → N**.
Each replica is its own BullMQ consumer — jobs are distributed round-robin.

---

## 8. Costs

Both services run 24/7. On Railway's Hobby plan ($5/mo) the two workers
consume ~$5–8/mo combined assuming low-to-moderate traffic (they're idle
most of the time — BullMQ workers only spin up CPU when a job arrives).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Worker logs "Worker started" then nothing | `REDIS_URL` missing or wrong | Set on service, redeploy |
| Transcription jobs fail with S3 access denied | Bad `AWS_*` creds | Rotate IAM keys; set env vars |
| Summarization jobs fail with "API key" | `ANTHROPIC_API_KEY` missing | Copy from Anthropic console |
| Recordings stuck at `TRANSCRIBING` for > 5 min | Worker crashed mid-job | Check Railway logs for error; fix and redeploy — BullMQ retries up to 3× |
| No heartbeat in logs | Process crashed at startup | Check for ENV errors at the top of the logs |
