// Kolasys AI — Bearer-token authentication for the public REST API.
//
// Reads `Authorization: Bearer kol_…`, hashes it, looks up the matching
// non-revoked ApiKey, bumps lastUsedAt, and returns the org id. Returns
// null on any failure so callers can short-circuit with a 401.

import { db } from '@/lib/db'
import { hashApiKey } from '@/server/routers/apikeys.router'

export type ApiKeyAuth = {
  orgId: string
  keyId: string
}

export async function authenticateApiKey(request: Request): Promise<ApiKeyAuth | null> {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization')
  if (!header) return null

  const match = /^Bearer\s+(kol_[A-Za-z0-9]+)$/.exec(header.trim())
  if (!match) return null

  const raw = match[1]
  const keyHash = hashApiKey(raw)

  const key = await db.apiKey.findFirst({
    where: { keyHash, revokedAt: null },
    select: { id: true, orgId: true },
  })
  if (!key) return null

  // Suspension gate — same rule as `orgProcedure`. A suspended org's API
  // key behaves as if it was revoked: returns null so callers fall
  // through to a 401, with no leaking of the underlying reason.
  const org = await db.organization.findFirst({
    where: { id: key.orgId },
    select: { suspended: true },
  })
  if (!org || org.suspended) return null

  // Fire-and-forget — don't block the response on the timestamp update.
  // (PrismaNeonHttp has no proper background queue, but Vercel keeps the
  // function alive long enough for the awaited Promise to resolve.)
  void db.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  }).catch((err) => {
    console.error('[api-auth] failed to update lastUsedAt:', err)
  })

  return { orgId: key.orgId, keyId: key.id }
}

export function unauthorizedResponse(): Response {
  return Response.json(
    { error: 'Unauthorized', message: 'Provide a valid `Authorization: Bearer kol_…` header.' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="kolasys-api"' } },
  )
}
