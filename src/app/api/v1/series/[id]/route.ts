// Kolasys AI — Public REST API: fetch a single meeting series.
// Auth: `Authorization: Bearer kol_…`
//
// GET /api/v1/series/{id} — returns the series + every recording in it,
// including each recording's latest AI summary (untruncated). Same shape as
// the tRPC `series.get` query.

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { id } = await params

  const series = await db.meetingSeries.findFirst({
    where: { id, orgId: auth.orgId },
    include: {
      recordings: {
        include: {
          recording: {
            select: {
              id: true,
              title: true,
              createdAt: true,
              status: true,
              duration: true,
              notes: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                select: { summary: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!series) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json(series)
}
