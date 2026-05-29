// Kolasys AI — Calendar bot poller.
//
// Runs on Railway 24/7. Every 60s, walks every org that has:
//   - autoRecordMeetings === true
//   - suspended === false
//   - at least one OrgMember with a Google or Microsoft refresh token
//
// For each upcoming meeting in the next 4–6 minutes that has a video URL
// (Zoom / Teams / Meet), it auto-deploys a Recall.ai bot via the existing
// meetingbot.service helper (so we get a webhook_url and the same payload
// shape the manual-deploy path uses → bot.done flows into botIngestionQueue
// → bot-ingest.service → S3 → transcription / summarization).
//
// Polling, not a BullMQ Worker: there's no event source to consume from,
// just wall-clock time. `calendarBotQueue` is scaffolded in lib/queues.ts
// for future manual-trigger use but unused here.

import 'dotenv/config'
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  initialScope: { tags: { worker: 'calendar-bot' } },
})

import { ConfidentialClientApplication } from '@azure/msal-node'
import { db } from '@/lib/db'
import { deployBot } from '@/services/meetingbot.service'
import { RecordingSource, RecordingStatus } from '@/generated/prisma/client'

const POLL_INTERVAL_MS = 60 * 1_000
const LOOKAHEAD_MS = 15 * 60 * 1_000 // pull events for the next 15 minutes
const DEPLOY_WINDOW_MIN = 4 // deploy when 4 ≤ minutesUntilStart ≤ 6
const DEPLOY_WINDOW_MAX = 6
const DEDUPE_LOOKBACK_MS = 30 * 60 * 1_000 // don't double-deploy in 30 min

// Status set we treat as "already-in-flight" when deciding whether to deploy.
// FAILED is intentionally excluded so a failed attempt can retry next poll.
const ACTIVE_STATUSES: RecordingStatus[] = [
  RecordingStatus.PENDING,
  RecordingStatus.PROCESSING,
  RecordingStatus.TRANSCRIBING,
  RecordingStatus.SUMMARIZING,
  RecordingStatus.READY,
]

const GRAPH_SCOPES = ['Calendars.Read', 'offline_access', 'User.Read']

type UpcomingEvent = {
  externalId: string
  title: string
  start: string
  description: string
  location: string
  source: 'google' | 'microsoft'
}

// ── URL extraction ─────────────────────────────────────────────────────────
// Title / description / location are the three places clients dump the join
// URL. Patterns intentionally permissive — Recall handles the parse on
// their end as long as we hand them a real provider URL.

function extractMeetingUrl(event: UpcomingEvent): string | null {
  const text = [event.title, event.description, event.location].filter(Boolean).join(' ')
  const patterns = [
    /https:\/\/[a-z0-9-]+\.zoom\.us\/j\/[\w?=&%/\-.]+/i,
    /https:\/\/us[0-9]+web\.zoom\.us\/j\/[\w?=&%/\-.]+/i,
    /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[\w%/\-._~:?#[\]@!$&'()*+,;=]+/i,
    /https:\/\/meet\.google\.com\/[a-z-]+/i,
  ]
  for (const pattern of patterns) {
    const m = text.match(pattern)
    if (m) return m[0]
  }
  return null
}

// ── Google ─────────────────────────────────────────────────────────────────

type GoogleApiEvent = {
  id?: string
  summary?: string
  description?: string
  location?: string
  status?: string
  start?: { dateTime?: string; date?: string }
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>
  }
}

async function getGoogleEvents(refreshToken: string): Promise<UpcomingEvent[]> {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return []

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      // Form-urlencoded matches /api/v1/calendar/upcoming and is the canonical
      // OAuth2 token-endpoint encoding. Google accepts both, this stays
      // consistent with the rest of the codebase.
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    if (!tokenRes.ok) {
      console.error('[calendar-bot] google token refresh failed:', tokenRes.status)
      return []
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string }
    const accessToken = tokenJson.access_token
    if (!accessToken) return []

    const now = new Date()
    const cutoff = new Date(now.getTime() + LOOKAHEAD_MS)
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    url.searchParams.set('timeMin', now.toISOString())
    url.searchParams.set('timeMax', cutoff.toISOString())
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '25')

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) {
      console.error('[calendar-bot] google events fetch failed:', res.status)
      return []
    }
    const data = (await res.json()) as { items?: GoogleApiEvent[] }

    return (data.items ?? [])
      .filter((e) => e.status !== 'cancelled')
      .map<UpcomingEvent>((e) => {
        // Prefer Google's structured conference URL — it's a real Meet link
        // even when the user pasted nothing in the description.
        const conferenceUrl =
          e.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ?? ''
        return {
          externalId: e.id ?? '',
          title: e.summary ?? 'Untitled',
          start: e.start?.dateTime ?? e.start?.date ?? '',
          description: e.description ?? '',
          // Hoist the conference URL into `location` so extractMeetingUrl
          // sees it without us needing a special-case here.
          location: [e.location ?? '', conferenceUrl].filter(Boolean).join(' '),
          source: 'google',
        }
      })
  } catch (err) {
    console.error('[calendar-bot] google fetch threw:', err)
    return []
  }
}

