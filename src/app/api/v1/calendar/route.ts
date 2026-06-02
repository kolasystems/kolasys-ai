// Kolasys AI — Public REST API: calendar integration management.
//
// DELETE /api/v1/calendar
//   Disconnects all calendar providers (Google + Microsoft) for the
//   authenticated user. Mirrors the tRPC calendar.disconnect mutation.
//   When authenticated via Clerk session JWT (auth.userId present), only
//   the calling user's tokens are cleared. kol_ API keys clear all members.
//
// Optional query param: provider=google|microsoft
//   Omit to disconnect both providers.

import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

export async function DELETE(request: Request): Promise<Response> {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  const { searchParams } = new URL(request.url)
  const provider = searchParams.get('provider') as 'google' | 'microsoft' | null
  if (provider && provider !== 'google' && provider !== 'microsoft') {
    return Response.json(
      { error: 'provider must be "google" or "microsoft"' },
      { status: 400 },
    )
  }

  const data =
    provider === 'google'
      ? { googleRefreshToken: null }
      : provider === 'microsoft'
        ? { microsoftRefreshToken: null }
        : { googleRefreshToken: null, microsoftRefreshToken: null }

  const result = await db.orgMember.updateMany({
    where: {
      orgId: auth.orgId,
      ...(auth.userId ? { userId: auth.userId } : {}),
    },
    data,
  })

  if (result.count === 0) {
    return Response.json({ error: 'No calendar integration found' }, { status: 404 })
  }

  return Response.json({ success: true })
}
