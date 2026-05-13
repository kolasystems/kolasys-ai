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
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import ffmpegPath from 'ffmpeg-static'
import { bullmqConnection } from '@/lib/redis'
import { db } from '@/lib/db'
import { getSignedDownloadUrl, deleteFromS3 } from '@/lib/storage'
import { transcribeAudio } from '@/services/transcription.service'
import { diarizeAudio, mapSpeakersToSegments } from '@/services/diarization.service'
import { summarizationQueue, type TranscriptionJobData } from '@/lib/queues'
import { JobStatus, RecordingStatus } from '@/generated/prisma/client'

// OpenAI Whisper's upload cap is 25 MiB (26214400 bytes). Stay a hair under
// to absorb HTTP form overhead.
const MAX_WHISPER_BYTES = 24 * 1024 * 1024
import type { BotIngestionJobData } from '@/lib/queues'
import { ingestBotMedia } from '@/services/bot-ingest.service'

/**
 * Map an S3 key's file extension to the right Content-Type for Deepgram.
 * The bytes are unchanged — this only affects the HTTP header so Deepgram
 * routes to the right decoder. Unknown extensions fall back to mp4 since
 * that's the safest cross-platform default.
 */
function mimeFromS3Key(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'webm': return 'audio/webm'
    case 'mp3':  return 'audio/mpeg'
    case 'wav':  return 'audio/wav'
    case 'ogg':  return 'audio/ogg'
    case 'm4a':
    case 'mp4':  return 'audio/mp4'
    default:     return 'audio/mp4'
  }
}

/**
 * Re-encode the source audio to mono 64 kbps 16 kHz MP3 so Whisper's 25
 * MiB upload cap stops biting. ffmpeg-static ships a platform-specific
 * binary, so no system ffmpeg is required on Railway.
 *
 * Uses execFileSync (no shell) with an args array to avoid any quoting
 * issues on the file paths. Temp files are cleaned in a finally block.
 */
