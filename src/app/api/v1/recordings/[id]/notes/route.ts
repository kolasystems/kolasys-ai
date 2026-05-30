// Kolasys AI — Public REST API: personal notes for a recording.
// Auth: `Authorization: Bearer kol_…`
//
// PATCH /api/v1/recordings/{id}/notes — upsert the user's free-form personal
// notes (distinct from the AI-generated notes). Used by the desktop app's
// "My Notes" textarea (debounced auto-save).

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

const MAX_NOTES = 100_000 // generous cap to bound a runaway payload

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { id } = await params

  let body: { personalNotes?: unknown } = {}
  try {
    body = (await request.json()) as { personalNotes?: unknown }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.personalNotes !== 'string') {
    return Response.json({ error: '`personalNotes` must be a string' }, { status: 400 })
  }
  const notes = body.personalNotes.slice(0, MAX_NOTES)

  // Org-scope the write so a key can only touch its own org's recordings.
  const recording = await db.recording.findFirst({
    where: { id, orgId: auth.orgId },
    select: { id: true },
  })
  if (!recording) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  await db.recording.update({
    where: { id: recording.id },
    data: { personalNotes: notes },
  })

  return Response.json({ ok: true, personalNotes: notes })
}
