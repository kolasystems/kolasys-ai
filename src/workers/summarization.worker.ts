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
  summarizeTranscript,
  extractActionItems,
  type SectionDefinition,
} from '@/services/summarization.service'
import { type SummarizationJobData } from '@/lib/queues'
import { JobStatus, Priority, RecordingStatus } from '@/generated/prisma/client'
import { postToSlack } from '@/services/integrations/slack.service'
import { createNotionPage } from '@/services/integrations/notion.service'
import { resend, FROM_EMAIL } from '@/lib/email'
import { captureServerEvent } from '@/lib/posthog'
import { sendExpoPush } from '@/services/push.service'
import { extractKnowledge } from '@/services/knowledge.service'
import { KnowledgeEntityType } from '@/generated/prisma/client'
import { clerkClient } from '@clerk/nextjs/server'

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

  // ── 3. Fetch recording (for title, orgId, userId) ─────────────────────────
  const recording = await db.recording.findUnique({
    where: { id: recordingId },
    select: { id: true, title: true, orgId: true, userId: true },
  })

  if (!recording) {
    throw new Error(`Recording ${recordingId} not found`)
  }

  // ── 4. Resolve template sections ──────────────────────────────────────────
  let sections: SectionDefinition[] | undefined

  if (templateId) {
    const template = await db.noteTemplate.findUnique({
      where: { id: templateId },
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
      templateId: templateId ?? null,
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

  // ── 8.5. Mobile push (Apple Watch Phase 2) ───────────────────────────────
  // Fire-and-forget Expo push so the phone + watch light up the moment
  // notes are ready. Body = 3-bullet wrist summary built from the note's
  // top sections. Never fails the job — logs only.
  try {
    const orgWithToken = await db.organization.findFirst({
      where: { id: recording.orgId },
      select: { expoPushToken: true, name: true },
    })

    if (orgWithToken?.expoPushToken) {
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

      await sendExpoPush({
        token: orgWithToken.expoPushToken,
        title: `Notes ready: ${recording.title}`,
        body: bullets,
        data: { recordingId },
      })
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

  // ── 11. Send post-meeting email — gated by Organization.postMeetingEmail ──
  try {
    const orgPrefs = await db.organization.findUnique({
      where: { id: recording.orgId },
      select: { postMeetingEmail: true },
    })
    const shouldEmail = orgPrefs?.postMeetingEmail !== false // default true

    if (!shouldEmail) {
      console.log(`[summarization] Post-meeting email SKIPPED (org pref off) for ${recordingId}`)
    } else {
      const client = await clerkClient()
      const clerkUser = await client.users.getUser(recording.userId)
      const email = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      )?.emailAddress

      if (email && summaryResult.summary) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.kolasys.ai'
        const recordingUrl = `${appUrl}/dashboard/recordings/${recordingId}`

        // Escape user-provided strings so we can safely interpolate into HTML.
        const esc = (s: string) =>
          s.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')

        const actionItemsHtml = rawActionItems.length > 0
          ? `
        <h2 style="color: #1e293b; font-size: 16px; margin-bottom: 12px;">
          Action Items (${rawActionItems.length})
        </h2>
        <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          ${rawActionItems.slice(0, 5).map((a) =>
            `<p style="margin: 4px 0; color: #475569;">• ${esc(a.title)}</p>`
          ).join('')}
          ${rawActionItems.length > 5
            ? `<p style="color: #94a3b8; margin: 8px 0 0; font-size: 13px;">+ ${rawActionItems.length - 5} more action items</p>`
            : ''}
        </div>
          `
          : ''

        const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 12px; margin-bottom: 24px;">
    <h1 style="color: white; margin: 0; font-size: 20px;">📝 Meeting Notes Ready</h1>
    <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">${esc(recording.title)}</p>
  </div>

  <h2 style="color: #1e293b; font-size: 16px; margin-bottom: 12px;">Summary</h2>
  <p style="color: #475569; line-height: 1.6; margin-bottom: 24px;">${esc(summaryResult.summary)}</p>

  ${actionItemsHtml}

  <a href="${recordingUrl}"
     style="display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
    View Full Notes →
  </a>

  <p style="color: #94a3b8; font-size: 12px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
    Kolasys AI · AI-powered meeting intelligence
  </p>
</div>
        `.trim()

        await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: `Meeting notes ready: ${recording.title}`,
          html,
        })

        console.log(`[summarization] Post-meeting email sent to ${email} for ${recordingId}`)
      }
    }
  } catch (emailErr) {
    // Email is non-fatal — recording is already marked READY
    console.error(`[summarization] Failed to send post-meeting email:`, emailErr)
    Sentry.captureException(emailErr, {
      tags: { worker: 'summarization', phase: 'email' },
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
