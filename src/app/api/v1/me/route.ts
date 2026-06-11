// Kolasys AI — Public REST API: identity for the authenticated bearer token.
// Auth: `Authorization: Bearer kol_…` or Clerk session JWT.
//
// GET  /api/v1/me — org + key metadata + member settings (role,
//                   emailSummaryOnReady). Member fields are null when the
//                   key has no linked user (pre-2026-06-11 keys).
// PATCH /api/v1/me — update per-user settings (emailSummaryOnReady).
//                    Requires a linked user; 403 otherwise.

import { z } from 'zod'
import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/

const patchSchema = z
  .object({
    emailSummaryOnReady: z.boolean().optional(),
  })
  .strict()

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const isKolKey = !auth.keyId.startsWith('clerk:')

  const [key, org, member] = await Promise.all([
    isKolKey
      ? db.apiKey.findFirst({
          where: { id: auth.keyId },
          select: { name: true, createdAt: true },
        })
      : null,
    db.organization.findFirst({
      where: { id: auth.orgId },
      select: { name: true, slug: true, plan: true },
    }),
    auth.userId
      ? db.orgMember.findFirst({
          where: { orgId: auth.orgId, userId: auth.userId },
          select: { role: true, emailSummaryOnReady: true },
        })
      : null,
  ])

  const email = key?.name ? (EMAIL_RE.exec(key.name)?.[0] ?? null) : null

  return Response.json({
    email,
    keyName: key?.name ?? null,
    orgId: auth.orgId,
    orgName: org?.name ?? null,
    orgSlug: org?.slug ?? null,
    plan: org?.plan ?? null,
    role: member?.role ?? null,
    emailSummaryOnReady: member?.emailSummaryOnReady ?? null,
  })
}

export async function PATCH(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  if (!auth.userId) {
    return Response.json(
      {
        error: 'Forbidden',
        message:
          'This API key has no linked user. Regenerate your key in Settings → API Keys to enable member settings writes.',
      },
      { status: 403 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Bad Request', message: 'Invalid JSON body.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: 'Bad Request', message: parsed.error.issues.map((e) => e.message).join('; ') },
      { status: 400 },
    )
  }

  const data = parsed.data
  if (Object.keys(data).length === 0) {
    return Response.json({ error: 'Bad Request', message: 'No valid fields to update.' }, { status: 400 })
  }

  // Neon HTTP: findFirst + update (no upsert/updateMany).
  const member = await db.orgMember.findFirst({
    where: { orgId: auth.orgId, userId: auth.userId },
    select: { id: true },
  })
  if (!member) {
    return Response.json({ error: 'Not Found', message: 'Member not found in this org.' }, { status: 404 })
  }

  const updated = await db.orgMember.update({
    where: { id: member.id },
    data,
    select: { role: true, emailSummaryOnReady: true },
  })

  return Response.json(updated)
}
