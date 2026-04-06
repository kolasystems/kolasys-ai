// Kolasys AI — Clerk webhook handler
// Syncs Clerk organization events to the database.
// Requires: npm install svix

import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { db } from '@/lib/db'
import { slugify } from '@/lib/utils'

type ClerkOrganizationEvent = {
  type: string
  data: {
    id: string
    name: string
    slug?: string
    created_at: number
    updated_at: number
  }
}

type ClerkOrganizationMembershipEvent = {
  type: string
  data: {
    id: string
    organization: { id: string }
    public_user_data: { user_id: string }
    role: string
    created_at: number
    updated_at: number
  }
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET
  if (!secret) {
    return new Response('CLERK_WEBHOOK_SECRET is not set', { status: 500 })
  }

  const headersList = await headers()
  const svixId = headersList.get('svix-id')
  const svixTimestamp = headersList.get('svix-timestamp')
  const svixSignature = headersList.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 })
  }

  const body = await req.text()

  let event: ClerkOrganizationEvent | ClerkOrganizationMembershipEvent
  try {
    const wh = new Webhook(secret)
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as typeof event
  } catch {
    return new Response('Webhook verification failed', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'organization.created': {
        const d = (event as ClerkOrganizationEvent).data
        const existingOrg = await db.organization.findUnique({
          where: { clerkOrgId: d.id },
          select: { id: true },
        })
        if (existingOrg) {
          await db.organization.update({ where: { clerkOrgId: d.id }, data: { name: d.name } })
        } else {
          try {
            await db.organization.create({
              data: { name: d.name, slug: d.slug ?? slugify(d.name), clerkOrgId: d.id },
            })
          } catch {
            // Race condition with self-healing orgProcedure — update instead.
            await db.organization.updateMany({ where: { clerkOrgId: d.id }, data: { name: d.name } })
          }
        }
        break
      }

      case 'organization.updated': {
        const d = (event as ClerkOrganizationEvent).data
        await db.organization.updateMany({
          where: { clerkOrgId: d.id },
          data: { name: d.name },
        })
        break
      }

      case 'organization.deleted': {
        const d = (event as ClerkOrganizationEvent).data
        await db.organization.deleteMany({ where: { clerkOrgId: d.id } })
        break
      }

      case 'organizationMembership.created': {
        const d = (event as ClerkOrganizationMembershipEvent).data
        const org = await db.organization.findUnique({
          where: { clerkOrgId: d.organization.id },
          select: { id: true },
        })
        if (org) {
          const role = d.role === 'org:admin' ? 'ADMIN' : 'MEMBER'
          const existingMember = await db.orgMember.findUnique({
            where: { orgId_userId: { orgId: org.id, userId: d.public_user_data.user_id } },
            select: { id: true },
          })
          if (existingMember) {
            await db.orgMember.update({
              where: { orgId_userId: { orgId: org.id, userId: d.public_user_data.user_id } },
              data: { role },
            })
          } else {
            try {
              await db.orgMember.create({
                data: { orgId: org.id, userId: d.public_user_data.user_id, role },
              })
            } catch {
              // Race condition — already created, update role.
              await db.orgMember.updateMany({
                where: { orgId: org.id, userId: d.public_user_data.user_id },
                data: { role },
              })
            }
          }
        }
        break
      }

      case 'organizationMembership.deleted': {
        const d = (event as ClerkOrganizationMembershipEvent).data
        const org = await db.organization.findUnique({
          where: { clerkOrgId: d.organization.id },
          select: { id: true },
        })
        if (org) {
          await db.orgMember.deleteMany({
            where: { orgId: org.id, userId: d.public_user_data.user_id },
          })
        }
        break
      }

      default:
        // Unhandled event type — ignore silently.
        break
    }
  } catch (err) {
    console.error('[clerk webhook] Error processing event:', err)
    return new Response('Internal server error', { status: 500 })
  }

  return new Response('OK', { status: 200 })
}
