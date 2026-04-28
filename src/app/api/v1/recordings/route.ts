// Kolasys AI — Public REST API: list recordings for the authenticated org.
// GET /api/v1/recordings — auth: `Authorization: Bearer kol_…`

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200)

  const recordings = await db.recording.findMany({
    where: { orgId: auth.orgId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      source: true,
      duration: true,
      createdAt: true,
      startedAt: true,
      endedAt: true,
    },
  })

  return Response.json({ recordings })
}
