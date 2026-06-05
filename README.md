# Kolasys AI — Web

Next.js 16.2 web application for Kolasys AI — Claude-powered meeting intelligence. Transcribes, summarises, and surfaces action items from recorded meetings.

**Production:** https://app.kolasys.ai  
**Repo:** https://github.com/kolasystems/kolasys-ai  
**See CLAUDE.md for full architecture reference.**

## Quick start

```bash
npm run dev          # Next.js on localhost:3000
```

Workers (Railway 24/7 — only needed locally for pipeline debugging):

```bash
npx tsx src/workers/transcription.worker.ts
npx tsx src/workers/summarization.worker.ts
npx tsx src/workers/calendar-bot.worker.ts
```

## Stack

Next.js 16.2 · tRPC 11 · Prisma 7 (Neon HTTP) · Clerk 7 · Upstash Redis · AWS S3 · Anthropic Claude · Recall.ai · Vercel + Railway

## Key constraints

- **Prisma v7 / Neon HTTP**: no `$transaction`, no `upsert`, no `updateMany`. Use `findFirst` + `create`/`update` sequentially. See `src/lib/db.ts`.
- **Railway env vars**: each Railway service has its own scope — Vercel vars don't propagate. `calendar-bot-worker` needs its own `MICROSOFT_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`.
- **Clerk keys**: never mix test (`pk_test_`) and live (`pk_live_`) keys across environments.
