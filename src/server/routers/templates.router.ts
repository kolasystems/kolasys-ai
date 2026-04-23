// Kolasys AI — Note templates ("AI Skills") tRPC router
import 'server-only'

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { Prisma } from '@/generated/prisma/client'
import { router, orgProcedure } from '../trpc'

const sectionSchema = z.object({
  title: z.string().min(1).max(120),
  prompt: z.string().min(1).max(2_000),
})

// Auto-apply rule: a regex pattern checked against either the meeting title
// or the stringified attendee list. Highest-priority match wins when a new
// recording is summarized without an explicit templateId.
const autoApplyRuleSchema = z.object({
  field: z.enum(['title', 'attendees']),
  pattern: z.string().min(1).max(200),
  priority: z.number().int().min(1).max(10),
})

// Seed map: template id → auto-apply rules installed by `seedAutoApplyRules`.
// Templates not listed here are left untouched. Values are stored as plain
// regex sources with the /i flag applied at match time.
const AUTO_APPLY_SEED: Record<string, Array<z.infer<typeof autoApplyRuleSchema>>> = {
  'global-sales-call': [
    { field: 'title', pattern: 'sales|demo|prospect|pitch|client', priority: 10 },
  ],
  'global-one-on-one': [
    { field: 'title', pattern: '1:1|one.on.one|check.in|sync', priority: 9 },
  ],
  'global-daily-standup': [
    { field: 'title', pattern: 'sprint|standup|planning|retro|retrospective|scrum', priority: 9 },
  ],
}

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
        autoApplyRules: true,
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
        autoApplyRules: z.array(autoApplyRuleSchema).max(10).optional(),
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
          autoApplyRules: input.autoApplyRules ?? Prisma.DbNull,
          isDefault: false,
        },
        select: {
          id: true,
          name: true,
          description: true,
          prompt: true,
          category: true,
          structure: true,
          autoApplyRules: true,
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
        autoApplyRules: z.array(autoApplyRuleSchema).max(10).nullable().optional(),
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
          ...(input.autoApplyRules !== undefined && {
            autoApplyRules: input.autoApplyRules ?? Prisma.DbNull,
          }),
        },
        select: {
          id: true,
          name: true,
          description: true,
          prompt: true,
          category: true,
          structure: true,
          autoApplyRules: true,
          isDefault: true,
        },
      })
    }),

  // ── Seed auto-apply rules onto the built-in global templates ─────────────
  // Idempotent. Runs under orgProcedure so any authenticated org member can
  // trigger it (there's no sensitive data in the seed — it just populates
  // rule rows on templates owned by `orgId: null`).
  seedAutoApplyRules: orgProcedure.mutation(async ({ ctx }) => {
    let seeded = 0
    for (const [templateId, rules] of Object.entries(AUTO_APPLY_SEED)) {
      // Only touch global (orgId === null) templates that still have no
      // rules so we don't stomp on anything an admin has customized.
      const existing = await ctx.db.noteTemplate.findFirst({
        where: { id: templateId, orgId: null },
        select: { id: true, autoApplyRules: true },
      })
      if (!existing) continue
      if (existing.autoApplyRules !== null && existing.autoApplyRules !== undefined) {
        continue
      }
      await ctx.db.noteTemplate.update({
        where: { id: templateId },
        data: { autoApplyRules: rules },
      })
      seeded += 1
    }
    return { seeded, total: Object.keys(AUTO_APPLY_SEED).length }
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
