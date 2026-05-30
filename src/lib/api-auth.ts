// Kolasys AI — Bearer-token authentication for the public REST API.
//
// Two accepted Bearer formats:
//
//   1. `Authorization: Bearer kol_<hex>` — long-lived org-scoped API key
//      (desktop app, CI integrations). Hash → DB lookup → orgId.
//
//   2. `Authorization: Bearer <clerk-session-jwt>` — short-lived per-user
//      Clerk session JWT. Verified via createClerkClient().verifyToken();
//      userId resolved to org via OrgMember lookup.
//
// Returns null on any failure so callers short-circuit with a 401.

import { db } from '@/lib/db'
import { verifyToken } from '@clerk/nextjs/server'
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
  if (raw.startsWith('kol_')) {
    return verifyKolApiKey(raw)
  }

  // ── Path B: Clerk session JWT ────────────────────────────────────────────
  return verifyClerkSession(raw)
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

async function verifyClerkSession(token: string): Promise<ApiKeyAuth | null> {
  let verified: Awaited<ReturnType<typeof verifyToken>>
  try {
    verified = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY })
  } catch (err) {
    console.error('[api-auth] clerk verifyToken threw:', err)
    return null
  }

  if (!verified?.sub) return null

  const member = await db.orgMember.findFirst({
    where: { userId: verified.sub },
    include: { org: true },
  })
  if (!member || member.org.suspended) return null

  return {
    orgId: member.org.id,
    keyId: `clerk:${verified.sub}`,
    userId: verified.sub,
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
