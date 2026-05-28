// Kolasys AI — Public REST API: edit a single note section.
// Auth: `Authorization: Bearer kol_…`
//
// PATCH /api/v1/notes/{noteId}/sections/{sectionId} — replaces a section's
// markdown body. Used by the desktop editor when the user edits an AI-
// generated section (Meeting Overview, Key Discussion Points, etc.) inline.
//
// Security: the section is loaded by its own id; we then verify the parent
// Note's orgId matches the bearer token's org. Per spec: 404 when the section
// doesn't exist at all, 403 when it exists but lives in a different org.
// `noteId` from the URL is descriptive (REST hierarchy) and not used for
// additional validation.

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

// Generous cap to bound a runaway payload — matches the personal-notes route.
const MAX_CONTENT = 100_000

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ noteId: string; sectionId: string }> },
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { sectionId } = await params

  let body: { content?: unknown } = {}
  try {
    body = (await request.json()) as { content?: unknown }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.content !== 'string') {
    return Response.json({ error: '`content` must be a string' }, { status: 400 })
  }
  const content = body.content.slice(0, MAX_CONTENT)

  // Fetch the section + its parent note's orgId in one round-trip — the
  // security check is the org match on the note, not on the section directly
  // (NoteSection has no orgId column).
  const section = await db.noteSection.findFirst({
    where: { id: sectionId },
    select: { id: true, note: { select: { orgId: true } } },
  })
  if (!section) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  if (section.note.orgId !== auth.orgId) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  await db.noteSection.update({
    where: { id: section.id },
    data: { content },
  })

  return Response.json({ ok: true })
}
