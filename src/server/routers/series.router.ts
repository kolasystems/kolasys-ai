// Kolasys AI — Meeting series tRPC router.
//
// list / get / rename / delete / addRecording / removeRecording. All
// procedures are `orgProcedure` so ctx.orgId is the internal DB org id.
//
// Prisma v7 caveats:
//  - update/delete `where` only accepts UniqueWhereInput, so we resolve via
//    findFirst({ id, orgId }) → update/delete({ id }) — same pattern as
//    `updateSpeakerLabel` in recordings.router.ts.
//  - addRecording/removeRecording verify BOTH the series AND the recording
//    belong to ctx.orgId before mutating, so a malicious caller can't
//    attach another org's recordings to their series by guessing IDs.

import 'server-only'

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure } from '../trpc'

export const seriesRouter = router({
  list: orgProcedure.query(async ({ ctx }) => {
    const series = await ctx.db.meetingSeries.findMany({
      where: { orgId: ctx.orgId },
      include: {
        recordings: {
          include: {
            recording: {
              select: { id: true, title: true, createdAt: true, status: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })
    return series.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      autoDetected: s.autoDetected,
      meetingCount: s.recordings.length,
      lastMeetingAt: s.recordings[0]?.recording.createdAt ?? s.createdAt,
      recentMeetings: s.recordings.slice(0, 3).map((r) => ({
        id: r.recording.id,
        title: r.recording.title,
        createdAt: r.recording.createdAt,
      })),
    }))
  }),

  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.meetingSeries.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        include: {
          recordings: {
            include: {
              recording: {
                select: {
                  id: true,
                  title: true,
                  createdAt: true,
                  status: true,
                  duration: true,
                  notes: {
                    take: 1,
                    orderBy: { createdAt: 'desc' },
                    select: { summary: true },
                  },
                },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      })
    }),

  rename: orgProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // Org-scope check via findFirst — Prisma update where can't carry orgId.
      const existing = await ctx.db.meetingSeries.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })

      return ctx.db.meetingSeries.update({
        where: { id: existing.id },
        // autoDetected → false: a user-renamed series is no longer "auto".
        data: { name: input.name, autoDetected: false },
      })
    }),

  delete: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.meetingSeries.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })

      // Memberships have onDelete: Cascade in the schema, but we delete them
      // explicitly first to match the spec and to keep the call order
      // deterministic across Prisma backends.
      await ctx.db.recordingSeriesMembership.deleteMany({
        where: { seriesId: existing.id },
      })
      return ctx.db.meetingSeries.delete({ where: { id: existing.id } })
    }),

  addRecording: orgProcedure
    .input(z.object({ seriesId: z.string(), recordingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Both the series AND the recording must belong to this org — without
      // this check a caller could attach any recording to any series by
      // guessing IDs (the compound-key upsert is not org-scoped on its own).
      const series = await ctx.db.meetingSeries.findFirst({
        where: { id: input.seriesId, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!series) throw new TRPCError({ code: 'NOT_FOUND' })
      const recording = await ctx.db.recording.findFirst({
        where: { id: input.recordingId, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!recording) throw new TRPCError({ code: 'NOT_FOUND' })

      return ctx.db.recordingSeriesMembership.upsert({
        where: { seriesId_recordingId: input },
        create: input,
        update: {},
      })
    }),

  removeRecording: orgProcedure
    .input(z.object({ seriesId: z.string(), recordingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Same org-scope check as addRecording.
      const series = await ctx.db.meetingSeries.findFirst({
        where: { id: input.seriesId, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!series) throw new TRPCError({ code: 'NOT_FOUND' })

      return ctx.db.recordingSeriesMembership.delete({
        where: { seriesId_recordingId: input },
      })
    }),
})
