// Kolasys AI — Create a Stripe Checkout Session for the active org.
// POST /api/stripe/checkout
// Body: { priceId: string, seats?: number }
// Auth: Clerk — accepts both the standard browser session cookie AND
// `Authorization: Bearer <session-jwt>` from the mobile app. Without
// `acceptsToken: 'session_token'` Clerk only inspects the cookie, so a
// React Native client passing its `getToken()` JWT in the header would
// 401 even though the token is valid.

import { auth, clerkClient } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { createOrgCheckoutSession } from '@/lib/stripe'

type Body = { priceId?: string; seats?: number }

export async function POST(request: Request) {
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

  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.priceId) {
    return Response.json({ error: 'priceId is required' }, { status: 400 })
  }

  // Resolve the internal org id from the active Clerk org. If the row
  // doesn't exist yet (Clerk webhook lag), bootstrap it so checkout still
  // works — same pattern as orgProcedure.
  let org = await db.organization.findFirst({
    where: { clerkOrgId },
    select: { id: true },
  })
  if (!org) {
    const client = await clerkClient()
    const clerkOrg = await client.organizations.getOrganization({
      organizationId: clerkOrgId,
    })
    const baseSlug = clerkOrg.slug ?? clerkOrgId
    const slugTaken = await db.organization.findFirst({
      where: { slug: baseSlug },
      select: { id: true },
    })
    const slug = slugTaken ? clerkOrgId : baseSlug
    try {
      const created = await db.organization.create({
        data: { name: clerkOrg.name, slug, clerkOrgId },
        select: { id: true },
      })
      org = created
    } catch {
      org = await db.organization.findFirst({
        where: { clerkOrgId },
        select: { id: true },
      })
    }
    if (!org) {
      return Response.json({ error: 'Failed to resolve org' }, { status: 500 })
    }
  }

  try {
    const result = await createOrgCheckoutSession({
      orgId: org.id,
      priceId: body.priceId,
      seats: body.seats,
    })
    return Response.json(result)
  } catch (err) {
    console.error('[api/stripe/checkout] error:', err)
    const message = err instanceof Error ? err.message : 'Checkout failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
