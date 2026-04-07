# Kolasys AI — Bugs and Fixes

Complete catalogue of every bug hit during development, how it was diagnosed, and exactly how it was fixed.
Ordered chronologically by session. See `docs/SESSION_LOG.md` for narrative context.

---

## Session 1 Bugs (discovered after writing, fixed in Session 2)

---

### Bug 1 — Prisma v7 constructor API changed

**Severity:** P0 — app won't start  
**File:** `src/lib/db.ts`  
**Session discovered:** 1 | **Session fixed:** 2

**Symptom:**
```
TypeError: PrismaNeon is not a constructor
```

**Root cause:**
Session 1 used the Prisma v6 WebSocket adapter pattern:
```typescript
// WRONG — Prisma v6 API
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool } from '@neondatabase/serverless';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaNeon(pool);
```
Prisma v7 renamed and redesigned the Neon HTTP adapter:
- Class renamed: `PrismaNeon` → `PrismaNeonHttp`
- Constructor changed: takes a connection string directly, not a Pool
- HTTP adapter replaces the WebSocket adapter for serverless use

**Fix:**
```typescript
// CORRECT — Prisma v7 HTTP adapter
import { PrismaNeonHttp } from '@prisma/adapter-neon';
const adapter = new PrismaNeonHttp(process.env.DATABASE_URL!);
export const db = new PrismaClient({ adapter });
```

**Also note:** The database URL no longer goes in `schema.prisma` datasource block — it goes in `prisma.config.ts`:
```typescript
// prisma.config.ts
import { defineConfig } from 'prisma/config';
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
```

---

### Bug 2 — Prisma enums imported in client components

**Severity:** P0 — build fails  
**Files:** `src/components/new-recording-modal.tsx`, `src/components/status-badge.tsx`, `src/app/dashboard/recordings/page.tsx`  
**Session discovered:** 1 | **Session fixed:** 2

**Symptom:**
```
Error: You're importing a component that needs "server-only" ...
```
Or variations of Prisma Node.js API errors in the browser bundle.

**Root cause:**
Prisma generates a client that uses Node.js-only APIs. These files imported enum values directly:
```typescript
// WRONG — Prisma in client component
import { RecordingStatus, RecordingSource } from '@/generated/prisma/client';
```
When Next.js bundled the client component, it pulled in the Prisma client and all its Node.js dependencies, which don't exist in the browser.

**Fix:**
Define enum-equivalent string union types locally in client files:
```typescript
// CORRECT — local string union type, no Prisma import
type RecordingStatus = 'PENDING' | 'PROCESSING' | 'TRANSCRIBING' | 'SUMMARIZING' | 'READY' | 'FAILED';
type RecordingSource = 'UPLOAD' | 'BROWSER' | 'MEETING_BOT';
```

**Rule:** Never import from `@/generated/prisma/client` or `@/lib/db` in any `'use client'` file.

---

### Bug 3 — Missing `'use client'` in `src/lib/trpc.ts`

**Severity:** P0 — build fails  
**File:** `src/lib/trpc.ts`  
**Session discovered:** 1 | **Session fixed:** 2

**Symptom:**
```
Error: This module cannot be imported from a Server Component module
```
Or Prisma leaking into the client bundle.

**Root cause:**
`src/lib/trpc.ts` creates the React tRPC client with `createTRPCReact<AppRouter>()`. Without `'use client'`, Next.js treated `trpc.ts` as a server module — and the `import type { AppRouter }` traversal pulled in `server/root.ts` → `server/routers/recordings.router.ts` → `db.ts` into the client bundle, causing build errors.

**Fix:**
```typescript
'use client';  // ← must be first line
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@/server/root';
export const trpc = createTRPCReact<AppRouter>();
```

---

### Bug 4 — Missing `server-only` guards on server files

**Severity:** P1 — silent build risk  
**Files:** `src/server/trpc.ts`, `src/server/root.ts`  
**Session discovered:** 1 | **Session fixed:** 2

**Symptom:** No immediate error. Server secrets could leak into the client bundle if files are accidentally imported on the client side.

**Fix:**
```typescript
import 'server-only';  // first import in each server-only file
```
Makes Next.js throw a clear build error if these files are ever imported from a client component.

**Important:** `db.ts` and `storage.ts` also got `server-only` in Session 2 — this was reverted in Session 3 (see Bug 10). Only add `server-only` to files that workers will never import.

---

### Bug 5 — Next.js 16 async `params`

**Severity:** P0 — TypeScript error + runtime crash  
**File:** `src/app/dashboard/recordings/[id]/page.tsx`  
**Session discovered:** 1 | **Session fixed:** 2

