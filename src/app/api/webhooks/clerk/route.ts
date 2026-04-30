// Kolasys AI — Clerk webhook handler
// Syncs Clerk organization and user events to the database.
// Requires: npm install svix

import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { db } from '@/lib/db'
import { slugify } from '@/lib/utils'
import { sendEmail } from '@/lib/email'
import { WelcomeEmail } from '@/emails/welcome'
import React from 'react'

// ─── Event types ─────────────────────────────────────────────────────────────

type ClerkUserCreatedEvent = {
  type: 'user.created'
  data: {
    id: string
    email_addresses: Array<{ id: string; email_address: string }>
    primary_email_address_id: string
    first_name: string | null
    last_name: string | null
    username: string | null
  }
}

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

type ClerkEvent =
  | ClerkUserCreatedEvent
  | ClerkOrganizationEvent
  | ClerkOrganizationMembershipEvent

// ─── Handler ─────────────────────────────────────────────────────────────────

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

  let event: ClerkEvent
  try {
    const wh = new Webhook(secret)
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkEvent
  } catch {
    return new Response('Webhook verification failed', { status: 400 })
  }

  try {
    switch (event.type) {
      // ── User events ────────────────────────────────────────────────────────

      case 'user.created': {
        const d = (event as ClerkUserCreatedEvent).data
        const primaryEmail = d.email_addresses.find(
          (e) => e.id === d.primary_email_address_id
        )?.email_address

        if (primaryEmail) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.kolasys.ai'
          const firstName = d.first_name ?? 'there'

          // Send welcome email (non-fatal — don't let email failure break the webhook).
          // From: hello@kolasys.ai requires the kolasys.ai domain to be verified
          // in Resend; otherwise the send returns an error and we fall back to
          // the configured FROM_EMAIL via the catch path.
          sendEmail({
            to: primaryEmail,
            from: 'Kolasys AI <hello@kolasys.ai>',
            subject: 'Welcome to Kolasys AI 👋',
            react: React.createElement(WelcomeEmail, { firstName, appUrl }),
          }).catch((err) =>
            console.error('[clerk webhook] Failed to send welcome email:', err)
          )
        }
        break
      }

      // ── Organization events ───────────────────────────────────────────────

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
