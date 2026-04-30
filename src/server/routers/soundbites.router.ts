// Kolasys AI — Soundbites router. Each soundbite is a virtual clip range
// over an existing recording — no audio is duplicated. We store title +
// start/end timestamps + the captured transcript snippet for previews.

import 'server-only'

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure } from '../trpc'

export const soundbitesRouter = router({
  // List soundbites for one recording (most-recent first), or for the whole
  // org when recordingId is omitted (used by /dashboard/soundbites).
  list: orgProcedure
    .input(z.object({ recordingId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db.soundbite.findMany({
        where: {
          orgId: ctx.orgId,
          ...(input?.recordingId ? { recordingId: input.recordingId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          recordingId: true,
          title: true,
          startSeconds: true,
          endSeconds: true,
          transcript: true,
          createdAt: true,
          recording: { select: { title: true } },
        },
      })
    }),

  create: orgProcedure
    .input(
      z.object({
        recordingId: z.string(),
        title: z.string().min(1).max(200),
        startSeconds: z.number().min(0).max(36000),
        endSeconds: z.number().min(0).max(36000),
        transcript: z.string().max(4000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.endSeconds <= input.startSeconds) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'endSeconds must be greater than startSeconds.',
        })
      }
      const recording = await ctx.db.recording.findFirst({
        where: { id: input.recordingId, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!recording) throw new TRPCError({ code: 'NOT_FOUND' })

      return ctx.db.soundbite.create({
        data: {
          orgId: ctx.orgId,
          recordingId: input.recordingId,
          title: input.title,
          startSeconds: input.startSeconds,
          endSeconds: input.endSeconds,
          transcript: input.transcript ?? null,
        },
        select: {
          id: true,
          title: true,
          startSeconds: true,
          endSeconds: true,
          transcript: true,
          createdAt: true,
        },
      })
    }),

  delete: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.soundbite.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      await ctx.db.soundbite.delete({ where: { id: input.id } })
      return { ok: true }
    }),
})
