// Kolasys AI — Note templates ("AI Skills") tRPC router
import 'server-only'

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure } from '../trpc'

const sectionSchema = z.object({
  title: z.string().min(1).max(120),
  prompt: z.string().min(1).max(2_000),
})

export const templatesRouter = router({
  // ── List available templates: global + own org ────────────────────────────
  list: orgProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.noteTemplate.findMany({
      where: { OR: [{ orgId: null }, { orgId: ctx.orgId }] },
      orderBy: [{ isDefault: 'desc' }, { category: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        prompt: true,
        category: true,
        structure: true,
        isDefault: true,
        orgId: true,
      },
    })
    return rows.map((t) => ({ ...t, isGlobal: t.orgId === null }))
  }),

  // ── Get a single template ─────────────────────────────────────────────────
  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const t = await ctx.db.noteTemplate.findFirst({
        where: {
          id: input.id,
          OR: [{ orgId: null }, { orgId: ctx.orgId }],
        },
      })
      if (!t) throw new TRPCError({ code: 'NOT_FOUND' })
      return { ...t, isGlobal: t.orgId === null }
    }),

  // ── Create a new custom template for the active org ───────────────────────
  create: orgProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        prompt: z.string().max(4_000).optional(),
        category: z.string().max(60).optional(),
        structure: z.array(sectionSchema).min(1).max(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.noteTemplate.create({
        data: {
          orgId: ctx.orgId,
          name: input.name,
          description: input.description ?? null,
          prompt: input.prompt ?? null,
          category: input.category ?? null,
          structure: input.structure,
          isDefault: false,
        },
        select: {
          id: true,
          name: true,
          description: true,
          prompt: true,
          category: true,
          structure: true,
          isDefault: true,
        },
      })
    }),

  // ── Update a custom template (global templates cannot be edited) ──────────
  update: orgProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(500).nullable().optional(),
        prompt: z.string().max(4_000).nullable().optional(),
        category: z.string().max(60).nullable().optional(),
        structure: z.array(sectionSchema).min(1).max(30).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.noteTemplate.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found or is a global template (read-only).',
        })
      }
      return ctx.db.noteTemplate.update({
        where: { id: input.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.prompt !== undefined && { prompt: input.prompt }),
          ...(input.category !== undefined && { category: input.category }),
          ...(input.structure !== undefined && { structure: input.structure }),
        },
        select: {
          id: true,
          name: true,
          description: true,
          prompt: true,
          category: true,
          structure: true,
          isDefault: true,
        },
      })
    }),

  // ── Delete a custom template ──────────────────────────────────────────────
  delete: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.noteTemplate.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found or is a global template.',
        })
      }
      await ctx.db.noteTemplate.delete({ where: { id: input.id } })
      return { success: true }
    }),
})
