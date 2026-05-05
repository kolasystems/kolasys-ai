// Kolasys AI — Create a Stripe Billing Portal session for the active org.
// POST /api/stripe/portal — auth: Clerk. Accepts both the browser session
// cookie AND `Authorization: Bearer <session-jwt>` from the mobile app
// (without `acceptsToken: 'session_token'` Clerk would only inspect the
// cookie and 401 a header-only request).
// Returns 400 if the org has no Stripe customer yet.

import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { createOrgPortalSession } from '@/lib/stripe'

export async function POST() {
  const { userId, orgId: clerkOrgId } = await auth({
    acceptsToken: 'session_token',
  })
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clerkOrgId) {
    return Response.json(
      { error: 'No active organization' },
      { status: 400 },
    )
  }

  const org = await db.organization.findFirst({
    where: { clerkOrgId },
    select: { id: true, stripeCustomerId: true },
  })
  if (!org) {
    return Response.json({ error: 'Organization not found' }, { status: 404 })
  }
  if (!org.stripeCustomerId) {
    return Response.json(
      { error: 'No Stripe customer for this org yet — start a subscription first.' },
      { status: 400 },
    )
  }

  try {
    const result = await createOrgPortalSession(org.id)
    return Response.json(result)
  } catch (err) {
    console.error('[api/stripe/portal] error:', err)
    return Response.json({ error: 'Portal session failed' }, { status: 500 })
  }
}
