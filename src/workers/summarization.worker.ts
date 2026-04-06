// Kolasys AI — Summarization BullMQ worker
// Run this process separately: `tsx src/workers/summarization.worker.ts`

import { Worker, type Job } from 'bullmq'
import { bullmqConnection } from '@/lib/redis'
import { db } from '@/lib/db'
import {
  summarizeTranscript,
  extractActionItems,
  type SectionDefinition,
} from '@/services/summarization.service'
import { type SummarizationJobData } from '@/lib/queues'
import { JobStatus, Priority, RecordingStatus } from '@/generated/prisma/client'

// ─── Priority mapping ────────────────────────────────────────────────────────
// Claude returns string literals; map to the Prisma enum.

const PRIORITY_MAP: Record<string, Priority> = {
  LOW: Priority.LOW,
  MEDIUM: Priority.MEDIUM,
  HIGH: Priority.HIGH,
  URGENT: Priority.URGENT,
}

function toPriority(raw: string | undefined): Priority {
  if (!raw) return Priority.MEDIUM
  return PRIORITY_MAP[raw.toUpperCase()] ?? Priority.MEDIUM
}

// ─── Main processor ──────────────────────────────────────────────────────────

async function processSummarization(job: Job<SummarizationJobData>) {
  const { recordingId, transcriptId, templateId } = job.data

  console.log(`[summarization] Starting job ${job.id} for recording ${recordingId}`)

  // ── 1. Upsert a ProcessingJob row so we have an audit trail ───────────────
  await db.processingJob.upsert({
    where: {
      // There may or may not be an existing SUMMARIZATION job row.
      // Use a deterministic synthetic key: recordingId + type.
      // Prisma upsert needs a unique field; fall back to create-only pattern.
      id: `${recordingId}-SUMMARIZATION`,
    },
    create: {
      id: `${recordingId}-SUMMARIZATION`,
      recordingId,
      type: 'SUMMARIZATION',
      status: JobStatus.PROCESSING,
      startedAt: new Date(),
      attempts: 1,
    },
    update: {
      status: JobStatus.PROCESSING,
      startedAt: new Date(),
      attempts: { increment: 1 },
      error: null,
    },
  })

  // ── 2. Fetch transcript ───────────────────────────────────────────────────
  console.log(`[summarization] Fetching transcript ${transcriptId}`)

  const transcript = await db.transcript.findUnique({
    where: { id: transcriptId },
    select: { text: true, recordingId: true },
  })

  if (!transcript) {
    throw new Error(`Transcript ${transcriptId} not found`)
  }

  // ── 3. Fetch recording (for title, orgId, userId) ─────────────────────────
  const recording = await db.recording.findUnique({
    where: { id: recordingId },
    select: { id: true, title: true, orgId: true, userId: true },
  })

  if (!recording) {
    throw new Error(`Recording ${recordingId} not found`)
  }

  // ── 4. Resolve template sections ──────────────────────────────────────────
  let sections: SectionDefinition[] | undefined

  if (templateId) {
    const template = await db.noteTemplate.findUnique({
      where: { id: templateId },
      select: { structure: true },
    })

    if (template?.structure) {
      sections = template.structure as SectionDefinition[]
    }
  }

  // ── 5. Summarise + extract action items in parallel ───────────────────────
  console.log(
    `[summarization] Calling Claude for summary and action items (${transcript.text.length} chars)`
  )

  const [summaryResult, rawActionItems] = await Promise.all([
    summarizeTranscript(transcript.text, sections, recording.title),
    extractActionItems(transcript.text, recording.title),
  ])

  console.log(
    `[summarization] Claude returned ${summaryResult.sections.length} sections, ` +
      `${rawActionItems.length} action items`
  )

  // ── 6. Persist Note + NoteSections + ActionItems in one transaction ────────
  const note = await db.$transaction(async (tx) => {
    const createdNote = await tx.note.create({
      data: {
        recordingId,
        orgId: recording.orgId,
        userId: recording.userId,
        title: recording.title,
        summary: summaryResult.summary,
        templateId: templateId ?? null,
      },
    })

    if (summaryResult.sections.length > 0) {
      await tx.noteSection.createMany({
        data: summaryResult.sections.map((s) => ({
          noteId: createdNote.id,
          title: s.title,
          content: s.content,
          order: s.order,
        })),
      })
    }

    if (rawActionItems.length > 0) {
      await tx.actionItem.createMany({
        data: rawActionItems.map((item) => ({
          noteId: createdNote.id,
          orgId: recording.orgId,
          title: item.title,
          description: item.description ?? null,
          assignee: null, // names from transcript can't be mapped to Clerk IDs here
          priority: toPriority(item.priority),
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
        })),
      })
    }

    return createdNote
  })

  console.log(
    `[summarization] Saved note ${note.id} with ` +
      `${summaryResult.sections.length} sections and ${rawActionItems.length} action items`
  )

  // ── 7. Mark recording as READY ────────────────────────────────────────────
  await db.recording.update({
    where: { id: recordingId },
    data: { status: RecordingStatus.READY },
  })

  // ── 8. Mark summarization job as COMPLETED ────────────────────────────────
  await db.processingJob.update({
    where: { id: `${recordingId}-SUMMARIZATION` },
    data: {
      status: JobStatus.COMPLETED,
      completedAt: new Date(),
      result: {
        noteId: note.id,
        sections: summaryResult.sections.length,
        actionItems: rawActionItems.length,
      },
    },
  })

  console.log(`[summarization] Completed job ${job.id}. Note: ${note.id}`)
}

// ─── Failure handler ─────────────────────────────────────────────────────────

async function handleFailure(
  job: Job<SummarizationJobData> | undefined,
  err: Error
) {
  if (!job) return

  console.error(
    `[summarization] Job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts ?? 3}):`,
    err.message
  )

  // Only mark the recording as FAILED on the final attempt so transient
  // errors (rate limits, network blips) get a chance to retry first.
  const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 3)

  try {
    await db.processingJob.update({
      where: { id: `${job.data.recordingId}-SUMMARIZATION` },
      data: {
        status: isFinalAttempt ? JobStatus.FAILED : JobStatus.QUEUED,
        error: err.message,
        completedAt: isFinalAttempt ? new Date() : null,
      },
    })

    if (isFinalAttempt) {
      await db.recording.update({
        where: { id: job.data.recordingId },
        data: { status: RecordingStatus.FAILED },
      })
      console.error(
        `[summarization] Recording ${job.data.recordingId} marked FAILED after all retries exhausted`
      )
    }
  } catch (dbErr) {
    console.error('[summarization] Failed to update DB on job failure:', dbErr)
  }
}

// ─── Worker ──────────────────────────────────────────────────────────────────

const worker = new Worker<SummarizationJobData>(
  'summarization',
  processSummarization,
  {
    connection: bullmqConnection,
    concurrency: 2, // Claude is slower than Whisper; keep concurrency lower
  }
)

worker.on('failed', handleFailure)
worker.on('error', (err) => console.error('[summarization] Worker error:', err))

console.log('[summarization] Worker started')

// ─── Graceful shutdown ───────────────────────────────────────────────────────

process.on('SIGTERM', async () => {
  console.log('[summarization] SIGTERM received — draining and closing worker')
  await worker.close()
  process.exit(0)
})
