// Kolasys AI — Billing tRPC router.
//
// Wraps the same Stripe helpers used by the REST routes so the in-app UI
// can hit them without a round trip through fetch.

import 'server-only'

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure } from '../trpc'
import {
  createOrgCheckoutSession,
  createOrgPortalSession,
} from '@/lib/stripe'

export const billingRouter = router({
  // ── Current subscription state for the active org ────────────────────────
  getSubscription: orgProcedure.query(async ({ ctx }) => {
    const org = await ctx.db.organization.findFirst({
      where: { id: ctx.orgId },
      select: {
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        trialStartedAt: true,
        trialEndsAt: true,
        maxRecordingsPerMonth: true,
      },
    })
    if (!org) throw new TRPCError({ code: 'NOT_FOUND' })

    const monthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    )
    const recordingsThisMonth = await ctx.db.recording.count({
      where: { orgId: ctx.orgId, createdAt: { gte: monthStart } },
    })

    return {
      ...org,
      recordingsThisMonth,
    }
  }),

  // ── Start a Stripe Checkout flow ─────────────────────────────────────────
  createCheckoutSession: orgProcedure
    .input(
      z.object({
        priceId: z.string().min(1),
        seats: z.number().int().min(1).max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createOrgCheckoutSession({
          orgId: ctx.orgId,
          priceId: input.priceId,
          seats: input.seats,
        })
      } catch (err) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Checkout failed',
        })
      }
    }),

  // ── Open the Stripe Billing Portal ───────────────────────────────────────
  createPortalSession: orgProcedure.mutation(async ({ ctx }) => {
    try {
      return await createOrgPortalSession(ctx.orgId)
    } catch (err) {
      const code =
        err instanceof Error && err.message === 'NO_CUSTOMER'
          ? 'BAD_REQUEST'
          : 'INTERNAL_SERVER_ERROR'
      throw new TRPCError({
        code,
        message:
          err instanceof Error && err.message === 'NO_CUSTOMER'
            ? 'No Stripe customer for this org yet — start a subscription first.'
            : 'Portal session failed',
      })
    }
  }),
})
