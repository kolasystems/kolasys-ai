// Kolasys AI — Public REST API: list meeting series for the org.
// Auth: `Authorization: Bearer kol_…`
//
// GET /api/v1/series — same shape as `series.list` (tRPC). Used by desktop +
// mobile to render the series list / sidebar.

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

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
