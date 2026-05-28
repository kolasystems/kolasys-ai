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
      // AI note — full untruncated payload. Mirrors the shape the web detail
      // page renders (src/app/dashboard/recordings/[id]/page.tsx → noteProp):
      // Note-level { id, summary, templateId }, sections[] with order so the
      // desktop can sort independently, and action items with status/priority/
      // dueDate. Sorted server-side: sections by order asc, action items by
      // priority asc — same as the dashboard query.
      notes: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          summary: true,
          templateId: true,
          sections: {
            orderBy: { order: 'asc' },
            select: { id: true, title: true, content: true, order: true },
          },
          actionItems: {
            orderBy: { priority: 'asc' },
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
              priority: true,
              dueDate: true,
            },
          },
        },
      },
    },
  })

  if (!recording) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json(recording)
}
