// Kolasys AI — Dashboard overview page

import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { Mic2, FileText, CheckSquare, Clock } from 'lucide-react'
import Link from 'next/link'
import { StuckRecordingsBanner } from '@/components/stuck-recordings-banner'

export const metadata: Metadata = { title: 'Dashboard' }

const STUCK_THRESHOLD_MS = 30 * 60_000

export default async function DashboardPage() {
  const { orgId } = await auth()

  const [recordingCount, noteCount, actionItemCount] = await Promise.all([
    orgId ? db.recording.count({ where: { orgId } }) : 0,
    orgId ? db.note.count({ where: { orgId } }) : 0,
    orgId ? db.actionItem.count({ where: { orgId, status: 'OPEN' } }) : 0,
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

  const stats = [
    { label: 'Total Recordings', value: recordingCount, icon: Mic2, href: '/dashboard/recordings' },
    { label: 'Meeting Notes', value: noteCount, icon: FileText, href: '/dashboard/recordings' },
    { label: 'Open Action Items', value: actionItemCount, icon: CheckSquare, href: '/dashboard/action-items' },
  ]

  return (
    <div className="p-4 sm:p-8">
      <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl">Overview</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Welcome to Kolasys AI — your AI-powered meeting intelligence hub.
      </p>

      <div className="mt-5 sm:mt-6">
        <StuckRecordingsBanner recordings={stuckRecordings} />
      </div>

      {/* Stat cards */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:mt-6 sm:grid-cols-3 sm:gap-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50">
              <stat.icon className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-neutral-900">{stat.value}</p>
              <p className="text-xs text-neutral-500">{stat.label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent recordings */}
      <div className="mt-7 sm:mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900">Recent Recordings</h2>
          <Link
            href="/dashboard/recordings"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            View all →
          </Link>
        </div>

        {recentRecordings.length === 0 ? (
          <div className="mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 py-10 text-center sm:py-12">
            <Mic2 className="mb-3 h-10 w-10 text-neutral-300" />
            <p className="text-sm font-medium text-neutral-500">No recordings yet</p>
            <p className="mt-1 text-xs text-neutral-400">
              Upload a file, record in your browser, or send a bot to a meeting.
            </p>
            <Link
              href="/dashboard/recordings"
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
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
                  className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:bg-neutral-50 transition-colors min-h-[52px]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Mic2 className="h-4 w-4 flex-shrink-0 text-neutral-400" />
                    <span className="truncate text-sm font-medium text-neutral-800">{r.title}</span>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2 text-xs text-neutral-500 sm:gap-3">
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
