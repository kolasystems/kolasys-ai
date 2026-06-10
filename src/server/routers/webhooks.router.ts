// Kolasys AI — Outbound webhook endpoint management tRPC router.
//
// OWNER / ADMIN members register URLs that receive signed POST payloads when
// a recording reaches READY. The signing secret is shown exactly once (on
// create and rotateSecret); list and update never return it.
//
// Delivery (the Step-12 fan-out in the summarization worker) is a separate
// concern. This router is management only: CRUD + secret rotation.

import 'server-only'

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { randomBytes } from 'node:crypto'
import { router, orgProcedure } from '../trpc'
import { MemberRole } from '@/generated/prisma/client'

const SECRET_PREFIX = 'whsec_'

function generateWebhookSecret(): string {
  // 24 random bytes → 48-char lowercase hex, prefixed with "whsec_"
  return SECRET_PREFIX + randomBytes(24).toString('hex')
}

// ── Role guard ─────────────────────────────────────────────────────────────────
// Extends orgProcedure to require OWNER or ADMIN role. MEMBER role is rejected.
// list stays on the base orgProcedure so any member can view registered endpoints.
const adminProcedure = orgProcedure.use(async ({ ctx, next }) => {
  const member = await ctx.db.orgMember.findFirst({
    where: { orgId: ctx.orgId, userId: ctx.userId },
    select: { role: true },
  })
  if (!member || member.role === MemberRole.MEMBER) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only workspace owners and admins can manage webhook endpoints.',
    })
  }
  return next({ ctx })
})

// ── Router ─────────────────────────────────────────────────────────────────────

export const webhooksRouter = router({
  // ── list ────────────────────────────────────────────────────────────────────
  // Available to any org member. The raw secret is never returned.
  // secretHint = "whsec_…" + last 4 chars — enough for visual identification.
  list: orgProcedure.query(async ({ ctx }) => {
    const endpoints = await ctx.db.webhookEndpoint.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: 'desc' },
      select: {
        id:          true,
        url:         true,
        enabled:     true,
        description: true,
        secret:      true, // fetched only to derive secretHint; stripped before return
        createdAt:   true,
      },
    })

    return endpoints.map(({ secret, ...rest }) => ({
      ...rest,
      secretHint: SECRET_PREFIX + '…' + secret.slice(-4),
    }))
  }),

  // ── create ──────────────────────────────────────────────────────────────────
  // OWNER / ADMIN only. Generates a new signing secret and returns it exactly
  // once — the UI must surface it immediately; it cannot be recovered later.
  create: adminProcedure
    .input(
      z.object({
        url:         z.string().url(),
        description: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const secret = generateWebhookSecret()

      const endpoint = await ctx.db.webhookEndpoint.create({
        data: {
          orgId:       ctx.orgId,
          url:         input.url,
          secret,
          description: input.description ?? null,
        },
        select: {
          id:          true,
          url:         true,
          enabled:     true,
          description: true,
          createdAt:   true,
        },
      })

      // Return the raw secret once — never returned again after this response.
      return { ...endpoint, secret }
    }),

  // ── update ──────────────────────────────────────────────────────────────────
  // OWNER / ADMIN only. Undefined fields are ignored (Prisma no-op).
  // The secret is never returned.
  update: adminProcedure
    .input(
      z.object({
        id:          z.string(),
        enabled:     z.boolean().optional(),
        url:         z.string().url().optional(),
        description: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.webhookEndpoint.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Webhook endpoint not found.',
        })
      }

      const updated = await ctx.db.webhookEndpoint.update({
        where: { id: input.id },
        data: {
          enabled:     input.enabled,
          url:         input.url,
          description: input.description,
        },
        select: {
          id:          true,
          url:         true,
          enabled:     true,
          description: true,
          createdAt:   true,
          updatedAt:   true,
        },
      })

      return updated
    }),

  // ── delete ──────────────────────────────────────────────────────────────────
  // OWNER / ADMIN only. WebhookDelivery rows cascade-delete via the schema
  // relation (onDelete: Cascade on WebhookDelivery.endpointId).
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.webhookEndpoint.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Webhook endpoint not found.',
        })
      }

      await ctx.db.webhookEndpoint.delete({ where: { id: input.id } })

      return { ok: true as const }
    }),

  // ── rotateSecret ─────────────────────────────────────────────────────────────
  // OWNER / ADMIN only. Replaces the signing secret atomically. Returns the new
  // raw secret exactly once — callers must update their verification logic before
  // the next delivery attempt.
  rotateSecret: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.webhookEndpoint.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Webhook endpoint not found.',
        })
      }

      const newSecret = generateWebhookSecret()

      await ctx.db.webhookEndpoint.update({
        where: { id: input.id },
        data: { secret: newSecret },
      })

      // Return the new raw secret once.
      return { id: input.id, secret: newSecret }
    }),
})
