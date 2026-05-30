// Kolasys AI — Public REST API: add a recording to a meeting series.
// Auth: `Authorization: Bearer kol_…`
//
// POST /api/v1/series/{id}/recordings — link an existing recording into a
// series (the "manual folder" path: the desktop drag-drops a meeting into a
// series sidebar entry). Mirrors the tRPC `series.addRecording` mutation,
// including the dual org-scope check (both the series AND the recording
// must belong to this bearer's org — without that check a caller could
// attach any recording to any series by guessing IDs).
//
// Idempotent: re-adding the same (seriesId, recordingId) pair returns 200,
// not a conflict, so the desktop can retry safely.

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { id: seriesId } = await params

  let body: { recordingId?: unknown } = {}
  try {
    body = (await request.json()) as { recordingId?: unknown }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.recordingId !== 'string' || body.recordingId.length === 0) {
    return Response.json(
      { error: '`recordingId` must be a non-empty string' },
      { status: 400 },
    )
  }
  const recordingId = body.recordingId

  // Org-scope check on BOTH ends. Done sequentially because Prisma v7 in HTTP
  // mode has no $transaction — same constraint that drives the rest of the
  // codebase's lookup patterns (see CLAUDE.md).
  const series = await db.meetingSeries.findFirst({
    where: { id: seriesId, orgId: auth.orgId },
    select: { id: true },
  })
  if (!series) {
    return Response.json({ error: 'Series not found' }, { status: 404 })
  }

  const recording = await db.recording.findFirst({
    where: { id: recordingId, orgId: auth.orgId },
    select: { id: true },
  })
  if (!recording) {
    return Response.json({ error: 'Recording not found' }, { status: 404 })
  }

  // Compound-unique key is `seriesId_recordingId` because the schema declares
  // `@@unique([seriesId, recordingId])` in that order. Prisma derives the
  // generated key name from the declaration order, NOT the alphabetical
  // order. `update: {}` makes the upsert a no-op when the pair already
  // exists, so callers can retry without seeing a conflict.
  await db.recordingSeriesMembership.upsert({
    where: { seriesId_recordingId: { seriesId, recordingId } },
    create: { seriesId, recordingId },
    update: {},
  })

  return Response.json({ success: true })
}
