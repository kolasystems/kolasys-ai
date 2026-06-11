// Kolasys AI — Public REST API: org settings for the authenticated bearer token.
// Auth: `Authorization: Bearer kol_…` or Clerk session JWT.
//
// GET  /api/v1/organization — read-only: name, plan, AI-context fields,
//                             deleteAudioAfterTranscription.
// PATCH /api/v1/organization — write: internalJargon, companyDescription,
//                              deleteAudioAfterTranscription.
//
// PATCH is admin-gated: the API key must have been created by a user with role
// OWNER or ADMIN in the org. Keys minted before 2026-06-11 (createdByUserId
// absent) are blocked; regenerate the key to gain access.

import { z } from 'zod'
import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

const patchSchema = z
  .object({
    internalJargon: z.string().max(2000).nullable().optional(),
    companyDescription: z.string().max(2000).nullable().optional(),
    deleteAudioAfterTranscription: z.boolean().optional(),
  })
  .strict()

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const org = await db.organization.findFirst({
    where: { id: auth.orgId },
    select: {
      name: true,
      plan: true,
      internalJargon: true,
      companyDescription: true,
      deleteAudioAfterTranscription: true,
    },
  })
  if (!org) return Response.json({ error: 'Not Found' }, { status: 404 })

  return Response.json(org)
}

export async function PATCH(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  // Admin gate — requires a linked user (present on keys minted after
  // 2026-06-11, always present for Clerk JWT).
  if (!auth.userId) {
    return Response.json(
      {
        error: 'Forbidden',
        message:
          'This API key has no linked user. Regenerate your key in Settings → API Keys to enable org settings writes.',
      },
      { status: 403 },
    )
  }

  const member = await db.orgMember.findFirst({
    where: { orgId: auth.orgId, userId: auth.userId },
    select: { role: true },
  })
  if (!member || member.role === 'MEMBER') {
    return Response.json(
      { error: 'Forbidden', message: 'Only workspace owners and admins can modify org settings.' },
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
  const org = await db.organization.findFirst({
    where: { id: auth.orgId },
    select: { id: true },
  })
  if (!org) return Response.json({ error: 'Not Found' }, { status: 404 })

  const updated = await db.organization.update({
    where: { id: org.id },
    data,
    select: {
      name: true,
      plan: true,
      internalJargon: true,
      companyDescription: true,
      deleteAudioAfterTranscription: true,
    },
  })

  return Response.json(updated)
}