// ── Microsoft ──────────────────────────────────────────────────────────────

type GraphEvent = {
  id?: string
  subject?: string
  bodyPreview?: string
  body?: { content?: string }
  start?: { dateTime?: string }
  location?: { displayName?: string }
  onlineMeeting?: { joinUrl?: string }
  onlineMeetingUrl?: string
}

function makeMicrosoftCca(): ConfidentialClientApplication | null {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) return null
  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common'
  return new ConfidentialClientApplication({
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      authority: `https://login.microsoftonline.com/${tenant}`,
    },
  })
}

async function getMicrosoftEvents(refreshToken: string): Promise<UpcomingEvent[]> {
  const cca = makeMicrosoftCca()
  if (!cca) return []

  try {
    const result = await cca.acquireTokenByRefreshToken({
      refreshToken,
      scopes: GRAPH_SCOPES,
    })
    if (!result?.accessToken) return []

    const now = new Date()
    const cutoff = new Date(now.getTime() + LOOKAHEAD_MS)
    const url = new URL('https://graph.microsoft.com/v1.0/me/calendarView')
    url.searchParams.set('startDateTime', now.toISOString())
    url.searchParams.set('endDateTime', cutoff.toISOString())
    url.searchParams.set(
      '$select',
      'id,subject,bodyPreview,body,start,location,onlineMeeting,onlineMeetingUrl',
    )
    url.searchParams.set('$orderby', 'start/dateTime')
    url.searchParams.set('$top', '25')

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${result.accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
    })
    if (!res.ok) {
      console.error('[calendar-bot] graph fetch failed:', res.status)
      return []
    }
    const data = (await res.json()) as { value?: GraphEvent[] }
    return (data.value ?? []).map<UpcomingEvent>((e) => {
      const joinUrl = e.onlineMeeting?.joinUrl ?? e.onlineMeetingUrl ?? ''
      return {
        externalId: e.id ?? '',
        title: e.subject ?? 'Untitled',
        start: toIsoUtc(e.start?.dateTime),
        description: e.bodyPreview ?? e.body?.content ?? '',
        location: [e.location?.displayName ?? '', joinUrl].filter(Boolean).join(' '),
        source: 'microsoft',
      }
    })
  } catch (err) {
    console.error('[calendar-bot] microsoft fetch threw:', err)
    return []
  }
}

function toIsoUtc(dt: string | undefined): string {
  if (!dt) return ''
  return /[Zz]|[+-]\d{2}:?\d{2}$/.test(dt) ? dt : `${dt}Z`
}

// ── Deploy ─────────────────────────────────────────────────────────────────
// Mirrors calendar.router.ts:deployBotForEvent so the calendar-bot worker
// and the manual /dashboard/calendar "Deploy bot" button produce
// indistinguishable Recording rows + Recall webhooks.

