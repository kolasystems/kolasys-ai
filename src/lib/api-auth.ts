// Kolasys AI — Bearer-token authentication for the public REST API.
//
// Two accepted Bearer formats:
//
//   1. `Authorization: Bearer kol_<hex>` — long-lived org-scoped API key
//      (desktop app, CI integrations). Hash → DB lookup → orgId. Existing
//      behavior, unchanged on the wire.
//
//   2. `Authorization: Bearer <clerk-session-jwt>` — short-lived per-user
//      Clerk session JWT. Validated via `auth({ acceptsToken: 'session_token' })`
//      against Clerk's JWKs; the JWT's `org_id` claim is translated to the
//      internal DB org id. Mirrors the dual-auth pattern already in use on
//      /api/stripe/checkout, /api/stripe/portal, and /api/ai/suggestions.
//
// Returns null on any failure so callers short-circuit with a 401.

import { db } from '@/lib/db'
import { auth } from '@clerk/nextjs/server'
import { hashApiKey } from '@/server/routers/apikeys.router'

export type ApiKeyAuth = {
  orgId: string
  keyId: string
  /** Clerk user id when authenticated via session JWT; absent for kol_ keys. */
  userId?: string
}

export async function authenticateApiKey(request: Request): Promise<ApiKeyAuth | null> {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization')
  if (!header) return null

  // Permissive Bearer match — payload-format check happens in each branch.
  const match = /^Bearer\s+(\S+)$/.exec(header.trim())
  if (!match) return null
  const raw = match[1]

  // ── Path A: long-lived kol_ API key ──────────────────────────────────────
  // Same hash + lookup + suspension gate the original implementation used.
  if (raw.startsWith('kol_')) {
    return verifyKolApiKey(raw)
  }

  // ── Path B: Clerk session JWT ────────────────────────────────────────────
  // Anything else falls through here. Mobile (`@clerk/clerk-expo` getToken)
  // and any future third-party session-token integrations land in this path.
  return verifyClerkSession()
}

// ── kol_ verification (original implementation, factored out) ─────────────

async function verifyKolApiKey(raw: string): Promise<ApiKeyAuth | null> {
  // Tighten the format check now that the outer regex is permissive — the
  // hash function is fine on garbage input but the result will never match a
  // real key, so this is purely defensive.
  if (!/^kol_[A-Za-z0-9]+$/.test(raw)) return null

  const keyHash = hashApiKey(raw)

  const key = await db.apiKey.findFirst({
    where: { keyHash, revokedAt: null },
    select: { id: true, orgId: true },
  })
  if (!key) return null

  // Suspension gate — same rule as `orgProcedure`. A suspended org's API
  // key behaves as if it was revoked: returns null so callers fall through
  // to a 401, with no leaking of the underlying reason.
  const org = await db.organization.findFirst({
    where: { id: key.orgId },
    select: { suspended: true },
  })
  if (!org || org.suspended) return null

  // Fire-and-forget — don't block the response on the timestamp update.
  void db.apiKey
    .update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    })
    .catch((err) => {
      console.error('[api-auth] failed to update lastUsedAt:', err)
    })

  return { orgId: key.orgId, keyId: key.id }
}

// ── Clerk session-JWT verification ────────────────────────────────────────

async function verifyClerkSession(): Promise<ApiKeyAuth | null> {
  // `auth({ acceptsToken: 'session_token' })` accepts a Bearer JWT in the
  // Authorization header (in addition to the browser session cookie) and
  // verifies it against Clerk's JWKs. clerkClient.verifyToken isn't a real
  // method in Clerk 7 — this is the idiomatic equivalent and matches the
  // pattern used in /api/stripe/checkout + /api/stripe/portal.
  let session: Awaited<ReturnType<typeof auth>>
  try {
    session = await auth({ acceptsToken: 'session_token' })
  } catch (err) {
    console.error('[api-auth] clerk session verification threw:', err)
    return null
  }

  if (!session.userId || !session.orgId) return null

  // Translate Clerk org id → internal DB org id. Same lookup
  // `orgProcedure` does (src/server/trpc.ts), but without the org/member
  // auto-bootstrap: a mobile-only user who has never opened the dashboard
  // won't have an Organization row yet and will get a 401 here. Worth
  // flagging if it bites.
  const org = await db.organization.findFirst({
    where: { clerkOrgId: session.orgId },
    select: { id: true, suspended: true },
  })
  if (!org || org.suspended) return null

  // Synthetic keyId so existing audit attribution that reads `auth.keyId`
  // (e.g. /api/v1/recordings POST → `userId: \`apikey:${auth.keyId}\``)
  // still produces a traceable identifier. Also expose userId directly for
  // routes that want proper attribution.
  return {
    orgId: org.id,
    keyId: `clerk:${session.userId}`,
    userId: session.userId,
  }
}

export function unauthorizedResponse(): Response {
  return Response.json(
    {
      error: 'Unauthorized',
      message:
        'Provide a valid `Authorization: Bearer kol_…` or `Bearer <clerk-session-jwt>` header.',
    },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="kolasys-api"' } },
  )
}
