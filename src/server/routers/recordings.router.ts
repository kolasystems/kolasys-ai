// Kolasys AI — Recordings tRPC router

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure } from '../trpc'
import {
  RecordingSource,
  RecordingStatus,
  ActionItemStatus,
  Priority,
} from '@/generated/prisma/client'
import { generateRecordingKey, getSignedUploadUrl, deleteFromS3 } from '@/lib/storage'
import { transcriptionQueue, summarizationQueue } from '@/lib/queues'
import { deployBot } from '@/services/meetingbot.service'
import { captureServerEvent } from '@/lib/posthog'

export const recordingsRouter = router({
  // ── List recordings for the active org ────────────────────────────────────
  // P1 perf: removed _count.jobs (never shown in UI); transcript include is a
  // single lightweight index lookup per row.
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
        select: {
          id: true,
          title: true,
          status: true,
          source: true,
          duration: true,
          createdAt: true,
          updatedAt: true,
          // hasTranscript: one-to-one; select only id to avoid loading text
          transcript: { select: { id: true } },
          _count: { select: { notes: true } },
        },
      })

      let nextCursor: string | undefined
      if (items.length > input.limit) {
        nextCursor = items.pop()!.id
      }

      return { items, nextCursor }
    }),

  // ── Get a single recording — org-scoped ───────────────────────────────────
  get: orgProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const recording = await ctx.db.recording.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        include: {
          transcript: {
            select: {
              id: true,
              text: true,
              language: true,
              // Fetch 101 so the client knows whether more exist
              segments: { orderBy: { startTime: 'asc' }, take: 101 },
            },
          },
          notes: {
            include: {
              sections: { orderBy: { order: 'asc' } },
              actionItems: { orderBy: { priority: 'asc' } },
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          jobs: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
      })

      if (!recording) throw new TRPCError({ code: 'NOT_FOUND' })

      // Track note viewed (fires on each fetch — PostHog deduplicates per session)
      if (recording.status === 'READY' && recording.notes.length > 0) {
        captureServerEvent(ctx.userId, 'note_viewed', {
          recording_id: recording.id,
          has_action_items: recording.notes[0]?.actionItems.length > 0,
        })
      }

      // Expose note as a top-level singular field so both web and mobile clients
      // can access recording.note directly without indexing into the notes array.
      return {
        ...recording,
        note: recording.notes[0] ?? null,
      }
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
      const recording = await ctx.db.recording.findFirst({
        where: { id: input.recordingId, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!recording) throw new TRPCError({ code: 'NOT_FOUND' })

      const key = generateRecordingKey(ctx.orgId, input.recordingId, input.extension)
      const url = await getSignedUploadUrl(key, input.contentType)

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

      // PostHog: track recording upload (fire-and-forget)
      captureServerEvent(ctx.userId, 'recording_uploaded', {
        recording_id: recording.id,
        source: recording.source,
        file_size: input.fileSize,
        mime_type: input.mimeType,
        org_id: ctx.orgId,
      })

      return { success: true }
    }),

  // ── Search recordings by title or transcript text (ILIKE) ─────────────────
  search: orgProcedure
    .input(z.object({ query: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.recording.findMany({
        where: {
          orgId: ctx.orgId,
          OR: [
            { title: { contains: input.query, mode: 'insensitive' } },
            { transcript: { text: { contains: input.query, mode: 'insensitive' } } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          title: true,
          status: true,
          duration: true,
          createdAt: true,
          _count: { select: { notes: true } },
        },
      })
    }),

  // ── Paginated transcript segments for "load more" ─────────────────────────
  listTranscriptSegments: orgProcedure
    .input(
      z.object({
        transcriptId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(200).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify the transcript belongs to this org before returning segments.
      const transcript = await ctx.db.transcript.findFirst({
        where: { id: input.transcriptId, recording: { orgId: ctx.orgId } },
        select: { id: true },
      })
      if (!transcript) throw new TRPCError({ code: 'NOT_FOUND' })

      const segments = await ctx.db.transcriptSegment.findMany({
        where: { transcriptId: input.transcriptId },
        orderBy: { startTime: 'asc' },
        take: input.limit + 1,
        select: { id: true, startTime: true, endTime: true, speaker: true, text: true },
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
      })

      let nextCursor: string | undefined
      if (segments.length > input.limit) {
        nextCursor = segments.pop()!.id
      }

      return { segments, nextCursor }
    }),

  // ── Update a note section's content (inline editing) ─────────────────────
  updateNoteSection: orgProcedure
    .input(z.object({ id: z.string(), content: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const section = await ctx.db.noteSection.findFirst({
        where: { id: input.id, note: { orgId: ctx.orgId } },
        select: { id: true },
      })
      if (!section) throw new TRPCError({ code: 'NOT_FOUND' })

      return ctx.db.noteSection.update({
        where: { id: input.id },
        data: { content: input.content },
        select: { id: true, content: true },
      })
    }),

  // ── Update an action item's status and/or priority ─────────────────────────
  updateActionItem: orgProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.nativeEnum(ActionItemStatus).optional(),
        priority: z.nativeEnum(Priority).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.actionItem.findFirst({
        where: { id: input.id, orgId: ctx.orgId },
        select: { id: true, noteId: true },
      })
      if (!item) throw new TRPCError({ code: 'NOT_FOUND' })

      const updated = await ctx.db.actionItem.update({
        where: { id: input.id },
        data: {
          ...(input.status !== undefined && { status: input.status }),
          ...(input.priority !== undefined && { priority: input.priority }),
        },
        select: { id: true, status: true, priority: true },
      })

      // PostHog: track action item completion (fire-and-forget)
      if (input.status === ActionItemStatus.COMPLETED) {
        captureServerEvent(ctx.userId, 'action_item_completed', {
          action_item_id: input.id,
          org_id: ctx.orgId,
        })
      }

      return updated
    }),

  // ── List speaker labels for a recording ───────────────────────────────────
  listSpeakerLabels: orgProcedure
    .input(z.object({ recordingId: z.string() }))
    .query(async ({ ctx, input }) => {
      const recording = await ctx.db.recording.findFirst({
        where: { id: input.recordingId, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!recording) throw new TRPCError({ code: 'NOT_FOUND' })

      return ctx.db.speakerLabel.findMany({
        where: { recordingId: input.recordingId },
        select: { id: true, speakerId: true, displayName: true },
        orderBy: { speakerId: 'asc' },
      })
    }),

  // ── Update (rename) a speaker label ───────────────────────────────────────
  updateSpeakerLabel: orgProcedure
    .input(
      z.object({
        recordingId: z.string(),
        speakerId: z.string(),
        displayName: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const recording = await ctx.db.recording.findFirst({
        where: { id: input.recordingId, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!recording) throw new TRPCError({ code: 'NOT_FOUND' })

      // findFirst + update (no upsert — HTTP mode)
      const existing = await ctx.db.speakerLabel.findFirst({
        where: { recordingId: input.recordingId, speakerId: input.speakerId },
        select: { id: true },
      })
      if (existing) {
        return ctx.db.speakerLabel.update({
          where: { id: existing.id },
          data: { displayName: input.displayName },
          select: { id: true, speakerId: true, displayName: true },
        })
      }
      try {
        return ctx.db.speakerLabel.create({
          data: {
            recordingId: input.recordingId,
            speakerId: input.speakerId,
            displayName: input.displayName,
          },
          select: { id: true, speakerId: true, displayName: true },
        })
      } catch {
        // Race condition — read back
        const row = await ctx.db.speakerLabel.findFirst({
          where: { recordingId: input.recordingId, speakerId: input.speakerId },
          select: { id: true, speakerId: true, displayName: true },
        })
        if (!row) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' })
        return row
      }
    }),

  // ── Bulk rename speakers ──────────────────────────────────────────────────
  // Accepts [{from, to}] pairs. Updates every TranscriptSegment whose speaker
  // matches `from` to the new display name, and upserts a SpeakerLabel row
  // for each mapping so clients can still resolve the original SPEAKER_N id.
  nameSpeakers: orgProcedure
    .input(
      z.object({
        recordingId: z.string(),
        speakerMappings: z
          .array(
            z.object({
              from: z.string().min(1).max(100),
              to: z.string().min(1).max(100),
            })
          )
          .min(1)
          .max(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const recording = await ctx.db.recording.findFirst({
        where: { id: input.recordingId, orgId: ctx.orgId },
        select: { id: true, transcript: { select: { id: true } } },
      })
      if (!recording) throw new TRPCError({ code: 'NOT_FOUND' })

      const transcriptId = recording.transcript?.id
      let segmentsUpdated = 0

      for (const { from, to } of input.speakerMappings) {
        const trimmedFrom = from.trim()
        const trimmedTo = to.trim()
        if (!trimmedFrom || !trimmedTo || trimmedFrom === trimmedTo) continue

        // Update all TranscriptSegment rows for this transcript where speaker matches.
        // HTTP mode has no updateMany — loop one-by-one.
        if (transcriptId) {
          const matching = await ctx.db.transcriptSegment.findMany({
            where: { transcriptId, speaker: trimmedFrom },
            select: { id: true },
          })
          for (const seg of matching) {
            await ctx.db.transcriptSegment.update({
              where: { id: seg.id },
              data: { speaker: trimmedTo },
            })
          }
          segmentsUpdated += matching.length
        }

        // Upsert SpeakerLabel (findFirst + create/update — no upsert in HTTP mode).
        const existing = await ctx.db.speakerLabel.findFirst({
          where: { recordingId: input.recordingId, speakerId: trimmedFrom },
          select: { id: true },
        })
        if (existing) {
          await ctx.db.speakerLabel.update({
            where: { id: existing.id },
            data: { displayName: trimmedTo },
          })
        } else {
          try {
            await ctx.db.speakerLabel.create({
              data: {
                recordingId: input.recordingId,
                speakerId: trimmedFrom,
                displayName: trimmedTo,
              },
            })
          } catch {
            // Race condition — already created concurrently.
          }
        }
      }

      return { success: true, segmentsUpdated }
    }),

  // ── Re-transcribe ────────────────────────────────────────────────────────
  // Wipes existing transcript + segments + speaker labels and re-enqueues the
  // transcription job. The original S3 audio is normally deleted after the
  // first transcription (privacy-by-design), so this only succeeds when the
  // audio is still available (early retry, failed diarization, etc.).
  retranscribe: orgProcedure
    .input(
      z.object({
        recordingId: z.string(),
        language: z.string().min(2).max(10).default('en'),
        quality: z.enum(['standard', 'high']).default('standard'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const recording = await ctx.db.recording.findFirst({
        where: { id: input.recordingId, orgId: ctx.orgId },
        select: { id: true, s3Key: true, transcript: { select: { id: true } } },
      })
      if (!recording) throw new TRPCError({ code: 'NOT_FOUND' })
      if (!recording.s3Key) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'No S3 key on record. Re-transcribe requires the original audio to still be available.',
        })
      }

      // Delete existing transcript data. HTTP mode has no batch deletes — loop
      // segments individually, then the transcript (FK cascade would handle the
      // segments, but explicit deletion avoids surprises on future schema edits).
      if (recording.transcript) {
        const segs = await ctx.db.transcriptSegment.findMany({
          where: { transcriptId: recording.transcript.id },
          select: { id: true },
        })
        for (const s of segs) {
          await ctx.db.transcriptSegment.delete({ where: { id: s.id } })
        }
        await ctx.db.transcript.delete({ where: { id: recording.transcript.id } })
      }

      const labels = await ctx.db.speakerLabel.findMany({
        where: { recordingId: input.recordingId },
        select: { id: true },
      })
      for (const l of labels) {
        await ctx.db.speakerLabel.delete({ where: { id: l.id } })
      }

      // Reset status and enqueue.
      await ctx.db.recording.update({
        where: { id: input.recordingId },
        data: { status: RecordingStatus.PENDING },
      })

      await transcriptionQueue.add('transcribe', {
        recordingId: input.recordingId,
        orgId: ctx.orgId,
        s3Key: recording.s3Key,
        language: input.language,
        quality: input.quality,
      })

      captureServerEvent(ctx.userId, 'recording_retranscribed', {
        recording_id: input.recordingId,
        language: input.language,
        quality: input.quality,
      })

      return { success: true }
    }),

  // ── Preview how many occurrences find/replace would hit ──────────────────
  previewFindReplace: orgProcedure
    .input(
      z.object({
        recordingId: z.string(),
        find: z.string().min(1).max(500),
        wholeWord: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const recording = await ctx.db.recording.findFirst({
        where: { id: input.recordingId, orgId: ctx.orgId },
        select: { transcript: { select: { id: true } } },
      })
      if (!recording?.transcript) {
        return { occurrences: 0, segments: 0 }
      }
      const segments = await ctx.db.transcriptSegment.findMany({
        where: { transcriptId: recording.transcript.id },
        select: { text: true },
      })
      const re = buildFindRegex(input.find, input.wholeWord)
      let occurrences = 0
      let matchingSegments = 0
      for (const { text } of segments) {
        const m = text.match(re)
        if (m && m.length > 0) {
          occurrences += m.length
          matchingSegments += 1
        }
      }
      return { occurrences, segments: matchingSegments }
    }),

  // ── Find & Replace across the transcript ─────────────────────────────────
  findReplaceTranscript: orgProcedure
    .input(
      z.object({
        recordingId: z.string(),
        find: z.string().min(1).max(500),
        replace: z.string().max(500),
        wholeWord: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const recording = await ctx.db.recording.findFirst({
        where: { id: input.recordingId, orgId: ctx.orgId },
        select: { transcript: { select: { id: true, text: true } } },
      })
      if (!recording?.transcript) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Transcript not available for this recording.',
        })
      }

      const re = buildFindRegex(input.find, input.wholeWord)

      // Update the full-text field on the Transcript first.
      const newText = recording.transcript.text.replace(re, input.replace)
      await ctx.db.transcript.update({
        where: { id: recording.transcript.id },
        data: { text: newText },
      })

      // Then update each matching segment. No updateMany in HTTP mode.
      const segments = await ctx.db.transcriptSegment.findMany({
        where: { transcriptId: recording.transcript.id },
        select: { id: true, text: true },
      })

      let updatedSegments = 0
      let totalOccurrences = 0
      for (const seg of segments) {
        const matches = seg.text.match(re)
        if (!matches || matches.length === 0) continue
        const replaced = seg.text.replace(re, input.replace)
        await ctx.db.transcriptSegment.update({
          where: { id: seg.id },
          data: { text: replaced },
        })
        updatedSegments += 1
        totalOccurrences += matches.length
      }

      return {
        success: true,
        segmentsUpdated: updatedSegments,
        occurrences: totalOccurrences,
      }
    }),

  // ── Regenerate notes with a different template ────────────────────────────
  // Re-enqueues the summarization job with the selected templateId. The
  // existing worker creates a new Note row; the UI always shows the latest.
  regenerateWithTemplate: orgProcedure
    .input(
      z.object({
        recordingId: z.string(),
        templateId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const recording = await ctx.db.recording.findFirst({
        where: { id: input.recordingId, orgId: ctx.orgId },
        select: { transcript: { select: { id: true } } },
      })
      if (!recording?.transcript) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Recording has no transcript yet. Wait for transcription to finish.',
        })
      }

      const template = await ctx.db.noteTemplate.findFirst({
        where: {
          id: input.templateId,
          OR: [{ orgId: null }, { orgId: ctx.orgId }],
        },
        select: { id: true },
      })
      if (!template) throw new TRPCError({ code: 'NOT_FOUND', message: 'Template not found.' })

      await ctx.db.recording.update({
        where: { id: input.recordingId },
        data: { status: RecordingStatus.SUMMARIZING },
      })

      await summarizationQueue.add('summarize', {
        recordingId: input.recordingId,
        transcriptId: recording.transcript.id,
        templateId: template.id,
      })

      captureServerEvent(ctx.userId, 'notes_regenerated', {
        recording_id: input.recordingId,
        template_id: template.id,
      })

      return { success: true }
    }),

  // ── TODO: Ask AI query ────────────────────────────────────────────────────
  // When implemented, add PostHog tracking:
  //   captureServerEvent(ctx.userId, 'ask_ai_query', {
  //     has_recording_id: !!input.recordingId,
  //     query_length: input.query.length,
  //   })

  // ── TODO: Calendar connected ──────────────────────────────────────────────
  // When calendar OAuth is implemented:
  //   captureServerEvent(ctx.userId, 'calendar_connected', { provider: 'google' | 'outlook' })

  // ── TODO: Integration connected ───────────────────────────────────────────
  // When Slack/Notion settings are implemented:
  //   captureServerEvent(ctx.userId, 'integration_connected', { type: 'slack' | 'notion' })
})

// Build a case-insensitive regex from a user-supplied find string. All special
// regex metacharacters are escaped so the user can search for literal text.
// When `wholeWord` is true the match is bounded by \b so "bat" doesn't match
// "battle".
function buildFindRegex(find: string, wholeWord: boolean): RegExp {
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped
  return new RegExp(pattern, 'gi')
}
