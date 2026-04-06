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
- Constructor signature changed: takes a connection string directly, not a Pool instance
- HTTP adapter replaces the WebSocket adapter entirely for serverless use

**Fix:**
```typescript
// CORRECT — Prisma v7 HTTP adapter
import { PrismaNeonHttp } from '@prisma/adapter-neon';
const adapter = new PrismaNeonHttp(process.env.DATABASE_URL!);
export const db = new PrismaClient({ adapter });
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
Prisma generates a client that uses Node.js-only APIs (`fs`, `path`, native bindings). These files imported enum values directly:
```typescript
// WRONG — Prisma in client component
import { RecordingStatus, RecordingSource } from '@/generated/prisma/client';
```
When Next.js bundled the client component, it pulled in the Prisma client and all its Node.js dependencies, which don't exist in the browser.

**Fix:**
Define enum-equivalent string union types locally in client files:
```typescript
// CORRECT — local string union type, no Prisma import
type RecordingStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
type RecordingSource = 'UPLOAD' | 'BROWSER' | 'MEETING_BOT';
```
These are structurally equivalent to Prisma enums at runtime. They require no imports and never reach the client bundle.

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
`src/lib/trpc.ts` creates the React tRPC client with `createTRPCReact<AppRouter>()`. The `AppRouter` type import, while just a type, still traverses the module graph at build time. Without `'use client'`, Next.js treated `trpc.ts` as a server module — but the `import type { AppRouter }` pulled in `server/root.ts` → `server/routers/recordings.router.ts` → `db.ts` into the server bundle. With `server-only` guards on those files, this caused a build error when they were also referenced from the client path.

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

**Symptom:** No immediate error, but server secrets could leak into the client bundle if files are accidentally imported on the wrong side.

**Root cause:** Server-only files (tRPC init, router definitions) had no guard to prevent accidental client-side import.

**Fix:**
```typescript
import 'server-only';  // first import in each server-only file
```
This causes Next.js to throw a clear build error if these files are ever imported from a client component, catching the mistake at build time rather than at runtime.

**Important note:** `db.ts` and `storage.ts` initially also got `server-only` — this was later reverted in Session 3 (see Bug 10).

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
  ...
}

// In generateMetadata:
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;  // ← must await here too
  ...
}
```

---

### Bug 6 — Clerk catch-all route structure

**Severity:** P0 — auth sub-routes 404  
**Files:** `src/app/sign-in/page.tsx`, `src/app/sign-up/page.tsx`  
**Session discovered:** 1 | **Session fixed:** 2

**Symptom:** Clicking "Sign In" works, but Clerk's internal flows (email verification, MFA, SSO callbacks) return 404.

**Root cause:**
Clerk renders multiple views at sub-paths (e.g., `/sign-in/factor-one`, `/sign-in/sso-callback`). A simple `page.tsx` file only handles the exact path. Clerk requires a catch-all route to handle all its sub-paths.

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

**Symptom:** Routes that should require auth are publicly accessible; auth redirects don't work.

**Root cause:**
Next.js 16 renamed the middleware entry point from `middleware.ts` to `proxy.ts`. The file was already correctly named `src/proxy.ts`, but the Clerk import needed updating.

**Fix:**
```typescript
// src/proxy.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
// (not from '@clerk/nextjs' — must include /server for v7)
```

---

### Bug 8 — Legacy `app/` directory left by scaffold

**Severity:** P0 — route conflicts  
**Directory:** `app/` at repo root  
**Session discovered:** 1 | **Session fixed:** 2

**Symptom:** Dashboard routes return 404 or serve the wrong page. Confusing routing behaviour.

**Root cause:**
`create-next-app` generated an `app/` directory at the repository root alongside the intentional `src/app/`. Next.js tried to merge both as valid App Router directories, creating route conflicts.

**Fix:**
```bash
rm -rf app/
```
All routes live in `src/app/` only. Nothing in root `app/` should ever be recreated.

---

### Bug 9 — Missing `svix` package

**Severity:** P0 — Clerk webhook handler crashes  
**File:** `src/app/api/webhooks/clerk/route.ts`  
**Session discovered:** 1 | **Session fixed:** 2

**Symptom:**
```
Error: Cannot find module 'svix'
```

**Root cause:**
The Clerk webhook handler used `import { Webhook } from 'svix'` but `svix` was never added to `package.json`.

**Fix:**
```bash
npm install svix
```

---

### Bug 9b — Slow Turbopack compile / port conflicts (Mac Studio)