async function reencodeForWhisper(
  source: Buffer,
  recordingId: string,
  s3Key: string,
): Promise<Buffer> {
  if (!ffmpegPath) {
    throw new Error(
      'ffmpeg-static did not resolve a binary path for this platform',
    )
  }
  const ext = (s3Key.split('.').pop() ?? 'bin').toLowerCase()
  const tmpDir = os.tmpdir()
  const tmpIn = path.join(tmpDir, `kolasys-${recordingId}-in.${ext}`)
  const tmpOut = path.join(tmpDir, `kolasys-${recordingId}-out.mp3`)

  try {
    fs.writeFileSync(tmpIn, source)
    execFileSync(
      ffmpegPath,
      [
        '-y',           // overwrite output if it exists
        '-i', tmpIn,
        '-ac', '1',     // mono
        '-ar', '16000', // 16 kHz — Whisper's native sample rate
        '-b:a', '64k',
        tmpOut,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const out = fs.readFileSync(tmpOut)
    console.log(
      `[transcription] re-encoded ${source.length} → ${out.length} bytes for ${recordingId}`,
    )
    return out
  } finally {
    for (const p of [tmpIn, tmpOut]) {
      try { fs.unlinkSync(p) } catch {/* not all may exist on failure */}
    }
  }
}

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
  const originalBuffer = Buffer.from(await audioRes.arrayBuffer())

  // Whisper rejects uploads >25 MiB with a 413. Re-encode large files to a
  // mono 64 kbps 16 kHz MP3 before sending — perfectly fine for speech and
  // typically 1/5 to 1/10 the size of the source. Deepgram (diarization
  // below) sees the same re-encoded buffer for consistency.
  // Buffer<ArrayBufferLike> vs Buffer<ArrayBuffer> — pin the type so the
  // assignment from `reencodeForWhisper` (which reads from fs) doesn't
  // narrow the variance.
  let audioBuffer: Buffer<ArrayBufferLike> = originalBuffer
  let filename = s3Key.split('/').pop() ?? 'audio.mp3'
  let diarizationMimeType = mimeFromS3Key(s3Key)

  if (originalBuffer.length > MAX_WHISPER_BYTES) {
    audioBuffer = await reencodeForWhisper(originalBuffer, recordingId, s3Key)
    filename = `${recordingId}.mp3`
    diarizationMimeType = 'audio/mpeg'
  }

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
          // Persist word timings as JSON for click-to-seek in the UI.
          wordsJson:
            seg.words && seg.words.length > 0
              ? JSON.stringify(seg.words)
              : null,
        },
      })
    }
  }

  // ── Speaker diarization (optional — requires DEEPGRAM_API_KEY) ───────────
  // Run BEFORE deleting the audio buffer. Deepgram needs the audio to identify speakers.
  if (process.env.DEEPGRAM_API_KEY && transcript) {
    try {
      console.log(`[transcription] Running Deepgram diarization for ${recordingId}`)
      // Use the same content type we sent to Whisper — when the source
      // was re-encoded the buffer is mp3 regardless of what s3Key says.
      const speakerWords = await diarizeAudio(audioBuffer, diarizationMimeType)

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

// ─── Health check / heartbeat ───────────────────────────────────────────────
// Railway doesn't expose an HTTP health check for worker-style services, so we
// log every 60s instead. Counters are kept in-process (reset on restart).

let jobsProcessed = 0
let lastJobId: string | null = null

worker.on('completed', (job) => {
  jobsProcessed += 1
  lastJobId = String(job.id)
})

const heartbeatInterval = setInterval(() => {
  console.log(
    `[transcription] alive — processed ${jobsProcessed} jobs, last job: ${lastJobId ?? 'none'}`
  )
}, 60_000)
// If the process is otherwise idle, don't let the heartbeat keep it alive
// past shutdown signals.
heartbeatInterval.unref()

console.log('[transcription] Worker started')

// ─── Bot ingestion worker ───────────────────────────────────────────────────
// Consumes the `bot-ingestion` queue produced by the Recall.ai webhook.
// Pulls the bot's recorded media → S3 → transcription queue. Lower
// concurrency than transcription because each job does a multi-MB
// download + S3 upload.

const botIngestionWorker = new Worker<BotIngestionJobData>(
  'bot-ingestion',
  async (job) => {
    const { botId } = job.data
    console.log('[bot-ingest] processing botId:', botId)
    await ingestBotMedia(botId)
  },
  {
    connection: bullmqConnection,
    concurrency: 3,
  },
)

botIngestionWorker.on('failed', (job, err) => {
  console.error('[bot-ingest] job failed:', job?.id, err)
  Sentry.captureException(err, {
    tags: { worker: 'bot-ingestion' },
    extra: { jobId: job?.id, botId: job?.data?.botId },
  })
})
botIngestionWorker.on('error', (err) => {
  console.error('[bot-ingest] Worker error:', err)
  Sentry.captureException(err, { tags: { worker: 'bot-ingestion', phase: 'worker_error' } })
})

console.log('[bot-ingest] Worker started')

// ─── Graceful shutdown ──────────────────────────────────────────────────────
// On SIGTERM (Railway redeploys) or SIGINT (local Ctrl-C) we stop the
// heartbeat and wait for BullMQ to drain — worker.close() resolves once all
// active jobs complete, so in-flight transcription work is never killed mid-run.

let shuttingDown = false

async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[transcription] shutting down gracefully (${signal})`)
  clearInterval(heartbeatInterval)
  try {
    await Promise.all([worker.close(), botIngestionWorker.close()])
  } catch (err) {
    console.error('[transcription] Error during worker.close():', err)
    Sentry.captureException(err, { tags: { worker: 'transcription', phase: 'shutdown' } })
  }
  try {
    await Sentry.close(2000)
  } catch {
    /* noop */
  }
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
