// Kolasys AI — Recall.ai webhook handler
// Handles bot status changes and recording completion events.
//
// Recall.ai delivers webhooks via Svix; signatures land in the standard
// svix-id / svix-timestamp / svix-signature headers and are verified with
// `svix`'s Webhook helper using the whsec_… secret from Recall's webhook
// config UI as RECALLAI_WEBHOOK_SECRET. The bot.status_change → 'done'
// branch downloads the bot's recorded media from Recall.ai, uploads to S3,
// and enqueues transcription — the same pipeline trigger as
// recordings.confirmUpload.

import { after } from 'next/server'
import { Webhook } from 'svix'
import { db } from '@/lib/db'
import { transcriptionQueue } from '@/lib/queues'
import { RecordingStatus } from '@/generated/prisma/client'
import { getBotMediaUrl } from '@/services/meetingbot.service'
import { generateRecordingKey, uploadToS3 } from '@/lib/storage'

type RecallEvent =
  | { event: 'bot.done'; data: { bot_id: string } }
  | {
      event: 'recording.done'
      data: { bot_id: string; recording: { id: string; media_shortcuts?: unknown } }
    }
  | { event: 'bot.call_ended'; data: { bot_id: string } }
  | { event: 'bot.fatal'; data: { bot_id: string } }
  | { event: string; data: unknown }

export async function POST(request: Request) {
  const rawBody = await request.text()

  // ⚠️ TEMPORARY — signature verification is downgraded from "block" to
  // "log" while we debug why Recall.ai webhooks are 401-ing. This route
  // is in the public proxy list, so for the duration this stays live an
  // attacker who knows a valid botId could forge bot.status_change events.
  // REMOVE THIS BLOCK and restore the throw-on-failure path once the secret
  // mismatch is resolved.
  const secret = process.env.RECALLAI_WEBHOOK_SECRET
  console.log('[recall] secret present:', !!secret)
  console.log(
    '[recall] all headers:',
    JSON.stringify(Object.fromEntries(request.headers.entries())),
  )

  if (secret) {
    const wh = new Webhook(secret)
    try {
      wh.verify(rawBody, {
        'svix-id': request.headers.get('svix-id') ?? '',
        'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
        'svix-signature': request.headers.get('svix-signature') ?? '',
      })
      console.log('[recall] signature OK')
    } catch (err) {
      console.error('[recall] signature FAILED:', err)
      // TEMP: log but don't block — remove after debugging
    }
  }

  const body = rawBody

  let event: RecallEvent
  try {
    event = JSON.parse(body) as RecallEvent
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  console.log(
    '[recall] event:',
    JSON.stringify({ event: event.event, data: event.data }),
  )

  try {
    switch (event.event) {
      // recording.done is the canonical "audio is ready to download" event;
      // bot.done is the fallback if recording.done doesn't fire. Either way
      // the work (Recall fetch → S3 upload → enqueue) runs AFTER we send the
      // 200 via Next.js's `after()` so Vercel doesn't time out and Recall
      // doesn't retry on us.
      case 'bot.done':
      case 'recording.done': {
        const botId = (event.data as { bot_id: string }).bot_id
        after(async () => {
          await ingestBotMedia(botId)
        })
        break
      }

      // Marks the call as ended but media may still be processing — log
      // only; the recording.done / bot.done event will trigger ingestion.
      case 'bot.call_ended':
        break

      // Bot crashed mid-call. Mark the recording FAILED so the dashboard
      // stops showing it as in-progress. HTTP-mode Prisma has no
      // updateMany, so look up the row first.
      case 'bot.fatal': {
        const data = event.data as { bot_id: string }
        const recording = await db.recording.findFirst({
          where: { botId: data.bot_id },
          select: { id: true },
        })
        if (recording) {
          await db.recording.update({
            where: { id: recording.id },
            data: { status: RecordingStatus.FAILED },
          })
        }
        break
      }

      default:
        // Unknown event type — already logged above. No-op.
        break
    }
  } catch (err) {
    console.error('[recall webhook] Error processing event:', err)
    return new Response('Internal server error', { status: 500 })
  }

  return new Response('OK', { status: 200 })
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Pull the bot's recorded audio from Recall.ai, upload it to the same S3
 * bucket used by direct uploads, and enqueue transcription. Mirrors the
 * tail of `recordings.confirmUpload` so the rest of the pipeline (worker
 * → Whisper → notes → push) doesn't need to know the recording came from
 * a bot.
 *
 * Idempotent: recording.done and bot.done both fire for the same recording,
 * so the second call is a no-op once s3Key is set (we just re-enqueue).
 */
async function ingestBotMedia(botId: string) {
  console.log('[recall] ingestBotMedia starting for botId:', botId)
  const recording = await db.recording.findFirst({
    where: { botId },
    select: { id: true, orgId: true, s3Key: true },
  })
  if (!recording) {
    console.warn(`[recall webhook] no recording found for bot ${botId}`)
    return
  }

  // Already ingested by an earlier event — just make sure the worker has
  // the job and the status reflects it.
  if (recording.s3Key) {
    await transcriptionQueue.add('transcribe', {
      recordingId: recording.id,
      orgId: recording.orgId,
      s3Key: recording.s3Key,
    })
    await db.recording.update({
      where: { id: recording.id },
      data: { status: RecordingStatus.TRANSCRIBING, endedAt: new Date() },
    })
    console.log(`[recall webhook] bot ${botId} already ingested — re-enqueued`)
    return
  }

  const media = await getBotMediaUrl(botId)
  if (!media) {
    console.error(
      `[recall webhook] bot ${botId} 'done' but no media URL on the response`,
    )
    await db.recording.update({
      where: { id: recording.id },
      data: { status: RecordingStatus.FAILED },
    })
    return
  }

  // Stream the file. arrayBuffer is fine for typical meeting audio (< a
  // few hundred MB); upgrade to streamed PUT if we ever see OOM here.
  const res = await fetch(media.url)
  if (!res.ok) {
    console.error(
      `[recall webhook] failed to download Recall media: ${res.status} ${res.statusText}`,
    )
    await db.recording.update({
      where: { id: recording.id },
      data: { status: RecordingStatus.FAILED },
    })
    return
  }
  const arrayBuf = await res.arrayBuffer()
  const buffer = Buffer.from(arrayBuf)
  const fileSize = buffer.byteLength
  const responseContentType = res.headers.get('content-type') ?? media.contentType

  const s3Key = generateRecordingKey(recording.orgId, recording.id, media.extension)
  await uploadToS3(s3Key, buffer, responseContentType)

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

  console.log(
    `[recall webhook] ingested bot ${botId} → ${s3Key} (${fileSize} bytes) → queued transcription`,
  )
}
