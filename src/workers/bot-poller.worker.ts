// Kolasys AI — Bot pipeline polling safety net.
//
// Webhooks from Recall.ai are the fast path for triggering transcription,
// but they can fail (signature mismatch, cold starts, delivery errors).
// This worker polls Recall.ai every 2 minutes and recovers any recordings
// that are stuck at PROCESSING despite the bot being in `done` state.
//
// Architecture decision: webhooks are an optimization, not the critical path.
// Every MEETING_BOT recording will complete within 2 minutes of the bot
// finishing, regardless of webhook delivery.

import 'dotenv/config'
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0,
  initialScope: { tags: { worker: 'bot-poller' } },
})

import { db } from '@/lib/db'
import { botIngestionQueue } from '@/lib/queues'

const RECALL_BASE_URL = 'https://us-west-2.recall.ai/api/v1'
const POLL_INTERVAL_MS = 2 * 60 * 1000   // 2 minutes
const LOOKBACK_HOURS = 24
const STUCK_THRESHOLD_MS = 5 * 60 * 1000 // ignore recordings < 5 min old (may still be in-call)

type RecallBot = {
  id: string
  status_changes: Array<{ code: string; created_at: string }>
}

async function pollOnce(): Promise<void> {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()

  // Fetch recent bots from Recall.ai.
  const res = await fetch(
    `${RECALL_BASE_URL}/bot/?created_at_after=${since}&limit=100`,
    { headers: { Authorization: `Token ${process.env.RECALLAI_API_KEY}` } },
  )
  if (!res.ok) {
    console.error('[bot-poller] Recall.ai API error:', res.status)
    return
  }

  const data = (await res.json()) as { results?: RecallBot[] }
  const bots: RecallBot[] = data.results ?? []

  // Keep only bots whose final status is 'done' or 'call_ended'.
  const doneBotIds = bots
    .filter((b) => {
      const last = b.status_changes?.[b.status_changes.length - 1]?.code
      return last === 'done' || last === 'call_ended'
    })
    .map((b) => b.id)

  if (doneBotIds.length === 0) {
    console.log(`[bot-poller] checked ${bots.length} bots, 0 done — nothing to do`)
    return
  }

  // Find any of those bots where our Recording is still stuck at PROCESSING
  // with no audio uploaded yet (s3Key null).
  // Note: createdAt filter is done in JS instead of SQL — the Neon HTTP adapter
  // has a timezone offset issue that makes Prisma DateTime comparisons unreliable.
  const candidates = await db.recording.findMany({
    where: {
      botId: { in: doneBotIds },
      status: 'PROCESSING',
      s3Key: null,
    },
    select: { id: true, botId: true, title: true, createdAt: true },
  })

  const now = Date.now()
  const stuck = candidates.filter(rec => now - rec.createdAt.getTime() > STUCK_THRESHOLD_MS)

  for (const rec of stuck) {
    if (!rec.botId) continue
    await botIngestionQueue.add('ingest', { botId: rec.botId })
    console.log(`[bot-poller] RECOVERED: "${rec.title}" (bot ${rec.botId})`)
  }

  console.log(
    `[bot-poller] checked ${bots.length} bots (${doneBotIds.length} done), ` +
    `found ${stuck.length} stuck, enqueued ${stuck.length}`,
  )
}

let polls = 0

async function main(): Promise<void> {
  console.log('[bot-poller] worker starting…')
  await pollOnce()
  setInterval(async () => {
    polls++
    try {
      await pollOnce()
    } catch (err) {
      console.error('[bot-poller] poll failed:', err)
      Sentry.captureException(err, { tags: { worker: 'bot-poller' } })
    }
    if (polls % 30 === 0) {
      console.log(`[bot-poller] alive — ${polls} polls completed`)
    }
  }, POLL_INTERVAL_MS)
}

main().catch((err) => {
  console.error('[bot-poller] fatal:', err)
  Sentry.captureException(err)
  process.exit(1)
})