**Symptom:**
```typescript
// TypeScript error: Property 'id' does not exist on type 'Promise<{ id: string }>'
const { id } = params;
```

**Root cause:**
Next.js 16 changed `params` and `searchParams` from synchronous objects to `Promise<{}>`. This is a breaking change from Next.js 13/14/15.

**Fix:**
```typescript
// In page component:
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;  // ← must await
}

// In generateMetadata — also must await:
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}
```

---

### Bug 6 — Clerk catch-all route structure

**Severity:** P0 — auth sub-routes return 404  
**Files:** `src/app/sign-in/page.tsx`, `src/app/sign-up/page.tsx`  
**Session discovered:** 1 | **Session fixed:** 2

**Symptom:** Clicking "Sign In" works, but Clerk's internal flows (email verification, MFA, SSO callbacks) return 404.

**Root cause:**
Clerk renders multiple views at sub-paths (`/sign-in/factor-one`, `/sign-in/sso-callback`). A simple `page.tsx` only handles the exact path.

**Fix:**
```
# WRONG structure
src/app/sign-in/page.tsx

# CORRECT structure
src/app/sign-in/[[...sign-in]]/page.tsx
src/app/sign-up/[[...sign-up]]/page.tsx
```
The `[[...slug]]` syntax is Next.js's optional catch-all — it matches both the base path and any sub-paths.

---

### Bug 7 — Next.js 16 middleware renamed

**Severity:** P0 — auth middleware not running  
**File:** `src/proxy.ts`  
**Session discovered:** 1 | **Session fixed:** 2

**Root cause:**
Next.js 16 renamed the middleware entry point from `middleware.ts` to `proxy.ts`. The file was correctly named but the Clerk import path needed updating for v7.

**Fix:**
```typescript
// src/proxy.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
// (/server suffix is required in Clerk v7 — not '@clerk/nextjs')
```

---

### Bug 8 — Legacy `app/` directory left by scaffold

**Severity:** P0 — route conflicts  
**Directory:** `app/` at repo root  
**Session discovered:** 1 | **Session fixed:** 2

**Symptom:** Dashboard routes return 404 or serve the wrong page.

**Root cause:**
`create-next-app` generated an `app/` directory at the repository root alongside the intentional `src/app/`. Next.js tried to merge both, creating route conflicts.

**Fix:**
```bash
rm -rf app/
```
All routes live in `src/app/` only. The root `app/` must never be recreated.

---

### Bug 9 — Missing `svix` package

**Severity:** P0 — Clerk webhook handler crashes  
**File:** `src/app/api/webhooks/clerk/route.ts`  
**Session discovered:** 1 | **Session fixed:** 2

**Symptom:**
```
Error: Cannot find module 'svix'
```

**Fix:**
```bash
npm install svix
```

---

### Bug 9b — Slow Turbopack compile / port conflicts (Mac Studio)

**Severity:** P2 — developer experience  
**Session discovered:** 1 | **Session fixed:** N/A (workaround)

**Symptoms:**
- First compile takes 45–90 seconds on Mac Studio
- `Error: listen EADDRINUSE :::3000` when restarting after a crash

**Workaround:**
```bash
# Port conflict
npm run dev -- --port 3001

# Slow compile: wait — Turbopack incremental cache warms up after 2–3 reloads
# Subsequent hot reloads are < 2 seconds
```

---

## Session 2 Bugs (discovered during Session 3 after moving to Mac Mini)

---

### Bug 10 — `server-only` import blocking workers

**Severity:** P0 — workers crash on startup  
**Files:** `src/lib/db.ts`, `src/lib/storage.ts`  
**Session discovered:** 3 | **Session fixed:** 3

**Symptom:**
```
Error: This module cannot be imported from a Client Component module.
It is only meant to be used from a Server Component.
```
Both workers crash immediately on startup.

**Root cause:**
`db.ts` and `storage.ts` had `import 'server-only'` added in Session 2 (Bug 4 fix). The `server-only` package throws an error when it detects it's not inside the Next.js bundler context. BullMQ workers run as standalone `tsx` processes — they're entirely outside the Next.js bundler, so `server-only` throws unconditionally.

**Fix:**
Remove `import 'server-only'` from `db.ts` and `storage.ts`. These files are shared between Next.js server code and worker scripts.

Files that workers never import (`server/trpc.ts`, `server/root.ts`) keep their `server-only` guards.

**Rule:** Only add `server-only` to files that workers will never import.

---

### Bug 11 — `$transaction` not supported in Prisma HTTP mode

