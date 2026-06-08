// Kolasys AI — Recall.ai webhook handler
//
// Recall.ai delivers webhooks via Svix; signatures land in the standard
// svix-id / svix-timestamp / svix-signature headers and are verified with
// `svix`'s Webhook helper using the whsec_… secret from Recall's webhook
// config UI as RECALLAI_WEBHOOK_SECRET.
//
// This route is intentionally tiny: it verifies the signature, decodes the
// event, and enqueues a job onto `botIngestionQueue`. The Railway worker
// (transcription.worker.ts) consumes that queue and runs the
// download → S3 upload → transcription enqueue pipeline. Vercel's
// function lifecycle never holds a long-running download anymore, so
// there's no timeout-driven retry storm from Recall.

import { Webhook } from 'svix'
import { db } from '@/lib/db'
import { botIngestionQueue } from '@/lib/queues'
import { RecordingStatus } from '@/generated/prisma/client'

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

  // Strict Svix verification. The route lives in the public proxy list, so
  // this signature check is the only thing standing between Recall's
  // webhooks and anyone who can guess a botId. Missing secret → 500 (config
  // error); invalid/missing signature → 400 (rejected payload).
  const secret = process.env.RECALLAI_WEBHOOK_SECRET
  if (!secret) {
    console.error('[recall] RECALLAI_WEBHOOK_SECRET not set')
    return new Response('Webhook secret not configured', { status: 500 })
  }
  const svixId = request.headers.get('svix-id') ?? request.headers.get('webhook-id') ?? ''
  const svixTimestamp = request.headers.get('svix-timestamp') ?? request.headers.get('webhook-timestamp') ?? ''
  const svixSignature = request.headers.get('svix-signature') ?? request.headers.get('webhook-signature') ?? ''

  console.log('[recall] svix headers:', {
    id: svixId ? svixId.slice(0, 20) + '…' : '(missing)',
    timestamp: svixTimestamp || '(missing)',
    signature: svixSignature ? svixSignature.slice(0, 20) + '…' : '(missing)',
    bodyLen: rawBody.length,
  })

  const wh = new Webhook(secret)
  try {
    wh.verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[recall] signature FAILED: ${msg} | id=${svixId.slice(0, 16)} ts=${svixTimestamp} sigLen=${svixSignature.length} bodyLen=${rawBody.length}`)
    return new Response('Invalid signature', { status: 400 })
  }

  let event: RecallEvent
  try {
    event = JSON.parse(rawBody) as RecallEvent
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
      // bot.done is the fallback if recording.done doesn't fire. Either
      // way we just enqueue — the Railway worker handles the actual
      // Recall fetch + S3 upload + transcription enqueue.
      case 'bot.done':
      case 'recording.done': {
        const botId = (event.data as { bot_id: string }).bot_id
        console.log('[recall] enqueueing bot ingestion for botId:', botId)
        await botIngestionQueue.add('ingest', { botId })
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
