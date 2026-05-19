// Kolasys AI — Calendar sync page (server component + client sub-components).
// Surfaces both Google and Microsoft calendar connections; the meetings
// list shows merged events from whichever provider(s) are connected.

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { CalendarMeetingsList } from '@/components/calendar-meetings-list'
import { Calendar, CheckCircle2, ExternalLink } from 'lucide-react'

export const metadata = { title: 'Calendar — Kolasys AI' }

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  const { userId, orgId: clerkOrgId } = await auth()
  if (!userId || !clerkOrgId) redirect('/dashboard')

  const { connected, error } = await searchParams

  const org = await db.organization.findFirst({
    where: { clerkOrgId },
    select: { id: true },
  })

  const member = org
    ? await db.orgMember.findFirst({
        where: { orgId: org.id, userId },
        select: { googleRefreshToken: true, microsoftRefreshToken: true },
      })
    : null

  const googleConnected = !!member?.googleRefreshToken
  const microsoftConnected = !!member?.microsoftRefreshToken
  const anyConnected = googleConnected || microsoftConnected

  const googleConfigured = !!(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  )
  const microsoftConfigured = !!(
    process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
  )

  return (
    <div className="p-4 dark:bg-[#0F0F13] sm:p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Calendar</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
            Upcoming meetings — deploy a recording bot in one click.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {googleConnected && <ProviderChip label="Google connected" tone="blue" />}
          {microsoftConnected && (
            <ProviderChip label="Microsoft connected" tone="violet" />
          )}
        </div>
      </div>

      {/* Feedback banners */}
      {connected === '1' && (
        <Banner tone="green">Google Calendar connected successfully.</Banner>
      )}
      {connected === 'microsoft' && (
        <Banner tone="green">Microsoft Outlook Calendar connected successfully.</Banner>
      )}
      {error && <Banner tone="red">{errorMessage(error)}</Banner>}

      {/* Connect cards — render whichever providers aren't connected yet */}
      {(!googleConnected || !microsoftConnected) && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {!googleConnected && (
            <ConnectCard
              providerLabel="Google Calendar"
              description="Read-only access to your Google Calendar events."
              configured={googleConfigured}
              connectHref="/api/auth/google"
              missingEnvHint="GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET"
            />
          )}
          {!microsoftConnected && (
            <ConnectCard
              providerLabel="Microsoft Outlook"
              description="Sync Teams + Outlook calendars. Read-only access."
              configured={microsoftConfigured}
              connectHref="/api/auth/microsoft"
              missingEnvHint="MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET"
            />
          )}
        </div>
      )}

      {/* Meetings — rendered when at least one provider is connected. The
          client component fetches both providers via tRPC and merges them. */}
      {anyConnected && <CalendarMeetingsList />}
    </div>
  )
}

function ProviderChip({
  label,
  tone,
}: {
  label: string
  tone: 'blue' | 'violet'
}) {
  const cls =
    tone === 'blue'
      ? 'bg-blue-50 text-blue-700 ring-blue-200'
      : 'bg-violet-50 text-violet-700 ring-violet-200'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${cls}`}
    >
      <CheckCircle2 className="h-3 w-3" />
      {label}
    </span>
  )
}

function ConnectCard({
  providerLabel,
  description,
  configured,
  connectHref,
  missingEnvHint,
}: {
  providerLabel: string
  description: string
  configured: boolean
  connectHref: string
  missingEnvHint: string
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-neutral-200 py-10 px-6 text-center dark:border-white/10">
      <Calendar className="mb-3 h-10 w-10 text-neutral-300 dark:text-gray-500" />
      <p className="text-sm font-medium text-neutral-900 dark:text-white">
        Connect {providerLabel}
      </p>
      <p className="mt-1 max-w-xs text-xs text-neutral-500 dark:text-gray-400">
        {description}
      </p>
      {configured ? (
        <a
          href={connectHref}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          <ExternalLink className="h-4 w-4" />
          Connect {providerLabel}
        </a>
      ) : (
        <p className="mt-5 max-w-xs text-xs text-neutral-400 dark:text-gray-500">
          Not configured — set{' '}
          <code className="rounded bg-neutral-100 px-1 dark:bg-white/10 dark:text-gray-300">
            {missingEnvHint}
          </code>{' '}
          in the environment to enable.
        </p>
      )}
    </div>
  )
}

function Banner({
  tone,
  children,
}: {
  tone: 'green' | 'red'
  children: React.ReactNode
}) {
  const cls =
    tone === 'green'
      ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200'
      : 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
  return (
    <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>
  )
}

function errorMessage(code: string): string {
  const map: Record<string, string> = {
    google_auth_failed: 'Google authorization was declined or failed. Please try again.',
    microsoft_auth_failed:
      'Microsoft authorization was declined or failed. Please try again.',
    no_refresh_token: 'No refresh token was returned. Please disconnect and reconnect.',
    no_org: 'No active workspace selected. Please switch to a workspace first.',
    org_not_found: 'Workspace not found. Please try again.',
    member_not_found: 'Your membership could not be verified. Please try again.',
    token_exchange_failed: 'Failed to exchange the authorization code. Please try again.',
    not_configured: 'This calendar provider is not configured on the server.',
  }
  return map[code] ?? `An error occurred (${code}). Please try again.`
}
