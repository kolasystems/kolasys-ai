// Kolasys AI — Calendar tRPC router (Google + Microsoft Outlook).
//
// The original Google integration is preserved verbatim. Microsoft Outlook
// support is layered alongside it: separate refresh-token column, separate
// auth-URL procedure, listUpcomingMeetings merges both providers, and
// disconnect takes a provider argument.
import 'server-only'

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure, protectedProcedure } from '../trpc'
import { google } from 'googleapis'
import { ConfidentialClientApplication } from '@azure/msal-node'
import { deployBot } from '@/services/meetingbot.service'

function makeGoogleOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
  )
}

function makeMicrosoftCca(): ConfidentialClientApplication | null {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    return null
  }
  const tenant = process.env.MICROSOFT_TENANT_ID ?? 'common'
  return new ConfidentialClientApplication({
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      authority: `https://login.microsoftonline.com/${tenant}`,
    },
  })
}

const GRAPH_SCOPES = ['Calendars.Read', 'offline_access', 'User.Read']

export type CalendarEvent = {
  id: string
  title: string
  startTime: string
  endTime: string
  meetingUrl: string | null
  attendees: string[]
  provider: 'google' | 'microsoft'
}

export const calendarRouter = router({
  // ── Google: return the OAuth authorization URL ────────────────────────────
  getAuthUrl: protectedProcedure.query(() => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Google Calendar is not configured on this server.',
      })
    }
    const client = makeGoogleOAuth2Client()
    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar.readonly'],
      prompt: 'consent',
    })
    return { url }
  }),

  // ── Microsoft: return the OAuth authorization URL ─────────────────────────
  getMicrosoftAuthUrl: protectedProcedure.query(async () => {
    const cca = makeMicrosoftCca()
    if (!cca) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Microsoft Calendar is not configured on this server.',
      })
    }
    const redirectUri =
      process.env.MICROSOFT_REDIRECT_URI ??
      `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/microsoft/callback`
    const url = await cca.getAuthCodeUrl({
      scopes: GRAPH_SCOPES,
      redirectUri,
      prompt: 'consent',
    })
    return { url }
  }),

  // ── Combined connection status (both providers) ───────────────────────────
  connectionStatus: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.orgId) return { google: false, microsoft: false }

    // Resolve DB orgId (ctx.orgId is clerkOrgId in protectedProcedure)
    const org = await ctx.db.organization.findFirst({
      where: { clerkOrgId: ctx.orgId },
      select: { id: true },
    })
    if (!org) return { google: false, microsoft: false }

    const member = await ctx.db.orgMember.findFirst({
      where: { orgId: org.id, userId: ctx.userId },
      select: { googleRefreshToken: true, microsoftRefreshToken: true },
    })
    return {
      google: !!member?.googleRefreshToken,
      microsoft: !!member?.microsoftRefreshToken,
    }
  }),

  // ── List upcoming meetings — merges Google + Microsoft ────────────────────
  listUpcomingMeetings: orgProcedure.query(async ({ ctx }) => {
    const member = await ctx.db.orgMember.findFirst({
      where: { orgId: ctx.orgId, userId: ctx.userId },
      select: { googleRefreshToken: true, microsoftRefreshToken: true },
    })
    if (!member?.googleRefreshToken && !member?.microsoftRefreshToken) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'No calendar connected. Connect Google or Microsoft first.',
      })
    }

    // Run both fetches in parallel; tolerate individual failures so one
    // provider's expired token doesn't blank the whole list.
    const results = await Promise.allSettled([
      member.googleRefreshToken
        ? fetchGoogleEvents(ctx, member.googleRefreshToken)
        : Promise.resolve<CalendarEvent[]>([]),
      member.microsoftRefreshToken
        ? fetchMicrosoftEvents(ctx, member.microsoftRefreshToken)
        : Promise.resolve<CalendarEvent[]>([]),
    ])

    const events: CalendarEvent[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') events.push(...r.value)
      else console.error('[calendar] provider fetch failed:', r.reason)
    }
    events.sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    )
    return events
  }),

  // ── Deploy a meeting bot for a calendar event ─────────────────────────────
  deployBotForEvent: orgProcedure
    .input(
      z.object({
        eventId: z.string(),
        eventTitle: z.string(),
        meetingUrl: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { RecordingSource, RecordingStatus } = await import('@/generated/prisma/client')

      const recording = await ctx.db.recording.create({
        data: {
          orgId: ctx.orgId,
          userId: ctx.userId,
          title: input.eventTitle,
          source: RecordingSource.MEETING_BOT,
          status: RecordingStatus.PENDING,
          meetingUrl: input.meetingUrl,
        },
      })

      try {
        const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/recall`
        const orgPrefs = await ctx.db.organization.findUnique({
          where: { id: ctx.orgId },
          select: { botDisplayName: true },
        })
        const botId = await deployBot(
          input.meetingUrl,
          recording.id,
          webhookUrl,
          orgPrefs?.botDisplayName ?? 'Kolasys AI',
        )
        await ctx.db.recording.update({
          where: { id: recording.id },
          data: { botId, status: RecordingStatus.PROCESSING },
        })
        return { recordingId: recording.id, botId }
      } catch (err) {
        await ctx.db.recording.update({
          where: { id: recording.id },
          data: { status: RecordingStatus.FAILED },
        })
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Failed to deploy bot',
        })
      }
    }),

  // ── Disconnect one provider ───────────────────────────────────────────────
  disconnect: orgProcedure
    .input(z.object({ provider: z.enum(['google', 'microsoft']) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.orgMember.update({
        where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
        data:
          input.provider === 'google'
            ? { googleRefreshToken: null }
            : { microsoftRefreshToken: null },
      })
      return { success: true, provider: input.provider }
    }),
})

// ── Google event fetcher ───────────────────────────────────────────────────

type Ctx = {
  db: typeof import('@/lib/db').db
  orgId: string
  userId: string
}

async function fetchGoogleEvents(
  ctx: Ctx,
  refreshToken: string,
): Promise<CalendarEvent[]> {
  if (!process.env.GOOGLE_CLIENT_ID) return []

  const oauth2Client = makeGoogleOAuth2Client()
  oauth2Client.setCredentials({ refresh_token: refreshToken })

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })
    const now = new Date()
    const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

    const { data } = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: twoWeeksOut.toISOString(),
      maxResults: 30,
      singleEvents: true,
      orderBy: 'startTime',
    })

    return (data.items ?? [])
      .filter((e) => e.status !== 'cancelled')
      .map<CalendarEvent>((e) => ({
        id: e.id ?? '',
        title: e.summary ?? 'Untitled',
        startTime: e.start?.dateTime ?? e.start?.date ?? '',
        endTime: e.end?.dateTime ?? e.end?.date ?? '',
        meetingUrl:
          e.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')
            ?.uri ??
          e.location?.match(/https?:\/\/[^\s]+/)?.[0] ??
          null,
        attendees: (e.attendees ?? []).filter((a) => a.email).map((a) => a.email!),
        provider: 'google',
      }))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('invalid_grant') || msg.includes('Token has been expired')) {
      await ctx.db.orgMember.update({
        where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
        data: { googleRefreshToken: null },
      })
    }
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: msg })
  }
}

// ── Microsoft event fetcher ────────────────────────────────────────────────

type GraphEvent = {
  id?: string
  subject?: string
  start?: { dateTime?: string; timeZone?: string }
  end?: { dateTime?: string; timeZone?: string }
  onlineMeeting?: { joinUrl?: string } | null
  onlineMeetingUrl?: string | null
  body?: { content?: string; contentType?: string }
  location?: { displayName?: string } | null
  attendees?: Array<{ emailAddress?: { address?: string } }>
}

async function fetchMicrosoftEvents(
  ctx: Ctx,
  refreshToken: string,
): Promise<CalendarEvent[]> {
  const cca = makeMicrosoftCca()
  if (!cca) return []

  // Acquire a fresh access token from the stored refresh token.
  let accessToken: string
  try {
    const result = await cca.acquireTokenByRefreshToken({
      refreshToken,
      scopes: GRAPH_SCOPES,
    })
    if (!result?.accessToken) {
      throw new Error('No access token returned by msal-node')
    }
    accessToken = result.accessToken
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/invalid_grant|AADSTS70008|AADSTS50173/.test(msg)) {
      await ctx.db.orgMember.update({
        where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
        data: { microsoftRefreshToken: null },
      })
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Microsoft Calendar token expired. Please reconnect.',
      })
    }
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: msg })
  }

  // Hit /me/calendarview directly — no need to pull in the Graph SDK for
  // a single endpoint. calendarview honours singleEvents-style expansion.
  const now = new Date()
  const twoWeeksOut = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  const url = new URL('https://graph.microsoft.com/v1.0/me/calendarview')
  url.searchParams.set('startDateTime', now.toISOString())
  url.searchParams.set('endDateTime', twoWeeksOut.toISOString())
  url.searchParams.set(
    '$select',
    'id,subject,start,end,onlineMeeting,onlineMeetingUrl,body,location,attendees',
  )
  url.searchParams.set('$orderby', 'start/dateTime')
  url.searchParams.set('$top', '30')

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.timezone="UTC"',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Graph /calendarview ${res.status}: ${text.slice(0, 200)}`,
    })
  }
  const body = (await res.json()) as { value?: GraphEvent[] }
  return (body.value ?? []).map<CalendarEvent>((e) => ({
    id: e.id ?? '',
    title: e.subject ?? 'Untitled',
    startTime: toIsoUtc(e.start?.dateTime),
    endTime: toIsoUtc(e.end?.dateTime),
    meetingUrl:
      e.onlineMeeting?.joinUrl ??
      e.onlineMeetingUrl ??
      extractMeetingUrlFromBody(e.body?.content) ??
      null,
    attendees: (e.attendees ?? [])
      .map((a) => a.emailAddress?.address ?? '')
      .filter(Boolean),
    provider: 'microsoft',
  }))
}

function toIsoUtc(dt: string | undefined): string {
  if (!dt) return ''
  // Graph returns "2026-05-18T14:30:00.0000000" (no Z) when Prefer:
  // outlook.timezone="UTC" is set — append Z so Date.parse treats it as UTC.
  return /[Zz]|[+-]\d{2}:?\d{2}$/.test(dt) ? dt : `${dt}Z`
}

function extractMeetingUrlFromBody(html: string | undefined): string | null {
  if (!html) return null
  // Match Zoom / Google Meet / Teams / generic https links in the event body.
  const match = html.match(
    /https?:\/\/(?:[a-z0-9-]+\.)?(?:zoom\.us|meet\.google\.com|teams\.microsoft\.com)[^\s"<]*/i,
  )
  return match?.[0] ?? null
}
