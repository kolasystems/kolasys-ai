// Kolasys AI — tRPC server initialization
import 'server-only'

import { initTRPC, TRPCError } from '@trpc/server'
import { auth, clerkClient } from '@clerk/nextjs/server'
import superjson from 'superjson'
import { db } from '@/lib/db'

/**
 * createTRPCContext is called once per request.
 * auth() is async in Next.js 16.
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const { userId, orgId } = await auth()
  return { userId, orgId, db, headers: opts.headers }
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>

const t = initTRPC.context<Context>().create({
  transformer: superjson,
})

export const router = t.router
export const createCallerFactory = t.createCallerFactory

/** Public — no auth required. */
export const publicProcedure = t.procedure

/** Requires a signed-in Clerk user. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } })
})

/**
 * Requires a signed-in user AND an active Clerk organization.
 * Self-healing: if the Organization row doesn't exist yet (webhook delayed),
 * fetches org details from Clerk and creates it. Same for OrgMember.
 * No upserts or transactions — PrismaNeonHttp (HTTP mode) supports neither.
 */
export const orgProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.orgId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'No organization selected. Create or switch to an organization using the workspace switcher in the sidebar before uploading.',
    })
  }

  const clerkOrgId = ctx.orgId

  // ── Resolve Organization ─────────────────────────────────────────────────
  let org = await ctx.db.organization.findFirst({ where: { clerkOrgId } })

  if (!org) {
    const client = await clerkClient()
    const clerkOrg = await client.organizations.getOrganization({ organizationId: clerkOrgId })

    // Ensure slug is unique — fall back to clerkOrgId if the slug is taken.
    const baseSlug = clerkOrg.slug ?? clerkOrgId
    const slugTaken = await ctx.db.organization.findFirst({ where: { slug: baseSlug } })
    const slug = slugTaken ? clerkOrgId : baseSlug

    try {
      org = await ctx.db.organization.create({
        data: { name: clerkOrg.name, slug, clerkOrgId },
      })
    } catch {
      // Race condition: a concurrent request created it first — read it back.
      org = await ctx.db.organization.findFirst({ where: { clerkOrgId } })
      if (!org) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to resolve organization',
        })
      }
    }
  }

  // ── Suspension gate ──────────────────────────────────────────────────────
  // Hard stop for orgs flagged from /admin. Members can still sign in but
  // every tRPC mutation/query bounces with a clear message. Lifting the
  // suspension restores access on the next request.
  if (org.suspended) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Your account has been suspended. Contact support@kolasys.ai.',
    })
  }

  // ── Resolve OrgMember ────────────────────────────────────────────────────
  const existingMember = await ctx.db.orgMember.findFirst({
    where: { orgId: org.id, userId: ctx.userId },
  })

  if (!existingMember) {
    try {
      await ctx.db.orgMember.create({ data: { orgId: org.id, userId: ctx.userId } })
    } catch {
      // Race condition — already created by a concurrent request, that's fine.
    }
  }

  return next({ ctx: { ...ctx, orgId: org.id, clerkOrgId } })
})
