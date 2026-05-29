// Kolasys AI — Public REST API: flip a recording's share link off.
// Auth: `Authorization: Bearer kol_…`
//
// POST /api/v1/recordings/{id}/make-private — sets isPublic=false. The
// publicSlug is intentionally retained so re-sharing returns the same URL
// (matches the tRPC `recordings.makePrivate` contract — see CLAUDE.md).

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { id } = await params

  const recording = await db.recording.findFirst({
    where: { id, orgId: auth.orgId },
    select: { id: true },
  })
  if (!recording) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  await db.recording.update({
    where: { id: recording.id },
    data: { isPublic: false },
  })

  return Response.json({ ok: true })
}
