# Kolasys AI

> AI-powered meeting notes, transcription, and action item extraction.

Kolasys AI automatically joins your meetings (or accepts uploaded recordings), transcribes them with OpenAI Whisper, and uses Anthropic Claude to generate structured notes, surface decisions, and extract action items — all organised per organisation in a multi-tenant workspace.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Architecture Overview](#architecture-overview)
3. [Repository Layout](#repository-layout)
4. [Running Locally](#running-locally)
5. [Environment Variables](#environment-variables)
6. [Further Reading](#further-reading)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Auth | Clerk v7 (multi-org) |
| API | tRPC v11 + React Query |
| ORM | Prisma v7 |
| Database | PostgreSQL (Neon) |
| Queue | BullMQ + Redis (Upstash) |
| Transcription | OpenAI Whisper (`whisper-1`) |
| Summarisation | Anthropic Claude (`claude-sonnet-4-6`) |
| Meeting Bots | Recall.ai |
| File Storage | AWS S3 |
| Deployment | Vercel (web) + Railway/Render (workers) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                        │
│  Next.js App Router · Clerk UI · tRPC React Query · Tailwind    │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTPS / tRPC
┌───────────────────────────────▼─────────────────────────────────┐
│                       NEXT.JS SERVER (Vercel)                    │
│                                                                  │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────────┐   │
│  │  tRPC Router │  │ Webhook /clerk│  │ Webhook /recall    │   │
│  │  /api/trpc   │  │ (Clerk sync)  │  │ (bot events)       │   │
│  └──────┬───────┘  └───────┬───────┘  └──────────┬─────────┘   │
│         │                  │                      │             │
│         ▼                  ▼                      ▼             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     Prisma ORM                            │   │
│  └──────────────────────────┬───────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌────────────┐
        │PostgreSQL│   │  Redis   │   │  AWS S3    │
        │  (Neon)  │   │(Upstash) │   │ (audio /   │
        └──────────┘   └────┬─────┘   │  video)    │
                            │         └────────────┘
                   ┌────────▼────────┐
                   │   BullMQ Queue  │
                   │ (transcription) │
                   └────────┬────────┘
                            │
              ┌─────────────▼──────────────┐
              │   Transcription Worker      │
              │  (separate Node process)    │
              │                             │
              │  1. Download from S3        │
              │  2. OpenAI Whisper          │
              │  3. Save transcript/segs    │
              │  4. Enqueue summarisation   │
              └─────────────┬──────────────┘
                            │
              ┌─────────────▼──────────────┐
              │   Summarisation Worker      │
              │                             │
              │  1. Read transcript         │
              │  2. Anthropic Claude        │
              │  3. Save Note + Sections    │
              │  4. Extract ActionItems     │
              └────────────────────────────┘

  ┌─────────────────────────────────────┐
  │           Recall.ai                  │
  │  Bot joins Zoom / Meet / Teams       │
  │  → records meeting                   │
  │  → webhook → /api/webhooks/recall    │
  │  → video stored to S3                │
  │  → triggers transcription queue      │
  └─────────────────────────────────────┘
```

---

## Repository Layout

```
kolasys-ai/
├── prisma/
│   ├── schema.prisma          # All models and enums
│   └── seed.ts                # Built-in note templates
│
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout (ClerkProvider + TRPCReactProvider)
│   │   ├── page.tsx           # Redirects → /dashboard or /sign-in
│   │   ├── globals.css        # Tailwind v4 + brand theme
│   │   ├── dashboard/
│   │   │   ├── layout.tsx     # Sidebar + org switcher
│   │   │   ├── page.tsx       # Overview / stats
│   │   │   └── recordings/
│   │   │       ├── page.tsx         # Recordings list (infinite scroll)
│   │   │       └── [id]/page.tsx    # Recording detail + transcript + notes
│   │   └── api/
│   │       ├── trpc/[trpc]/route.ts
│   │       └── webhooks/
│   │           ├── clerk/route.ts
│   │           └── recall/route.ts
│   │
│   ├── components/
│   │   ├── status-badge.tsx
│   │   ├── browser-recorder.tsx
│   │   └── new-recording-modal.tsx
│   │
│   ├── lib/
│   │   ├── db.ts              # Prisma singleton
│   │   ├── redis.ts           # IORedis clients
│   │   ├── storage.ts         # S3 helpers
│   │   ├── queues.ts          # BullMQ queues
│   │   ├── trpc.ts            # createTRPCReact
│   │   └── utils.ts           # cn, formatDuration, etc.
│   │
│   ├── providers/
│   │   └── trpc-provider.tsx  # QueryClient + tRPC provider tree
│   │
│   ├── server/
│   │   ├── trpc.ts            # initTRPC, procedures, context
│   │   ├── root.ts            # Combined AppRouter
│   │   └── routers/
│   │       └── recordings.router.ts
│   │
│   ├── services/
│   │   ├── transcription.service.ts   # OpenAI Whisper
│   │   ├── summarization.service.ts   # Anthropic Claude
│   │   └── meetingbot.service.ts      # Recall.ai REST
│   │
│   ├── workers/
│   │   └── transcription.worker.ts    # BullMQ worker process
│   │
│   └── proxy.ts               # Clerk auth proxy (Next.js 16 middleware)
│
├── docs/                      # This folder
├── .env.example
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## Running Locally

### Prerequisites

- Node.js 20.9+
- PostgreSQL (local or [Neon](https://neon.tech) free tier)
- Redis (local or [Upstash](https://upstash.com) free tier)
- Accounts for: Clerk, AWS, OpenAI, Anthropic, Recall.ai (see [SETUP.md](./SETUP.md))

### 1. Install dependencies

```bash
npm install
npm install svix   # Clerk webhook verification
```

### 2. Configure environment

```bash
cp .env.example .env.local
# Fill in all values — see docs/SETUP.md for where to get each key
```

### 3. Set up the database

```bash
npx prisma generate        # Generate Prisma client
npx prisma db push         # Push schema to your database
npx prisma db seed         # Seed built-in note templates
```

### 4. Remove the legacy app/ directory

The project uses `src/app/`. Delete the old scaffold:

```bash
rm -rf app/
```

### 5. Run the dev server

```bash
npm run dev
```

### 6. Run the transcription worker (separate terminal)

```bash
npx tsx src/workers/transcription.worker.ts
```

Open [http://localhost:3000](http://localhost:3000) — you will be redirected to sign in via Clerk.

---

## Environment Variables

See [`.env.example`](../.env.example) for all required variables with descriptions.
See [SETUP.md](./SETUP.md) for step-by-step instructions to obtain each value.

---

## Further Reading

| Doc | Contents |
|---|---|
| [SETUP.md](./SETUP.md) | Service-by-service setup guide |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Deep-dive into every layer |
| [COMPLIANCE.md](./COMPLIANCE.md) | Recording laws, GDPR/CCPA, data retention |
| [PHASE1.md](./PHASE1.md) | Everything built in Phase 1 |
| [PHASE2.md](./PHASE2.md) | Planned Phase 2 features |
| [SESSION_LOG.md](./SESSION_LOG.md) | Build session history |
