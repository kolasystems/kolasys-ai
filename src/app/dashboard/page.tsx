// Kolasys AI — Dashboard overview (Fireflies-style home)

import type { Metadata } from 'next'
import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  Clock,
  Download,
  ListChecks,
  Mic2,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { StuckRecordingsBanner } from '@/components/stuck-recordings-banner'
import { KolasysLogoMark } from '@/components/kolasys-logo'

export const metadata: Metadata = { title: 'Dashboard' }

const STUCK_THRESHOLD_MS = 30 * 60_000

// ── Helpers ────────────────────────────────────────────────────────────────

function greetingFor(date: Date): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatToday(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const [{ orgId }, user] = await Promise.all([auth(), currentUser()])

  // Stats — 3 clean cards: Recordings, Open Actions, Contacts.
  // Contacts count ≈ distinct SpeakerLabel displayName for the org (good
  // enough for a home-page stat; exact aggregation lives on /contacts).
  const [recordingCount, actionItemCount, distinctLabels] = await Promise.all([
    orgId ? db.recording.count({ where: { orgId } }) : 0,
    orgId ? db.actionItem.count({ where: { orgId, status: 'OPEN' } }) : 0,
    orgId
      ? db.speakerLabel.findMany({
          where: { recording: { orgId } },
          distinct: ['displayName'],
          select: { displayName: true },
        })
      : [],
  ])
  const contactCount = distinctLabels.length

  const recentRecordings = orgId
    ? await db.recording.findMany({
        where: { orgId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          duration: true,
          createdAt: true,
        },
      })
    : []

  const stuckRecordings = orgId
    ? await db.recording.findMany({
        where: {
          orgId,
          status: { in: ['PENDING', 'PROCESSING', 'TRANSCRIBING', 'SUMMARIZING'] },
          createdAt: { lt: new Date(Date.now() - STUCK_THRESHOLD_MS) },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true },
      })
    : []

  const now = new Date()
  const greeting = greetingFor(now)
  const todayLabel = formatToday(now)
  const firstName = user?.firstName ?? 'there'

  return (
    <div className="p-4 sm:p-8">
      {/* ── Hero greeting ─────────────────────────────────────────── */}
      <section
        className={[
          'relative overflow-hidden rounded-2xl border p-5 sm:p-7',
          'border-neutral-200/80 dark:border-white/10',
          'bg-gradient-to-br from-slate-100 via-blue-50/60 to-indigo-50',
          'dark:bg-gradient-to-br dark:from-[#1A1A2E] dark:via-[#16213E] dark:to-[#0F3460]',
        ].join(' ')}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-neutral-900 dark:text-white sm:text-2xl">
              {greeting}, {firstName}!
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-white/70">
              Here&apos;s your meeting intelligence for today.
            </p>
          </div>
          <div className="hidden flex-shrink-0 items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-white/60 sm:flex">
            <Clock className="h-3.5 w-3.5" />
            {todayLabel}
          </div>
        </div>
      </section>

      {/* Stuck recordings banner — only renders when there are any */}
      <div className="mt-5">
        <StuckRecordingsBanner recordings={stuckRecordings} />
      </div>

      {/* ── Kolasys Desktop App banner ────────────────────────────── */}
      <section className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-neutral-900 px-4 py-3 text-white dark:bg-white/10 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center">
            <KolasysLogoMark size={20} className="text-white" />
          </div>
          <p className="min-w-0 text-sm leading-snug">
            <span className="font-semibold">Kolasys Desktop App</span>
            <span className="hidden text-white/60 sm:inline">
              {' '}— Record meetings without a bot. No participant sees you.
            </span>
            <span className="inline text-white/60 sm:hidden">
              {' '}— Record without a bot.
            </span>
          </p>
        </div>
        <button
          type="button"
          disabled
          aria-disabled
          className="flex flex-shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white/80"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Download</span>
          <span className="ml-1 hidden rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white/90 sm:inline">
            Coming soon
          </span>
        </button>
      </section>

      {/* ── 3 clean stat cards ───────────────────────────────────── */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4">
        <StatCard
          href="/dashboard/recordings"
          icon={<Mic2 className="h-4 w-4" />}
          label="Total Recordings"
          value={recordingCount}
        />
        <StatCard
          href="/dashboard/action-items"
          icon={<ListChecks className="h-4 w-4" />}
          label="Open Action Items"
          value={actionItemCount}
        />
        <StatCard
          href="/dashboard/contacts"
          icon={<Users className="h-4 w-4" />}
          label="Contacts"
          value={contactCount}
        />
      </div>

      {/* ── Recent Meetings ──────────────────────────────────────── */}
      <div className="mt-7 sm:mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
            Recent Meetings
          </h2>
          <Link
            href="/dashboard/recordings"
            className="text-sm font-medium text-[#CA2625] hover:opacity-80"
          >
            View all →
          </Link>
        </div>

        {recentRecordings.length === 0 ? (
          <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white py-10 text-center dark:border-white/10 dark:bg-[#1A1A24] sm:py-12">
            <Mic2 className="mb-3 h-10 w-10 text-neutral-300 dark:text-gray-500" />
            <p className="text-sm font-medium text-neutral-500 dark:text-gray-400">
              No meetings yet
            </p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-gray-500">
              Upload a file, record in your browser, or send a bot to a meeting.
            </p>
            <Link
              href="/dashboard/recordings"
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#CA2625] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#b21f1f]"
            >
              <Mic2 className="h-4 w-4" />
              New Recording
            </Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {recentRecordings.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dashboard/recordings/${r.id}`}
                  className="flex min-h-[52px] items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 transition-colors hover:border-[#CA2625]/40 hover:bg-neutral-50 dark:border-white/10 dark:bg-[#1A1A24] dark:hover:border-[#CA2625]/40 dark:hover:bg-white/5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-white/5">
                      <Mic2 className="h-4 w-4 text-neutral-500 dark:text-gray-400" />
                    </div>
                    <span className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                      {r.title}
                    </span>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2 text-xs text-neutral-500 dark:text-gray-400 sm:gap-3">
                    {r.duration && (
                      <span className="hidden items-center gap-1 sm:flex">
                        <Clock className="h-3 w-3" />
                        {Math.round(r.duration / 60)}m
                      </span>
                    )}
                    <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Clean stat card — no gradient, neutral icon ────────────────────────────

function StatCard({
  href,
  icon,
  label,
  value,
}: {
  href?: string
  icon: React.ReactNode
  label: string
  value: number
}) {
  const content = (
    <div className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-300 dark:border-white/10 dark:bg-[#1A1A24] dark:hover:border-white/20 sm:p-5">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-white/5 dark:text-gray-400">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums leading-none text-neutral-900 dark:text-white">
          {value}
        </p>
        <p className="mt-1.5 text-xs text-neutral-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  )
  if (href) return <Link href={href}>{content}</Link>
  return content
}
