// Kolasys AI — tRPC server initialization
import 'server-only'

import { initTRPC, TRPCError } from '@trpc/server'
import { auth } from '@clerk/nextjs/server'
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

/** Requires a signed-in user AND an active Clerk organization. */
export const orgProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.orgId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message:
        'No organization selected. Create or switch to an organization using the workspace switcher in the sidebar before uploading.',
    })
  }
  return next({ ctx: { ...ctx, orgId: ctx.orgId } })
})
