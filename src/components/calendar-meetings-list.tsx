'use client'

// Kolasys AI — Calendar meetings list + deploy bot (client component).
// Now merges Google + Microsoft events; the event payload tells us which
// provider it came from so the UI can label it and the disconnect button
// knows which token to clear.

import { useState } from 'react'
import Link from 'next/link'
import {
  Calendar,
  Clock,
  Users,
  Bot,
  CheckCircle2,
  Copy,
  Check,
  Loader2,
  ExternalLink,
  Mic,
} from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { relativeTime } from '@/lib/utils'

export function CalendarMeetingsList() {
  const {
    data: meetings,
    isLoading,
    error,
    refetch,
  } = trpc.calendar.listUpcomingMeetings.useQuery(undefined, {
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 min
  })

  const disconnectMutation = trpc.calendar.disconnect.useMutation({
    onSuccess: () => {
      window.location.reload()
    },
  })

  if (isLoading) {
    return (
      <div className="mt-6 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-neutral-200 bg-neutral-100" />
        ))}
      </div>
    )
  }

  if (error) {
    const isExpired =
      error.message?.includes('expired') || error.message?.includes('reconnect')
    const isMicrosoft = error.message?.includes('Microsoft')
    return (
      <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
        <p className="text-sm font-medium text-red-800">
          {isExpired
            ? `Your ${isMicrosoft ? 'Microsoft' : 'Google'} Calendar token has expired.`
            : `Failed to load meetings: ${error.message}`}
        </p>
        {isExpired && (
          <a
            href={isMicrosoft ? '/api/auth/microsoft' : '/api/auth/google'}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-red-700 underline hover:text-red-900"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Reconnect {isMicrosoft ? 'Microsoft' : 'Google'} Calendar
          </a>
        )}
      </div>
    )
  }

  if (!meetings || meetings.length === 0) {
    return (
      <div className="mt-6 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 py-12 text-center">
        <Calendar className="mb-3 h-8 w-8 text-neutral-300" />
        <p className="text-sm font-medium text-neutral-500">No upcoming meetings in the next 2 weeks</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 text-xs text-brand-600 underline hover:text-brand-700"
        >
          Refresh
        </button>
      </div>
    )
  }

  // Build the disconnect-buttons row based on which providers actually
  // appear in the merged list — avoids showing "Disconnect Microsoft"
  // when only Google events came back.
  const providers = new Set(meetings.map((m) => m.provider))

  return (
    <div className="mt-6 space-y-3">
      {meetings.map((event) => (
        <MeetingRow key={`${event.provider}:${event.id}`} event={event} />
      ))}
      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        {providers.has('google') && (
          <button
            type="button"
            onClick={() => disconnectMutation.mutate({ provider: 'google' })}
            disabled={disconnectMutation.isPending}
            className="text-xs text-neutral-400 underline hover:text-neutral-600"
          >
            Disconnect Google
          </button>
        )}
        {providers.has('microsoft') && (
          <button
            type="button"
            onClick={() => disconnectMutation.mutate({ provider: 'microsoft' })}
            disabled={disconnectMutation.isPending}
            className="text-xs text-neutral-400 underline hover:text-neutral-600"
          >
            Disconnect Microsoft
          </button>
        )}
      </div>
    </div>
  )
}

type CalendarEvent = {
  id: string
  title: string
  startTime: string
  endTime: string
  meetingUrl: string | null
  attendees: string[]
  provider: 'google' | 'microsoft'
}

function MeetingRow({ event }: { event: CalendarEvent }) {
  const [deployed, setDeployed] = useState(false)
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const deployMutation = trpc.calendar.deployBotForEvent.useMutation({
    onSuccess: (data) => {
      setDeployed(true)
      setRecordingId(data.recordingId)
    },
  })

  const start = new Date(event.startTime)
  const isInPast = start < new Date()

  function copyTitleForDesktop() {
    navigator.clipboard.writeText(event.title).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white px-5 py-4 shadow-sm">
      {/* Time */}
      <div className="flex w-20 flex-shrink-0 flex-col items-center justify-center rounded-lg bg-neutral-50 py-2">
        <span className="text-xs font-medium text-neutral-500">
          {start.toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        </span>
        <span className="mt-0.5 text-sm font-semibold text-neutral-900">
          {start.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-neutral-900">{event.title}</p>
          <span
            className={
              'rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ' +
              (event.provider === 'google'
                ? 'bg-blue-50 text-blue-700'
                : 'bg-violet-50 text-violet-700')
            }
            title={event.provider === 'google' ? 'Google Calendar' : 'Microsoft Outlook'}
          >
            {event.provider === 'google' ? 'G' : 'MS'}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {relativeTime(start)}
          </span>
          {event.attendees.length > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}
            </span>
          )}
          {event.meetingUrl && (
            <a
              href={event.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-brand-500 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Join meeting
            </a>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {/* Start Desktop Recording — copies the title so the desktop app
            can pre-fill it for the next recording it starts. */}
        <button
          type="button"
          onClick={copyTitleForDesktop}
          title="Copy meeting title for the desktop recorder"
          className={
            'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ' +
            (copied
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50')
          }
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Start Desktop Recording'}
        </button>

        {/* Bot deploy */}
        {deployed && recordingId ? (
          <Link
            href={`/dashboard/recordings/${recordingId}`}
            className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition-colors hover:bg-green-100"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Bot deployed
          </Link>
        ) : event.meetingUrl && !isInPast ? (
          <button
            type="button"
            onClick={() =>
              deployMutation.mutate({
                eventId: event.id,
                eventTitle: event.title,
                meetingUrl: event.meetingUrl!,
              })
            }
            disabled={deployMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {deployMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Bot className="h-3.5 w-3.5" />
            )}
            Send Bot
          </button>
        ) : (
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-400">
            {isInPast ? 'Past' : 'No video link'}
          </span>
        )}
      </div>
    </div>
  )
}
