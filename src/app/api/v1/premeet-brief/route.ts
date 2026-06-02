// Kolasys AI — Public REST API: pre-meeting brief.
//
// GET /api/v1/premeet-brief?memberId=&titleSlug=&date=YYYY-MM-DD
//
// Reads the Redis key written by the calendar-bot worker 30 min before a
// meeting starts: premeet:{memberId}:{titleSlug}:{date}
// Returns the parsed JSON brief or 404 if not yet available / already expired.

import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'
import { redis } from '@/lib/redis'

export async function GET(request: Request): Promise<Response> {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const memberId = searchParams.get('memberId')
  const titleSlug = searchParams.get('titleSlug')
  const date = searchParams.get('date')

  if (!memberId || !titleSlug || !date) {
    return Response.json(
      { error: 'Missing required query params: memberId, titleSlug, date' },
      { status: 400 },
    )
  }

  const key = `premeet:${memberId}:${titleSlug}:${date}`
  const raw = await redis.get(key)

  if (!raw) {
    return Response.json({ error: 'No brief available' }, { status: 404 })
  }

  return Response.json(JSON.parse(raw))
}
