// Kolasys AI — Transcription BullMQ worker
// Run this process separately: `tsx src/workers/transcription.worker.ts`
//
// PrismaNeonHttp (HTTP mode) does NOT support transactions of any kind.
// Every Prisma call here must be a single-model point operation:
//   findFirst / findUnique / create / update / delete — NO batch ops, NO nested writes.

import 'dotenv/config'
import * as Sentry from '@sentry/nextjs'

// Initialise Sentry before importing any other modules.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  // Tag all worker errors so they're easy to filter in Sentry
  initialScope: { tags: { worker: 'transcription' } },
})

import { Worker, type Job } from 'bullmq'
import { bullmqConnection } from '@/lib/redis'
import { db } from '@/lib/db'
import { getSignedDownloadUrl, deleteFromS3 } from '@/lib/storage'
import { transcribeAudio } from '@/services/transcription.service'
import { diarizeAudio, mapSpeakersToSegments } from '@/services/diarization.service'
import { summarizationQueue, type TranscriptionJobData } from '@/lib/queues'
import { JobStatus, RecordingStatus } from '@/generated/prisma/client'

async function processTranscription(job: Job<TranscriptionJobData>) {
  const { recordingId, s3Key, language, quality } = job.data

  console.log(
    `[transcription] Starting job ${job.id} for recording ${recordingId}` +
      (language ? ` (lang=${language})` : '') +
      (quality ? ` (quality=${quality})` : '')
  )

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
  const result = await transcribeAudio(audioBuffer, filename, {
    language,
    quality,
  })

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

  // ── Speaker diarization (optional — requires DEEPGRAM_API_KEY) ───────────
  // Run BEFORE deleting the audio buffer. Deepgram needs the audio to identify speakers.
  if (process.env.DEEPGRAM_API_KEY && transcript) {
    try {
      console.log(`[transcription] Running Deepgram diarization for ${recordingId}`)
      const mimeType = result.segments[0] ? 'audio/webm' : 'audio/mpeg'
      const speakerWords = await diarizeAudio(audioBuffer, mimeType)

      if (speakerWords.length > 0) {
        // Re-fetch segments with IDs so we can update them
        const savedSegments = await db.transcriptSegment.findMany({
          where: { transcriptId: transcript.id },
          select: { id: true, startTime: true, endTime: true },
          orderBy: { startTime: 'asc' },
        })

        const speakerAssignments = mapSpeakersToSegments(savedSegments, speakerWords)
        const uniqueSpeakers = new Set<number>()

        for (let i = 0; i < savedSegments.length; i++) {
          const speaker = speakerAssignments[i]
          if (speaker !== null && speaker !== undefined) {
            uniqueSpeakers.add(speaker)
            await db.transcriptSegment.update({
              where: { id: savedSegments[i].id },
              data: { speaker: `SPEAKER_${speaker}` },
            })
          }
        }

        // Create SpeakerLabel entries for each detected speaker
        for (const speakerNum of uniqueSpeakers) {
          const speakerId = `SPEAKER_${speakerNum}`
          const existing = await db.speakerLabel.findFirst({
            where: { recordingId, speakerId },
            select: { id: true },
          })
          if (!existing) {
            try {
              await db.speakerLabel.create({
                data: {
                  recordingId,
                  speakerId,
                  displayName: `Speaker ${speakerNum + 1}`,
                },
              })
            } catch {
              // Race condition — fine
            }
          }
        }

        console.log(
          `[transcription] Diarization complete: ${uniqueSpeakers.size} speaker(s) detected`
        )
      }
    } catch (diarErr) {
      // Diarization is non-fatal — transcript is already saved without speakers
      console.error(`[transcription] Diarization failed (non-fatal):`, diarErr)
      Sentry.captureException(diarErr, {
        tags: { worker: 'transcription', phase: 'diarization' },
        extra: { recordingId },
      })
    }
  }

  // Audio retention — the org chooses whether to keep the audio file or purge
  // it after transcription. Default is keep (Organization.deleteAudioAfterTranscription
  // defaults to false), which enables playback + re-transcribe in the UI.
  // Orgs that need the stricter privacy posture can flip the toggle in settings.
  const org = await db.recording
    .findUnique({
      where: { id: recordingId },
      select: { org: { select: { deleteAudioAfterTranscription: true } } },
    })
    .then((r) => r?.org ?? null)

  if (org?.deleteAudioAfterTranscription) {
    try {
      await deleteFromS3(s3Key)
      console.log(`[transcription] Deleted S3 audio for ${recordingId} (retention OFF)`)
    } catch (err) {
      // Log but don't fail the job — transcript is already saved.
      console.error(`[transcription] Failed to delete S3 object ${s3Key}:`, err)
      Sentry.captureException(err, {
        tags: { worker: 'transcription', phase: 's3_delete' },
        extra: { recordingId, s3Key },
      })
    }
  } else {
    console.log(`[transcription] Keeping S3 audio for ${recordingId} (retention ON)`)
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

  // Report to Sentry with full context
  Sentry.captureException(err, {
    tags: { worker: 'transcription' },
    extra: {
      jobId: job.id,
      recordingId: job.data.recordingId,
      attempt: job.attemptsMade,
    },
  })

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
worker.on('error', (err) => {
  console.error('[transcription] Worker error:', err)
  Sentry.captureException(err, { tags: { worker: 'transcription', phase: 'worker_error' } })
})

console.log('[transcription] Worker started')

// Graceful shutdown
process.on('SIGTERM', async () => {
  await worker.close()
  process.exit(0)
})
