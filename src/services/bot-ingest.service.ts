// Kolasys AI — Bot recording ingestion.
//
// Runs in the Railway worker (not Vercel) — pulls a Recall.ai bot's
// recorded media via the API, uploads to S3, and enqueues transcription.
// Mirrors the tail of `recordings.confirmUpload` so downstream pipeline
// (Whisper → notes → push) doesn't know the recording came from a bot.
//
// Each step is wrapped in its own try/catch with `[ingest] step N` log
// markers so partial failures pinpoint exactly where they died.

import { db } from '@/lib/db'
import { generateRecordingKey, uploadToS3 } from '@/lib/storage'
import { transcriptionQueue } from '@/lib/queues'
import { RecordingStatus } from '@/generated/prisma/client'
import { getBotMediaUrl } from '@/services/meetingbot.service'

/**
 * Idempotent: recording.done and bot.done both fire for the same recording,
 * so the second invocation is a no-op once `s3Key` is set (we just
 * re-enqueue the transcription job).
 */
export async function ingestBotMedia(botId: string): Promise<void> {
  console.log('[ingest] starting for botId:', botId)

  // ── Step 1: look up the recording row keyed by this botId ───────────────
  console.log('[ingest] step 1: looking up recording for botId:', botId)
  let recording: { id: string; orgId: string; s3Key: string | null } | null
  try {
    recording = await db.recording.findFirst({
      where: { botId },
      select: { id: true, orgId: true, s3Key: true },
    })
  } catch (err) {
    console.error('[ingest] step 1 FAILED (lookup):', err)
    throw err
  }
  console.log('[ingest] step 2: recording found:', recording?.id)
  if (!recording) {
    console.warn(`[ingest] no recording found for bot ${botId}`)
    return
  }

  // Already ingested by an earlier event — just re-enqueue.
  if (recording.s3Key) {
    try {
      await transcriptionQueue.add('transcribe', {
        recordingId: recording.id,
        orgId: recording.orgId,
        s3Key: recording.s3Key,
      })
      await db.recording.update({
        where: { id: recording.id },
        data: { status: RecordingStatus.TRANSCRIBING, endedAt: new Date() },
      })
      console.log(`[ingest] bot ${botId} already ingested — re-enqueued`)
    } catch (err) {
      console.error('[ingest] re-enqueue FAILED:', err)
      throw err
    }
    return
  }

  // ── Step 3: ask Recall.ai for the bot's media URL ──────────────────────
  let media: Awaited<ReturnType<typeof getBotMediaUrl>>
  try {
    media = await getBotMediaUrl(botId)
  } catch (err) {
    console.error('[ingest] step 3 FAILED (getBotMediaUrl threw):', err)
    await markFailed(recording.id)
    throw err
  }
  console.log('[ingest] step 3: media URL resolved:', media?.url ?? null)
  if (!media) {
    console.error(`[ingest] bot ${botId} 'done' but no media URL on the response`)
    await markFailed(recording.id)
    return
  }

  // ── Step 4: download the audio bytes ───────────────────────────────────
  let buffer: Buffer
  let responseContentType: string
  try {
    const res = await fetch(media.url)
    if (!res.ok) {
      console.error(
        `[ingest] step 4 FAILED (download non-OK): ${res.status} ${res.statusText}`,
      )
      await markFailed(recording.id)
      throw new Error(`Recall media download failed: ${res.status}`)
    }
    const arrayBuf = await res.arrayBuffer()
    buffer = Buffer.from(arrayBuf)
    responseContentType = res.headers.get('content-type') ?? media.contentType
  } catch (err) {
    console.error('[ingest] step 4 FAILED (fetch threw):', err)
    await markFailed(recording.id)
    throw err
  }
  console.log('[ingest] step 4: audio downloaded, size:', buffer.length)
  const fileSize = buffer.byteLength

  // ── Step 5: upload to S3 ───────────────────────────────────────────────
  const s3Key = generateRecordingKey(recording.orgId, recording.id, media.extension)
  try {
    await uploadToS3(s3Key, buffer, responseContentType)
  } catch (err) {
    console.error('[ingest] step 5 FAILED (S3 upload):', err)
    await markFailed(recording.id)
    throw err
  }
  console.log('[ingest] step 5: S3 upload complete, key:', s3Key)

  // ── Step 6: persist + enqueue transcription ────────────────────────────
  try {
    await db.recording.update({
      where: { id: recording.id },
      data: {
        s3Key,
        s3Bucket: process.env.S3_BUCKET_NAME,
        mimeType: responseContentType,
        fileSize,
        status: RecordingStatus.TRANSCRIBING,
        endedAt: new Date(),
      },
    })

    // Resolve language: org default (matches the upload-path confirmUpload
    // behaviour). 'auto' becomes undefined so Whisper auto-detects.
    const org = await db.organization.findFirst({
      where: { id: recording.orgId },
      select: { defaultTranscriptionLanguage: true },
    })
    const language = org?.defaultTranscriptionLanguage ?? 'en'

    await transcriptionQueue.add('transcribe', {
      recordingId: recording.id,
      orgId: recording.orgId,
      s3Key,
      language: language === 'auto' ? undefined : language,
    })
  } catch (err) {
    console.error('[ingest] step 6 FAILED (DB update / queue):', err)
    throw err
  }
  console.log('[ingest] step 6: queued for transcription')

  console.log(
    `[ingest] complete: bot ${botId} → ${s3Key} (${fileSize} bytes) → queued`,
  )
}

/**
 * Best-effort flip the recording to FAILED so the dashboard stops showing
 * it as in-progress. Wrapped because we don't want a failed-status update
 * to hide the actual root-cause log line.
 */
async function markFailed(recordingId: string): Promise<void> {
  try {
    await db.recording.update({
      where: { id: recordingId },
      data: { status: RecordingStatus.FAILED },
    })
  } catch (err) {
    console.error('[ingest] markFailed update threw:', err)
  }
}
