// Kolasys AI — Public REST API: fetch / rename a single meeting series.
// Auth: `Authorization: Bearer kol_…`
//
// GET   /api/v1/series/{id} — series + every recording in it (with each
//       recording's latest AI summary, untruncated). Same shape as tRPC
//       `series.get`.
// PATCH /api/v1/series/{id} — rename. Mirrors tRPC `series.rename`: trims
//       the name, caps at 100 chars, and flips autoDetected → false because
//       a user-renamed series is no longer "auto-detected".

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

const MAX_NAME = 100

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { id } = await params

  const series = await db.meetingSeries.findFirst({
    where: { id, orgId: auth.orgId },
    include: {
      recordings: {
        include: {
          recording: {
            select: {
              id: true,
              title: true,
              createdAt: true,
              status: true,
              duration: true,
              notes: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                select: { summary: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!series) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json(series)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { id } = await params

  let body: { name?: unknown } = {}
  try {
    body = (await request.json()) as { name?: unknown }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.name !== 'string') {
    return Response.json({ error: '`name` must be a string' }, { status: 400 })
  }
  const name = body.name.trim()
  if (name.length < 1 || name.length > MAX_NAME) {
    return Response.json(
      { error: `\`name\` must be 1–${MAX_NAME} characters` },
      { status: 400 },
    )
  }

  // Org-scope check first — Prisma's update where can't carry orgId, and we
  // must not leak existence of other orgs' series via a generic 404 path.
  const existing = await db.meetingSeries.findFirst({
    where: { id, orgId: auth.orgId },
    select: { id: true },
  })
  if (!existing) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  await db.meetingSeries.update({
    where: { id: existing.id },
    // autoDetected → false: a user-renamed series is no longer "auto".
    // Matches the tRPC series.rename semantics.
    data: { name, autoDetected: false },
  })

  return Response.json({ ok: true, name })
}
