// Kolasys AI — Webhook delivery BullMQ worker.
//
// Co-hosted in the summarization-worker Railway service (v1). This module
// is NOT a standalone entrypoint — it is imported by summarization.worker.ts,
// which initialises Sentry and dotenv before this module is evaluated.
//
// Job contract: { deliveryId, endpointId, body }
//   body = the exact JSON string that was signed at enqueue time. The delivery
//   worker must POST these exact bytes so the HMAC verifies on the customer side.
//
// Retry strategy: BullMQ retries up to 3× with exponential backoff (inherited
// from the queue's defaultJobOptions). On non-2xx or network/timeout error the
// job THROWS to trigger the retry. Only the final attempt marks status FAILED.
// If the endpoint is missing or disabled the job returns WITHOUT throwing —
// retrying a permanently invalid target is pointless.

import * as Sentry from '@sentry/nextjs'
import { Worker, type Job } from 'bullmq'
import { bullmqConnection } from '@/lib/redis'
import { db } from '@/lib/db'
import { WebhookDeliveryStatus } from '@/generated/prisma/client'
import { signWebhookPayload } from '@/lib/webhook-signing'
import type { WebhookDeliveryJobData } from '@/lib/queues'

const REQUEST_TIMEOUT_MS = 10_000

// ── Job processor ─────────────────────────────────────────────────────────────

async function processDelivery(job: Job<WebhookDeliveryJobData>): Promise<void> {
  const { deliveryId, endpointId, body } = job.data

  // ── 1. Load delivery + endpoint in a single query ─────────────────────────
  const delivery = await db.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      endpoint: {
        select: { url: true, secret: true, enabled: true },
      },
    },
  })

  // Endpoint deleted or delivery row missing — no point retrying; return clean.
  if (!delivery || !delivery.endpoint) {
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: WebhookDeliveryStatus.FAILED,
        lastError: 'Endpoint not found',
        attempts: job.attemptsMade + 1,
      },
    })
    console.warn(`[webhook-delivery] endpoint missing for delivery ${deliveryId} — skipping`)
    return
  }

  // Endpoint was disabled after the job was enqueued — skip, no retry.
  if (!delivery.endpoint.enabled) {
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: WebhookDeliveryStatus.FAILED,
        lastError: 'Endpoint disabled',
        attempts: job.attemptsMade + 1,
      },
    })
    console.warn(`[webhook-delivery] endpoint ${endpointId} disabled — skipping delivery ${deliveryId}`)
    return
  }

  const { url, secret } = delivery.endpoint

  // ── 2. Sign using the exact body bytes that will be sent ──────────────────
  const timestampSec = Math.floor(Date.now() / 1000)
  const sig = signWebhookPayload(body, secret, timestampSec)

  // ── 3. POST with 10 s hard timeout ────────────────────────────────────────
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS)

  let resp: Response | undefined
  let fetchError: string | undefined

  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Kolasys-Signature': sig,
        'X-Kolasys-Event': 'recording.ready',
        'X-Kolasys-Delivery': deliveryId,
      },
      body,
      signal: ac.signal,
    })
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err)
  } finally {
    clearTimeout(timer)
  }

  // ── 4. Handle result ──────────────────────────────────────────────────────

  if (resp?.ok) {
    // 2xx — mark successful delivery.
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: WebhookDeliveryStatus.SUCCESS,
        responseCode: resp.status,
        attempts: job.attemptsMade + 1,
        deliveredAt: new Date(),
        lastError: null,
      },
    })
    console.log(`[webhook-delivery] delivered ${deliveryId} → ${url} (${resp.status})`)
    return
  }

  // Non-2xx or network/timeout failure.
  const errorMsg = fetchError ?? (resp ? `HTTP ${resp.status}` : 'unknown error')
  // attemptsMade is 0-indexed and reflects prior attempts; +1 = current count.
  const isFinal = (job.attemptsMade + 1) >= (job.opts.attempts ?? 3)

  await db.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      // Stay PENDING on intermediate attempts so the status reflects "will retry".
      status: isFinal ? WebhookDeliveryStatus.FAILED : WebhookDeliveryStatus.PENDING,
      responseCode: resp?.status ?? null,
      attempts: job.attemptsMade + 1,
      lastError: errorMsg,
    },
  })

  console.warn(
    `[webhook-delivery] delivery ${deliveryId} failed` +
    ` (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 3}): ${errorMsg}`,
  )

  // Throw to hand control back to BullMQ, which applies exponential backoff
  // and reschedules the job (unless this was the final attempt).
  throw new Error(`Webhook delivery failed: ${errorMsg}`)
}

// ── Worker ────────────────────────────────────────────────────────────────────
// Exported so summarization.worker.ts can close it during graceful shutdown.

export const webhookDeliveryWorker = new Worker<WebhookDeliveryJobData>(
  'webhook-delivery',
  processDelivery,
  {
    connection: bullmqConnection,
    concurrency: 5, // I/O-bound HTTP calls; higher concurrency than Claude steps
  },
)

webhookDeliveryWorker.on('error', (err) => {
  console.error('[webhook-delivery] Worker error:', err)
  Sentry.captureException(err, { tags: { worker: 'webhook-delivery', phase: 'worker_error' } })
})

console.log('[webhook-delivery] Worker started')
