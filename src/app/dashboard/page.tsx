// Kolasys AI — Dashboard overview (Fireflies-style home)

import type { Metadata } from 'next'
import { auth, currentUser } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  CalendarDays,
  CheckCircle2,
  Download,
  MessageSquareText,
  Newspaper,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { StuckRecordingsBanner } from '@/components/stuck-recordings-banner'
import { KolasysLogoMark } from '@/components/kolasys-logo'
import { DashboardGreeting } from '@/components/dashboard-greeting'

export const metadata: Metadata = { title: 'Dashboard' }

const STUCK_THRESHOLD_MS = 30 * 60_000

// ── Helpers ────────────────────────────────────────────────────────────────

// First letter of a title, uppercased — used by the Recent Meetings avatar.
function initialOf(title: string): string {
  const ch = title.trim()[0]
  return ch ? ch.toUpperCase() : '?'
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const [{ orgId }, user] = await Promise.all([auth(), currentUser()])

  // Stats — cheap home-page counts. Contacts ≈ distinct SpeakerLabel.displayName
  // for the org (the exact aggregation lives on /contacts).
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

  const firstName = user?.firstName ?? 'there'

  return (
    <div className="p-4 sm:p-8">
      {/* ── Full-bleed atmospheric hero ─────────────────────────────
         Negative margins break out of the page's p-4/p-8 padding so the
         gradient reaches the full width of the main content area. No top
         radius (flush against the header), rounded bottom to soften the
         transition to the stat row below. */}
      <section
        className={[
          'relative -mx-4 -mt-4 sm:-mx-8 sm:-mt-8',
          'rounded-b-2xl',
          'bg-gradient-to-br from-[#C9D8E8] via-[#D4C5B0] to-[#A8C4D4]',
          'dark:from-[#1A1A2E] dark:via-[#16213E] dark:to-[#0F3460]',
          'px-4 pb-10 sm:px-8 sm:pb-12',
        ].join(' ')}
      >
        {/* Inner content container — pt-8 gives the greeting breathing room
            at the very top of the main content area (the banner is flush
            against the top edge, so internal padding is the only margin). */}
        <div className="pt-8 sm:pt-10">
          <DashboardGreeting firstName={firstName} />
          <p className="mt-1 text-sm text-neutral-600 dark:text-white/70">
            Here&apos;s your meeting intelligence for today.
          </p>
        </div>
      </section>

      {/* Stuck recordings banner — only renders when there are any */}
      <div className="mt-5">
        <StuckRecordingsBanner recordings={stuckRecordings} />
      </div>

      {/* ── Quick stat row ──────────────────────────────────────────
         3 columns on every screen; numbers are short enough to fit at
         phone widths. Subtle neutral-50 backgrounds so the row reads as
         soft context, not a stack of heavy cards. */}
      <div className="mt-5 grid grid-cols-3 gap-3 sm:mt-6 sm:gap-4">
        <StatCard
          href="/dashboard/recordings"
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" strokeWidth={2} />}
          label="Total Recordings"
          value={recordingCount}
        />
        <StatCard
          href="/dashboard/action-items"
          icon={<Zap className="h-5 w-5 text-amber-500" strokeWidth={2} />}
          label="Open Action Items"
          value={actionItemCount}
        />
        <StatCard
          href="/dashboard/contacts"
          icon={<Users className="h-5 w-5 text-violet-500" strokeWidth={2} />}
          label="Contacts"
          value={contactCount}
        />
      </div>

      {/* ── AI Features ────────────────────────────────────────────── */}
      <div className="mt-7 sm:mt-8">
        <div className="mb-3 flex items-center gap-2 sm:mb-4">
          <Sparkles className="h-4 w-4 text-neutral-500 dark:text-gray-400" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
            AI Features
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <AIFeatureCard
            gradient="from-violet-500 to-purple-600"
            icon={<Newspaper className="h-5 w-5 text-white" strokeWidth={2} />}
            title="Daily Digest"
            subtitle="Morning recap of your meetings"
            active
          />
          <AIFeatureCard
            gradient="from-pink-500 to-orange-400"
            icon={<CalendarDays className="h-5 w-5 text-white" strokeWidth={2} />}
            title="Meeting Prep"
            subtitle="Briefings before your next call"
            active
          />
          <AIFeatureCard
            gradient="from-emerald-500 to-teal-500"
            icon={<MessageSquareText className="h-5 w-5 text-white" strokeWidth={2} />}
            title="Popular Topics"
            subtitle="Trending themes from meetings"
            active
          />
        </div>
      </div>

      {/* ── Kolasys Desktop App banner ────────────────────────────── */}
      <section className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-neutral-900 px-4 py-3 text-white dark:bg-white/10 sm:mt-6 sm:px-5">
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

      {/* ── Recent Meetings ──────────────────────────────────────── */}
      <div className="mt-7 sm:mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
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
          <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-neutral-100/60 bg-white py-10 text-center shadow-sm dark:border-white/10 dark:bg-[#1A1A24] sm:py-12">
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
              New Recording
            </Link>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-100 rounded-xl border border-neutral-100/60 bg-white shadow-sm dark:divide-white/10 dark:border-white/10 dark:bg-[#1A1A24]">
            {recentRecordings.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dashboard/recordings/${r.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-white/5 sm:px-5"
                >
                  {/* Initial-letter avatar */}
                  <div
                    aria-hidden
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-700 dark:bg-white/10 dark:text-gray-200"
                  >
                    {initialOf(r.title)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                      {r.title}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-xs text-neutral-500 dark:text-gray-400">
                    {new Date(r.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Stat card — subtle neutral-50 surface, colored icon ────────────────────

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
    <div className="flex items-center gap-3 rounded-xl border border-neutral-100/60 bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-white/10 dark:bg-[#1A1A24] dark:hover:border-white/20">
      <div className="flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums leading-none text-neutral-900 dark:text-white">
          {value}
        </p>
        <p className="mt-1.5 text-xs text-neutral-500 dark:text-gray-400 sm:text-sm">
          {label}
        </p>
      </div>
    </div>
  )
  if (href) return <Link href={href}>{content}</Link>
  return content
}

// ── AI Feature card ───────────────────────────────────────────────────────

function AIFeatureCard({
  gradient,
  icon,
  title,
  subtitle,
  active,
}: {
  gradient: string // Tailwind class fragment, e.g. "from-violet-500 to-purple-600"
  icon: React.ReactNode
  title: string
  subtitle: string
  active?: boolean
}) {
  return (
    <div className="rounded-2xl border border-neutral-100/60 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${gradient}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">
              {title}
            </p>
            {active && (
              <CheckCircle2
                className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500"
                strokeWidth={2.25}
              />
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-gray-400">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  )
}
