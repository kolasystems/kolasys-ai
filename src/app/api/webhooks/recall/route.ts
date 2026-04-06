// Kolasys AI — Recall.ai webhook handler
// Handles bot status changes and recording completion events.

import { createHmac, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import { transcriptionQueue } from '@/lib/queues'
import { RecordingStatus } from '@/generated/prisma/client'

type RecallEvent =
  | { event: 'bot.status_change'; data: { bot_id: string; status: { code: string } } }
  | { event: 'transcript.ready'; data: { bot_id: string; transcript: unknown } }

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.RECALLAI_WEBHOOK_SECRET
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('x-recall-signature')

  if (!verifySignature(body, signature)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let event: RecallEvent
  try {
    event = JSON.parse(body) as RecallEvent
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  try {
    switch (event.event) {
      case 'bot.status_change': {
        const { bot_id, status } = event.data

        const recording = await db.recording.findFirst({
          where: { botId: bot_id },
          select: { id: true, orgId: true, s3Key: true },
        })
        if (!recording) break

        if (status.code === 'done') {
          // Recording has finished; trigger transcription if we have the file.
          if (recording.s3Key) {
            await transcriptionQueue.add('transcribe', {
              recordingId: recording.id,
              orgId: recording.orgId,
              s3Key: recording.s3Key,
            })
            await db.recording.update({
              where: { id: recording.id },
              data: { status: RecordingStatus.PROCESSING, endedAt: new Date() },
            })
          }
        } else if (status.code === 'fatal') {
          await db.recording.update({
            where: { id: recording.id },
            data: { status: RecordingStatus.FAILED },
          })
        } else if (status.code === 'in_call_recording') {
          await db.recording.update({
            where: { id: recording.id },
            data: { status: RecordingStatus.PROCESSING, startedAt: new Date() },
          })
        }
        break
      }

      case 'transcript.ready':
        // Real-time transcript delivered — persisted via the transcription worker instead.
        break

      default:
        break
    }
  } catch (err) {
    console.error('[recall webhook] Error processing event:', err)
    return new Response('Internal server error', { status: 500 })
  }

  return new Response('OK', { status: 200 })
}
