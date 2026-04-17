// Kolasys AI — Dashboard overview page

import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { Mic2, FileText, CheckSquare, Clock, CheckCheck } from 'lucide-react'
import Link from 'next/link'
import { StuckRecordingsBanner } from '@/components/stuck-recordings-banner'
import { GradientStatCard } from '@/components/gradient-stat-card'

export const metadata: Metadata = { title: 'Dashboard' }

const STUCK_THRESHOLD_MS = 30 * 60_000

export default async function DashboardPage() {
  const { orgId } = await auth()

  const [recordingCount, noteCount, actionItemCount, completedCount] = await Promise.all([
    orgId ? db.recording.count({ where: { orgId } }) : 0,
    orgId ? db.note.count({ where: { orgId } }) : 0,
    orgId ? db.actionItem.count({ where: { orgId, status: 'OPEN' } }) : 0,
    orgId ? db.actionItem.count({ where: { orgId, status: 'COMPLETED' } }) : 0,
  ])

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

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-xl font-bold text-primary sm:text-2xl">Overview</h1>
      <p className="mt-1 text-sm text-secondary">
        Welcome to Kolasys AI — your AI-powered meeting intelligence hub.
      </p>

      <div className="mt-5 sm:mt-6">
        <StuckRecordingsBanner recordings={stuckRecordings} />
      </div>

      {/* Stat cards */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:mt-6 sm:grid-cols-2 xl:grid-cols-4">
        <GradientStatCard
          variant="recordings"
          icon={Mic2}
          label="Total Recordings"
          value={recordingCount}
          href="/dashboard/recordings"
        />
        <GradientStatCard
          variant="notes"
          icon={FileText}
          label="Meeting Notes"
          value={noteCount}
          href="/dashboard/recordings"
        />
        <GradientStatCard
          variant="actionitems"
          icon={CheckSquare}
          label="Open Action Items"
          value={actionItemCount}
          href="/dashboard/action-items"
        />
        <GradientStatCard
          variant="checkins"
          icon={CheckCheck}
          label="Completed Tasks"
          value={completedCount}
          href="/dashboard/action-items"
        />
      </div>

      {/* Recent recordings */}
      <div className="mt-7 sm:mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-primary">Recent Recordings</h2>
          <Link
            href="/dashboard/recordings"
            className="text-sm font-medium text-accent hover:opacity-80"
          >
            View all →
          </Link>
        </div>

        {recentRecordings.length === 0 ? (
          <div className="glass mt-4 flex flex-col items-center justify-center py-10 text-center sm:py-12">
            <Mic2 className="mb-3 h-10 w-10 text-muted" />
            <p className="text-sm font-medium text-secondary">No recordings yet</p>
            <p className="mt-1 text-xs text-muted">
              Upload a file, record in your browser, or send a bot to a meeting.
            </p>
            <Link
              href="/dashboard/recordings"
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
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
                  className="glass lift-on-hover flex min-h-[52px] items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Mic2 className="h-4 w-4 flex-shrink-0 text-muted" />
                    <span className="truncate text-sm font-medium text-primary">{r.title}</span>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2 text-xs text-secondary sm:gap-3">
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