**Severity:** P0 — transcription worker crashes  
**File:** `src/workers/transcription.worker.ts`  
**Session discovered:** 3 | **Session fixed:** 3

**Symptom:**
```
Error: Transaction API not supported with HTTP adapter
```

**Root cause:**
The transcription worker used `prisma.$transaction([...])` to atomically write `Transcript` and `TranscriptSegment` records. `PrismaNeonHttp` communicates over HTTP — HTTP connections are stateless and cannot hold the server-side transaction state required by interactive transactions.

**Fix:**
```typescript
// WRONG
await prisma.$transaction([
  prisma.transcript.create({ data: transcriptData }),
  prisma.processingJob.update({ where: { id: jobId }, data: { status: 'COMPLETED' } }),
]);

// CORRECT
await prisma.transcript.create({ data: transcriptData });
await prisma.processingJob.update({ where: { id: jobId }, data: { status: 'COMPLETED' } });
```

Acceptable trade-off: operations are within a BullMQ job that retries on failure.

---

### Bug 12 — `upsert` not supported in Prisma HTTP mode

**Severity:** P0 — summarisation worker crashes  
**File:** `src/workers/summarization.worker.ts`  
**Session discovered:** 3 | **Session fixed:** 3

**Symptom:**
```
Error: Upsert not supported with HTTP adapter
```

**Root cause:**
`upsert` requires a read-modify-write that cannot be expressed as a single HTTP request.

**Fix:**
```typescript
// WRONG
await prisma.note.upsert({
  where: { recordingId },
  create: noteData,
  update: noteData,
});

// CORRECT
const existing = await prisma.note.findUnique({ where: { recordingId } });
if (existing) {
  await prisma.note.update({ where: { id: existing.id }, data: noteData });
} else {
  await prisma.note.create({ data: { recordingId, ...noteData } });
}
```

---

### Bug 13 — Nested writes (implicit transactions) not supported

**Severity:** P0 — both workers crash  
**Files:** `src/workers/transcription.worker.ts`, `src/workers/summarization.worker.ts`  
**Session discovered:** 3 | **Session fixed:** 3

**Symptom:**
```
Error: Nested operations require transactions which are not supported with HTTP adapter
```

**Root cause:**
Prisma's nested write syntax is sugar for an implicit transaction:
```typescript
// WRONG — implicit transaction
await prisma.transcript.create({
  data: {
    ...transcriptData,
    segments: { create: segments },  // ← implicit transaction
  },
});
```

**Fix:**
Break into explicit sequential operations:
```typescript
// CORRECT
const transcript = await prisma.transcript.create({ data: transcriptData });
await Promise.all(
  segments.map(seg =>
    prisma.transcriptSegment.create({
      data: { ...seg, transcriptId: transcript.id },
    })
  )
);
```
`Promise.all` is safe here because each segment create is independent.

---

### Bug 14 — Org foreign key constraint on first recording

**Severity:** P0 — first recording upload fails for new users  
**File:** `src/server/trpc.ts` (orgProcedure)  
**Session discovered:** 3 | **Session fixed:** 3

**Symptom:**
```
Error: Foreign key constraint failed on field: orgId
```

**Root cause:**
When a user creates their first Clerk org, a `organization.created` webhook fires to sync the org to the DB. If the webhook hasn't fired (no `CLERK_WEBHOOK_SECRET` configured, network delay, etc.), the `Organization` row doesn't exist. `orgProcedure` looked up the org by `clerkOrgId` and returned null. The mutation then tried to insert a recording with a null `orgId`, violating the DB constraint.

**Fix:**
Added auto-provisioning to `orgProcedure`:
```typescript
let org = await db.organization.findUnique({ where: { clerkOrgId: orgId } });
if (!org) {
  const clerkOrg = await clerkClient.organizations.getOrganization({ organizationId: orgId });
  org = await db.organization.create({
    data: {
      clerkOrgId: orgId,
      name: clerkOrg.name,
      slug: clerkOrg.slug ?? orgId,
      plan: 'FREE',
    },
  });
}
```
The webhook handler remains authoritative but is no longer a hard dependency.

---

### Bug 15 — `recordings.get` not org-scoped (data isolation security bug)

**Severity:** P0 (security) — data leak between organisations  
**File:** `src/server/routers/recordings.router.ts`  
**Session discovered:** 3 | **Session fixed:** 3

**Symptom:** No visible symptom in normal use — discovered during P0 security audit.

**Root cause:**
```typescript
// WRONG — no org check
const recording = await db.recording.findUnique({
  where: { id: input.id },
});
return recording;
```
Any authenticated user who knew (or guessed) a recording's UUID could read it regardless of org.

