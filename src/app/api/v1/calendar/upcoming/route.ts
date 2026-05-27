// Kolasys AI — Public REST API: upcoming calendar events (next 8 hours).
// Auth: `Authorization: Bearer kol_…`
//
// GET /api/v1/calendar/upcoming — merges the org's connected Google and/or
// Microsoft calendars. The desktop app calls this to populate "Coming up" and
// to auto-name a recording from the meeting that's about to start.
//
// OAuth tokens are stored per-member on OrgMember.googleRefreshToken /
// OrgMember.microsoftRefreshToken (refresh tokens only — never access tokens;
// see calendar.router.ts). A bearer API key resolves to an orgId but no user,
// so we pick the first member in the org holding each provider's token and
// mint a fresh access token from it on every call. Each provider is wrapped in
// its own try/catch so one expired connection never blanks the other's events.

import { ConfidentialClientApplication } from '@azure/msal-node'
import { db } from '@/lib/db'
import { authenticateApiKey, unauthorizedResponse } from '@/lib/api-auth'

// msal-node is Node-only.
export const runtime = 'nodejs'

const GRAPH_SCOPES = ['Calendars.Read', 'offline_access', 'User.Read']

type UpcomingEvent = {
  id: string
  title: string
  start: string // ISO datetime
  end: string // ISO datetime
  attendees: string[]
  source: 'google' | 'microsoft'
}

export async function GET(request: Request) {
  const auth = await authenticateApiKey(request)
  if (!auth) return unauthorizedResponse()

  console.log('[calendar/upcoming] orgId:', auth.orgId)

  const now = new Date()
  const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000) // TEMP: 48h for debugging (was 8h)
  const events: UpcomingEvent[] = []

  // ── Google ────────────────────────────────────────────────────────────────
  try {
    const member = await db.orgMember.findFirst({
      where: { orgId: auth.orgId, googleRefreshToken: { not: null } },
      select: { id: true, googleRefreshToken: true },
    })
    console.log('[calendar/upcoming] google token exists:', !!member?.googleRefreshToken)
    if (member?.googleRefreshToken) {
      const googleEvents = await fetchGoogleEvents(member.id, member.googleRefreshToken, now, cutoff)
      events.push(...googleEvents)
      console.log('[calendar/upcoming] google events:', googleEvents.length)
    }
  } catch (err) {
    console.error('[v1/calendar] google failed:', err)
  }

  // ── Microsoft ───────────────────────────────────────────────────────────────
  try {
    const member = await db.orgMember.findFirst({
      where: { orgId: auth.orgId, microsoftRefreshToken: { not: null } },
      select: { id: true, microsoftRefreshToken: true },
    })
    console.log('[calendar/upcoming] microsoft token exists:', !!member?.microsoftRefreshToken)
    if (member?.microsoftRefreshToken) {
      const msEvents = await fetchMicrosoftEvents(member.id, member.microsoftRefreshToken, now, cutoff)
      events.push(...msEvents)
      console.log('[calendar/upcoming] microsoft events:', msEvents.length)
    }
  } catch (err) {
    console.error('[v1/calendar] microsoft failed:', err)
  }

  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  return Response.json({ events })
}

// ── Google ────────────────────────────────────────────────────────────────────

type GoogleEvent = {
  id?: string
  status?: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: Array<{ email?: string }>
}

async function fetchGoogleEvents(
  memberId: string,
  refreshToken: string,
  now: Date,
  cutoff: Date,
): Promise<UpcomingEvent[]> {
  // Only a refresh token is stored, so exchange it for a fresh access token.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '')
    // A revoked/expired refresh token can't recover — clear it so the user
    // is prompted to reconnect (mirrors calendar.router.ts).
    if (text.includes('invalid_grant')) {
      await db.orgMember.update({ where: { id: memberId }, data: { googleRefreshToken: null } }).catch(() => {})
    }
    throw new Error(`google token refresh ${tokenRes.status}: ${text.slice(0, 200)}`)
  }
  const { access_token } = (await tokenRes.json()) as { access_token?: string }
  if (!access_token) throw new Error('google: no access_token in refresh response')

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
  url.searchParams.set('timeMin', now.toISOString())
  url.searchParams.set('timeMax', cutoff.toISOString())
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '20')
  url.searchParams.set('timeZone', 'UTC')

  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } })
  if (!res.ok) {
    throw new Error(`google events ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  }

  const data = (await res.json()) as { items?: GoogleEvent[] }
  return (data.items ?? [])
    .filter((e) => e.status !== 'cancelled')
    .map<UpcomingEvent>((e) => ({
      id: e.id ?? '',
      title: e.summary ?? 'Untitled',
      start: e.start?.dateTime ?? e.start?.date ?? '',
      end: e.end?.dateTime ?? e.end?.date ?? '',
      attendees: (e.attendees ?? []).map((a) => a.email ?? '').filter(Boolean),
      source: 'google',
    }))
}

// ── Microsoft ───────────────────────────────────────────────────────────────

type GraphEvent = {
  id?: string
  subject?: string
  start?: { dateTime?: string }
  end?: { dateTime?: string }
  attendees?: Array<{ emailAddress?: { address?: string } }>
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

async function fetchMicrosoftEvents(
  memberId: string,
  refreshToken: string,
  now: Date,
  cutoff: Date,
): Promise<UpcomingEvent[]> {
  const cca = makeMicrosoftCca()
  if (!cca) return []

  // Acquire a fresh access token from the stored refresh token.
  let accessToken: string
  try {
    const result = await cca.acquireTokenByRefreshToken({ refreshToken, scopes: GRAPH_SCOPES })
    if (!result?.accessToken) throw new Error('no access token returned by msal-node')
    accessToken = result.accessToken
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/invalid_grant|AADSTS70008|AADSTS50173/.test(msg)) {
      await db.orgMember.update({ where: { id: memberId }, data: { microsoftRefreshToken: null } }).catch(() => {})
    }
    throw new Error(`microsoft token refresh: ${msg}`)
  }

  const url = new URL('https://graph.microsoft.com/v1.0/me/calendarView')
  url.searchParams.set('startDateTime', now.toISOString())
  url.searchParams.set('endDateTime', cutoff.toISOString())
  url.searchParams.set('$select', 'id,subject,start,end,attendees')
  url.searchParams.set('$orderby', 'start/dateTime')
  url.searchParams.set('$top', '20')

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
  })
  if (!res.ok) {
    throw new Error(`graph /calendarView ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  }

  const body = (await res.json()) as { value?: GraphEvent[] }
  return (body.value ?? []).map<UpcomingEvent>((e) => ({
    id: e.id ?? '',
    title: e.subject ?? 'Untitled',
    start: toIsoUtc(e.start?.dateTime),
    end: toIsoUtc(e.end?.dateTime),
    attendees: (e.attendees ?? []).map((a) => a.emailAddress?.address ?? '').filter(Boolean),
    source: 'microsoft',
  }))
}

// Graph returns "2026-05-18T14:30:00.0000000" (no Z) under Prefer:
// outlook.timezone="UTC" — append Z so Date treats it as UTC.
function toIsoUtc(dt: string | undefined): string {
  if (!dt) return ''
  return /[Zz]|[+-]\d{2}:?\d{2}$/.test(dt) ? dt : `${dt}Z`
}
