// Kolasys AI — Transcription BullMQ worker
// Run this process separately: `tsx src/workers/transcription.worker.ts`
//
// PrismaNeonHttp (HTTP mode) does NOT support transactions of any kind.
// Every Prisma call here must be a single-model point operation:
//   findFirst / findUnique / create / update / delete — NO batch ops, NO nested writes.

import { Worker, type Job } from 'bullmq'
import { bullmqConnection } from '@/lib/redis'
import { db } from '@/lib/db'
import { getSignedDownloadUrl } from '@/lib/storage'
import { transcribeAudio } from '@/services/transcription.service'
import { summarizationQueue, type TranscriptionJobData } from '@/lib/queues'
import { JobStatus, RecordingStatus } from '@/generated/prisma/client'

async function processTranscription(job: Job<TranscriptionJobData>) {
  const { recordingId, orgId, s3Key } = job.data

  console.log(`[transcription] Starting job ${job.id} for recording ${recordingId}`)

  // Mark job as in-progress.
  // updateMany uses transactions internally — use findFirst + update instead.
  const queuedJob = await db.processingJob.findFirst({
    where: { recordingId, type: 'TRANSCRIPTION', status: 'QUEUED' },
    select: { id: true, attempts: true },
  })
  if (queuedJob) {
    await db.processingJob.update({
      where: { id: queuedJob.id },
      data: {
        status: JobStatus.PROCESSING,
        startedAt: new Date(),
        attempts: queuedJob.attempts + 1,
      },
    })
  }

  // Mark recording as actively transcribing so the UI can show granular status.
  await db.recording.update({
    where: { id: recordingId },
    data: { status: RecordingStatus.TRANSCRIBING },
  })

  // Download audio from S3.
  const downloadUrl = await getSignedDownloadUrl(s3Key)
  const audioRes = await fetch(downloadUrl)
  if (!audioRes.ok) throw new Error(`Failed to download audio: ${audioRes.status}`)
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer())

  const filename = s3Key.split('/').pop() ?? 'audio.mp3'

  // Transcribe.
  const result = await transcribeAudio(audioBuffer, filename)

  // Persist transcript — guard against retries (Transcript.recordingId is unique).
  let transcript = await db.transcript.findUnique({
    where: { recordingId },
    select: { id: true },
  })

  if (!transcript) {
    transcript = await db.transcript.create({
      data: {
        recordingId,
        text: result.text,
        language: result.language,
      },
    })

    // Individual creates — no createMany, no batch ops, no transactions.
    for (const seg of result.segments) {
      await db.transcriptSegment.create({
        data: {
          transcriptId: transcript.id,
          text: seg.text,
          startTime: seg.startTime,
          endTime: seg.endTime,
          confidence: seg.confidence,
          speaker: seg.speaker,
        },
      })
    }
  }

  // Update recording duration if available.
  if (result.duration) {
    await db.recording.update({
      where: { id: recordingId },
      data: { duration: Math.round(result.duration) },
    })
  }

  // Mark transcription job complete.
  // updateMany uses transactions internally — use findFirst + update instead.
  const processingJob = await db.processingJob.findFirst({
    where: { recordingId, type: 'TRANSCRIPTION', status: 'PROCESSING' },
    select: { id: true },
  })
  if (processingJob) {
    await db.processingJob.update({
      where: { id: processingJob.id },
      data: {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
        result: { transcriptId: transcript.id, segments: result.segments.length },
      },
    })
  }

  // Mark recording as moving into summarization phase.
  await db.recording.update({
    where: { id: recordingId },
    data: { status: RecordingStatus.SUMMARIZING },
  })

  // Enqueue summarization.
  await summarizationQueue.add('summarize', {
    recordingId,
    transcriptId: transcript.id,
  })

  console.log(`[transcription] Completed job ${job.id}. Transcript: ${transcript.id}`)
}

async function handleFailure(job: Job<TranscriptionJobData> | undefined, err: Error) {
  if (!job) return
  console.error(`[transcription] Job ${job.id} failed:`, err.message)

  // updateMany uses transactions internally — use findFirst + update instead.
  const failedJob = await db.processingJob.findFirst({
    where: { recordingId: job.data.recordingId, type: 'TRANSCRIPTION', status: 'PROCESSING' },
    select: { id: true },
  })
  if (failedJob) {
    await db.processingJob.update({
      where: { id: failedJob.id },
      data: {
        status: JobStatus.FAILED,
        error: err.message,
        completedAt: new Date(),
      },
    })
  }

  await db.recording.update({
    where: { id: job.data.recordingId },
    data: { status: RecordingStatus.FAILED },
  })
}

const worker = new Worker<TranscriptionJobData>(
  'transcription',
  processTranscription,
  {
    connection: bullmqConnection,
    concurrency: 3,
  }
)

worker.on('failed', handleFailure)
worker.on('error', (err) => console.error('[transcription] Worker error:', err))

console.log('[transcription] Worker started')

// Graceful shutdown
process.on('SIGTERM', async () => {
  await worker.close()
  process.exit(0)
})
