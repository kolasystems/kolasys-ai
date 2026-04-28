// Kolasys AI — Public REST API: transcript segments for a single recording.
// GET /api/v1/recordings/{id}/transcript — auth: `Authorization: Bearer kol_…`

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { id } = await params

  // Org-scope first — fail with 404 (not 403) so we don't leak existence.
  const recording = await db.recording.findFirst({
    where: { id, orgId: auth.orgId },
    select: { id: true },
  })
  if (!recording) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const transcript = await db.transcript.findFirst({
    where: { recordingId: id },
    select: {
      id: true,
      language: true,
      text: true,
      segments: {
        orderBy: { startTime: 'asc' },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          speaker: true,
          text: true,
          confidence: true,
        },
      },
    },
  })
  if (!transcript) {
    return Response.json({ error: 'Transcript not yet available' }, { status: 404 })
  }

  return Response.json({ transcript })
}
