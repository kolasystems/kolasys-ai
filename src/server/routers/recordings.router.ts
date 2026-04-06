// Kolasys AI — Recordings tRPC router

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure } from '../trpc'
import { RecordingSource, RecordingStatus } from '@/generated/prisma/client'
import { generateRecordingKey, getSignedUploadUrl, deleteFromS3 } from '@/lib/storage'
import { transcriptionQueue } from '@/lib/queues'
import { deployBot } from '@/services/meetingbot.service'

export const recordingsRouter = router({
  // ── List recordings for the active org ────────────────────────────────────
  list: orgProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        cursor: z.string().optional(),
        status: z.nativeEnum(RecordingStatus).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.recording.findMany({
        where: {
          orgId: ctx.orgId,
          ...(input.status && { status: input.status }),
        },
        take: input.limit + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
        orderBy: { createdAt: 'desc' },
        include: {
          transcript: { select: { id: true } },
          _count: { select: { notes: true, jobs: true } },
        },
      })

      let nextCursor: string | undefined
      if (items.length > input.limit) {
        nextCursor = items.pop()!.id
      }

      return { items, nextCursor }
    }),

  // ── Get a single recording — org-scoped so users can only access their own ─
  // FIX P0-1: switched from protectedProcedure to orgProcedure and added orgId
  // to the query so cross-org data access is impossible.
  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const recording = await ctx.db.recording.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        include: {
          transcript: {
            include: {
              segments: { orderBy: { startTime: 'asc' } },
            },
          },
          notes: {
            include: {
              sections: { orderBy: { order: 'asc' } },
              actionItems: { orderBy: { priority: 'asc' } },
            },
            orderBy: { createdAt: 'desc' },
          },
          jobs: { orderBy: { createdAt: 'desc' } },
        },
      })

      if (!recording) throw new TRPCError({ code: 'NOT_FOUND' })

      return recording
    }),

  // ── Create a new recording record ─────────────────────────────────────────
  create: orgProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        source: z.nativeEnum(RecordingSource),
        description: z.string().max(1000).optional(),
        meetingUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const recording = await ctx.db.recording.create({
        data: {
          orgId: ctx.orgId,
          userId: ctx.userId,
          title: input.title,
          source: input.source,
          description: input.description,
          meetingUrl: input.meetingUrl,
          status: RecordingStatus.PENDING,
        },
      })

      // FIX P0-3: deploy the Recall.ai bot immediately after creating the record.
      if (input.source === RecordingSource.MEETING_BOT && input.meetingUrl) {
        try {
          const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/recall`
          const botId = await deployBot(input.meetingUrl, recording.id, webhookUrl)
          await ctx.db.recording.update({
            where: { id: recording.id },
            data: { botId, status: RecordingStatus.PROCESSING },
          })
          return { ...recording, botId, status: RecordingStatus.PROCESSING }
        } catch (err) {
          // Bot deployment failed — clean up and surface the error to the client.
          await ctx.db.recording.update({
            where: { id: recording.id },
            data: { status: RecordingStatus.FAILED },
          })
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: err instanceof Error ? err.message : 'Failed to deploy meeting bot',
          })
        }
      }

      return recording
    }),

  // ── Delete a recording ────────────────────────────────────────────────────
  delete: orgProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const recording = await ctx.db.recording.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
      })
      if (!recording) throw new TRPCError({ code: 'NOT_FOUND' })

      // FIX P0-5: delete the S3 object before removing the DB row.
      // Don't fail the deletion if S3 errors — the file may already be gone.
      if (recording.s3Key) {
        try {
          await deleteFromS3(recording.s3Key)
        } catch (err) {
          console.error(
            `[recordings.delete] Failed to delete S3 object ${recording.s3Key}:`,
            err
          )
        }
      }

      await ctx.db.recording.delete({ where: { id: input.id } })
      return { success: true }
    }),

  // ── Get a pre-signed S3 upload URL ────────────────────────────────────────
  getUploadUrl: orgProcedure
    .input(
      z.object({
        recordingId: z.string(),
        contentType: z.string(),
        extension: z.string().max(10),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the recording belongs to this org before issuing an upload URL.
      const recording = await ctx.db.recording.findFirst({
        where: { id: input.recordingId, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!recording) throw new TRPCError({ code: 'NOT_FOUND' })

      const key = generateRecordingKey(ctx.orgId, input.recordingId, input.extension)
      const url = await getSignedUploadUrl(key, input.contentType)

      // Persist the S3 key so we know where to find the file later.
      await ctx.db.recording.update({
        where: { id: input.recordingId },
        data: { s3Key: key, s3Bucket: process.env.S3_BUCKET_NAME },
      })

      return { url, key }
    }),

  // ── Mark upload complete and enqueue transcription ────────────────────────
  confirmUpload: orgProcedure
    .input(
      z.object({
        recordingId: z.string(),
        duration: z.number().int().positive().optional(),
        fileSize: z.number().int().positive().optional(),
        mimeType: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const recording = await ctx.db.recording.findFirst({
        where: { id: input.recordingId, orgId: ctx.orgId },
      })
      if (!recording) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!recording.s3Key) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No S3 key on record.' })
      }

      await ctx.db.recording.update({
        where: { id: input.recordingId },
        data: {
          status: RecordingStatus.PROCESSING,
          duration: input.duration,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
        },
      })

      await transcriptionQueue.add('transcribe', {
        recordingId: recording.id,
        orgId: ctx.orgId,
        s3Key: recording.s3Key,
      })

      return { success: true }
    }),
})
