---
name: Kolasys AI project structure
description: Full project scaffold for Kolasys AI — AI-powered meeting notes app
type: project
---

Kolasys AI is an AI-powered meeting notes product scaffolded in April 2025.

**Tech stack:** Next.js 16.2.2 (App Router, Turbopack default), TypeScript, Tailwind CSS v4, Clerk auth v7, tRPC v11, Prisma v7 (PostgreSQL), BullMQ + IORedis, OpenAI Whisper (transcription), Anthropic Claude Sonnet (summarization), Recall.ai (meeting bots), AWS S3 (storage).

**Key structural decisions:**
- Source lives under `src/` — tsconfig `@/*` maps to `./src/*`
- Prisma generator: `provider = "prisma-client"` (v7), output to `../src/generated/prisma` — imports from `@/generated/prisma`
- Next.js 16 breaking change: `params` and `searchParams` in pages are `Promise<…>` — must `await params`
- Middleware renamed to `proxy.ts` in Next.js 16 — Clerk auth proxy at `src/proxy.ts`
- Tailwind v4 — no tailwind.config.js; configured via `@theme {}` in `src/app/globals.css`
- Config file is `next.config.ts` (TypeScript), not `.js`
- Old `app/` directory at repo root must be removed to avoid conflict with `src/app/`

**Why:** Replace placeholder Next.js scaffold with full Kolasys AI structure per user request.
**How to apply:** When adding new routes or pages, always await params. Import Prisma from `@/generated/prisma`. Run `npx prisma generate` after schema changes. Workers run as separate Node processes.
