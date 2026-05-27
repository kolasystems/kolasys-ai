// Kolasys AI — Public REST API: identity for the authenticated bearer token.
// Auth: `Authorization: Bearer kol_…`
//
// GET /api/v1/me — returns the org + the email the key was minted for.
//
// Desktop tokens are org-scoped API keys (see /desktop-auth). At mint time the
// signing user's email is baked into the key name (`Desktop · <email>`), so we
// recover it here for the desktop app's Account panel.

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const [key, org] = await Promise.all([
    db.apiKey.findFirst({
      where: { id: auth.keyId },
      select: { name: true, createdAt: true },
    }),
    db.organization.findFirst({
      where: { id: auth.orgId },
      select: { name: true, slug: true, plan: true },
    }),
  ])

  const email = key?.name ? (EMAIL_RE.exec(key.name)?.[0] ?? null) : null

  return Response.json({
    email,
    keyName: key?.name ?? null,
    orgId: auth.orgId,
    orgName: org?.name ?? null,
    orgSlug: org?.slug ?? null,
    plan: org?.plan ?? null,
  })
}