async function deployBotForMeeting(
  orgId: string,
  userId: string,
  botDisplayName: string,
  event: UpcomingEvent,
  meetingUrl: string,
): Promise<void> {
  const recording = await db.recording.create({
    data: {
      orgId,
      userId,
      title: event.title,
      source: RecordingSource.MEETING_BOT,
      status: RecordingStatus.PENDING,
      meetingUrl,
    },
  })

  try {
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/recall`
    const botId = await deployBot(meetingUrl, recording.id, webhookUrl, botDisplayName)
    await db.recording.update({
      where: { id: recording.id },
      data: { botId, status: RecordingStatus.PROCESSING },
    })
    console.log(
      `[calendar-bot] deployed bot ${botId} for "${event.title}" (org ${orgId}, recording ${recording.id})`,
    )
  } catch (err) {
    await db.recording.update({
      where: { id: recording.id },
      data: { status: RecordingStatus.FAILED },
    })
    Sentry.captureException(err, {
      tags: { worker: 'calendar-bot', phase: 'deploy' },
      extra: { orgId, eventTitle: event.title, meetingUrl },
    })
    throw err
  }
}

// ── Main poll loop ─────────────────────────────────────────────────────────

let inFlight = false
let processedPolls = 0

async function pollCalendars(): Promise<void> {
  if (inFlight) {
    console.log('[calendar-bot] previous poll still running — skipping this tick')
    return
  }
  inFlight = true
  const pollStart = Date.now()
  try {
    const orgs = await db.organization.findMany({
      where: { autoRecordMeetings: true, suspended: false },
      select: {
        id: true,
        botDisplayName: true,
        members: {
          where: {
            OR: [
              { googleRefreshToken: { not: null } },
              { microsoftRefreshToken: { not: null } },
            ],
          },
          select: {
            userId: true,
            googleRefreshToken: true,
            microsoftRefreshToken: true,
          },
          // One member per org is enough — first member with calendar OAuth
          // owns the "view" the bot will join from.
          take: 1,
        },
      },
    })

    for (const org of orgs) {
      const member = org.members[0]
      if (!member) continue

      try {
        const [googleEvents, msEvents] = await Promise.all([
          member.googleRefreshToken ? getGoogleEvents(member.googleRefreshToken) : Promise.resolve([]),
          member.microsoftRefreshToken
            ? getMicrosoftEvents(member.microsoftRefreshToken)
            : Promise.resolve([]),
        ])

        for (const event of [...googleEvents, ...msEvents]) {
          if (!event.start) continue
          const startMs = new Date(event.start).getTime()
          if (Number.isNaN(startMs)) continue

          const minutesUntilStart = (startMs - Date.now()) / 60_000
          if (minutesUntilStart < DEPLOY_WINDOW_MIN || minutesUntilStart > DEPLOY_WINDOW_MAX) {
            continue
          }

          const meetingUrl = extractMeetingUrl(event)
          if (!meetingUrl) continue

          // Dedupe by meetingUrl in the recent past — covers re-deploy after
          // a transient failure, the recording.done double-fire, and the
          // case where Google + Microsoft both surface the same event.
          // FAILED is intentionally excluded so a failed attempt retries.
          const existing = await db.recording.findFirst({
            where: {
              orgId: org.id,
              meetingUrl,
              status: { in: ACTIVE_STATUSES },
              createdAt: { gte: new Date(Date.now() - DEDUPE_LOOKBACK_MS) },
            },
            select: { id: true },
          })
          if (existing) continue

          await deployBotForMeeting(
            org.id,
            member.userId,
            org.botDisplayName,
            event,
            meetingUrl,
          )
        }

        // Bump last-run timestamp on success so /admin can show "polled X
        // minutes ago" without hammering the recordings table.
        await db.organization
          .update({
            where: { id: org.id },
            data: { lastCalendarBotRun: new Date() },
          })
          .catch((err) => console.error('[calendar-bot] lastCalendarBotRun update failed:', err))
      } catch (err) {
        console.error(`[calendar-bot] org ${org.id} failed:`, err)
        Sentry.captureException(err, {
          tags: { worker: 'calendar-bot', phase: 'per-org' },
          extra: { orgId: org.id },
        })
      }
    }
  } catch (err) {
    console.error('[calendar-bot] poll loop threw:', err)
    Sentry.captureException(err, { tags: { worker: 'calendar-bot', phase: 'poll-loop' } })
  } finally {
    inFlight = false
    processedPolls += 1
    console.log(`[calendar-bot] poll complete in ${Date.now() - pollStart}ms`)
  }
}

// ── Startup + heartbeat ────────────────────────────────────────────────────

console.log('[calendar-bot] worker starting…')
void pollCalendars()
setInterval(() => {
  void pollCalendars()
}, POLL_INTERVAL_MS)

// Heartbeat mirrors the format the transcription / summarization workers
// emit so /admin's Worker Health card can grep uniformly across logs.
setInterval(() => {
  console.log(`[calendar-bot] alive — processed ${processedPolls} polls`)
}, 60 * 1_000)
