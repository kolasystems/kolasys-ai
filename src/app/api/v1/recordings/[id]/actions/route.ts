// Kolasys AI — Public REST API: action items for a single recording.
// GET /api/v1/recordings/{id}/actions — auth: `Authorization: Bearer kol_…`

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
    select: { id: true },
  })
  if (!recording) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Action items hang off Note rows — pull them across all notes for this
  // recording (re-summarization can produce multiple Note rows; the latest
  // one wins for the UI but the API surfaces all of them).
  const notes = await db.note.findMany({
    where: { recordingId: id },
    orderBy: { createdAt: 'desc' },
    select: {
      actionItems: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          assignee: true,
          dueDate: true,
          status: true,
          priority: true,
          createdAt: true,
        },
      },
    },
  })

  const actionItems = notes.flatMap((n) => n.actionItems)
  return Response.json({ actionItems })
}
