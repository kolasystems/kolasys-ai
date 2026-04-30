// Kolasys AI — Persists a browser PushSubscription to the DB so the
// summarization worker can deliver notifications to it.

import { auth, clerkClient } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

type Body = {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

export async function POST(request: Request) {
  const { userId, orgId: clerkOrgId } = await auth()
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
  const { endpoint, keys } = body
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return Response.json(
      { error: 'endpoint, keys.p256dh and keys.auth are required' },
      { status: 400 },
    )
  }

  // Resolve the OrgMember row this subscription belongs to. Bootstrap the
  // org row if Clerk webhook lagged — same pattern as the rest of the app.
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

  let member = await db.orgMember.findFirst({
    where: { orgId: org.id, userId },
    select: { id: true },
  })
  if (!member) {
    try {
      member = await db.orgMember.create({
        data: { orgId: org.id, userId },
        select: { id: true },
      })
    } catch {
      member = await db.orgMember.findFirst({
        where: { orgId: org.id, userId },
        select: { id: true },
      })
    }
    if (!member) {
      return Response.json({ error: 'Failed to resolve member' }, { status: 500 })
    }
  }

  // Endpoint is unique — if a subscription already exists, update its keys
  // (the browser may have re-issued the same endpoint with new keys) and
  // re-bind to this member. HTTP-mode Prisma → no upsert.
  const existing = await db.webPushSubscription.findFirst({
    where: { endpoint },
    select: { id: true },
  })
  if (existing) {
    await db.webPushSubscription.update({
      where: { id: existing.id },
      data: { p256dh: keys.p256dh, auth: keys.auth, orgMemberId: member.id },
    })
  } else {
    await db.webPushSubscription.create({
      data: {
        orgMemberId: member.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    })
  }

  return Response.json({ ok: true })
}
