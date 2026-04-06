// Kolasys AI — Google Calendar tRPC router
import 'server-only'

import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, orgProcedure, protectedProcedure } from '../trpc'
import { google } from 'googleapis'
import { deployBot } from '@/services/meetingbot.service'

function makeOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
  )
}

export type CalendarEvent = {
  id: string
  title: string
  startTime: string
  endTime: string
  meetingUrl: string | null
  attendees: string[]
}

export const calendarRouter = router({
  // ── Return the Google OAuth authorization URL ─────────────────────────────
  getAuthUrl: protectedProcedure.query(() => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Google Calendar is not configured on this server.',
      })
    }
    const client = makeOAuth2Client()
    const url = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar.readonly'],
      prompt: 'consent', // force refresh token on every authorization
    })
    return { url }
  }),

  // ── Check whether the current user has connected Google Calendar ───────────
  connectionStatus: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.orgId) return { connected: false }

    // Resolve DB orgId (ctx.orgId may be clerkOrgId in protectedProcedure)
    const org = await ctx.db.organization.findFirst({
      where: { clerkOrgId: ctx.orgId },
      select: { id: true },
    })
    if (!org) return { connected: false }

    const member = await ctx.db.orgMember.findFirst({
      where: { orgId: org.id, userId: ctx.userId },
      select: { googleRefreshToken: true },
    })
    return { connected: !!member?.googleRefreshToken }
  }),

  // ── List upcoming Google Calendar meetings ────────────────────────────────
  listUpcomingMeetings: orgProcedure.query(async ({ ctx }) => {
    const member = await ctx.db.orgMember.findFirst({
      where: { orgId: ctx.orgId, userId: ctx.userId },
      select: { googleRefreshToken: true },
    })

    if (!member?.googleRefreshToken) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Google Calendar not connected.',
      })
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Google Calendar is not configured on this server.',
      })
    }

    const oauth2Client = makeOAuth2Client()
    oauth2Client.setCredentials({ refresh_token: member.googleRefreshToken })

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

      const events: CalendarEvent[] = (data.items ?? [])
        .filter((e) => e.status !== 'cancelled')
        .map((e) => ({
          id: e.id ?? '',
          title: e.summary ?? 'Untitled',
          startTime: e.start?.dateTime ?? e.start?.date ?? '',
          endTime: e.end?.dateTime ?? e.end?.date ?? '',
          meetingUrl:
            e.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')
              ?.uri ??
            e.location?.match(/https?:\/\/[^\s]+/)?.[0] ??
            null,
          attendees: (e.attendees ?? [])
            .filter((a) => a.email)
            .map((a) => a.email!),
        }))

      return events
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('invalid_grant') || msg.includes('Token has been expired')) {
        // Revoke the stored token so the user is prompted to reconnect
        await ctx.db.orgMember.update({
          where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
          data: { googleRefreshToken: null },
        })
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Google Calendar token expired. Please reconnect.',
        })
      }
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: msg })
    }
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
        const botId = await deployBot(input.meetingUrl, recording.id, webhookUrl)
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

  // ── Disconnect Google Calendar ─────────────────────────────────────────────
  disconnect: orgProcedure.mutation(async ({ ctx }) => {
    await ctx.db.orgMember.update({
      where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
      data: { googleRefreshToken: null },
    })
    return { success: true }
  }),
})
