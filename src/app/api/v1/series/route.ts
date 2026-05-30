// Kolasys AI — Public REST API: list / create meeting series for the org.
// Auth: `Authorization: Bearer kol_…`
//
// GET  /api/v1/series — same shape as `series.list` (tRPC). Used by desktop
//      + mobile to render the series list / sidebar.
// POST /api/v1/series — manually create a series. `autoDetected` defaults
//      to false on this path (an API-created series is by definition not
//      auto-detected), which keeps it consistent with how the tRPC
//      `series.rename` mutation flips the flag when a user edits the name.

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

const MAX_NAME = 100
const MAX_DESCRIPTION = 500

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const series = await db.meetingSeries.findMany({
    where: { orgId: auth.orgId },
    include: {
      recordings: {
        include: {
          recording: {
            select: { id: true, title: true, createdAt: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  const result = series.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    autoDetected: s.autoDetected,
    meetingCount: s.recordings.length,
    lastMeetingAt: s.recordings[0]?.recording.createdAt ?? s.createdAt,
    recentMeetings: s.recordings.slice(0, 3).map((r) => ({
      id: r.recording.id,
      title: r.recording.title,
      createdAt: r.recording.createdAt,
    })),
  }))

  return Response.json({ series: result })
}

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  let body: { name?: unknown; autoDetected?: unknown; description?: unknown } = {}
  try {
    body = (await request.json()) as typeof body
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

  // Optional description — accepted opportunistically even though the spec
  // doesn't require it, because the column exists and the desktop is the
  // only sane way to populate it.
  let description: string | null = null
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string') {
      return Response.json({ error: '`description` must be a string' }, { status: 400 })
    }
    description = body.description.trim().slice(0, MAX_DESCRIPTION) || null
  }

  // Default autoDetected to false — manual API creation is not "auto".
  const autoDetected =
    typeof body.autoDetected === 'boolean' ? body.autoDetected : false

  const series = await db.meetingSeries.create({
    data: {
      orgId: auth.orgId,
      name,
      description,
      autoDetected,
    },
    select: {
      id: true,
      name: true,
      description: true,
      autoDetected: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return Response.json(series, { status: 201 })
}
