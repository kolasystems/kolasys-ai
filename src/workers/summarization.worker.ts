// Kolasys AI — Summarization BullMQ worker
// Run this process separately: `tsx src/workers/summarization.worker.ts`

import 'dotenv/config'
import * as Sentry from '@sentry/nextjs'

// Initialise Sentry before importing any other modules.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  initialScope: { tags: { worker: 'summarization' } },
})

import { Worker, type Job } from 'bullmq'
import { bullmqConnection } from '@/lib/redis'
import { db } from '@/lib/db'
import {
  formatTitleWithDate,
  generateAiMeetingTitle,
  summarizeTranscript,
  extractActionItems,
  type SectionDefinition,
} from '@/services/summarization.service'
import { type SummarizationJobData, webhookDeliveryQueue } from '@/lib/queues'
import { JobStatus, Priority, RecordingStatus, WebhookDeliveryStatus } from '@/generated/prisma/client'
import { webhookDeliveryWorker } from './webhook-delivery.worker'
import { postToSlack } from '@/services/integrations/slack.service'
import { createNotionPage } from '@/services/integrations/notion.service'
import { captureServerEvent } from '@/lib/posthog'
import { sendSummaryEmail } from '@/services/summary-email.service'
import { sendExpoPush } from '@/services/push.service'
import { sendWebPushToMember } from '@/lib/web-push'
import { extractKnowledge } from '@/services/knowledge.service'
import { detectAndAssignSeries } from '@/services/series-detection.service'
import { KnowledgeEntityType } from '@/generated/prisma/client'
import { findBestTemplate } from '@/services/template-matcher.service'

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

  // ── 1. Create or update a ProcessingJob row for the audit trail ──────────
  // HTTP mode: no transactions or upserts — use findFirst → create/update.
  // findUnique + create/update — no upsert, no batch ops, no atomic increment ops.
  const existingJob = await db.processingJob.findUnique({
    where: { id: `${recordingId}-SUMMARIZATION` },
    select: { id: true, attempts: true },
  })
  if (existingJob) {
    await db.processingJob.update({
      where: { id: `${recordingId}-SUMMARIZATION` },
      data: { status: JobStatus.PROCESSING, startedAt: new Date(), attempts: existingJob.attempts + 1, error: null },
    })
  } else {
    try {
      await db.processingJob.create({
        data: {
          id: `${recordingId}-SUMMARIZATION`,
          recordingId,
          type: 'SUMMARIZATION',
          status: JobStatus.PROCESSING,
          startedAt: new Date(),
          attempts: 1,
        },
      })
    } catch {
      // Race condition — another retry created it first; re-read and update.
      const retryJob = await db.processingJob.findUnique({
        where: { id: `${recordingId}-SUMMARIZATION` },
        select: { id: true, attempts: true },
      })
      if (retryJob) {
        await db.processingJob.update({
          where: { id: `${recordingId}-SUMMARIZATION` },
          data: { status: JobStatus.PROCESSING, startedAt: new Date(), attempts: retryJob.attempts + 1, error: null },
        })
      }
    }
  }

  // ── 2. Fetch transcript ───────────────────────────────────────────────────
  console.log(`[summarization] Fetching transcript ${transcriptId}`)

  const transcript = await db.transcript.findUnique({
    where: { id: transcriptId },
    select: { text: true, recordingId: true },
  })

  if (!transcript) {
    throw new Error(`Transcript ${transcriptId} not found`)
  }

  // ── 3. Fetch recording (for title, orgId, userId, createdAt) ──────────────
  const recording = await db.recording.findUnique({
    where: { id: recordingId },
    select: { id: true, title: true, orgId: true, userId: true, createdAt: true, source: true, duration: true, webhookSentAt: true },
  })

  if (!recording) {
    throw new Error(`Recording ${recordingId} not found`)
  }

  // ── 4. Resolve template sections ──────────────────────────────────────────
  // Explicit templateId from the job wins; otherwise we try to auto-apply a
  // template whose regex rules match the meeting title. (Attendees list is
  // empty for now — wire the diarization speaker labels in when we flesh
  // out the attendee pipeline.)
  let sections: SectionDefinition[] | undefined
  const autoTemplateId = await findBestTemplate(
    recording.orgId,
    recording.title,
    [],
  )
  const effectiveTemplateId: string | null = templateId ?? autoTemplateId ?? null

  if (autoTemplateId && !templateId) {
    console.log(
      `[summarization] Auto-applying template ${autoTemplateId} to recording ${recordingId}`,
    )
  }

  if (effectiveTemplateId) {
    const template = await db.noteTemplate.findUnique({
      where: { id: effectiveTemplateId },
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

  // ── 6. Persist Note + NoteSections + ActionItems sequentially ────────────
  // HTTP mode: no transactions — create note first, then children.
  const note = await db.note.create({
    data: {
      recordingId,
      orgId: recording.orgId,
      userId: recording.userId,
      title: recording.title,
      summary: summaryResult.summary,
      templateId: effectiveTemplateId,
    },
  })

  // createMany uses transactions internally — use individual creates instead.
  for (const s of summaryResult.sections) {
    await db.noteSection.create({
      data: {
        noteId: note.id,
        title: s.title,
        content: s.content,
        order: s.order,
      },
    })
  }

  for (const item of rawActionItems) {
    await db.actionItem.create({
      data: {
        noteId: note.id,
        orgId: recording.orgId,
        title: item.title,
        description: item.description ?? null,
        assignee: null, // names from transcript can't be mapped to Clerk IDs here
        priority: toPriority(item.priority),
        dueDate: item.dueDate ? new Date(item.dueDate) : null,
      },
    })
  }

  console.log(
    `[summarization] Saved note ${note.id} with ` +
      `${summaryResult.sections.length} sections and ${rawActionItems.length} action items`
  )

  // ── 7. Push to Slack / Notion if org has integrations configured ─────────
  try {
    const org = await db.organization.findUnique({
      where: { id: recording.orgId },
      select: { slackWebhookUrl: true, notionApiKey: true, notionDatabaseId: true },
    })

    if (org) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
      const recordingUrl = `${appUrl}/dashboard/recordings/${recordingId}`

      const actionItemSummaries = rawActionItems.map((a) => ({
        title: a.title,
        priority: String(toPriority(a.priority)),
      }))

      const sectionSummaries = summaryResult.sections.map((s) => ({
        title: s.title,
        content: s.content,
      }))

      if (org.slackWebhookUrl) {
        await postToSlack(org.slackWebhookUrl, {
          recordingTitle: recording.title,
          recordingUrl,
          summary: summaryResult.summary ?? '',
          sections: sectionSummaries,
          actionItems: actionItemSummaries,
        }).catch((err) =>
          console.error(`[summarization] Slack push failed for ${recordingId}:`, err)
        )
      }

      if (org.notionApiKey && org.notionDatabaseId) {
        await createNotionPage(org.notionApiKey, org.notionDatabaseId, {
          recordingTitle: recording.title,
          recordingUrl,
          summary: summaryResult.summary ?? '',
          sections: sectionSummaries,
          actionItems: actionItemSummaries,
          createdAt: new Date(),
        }).catch((err) =>
          console.error(`[summarization] Notion push failed for ${recordingId}:`, err)
        )
      }
    }
  } catch (integrationErr) {
    console.error('[summarization] Integration push error (non-fatal):', integrationErr)
    Sentry.captureException(integrationErr, {
      tags: { worker: 'summarization', phase: 'integrations' },
      extra: { recordingId },
    })
  }

  // ── 8. Mark recording as READY ────────────────────────────────────────────
  await db.recording.update({
    where: { id: recordingId },
    data: { status: RecordingStatus.READY },
  })

  // ── 8.4. Auto-generate a smart title ─────────────────────────────────────
  // Only override default-format titles like "Recording – Apr 29 10:39 AM"
  // or empty strings. User-set titles (renames, voice memo filenames, etc.)
  // are left alone. The push notification step below reads recording.title,
  // so we update the in-memory variable too.
  const isDefaultTitle =
    !recording.title?.trim() ||
    /^Recording\s*[–-]/i.test(recording.title) ||
    /^Shared\s/i.test(recording.title) ||
    /^audio$/i.test(recording.title.trim()) ||
    /^voice\s*memo/i.test(recording.title) ||
    /^untitled/i.test(recording.title) ||
    /^\d{4}[-_]\d{2}[-_]\d{2}/.test(recording.title) ||
    // Desktop app default: "Meeting — May 6, 2026 at 12:36 PM"
    /^Meeting\s*[–—-]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(recording.title)
  if (isDefaultTitle) {
    try {
      const aiTitle = await generateAiMeetingTitle({
        summary: summaryResult.summary ?? null,
        transcriptText: transcript.text,
      })
      if (aiTitle) {
        const finalTitle = formatTitleWithDate(recording.createdAt, aiTitle)
        await db.recording.update({
          where: { id: recordingId },
          data: { title: finalTitle },
        })
        recording.title = finalTitle
        console.log(`[summarization] Auto-titled ${recordingId}: "${finalTitle}"`)
      }
    } catch (titleErr) {
      console.error('[summarization] Title generation failed (non-fatal):', titleErr)
    }
  }

  // ── 8.45. Meeting series auto-detection ─────────────────────────────────
  // Runs after the AI title (8.4) so similarity matching uses the topical
  // title rather than the default placeholder. Fire-and-forget — series
  // detection failure must never block the transcription pipeline.
  try {
    await detectAndAssignSeries(recordingId)
  } catch (err) {
    console.error('[series] detection failed (non-fatal):', err)
  }

  // ── 8.5. Mobile push (Apple Watch Phase 2) ───────────────────────────────
  // Fire-and-forget Expo push so only the recording's owner gets pinged on
  // their iPhone + mirrored Apple Watch — not every member of the org.
  // Body = 3-bullet wrist summary built from the note's top sections.
  // Never fails the job — logs only.
  try {
    const ownerMember = await db.orgMember.findFirst({
      where: { orgId: recording.orgId, userId: recording.userId },
      select: { id: true, expoPushToken: true },
    })

    if (ownerMember) {
      const pushNote = await db.note.findFirst({
        where: { recordingId },
        include: { sections: { orderBy: { order: 'asc' }, take: 3 } },
        orderBy: { createdAt: 'desc' },
      })

      const bullets =
        pushNote?.sections
          .slice(0, 3)
          .map((s) => `• ${s.title}`)
          .join('\n') ?? '• Notes are ready'

      // Expo push — iPhone + Apple Watch.
      if (ownerMember.expoPushToken) {
        await sendExpoPush({
          token: ownerMember.expoPushToken,
          title: `Notes ready: ${recording.title}`,
          body: bullets,
          data: { recordingId },
        }).catch((err) =>
          console.error('[push] Expo send failed (non-fatal):', err),
        )
      }

      // Web push — every browser this user has subscribed in.
      await sendWebPushToMember(ownerMember.id, {
        title: `Notes ready for ${recording.title}`,
        body: bullets,
        url: `/dashboard/recordings/${recordingId}`,
      }).catch((err) =>
        console.error('[push] Web push send failed (non-fatal):', err),
      )
    }
  } catch (pushErr) {
    console.error('[push] Failed to send push notification:', pushErr)
    // Non-fatal — do not rethrow.
  }

  // ── 8.6. Knowledge graph extraction ───────────────────────────────────────
  // Haiku pulls people / topics / projects from the transcript. Each entity
  // is upserted (normalized lowercase name per orgId+type) and linked to this
  // recording. HTTP-mode Prisma → no batch upserts, so we loop sequentially.
  // Non-fatal: log + continue on any failure so the main pipeline is safe.
  try {
    const transcriptRow = await db.transcript.findFirst({
      where: { recordingId },
      select: { text: true },
    })

    if (transcriptRow?.text) {
      const extracted = await extractKnowledge(transcriptRow.text, recording.title)

      type EntityInput = { type: KnowledgeEntityType; name: string }
      const allEntities: EntityInput[] = [
        ...extracted.people.map((name) => ({
          type: KnowledgeEntityType.PERSON,
          name: name.toLowerCase().trim(),
        })),
        ...extracted.topics.map((name) => ({
          type: KnowledgeEntityType.TOPIC,
          name: name.toLowerCase().trim(),
        })),
        ...extracted.projects.map((name) => ({
          type: KnowledgeEntityType.PROJECT,
          name: name.toLowerCase().trim(),
        })),
      ].filter((e) => e.name.length > 1)

      for (const entity of allEntities) {
        // Upsert entity — findFirst + create/update (HTTP mode).
        const existing = await db.knowledgeEntity.findFirst({
          where: { orgId: recording.orgId, type: entity.type, name: entity.name },
          select: { id: true, mentions: true },
        })

        let entityId: string
        if (existing) {
          await db.knowledgeEntity.update({
            where: { id: existing.id },
            data: { mentions: existing.mentions + 1, lastSeen: new Date() },
          })
          entityId = existing.id
        } else {
          const created = await db.knowledgeEntity.create({
            data: { orgId: recording.orgId, type: entity.type, name: entity.name, mentions: 1 },
          })
          entityId = created.id
        }

        // Upsert the link row.
        const existingLink = await db.knowledgeEntityRecording.findFirst({
          where: { entityId, recordingId },
          select: { id: true, mentions: true },
        })
        if (existingLink) {
          await db.knowledgeEntityRecording.update({
            where: { id: existingLink.id },
            data: { mentions: existingLink.mentions + 1 },
          })
        } else {
          try {
            await db.knowledgeEntityRecording.create({
              data: { entityId, recordingId, mentions: 1 },
            })
          } catch {
            // Race condition — another attempt created it first. Fine.
          }
        }
      }

      console.log(
        `[summarization] Knowledge graph: +${allEntities.length} entities for ${recordingId}`,
      )
    }
  } catch (knowledgeErr) {
    console.error('[summarization] Knowledge extraction failed (non-fatal):', knowledgeErr)
    Sentry.captureException(knowledgeErr, {
      tags: { worker: 'summarization', phase: 'knowledge' },
      extra: { recordingId },
    })
  }

  // ── 9. Mark summarization job as COMPLETED ────────────────────────────────
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

  // ── 10. PostHog: recording_ready event ────────────────────────────────────
  const wordCount = transcript.text.split(/\s+/).filter(Boolean).length
  captureServerEvent(recording.userId, 'recording_ready', {
    recording_id: recordingId,
    org_id: recording.orgId,
    word_count: wordCount,
    section_count: summaryResult.sections.length,
    action_item_count: rawActionItems.length,
  })

  // ── 11. Send post-meeting summary email ──────────────────────────────────
  // Delegated to summary-email.service: idempotency (summaryEmailSentAt),
  // org toggle (postMeetingEmail), per-user toggle (emailSummaryOnReady),
  // Clerk email resolution, transcript + summary attachments.
  // Best-effort — never blocks or fails the job.
  try {
    await sendSummaryEmail(recordingId)
  } catch (emailErr) {
    console.error(`[summarization] Summary email failed (non-fatal):`, emailErr)
    Sentry.captureException(emailErr, {
      tags: { worker: 'summarization', phase: 'email' },
      extra: { recordingId },
    })
  }

  // ── 12. Enqueue outbound webhook deliveries ───────────────────────────────
  // Idempotency: webhookSentAt is stamped after all jobs are enqueued. A worker
  // restart before the stamp re-enqueues, which could cause duplicate deliveries
  // to customer endpoints — acceptable for v1 (idempotent receivers recommended).
  // CRITICAL: this step only enqueues jobs. The actual HTTP POST is done by
  // webhookDeliveryWorker so a slow/dead endpoint never blocks the pipeline.
  // Non-fatal — logs and swallows, exactly like Step 11.
  try {
    if (recording.webhookSentAt == null) {
      const endpoints = await db.webhookEndpoint.findMany({
        where: { orgId: recording.orgId, enabled: true },
        select: { id: true },
      })

      if (endpoints.length > 0) {
        // Build the payload once — every delivery for this recording shares
        // the same signed body so signatures can't diverge between endpoints.
        const payload = {
          event: 'recording.ready',
          timestamp: new Date().toISOString(),
          data: {
            recordingId,
            orgId: recording.orgId,
            title: recording.title, // possibly updated by step 8.4 AI-title
            status: 'READY' as const,
            source: recording.source,
            durationSeconds: recording.duration ?? null,
            createdAt: recording.createdAt.toISOString(),
            summary: summaryResult.summary ?? null,
            actionItemCount: rawActionItems.length,
          },
        }
        const body = JSON.stringify(payload)

        // Sequential creates — Neon HTTP adapter: no createMany (uses transactions).
        for (const endpoint of endpoints) {
          const delivery = await db.webhookDelivery.create({
            data: {
              endpointId: endpoint.id,
              recordingId,
              event: 'recording.ready',
              status: WebhookDeliveryStatus.PENDING,
              attempts: 0,
            },
            select: { id: true },
          })
          await webhookDeliveryQueue.add('deliver', {
            deliveryId: delivery.id,
            endpointId: endpoint.id,
            body,
          })
        }

        // Stamp idempotency — findFirst + update (Neon HTTP: no updateMany).
        const rec = await db.recording.findFirst({
          where: { id: recordingId },
          select: { id: true },
        })
        if (rec) {
          await db.recording.update({
            where: { id: rec.id },
            data: { webhookSentAt: new Date() },
          })
        }

        console.log(
          `[summarization] Enqueued ${endpoints.length} webhook delivery job(s) for ${recordingId}`,
        )
      }
    }
  } catch (webhookErr) {
    console.error(`[summarization] Webhook fan-out failed (non-fatal):`, webhookErr)
    Sentry.captureException(webhookErr, {
      tags: { worker: 'summarization', phase: 'webhooks' },
      extra: { recordingId },
    })
  }
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

  // Report to Sentry
  Sentry.captureException(err, {
    tags: { worker: 'summarization' },
    extra: {
      jobId: job.id,
      recordingId: job.data.recordingId,
      attempt: job.attemptsMade,
    },
  })

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
worker.on('error', (err) => {
  console.error('[summarization] Worker error:', err)
  Sentry.captureException(err, { tags: { worker: 'summarization', phase: 'worker_error' } })
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
    `[summarization] alive — processed ${jobsProcessed} jobs, last job: ${lastJobId ?? 'none'}`
  )
}, 60_000)
heartbeatInterval.unref()

console.log('[summarization] Worker started')

// ─── Graceful shutdown ───────────────────────────────────────────────────────
// On SIGTERM (Railway redeploys) or SIGINT (local Ctrl-C) we stop the
// heartbeat and wait for BullMQ to drain — worker.close() resolves once all
// active jobs complete, so an in-flight Claude call is never killed mid-run.

let shuttingDown = false

async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[summarization] shutting down gracefully (${signal})`)
  clearInterval(heartbeatInterval)
  try {
    await worker.close()
    await webhookDeliveryWorker.close()
  } catch (err) {
    console.error('[summarization] Error during worker.close():', err)
    Sentry.captureException(err, { tags: { worker: 'summarization', phase: 'shutdown' } })
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