**Fix:**
```typescript
// CORRECT — org-scoped
const recording = await db.recording.findUnique({
  where: { id: input.id },
  include: { transcript: true, note: { include: { sections: true, actionItems: true } } },
});

if (!recording || recording.orgId !== ctx.orgId) {
  throw new TRPCError({ code: 'FORBIDDEN', message: 'Recording not found' });
}
```
The error message intentionally doesn't distinguish "not found" from "forbidden" to avoid leaking record existence.

---

### Bug 16 — S3 audio files never deleted (privacy)

**Severity:** P0 (privacy) — audio accumulates in S3 indefinitely  
**File:** `src/workers/transcription.worker.ts`  
**Session discovered:** 3 | **Session fixed:** 3

**Root cause:**
```typescript
// WRONG — deletion silently swallowed
try {
  await deleteFromS3(job.data.s3Key);
} catch {
  // silent
}
```
Privacy policy states audio files are deleted after transcription. This was not being enforced.

**Fix:**
```typescript
// CORRECT — deletion after transcript committed, errors logged
await prisma.transcript.create({ data: transcriptData });
// ... save segments ...

try {
  await deleteFromS3(job.data.s3Key);
} catch (err) {
  console.error(`[transcription] Failed to delete S3 file ${job.data.s3Key}:`, err);
  Sentry.captureException(err, { tags: { phase: 's3_delete', jobId: job.id } });
}
```
Deletion happens after the transcript is committed. Failure is logged (and Sentry-tracked) but doesn't fail the job — transcript is saved regardless.

---

### Bug 17 — Worker env vars not loading (new machine)

**Severity:** P0 — all service connections fail in workers  
**Files:** `src/workers/transcription.worker.ts`, `src/workers/summarization.worker.ts`  
**Session discovered:** 3 | **Session fixed:** 3

**Symptom:**
```
Error: DATABASE_URL is not defined
Error: REDIS_URL is not defined
```

**Root cause:**
Next.js automatically reads `.env` files and injects them into `process.env`. BullMQ workers run via `npx tsx src/workers/...` — plain Node.js processes outside of Next.js. `process.env` only contains system environment variables, not anything from `.env` files.

On Mac Studio, env vars had been manually exported in the shell session. On Mac Mini (clean environment), nothing was exported — so the issue was invisible until the new machine.

**Fix:**
```typescript
import 'dotenv/config';  // ← must be first line — loads .env before anything else
import { Worker } from 'bullmq';
// ...rest of imports
```

**Rule:** Any standalone Node.js script that reads `process.env` must explicitly load dotenv. Never rely on Next.js env injection being available outside Next.js.

---

## Summary Table

| # | Bug | Severity | Session Fixed | File(s) |
|---|---|---|---|---|
| 1 | Prisma v7 constructor: `PrismaNeon` → `PrismaNeonHttp` | P0 | 2 | `db.ts` |
| 2 | Prisma enums in client components | P0 | 2 | 3 component files |
| 3 | Missing `'use client'` in `trpc.ts` | P0 | 2 | `lib/trpc.ts` |
| 4 | Missing `server-only` on server files | P1 | 2 | `server/trpc.ts`, `server/root.ts` |
| 5 | Next.js 16 async `params` | P0 | 2 | `recordings/[id]/page.tsx` |
| 6 | Clerk catch-all route structure missing | P0 | 2 | sign-in, sign-up pages |
| 7 | Next.js 16 middleware path + Clerk v7 import | P0 | 2 | `proxy.ts` |
| 8 | Legacy `app/` directory from scaffold | P0 | 2 | `app/` (deleted) |
| 9 | Missing `svix` package | P0 | 2 | `package.json` |
| 9b | Port conflict + slow Turbopack compile | P2 | N/A (workaround) | N/A |
| 10 | `server-only` blocking workers | P0 | 3 | `db.ts`, `storage.ts` |
| 11 | `$transaction` unsupported in HTTP mode | P0 | 3 | transcription worker |
| 12 | `upsert` unsupported in HTTP mode | P0 | 3 | summarisation worker |
| 13 | Nested writes (implicit transactions) | P0 | 3 | both workers |
| 14 | Org FK constraint on first recording | P0 | 3 | `server/trpc.ts` |
| 15 | `recordings.get` not org-scoped | P0 (security) | 3 | recordings router |
| 16 | S3 audio files never deleted | P0 (privacy) | 3 | transcription worker |
| 17 | Worker env vars not loading | P0 | 3 | both workers |
