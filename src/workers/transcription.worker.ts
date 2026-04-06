// Kolasys AI — Transcription BullMQ worker
// Run this process separately: `tsx src/workers/transcription.worker.ts`

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
  await db.processingJob.updateMany({
    where: { recordingId, type: 'TRANSCRIPTION', status: 'QUEUED' },
    data: { status: JobStatus.PROCESSING, startedAt: new Date(), attempts: { increment: 1 } },
  })

  // Download audio from S3.
  const downloadUrl = await getSignedDownloadUrl(s3Key)
  const audioRes = await fetch(downloadUrl)
  if (!audioRes.ok) throw new Error(`Failed to download audio: ${audioRes.status}`)
  const audioBuffer = Buffer.from(await audioRes.arrayBuffer())

  const filename = s3Key.split('/').pop() ?? 'audio.mp3'

  // Transcribe.
  const result = await transcribeAudio(audioBuffer, filename)

  // Persist transcript + segments in a transaction.
  const transcript = await db.$transaction(async (tx) => {
    const t = await tx.transcript.create({
      data: {
        recordingId,
        text: result.text,
        language: result.language,
      },
    })

    if (result.segments.length > 0) {
      await tx.transcriptSegment.createMany({
        data: result.segments.map((seg) => ({
          transcriptId: t.id,
          text: seg.text,
          startTime: seg.startTime,
          endTime: seg.endTime,
          confidence: seg.confidence,
          speaker: seg.speaker,
        })),
      })
    }

    return t
  })

  // Update recording duration if available.
  if (result.duration) {
    await db.recording.update({
      where: { id: recordingId },
      data: { duration: Math.round(result.duration) },
    })
  }

  // Mark transcription job complete.
  await db.processingJob.updateMany({
    where: { recordingId, type: 'TRANSCRIPTION', status: 'PROCESSING' },
    data: {
      status: JobStatus.COMPLETED,
      completedAt: new Date(),
      result: { transcriptId: transcript.id, segments: result.segments.length },
    },
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

  await db.processingJob.updateMany({
    where: { recordingId: job.data.recordingId, type: 'TRANSCRIPTION', status: 'PROCESSING' },
    data: {
      status: JobStatus.FAILED,
      error: err.message,
      completedAt: new Date(),
    },
  })

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
