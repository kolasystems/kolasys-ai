// Kolasys AI — Public REST API: update a single action item.
// Auth: `Authorization: Bearer kol_…`
//
// PATCH /api/v1/recordings/actions/{id} — update an action item's status (and
// optionally priority). Mirrors the tRPC `recordings.updateActionItem`
// procedure but bearer-authed. The desktop app calls this when the user ticks
// the checkbox on a meeting's action items.

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'
import { ActionItemStatus, Priority } from '@/generated/prisma/client'

type Body = {
  status?: string
  priority?: string
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { id } = await params

  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Validate status / priority against the Prisma enums.
  const data: { status?: ActionItemStatus; priority?: Priority } = {}
  if (body.status !== undefined) {
    const s = String(body.status).toUpperCase()
    if (!(s in ActionItemStatus)) {
      return Response.json({ error: '`status` must be one of: ' + Object.keys(ActionItemStatus).join(', ') }, { status: 400 })
    }
    data.status = s as ActionItemStatus
  }
  if (body.priority !== undefined) {
    const p = String(body.priority).toUpperCase()
    if (!(p in Priority)) {
      return Response.json({ error: '`priority` must be one of: ' + Object.keys(Priority).join(', ') }, { status: 400 })
    }
    data.priority = p as Priority
  }
  if (Object.keys(data).length === 0) {
    return Response.json({ error: 'Provide `status` and/or `priority`' }, { status: 400 })
  }

  // Org-scope the write so a key can only touch its own org's action items.
  const item = await db.actionItem.findFirst({
    where: { id, orgId: auth.orgId },
    select: { id: true },
  })
  if (!item) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await db.actionItem.update({
    where: { id: item.id },
    data,
    select: { id: true, status: true, priority: true },
  })

  return Response.json(updated)
}
