// Kolasys AI — Public REST API: fetch a single recording (full untruncated).
// Auth: `Authorization: Bearer kol_…`
//
// GET /api/v1/recordings/{id} — returns the same shape as the list endpoint,
// but with the AI summary at its full length (the list trims to 280 chars to
// keep payloads small). The desktop app calls this when opening a meeting's
// detail page so the full markdown body renders.

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { id } = await params

  const recording = await db.recording.findFirst({
    where: { id, orgId: auth.orgId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      source: true,
      duration: true,
      personalNotes: true,
      createdAt: true,
      startedAt: true,
      endedAt: true,
      notes: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { summary: true },
      },
    },
  })

  if (!recording) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json(recording)
}