**Severity:** P2 — developer experience  
**Session discovered:** 1 | **Session fixed:** N/A (workaround)

**Symptom:**
- First compile takes 45–90 seconds on Mac Studio
- `Error: listen EADDRINUSE :::3000` when restarting after a crash

**Root cause:**
- Turbopack cold builds on M-series Macs under memory pressure are slow on first compilation
- Crashed `next dev` processes leave port 3000 bound

**Workaround:**
```bash
# Port conflict
npm run dev -- --port 3001

# Slow compile: wait — Turbopack's incremental cache warms up after 2-3 reloads
# Subsequent hot reloads are fast (< 2 seconds)
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
`db.ts` and `storage.ts` had `import 'server-only'` added in Session 2 (Bug 4 fix). The `server-only` package works by throwing an error when it detects it's not running inside the Next.js bundler context. BullMQ workers run as standalone `tsx` processes — they're not inside the Next.js bundler at all. So `server-only` throws unconditionally in worker scripts.

**Fix:**
Remove `import 'server-only'` from `db.ts` and `storage.ts`. These files are shared between Next.js server code and worker scripts.

Files that workers never import (`server/trpc.ts`, `server/root.ts`) keep their `server-only` guards.

**Rule going forward:** Only add `server-only` to files that workers will never need to import.

---

### Bug 11 — `$transaction` not supported in Prisma HTTP mode

**Severity:** P0 — transcription worker crashes  
**File:** `src/workers/transcription.worker.ts`  
**Session discovered:** 3 | **Session fixed:** 3

**Symptom:**
```
Error: Transaction API not supported with HTTP adapter
```
Worker crashes mid-job after Whisper transcription completes.

**Root cause:**
The transcription worker used `prisma.$transaction([...])` to atomically write the `Transcript` and all `TranscriptSegment` records in one operation. The `PrismaNeonHttp` adapter communicates over HTTP — HTTP connections are stateless and cannot hold the server-side transaction state required by interactive transactions.

**Fix:**
Replace `$transaction` with sequential individual operations:
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
Acceptable trade-off: operations are within a BullMQ job that retries on failure, providing equivalent durability guarantees at the job level.

---

### Bug 12 — `upsert` not supported in Prisma HTTP mode

**Severity:** P0 — summarisation worker crashes  
**File:** `src/workers/summarization.worker.ts`  
**Session discovered:** 3 | **Session fixed:** 3

**Symptom:**
```
Error: Upsert not supported with HTTP adapter
```
Summarisation worker crashes when trying to save the `Note` record.

**Root cause:**
`prisma.note.upsert(...)` was used to handle idempotent job re-runs. Upsert requires a read-modify-write that cannot be expressed as a single HTTP request, so the HTTP adapter doesn't support it.

**Fix:**
Replace with explicit `findUnique` + conditional `create` or `update`:
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
Prisma's nested write syntax (creating related records in one call) is syntactic sugar for an implicit transaction:
```typescript
// WRONG — implicit transaction
await prisma.transcript.create({
  data: {
    ...transcriptData,
    segments: {
      create: segments,  // ← implicit transaction under the hood
    },
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
Note: `Promise.all` is safe here because each segment create is independent — no ordering requirement.

---

### Bug 14 — Org foreign key constraint on first recording

**Severity:** P0 — first recording upload fails for new users  
**File:** `src/server/trpc.ts` (orgProcedure)  
**Session discovered:** 3 | **Session fixed:** 3

**Symptom:**
```
Error: Foreign key constraint failed on field: orgId
```
First upload after account creation fails.

**Root cause:**
When a user creates their first Clerk org, a `organization.created` webhook fires to `/api/webhooks/clerk`. This webhook creates the `Organization` row in the DB. However, if the webhook hasn't fired (e.g., dev environment without `CLERK_WEBHOOK_SECRET` configured, or network delay), the org row doesn't exist when the user tries to create a recording. `orgProcedure` looked up the org by `clerkOrgId` and returned null. The mutation then tried to insert a recording with a null `orgId`, violating the DB constraint.

**Fix:**
Added auto-provisioning to `orgProcedure`:
```typescript
let org = await db.organization.findUnique({ where: { clerkOrgId: orgId } });
if (!org) {
  // Org not synced yet — provision it on-demand
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
Any authenticated user who knew (or guessed) a recording's UUID could read it, regardless of which org they belonged to.

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

return recording;
```
The error message intentionally doesn't distinguish "not found" from "forbidden" to avoid leaking information about record existence.

---

### Bug 16 — S3 audio files never deleted (privacy issue)

**Severity:** P0 (privacy) — audio files accumulate in S3  
**File:** `src/workers/transcription.worker.ts`  
**Session discovered:** 3 | **Session fixed:** 3

**Symptom:** No immediate runtime error — discovered during P0 audit. S3 bucket grows indefinitely.

**Root cause:**
```typescript
// WRONG — deletion swallowed silently
try {
  await deleteFromS3(job.data.s3Key);
} catch {
  // silent — deletion failure goes unnoticed
}
```
The Kolasys privacy policy states audio files are deleted after transcription. This was not being enforced.

**Fix:**
```typescript
// CORRECT — deletion after transcript committed, with error logging
await prisma.transcript.create({ data: transcriptData });
// ...save segments...

// Delete S3 file now that transcript is safely in DB
try {
  await deleteFromS3(job.data.s3Key);
} catch (err) {
  // Log but don't fail the job — transcript is saved, deletion can be retried
  console.error(`[transcription] Failed to delete S3 file ${job.data.s3Key}:`, err);
}
```
S3 deletion happens after the transcript is committed to the DB. Failure is logged visibly so it can be investigated. A scheduled S3 lifecycle rule (delete objects older than 1 day) should be added as an additional safety net.

---

### Bug 17 — Worker env vars not loading (new machine)

**Severity:** P0 — all service connections fail in workers  
**Files:** `src/workers/transcription.worker.ts`, `src/workers/summarization.worker.ts`  
**Session discovered:** 3 | **Session fixed:** 3

**Symptom:**
Workers start but immediately fail with connection errors:
```
Error: DATABASE_URL is not defined
Error: REDIS_URL is not defined
```

**Root cause:**
Next.js automatically reads `.env` and `.env.local` files and injects them into `process.env` at build/runtime. BullMQ workers run via `npx tsx src/workers/...` — a plain Node.js process outside of Next.js. In this context, `process.env` only contains system environment variables, not anything from `.env` files.

This didn't surface on Mac Studio because environment variables had been manually exported in the shell session. On Mac Mini (clean environment), nothing was exported.

**Fix:**
Add `import 'dotenv/config'` as the first import in both worker files:
```typescript
import 'dotenv/config';  // ← must be first line — loads .env before anything else
import { Worker } from 'bullmq';
// ...rest of imports
```
`dotenv` is already in `package.json` (used by Prisma's seed script). No new dependency needed.

**Rule:** Any standalone Node.js script that reads `process.env` must load dotenv explicitly. Next.js projects can't rely on the framework's env injection being available outside the framework.

---

## Summary Table

| # | Bug | Severity | Session Fixed | File(s) |
|---|---|---|---|---|
| 1 | Prisma v7 constructor API (`PrismaNeon` → `PrismaNeonHttp`) | P0 | 2 | `db.ts` |
| 2 | Prisma enums imported in client components | P0 | 2 | 3 component files |
| 3 | Missing `'use client'` in `trpc.ts` | P0 | 2 | `lib/trpc.ts` |
| 4 | Missing `server-only` on server files | P1 | 2 | `server/trpc.ts`, `server/root.ts` |
| 5 | Next.js 16 async `params` | P0 | 2 | `recordings/[id]/page.tsx` |
| 6 | Clerk catch-all route structure | P0 | 2 | sign-in, sign-up pages |
| 7 | Next.js 16 middleware renamed to `proxy.ts` | P0 | 2 | `proxy.ts` |
| 8 | Legacy `app/` directory from scaffold | P0 | 2 | `app/` (deleted) |
| 9 | Missing `svix` package | P0 | 2 | `package.json` |
| 9b | Port conflict + slow Turbopack compile | P2 | N/A (workaround) | N/A |
| 10 | `server-only` blocking workers | P0 | 3 | `db.ts`, `storage.ts` |
| 11 | `$transaction` unsupported in HTTP mode | P0 | 3 | transcription worker |
| 12 | `upsert` unsupported in HTTP mode | P0 | 3 | summarisation worker |
| 13 | Nested writes (implicit transactions) | P0 | 3 | both workers |
| 14 | Org FK constraint on first recording | P0 | 3 | `server/trpc.ts` |
| 15 | `recordings.get` not org-scoped | P0 (security) | 3 | recordings router |
| 16 | S3 files never deleted | P0 (privacy) | 3 | transcription worker |
| 17 | Worker env vars not loading | P0 | 3 | both workers |
