// Kolasys AI — Meeting series detail page.
//
// Server component. Title is inline-editable via a client subcomponent that
// calls `series.rename`. "Ask AI about this series" navigates the user to
// /dashboard/search?q=<synthesized prompt> rather than touching the
// existing /api/ai/ask route — minimum-viable hook until per-series
// streaming is wired up.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { Layers, Mic2 } from 'lucide-react'
import { db } from '@/lib/db'
import { formatDuration, relativeTime } from '@/lib/utils'
import { EditableSeriesTitle } from '@/components/editable-series-title'
import { SeriesAskAiInput } from '@/components/series-ask-ai-input'

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const series = await db.meetingSeries.findUnique({
    where: { id },
    select: { name: true },
  })
  return { title: series?.name ?? 'Series' }
}

export default async function SeriesDetailPage({ params }: Props) {
  const { id } = await params
  const { orgId: clerkOrgId } = await auth()
  if (!clerkOrgId) notFound()

  const org = await db.organization.findFirst({
    where: { clerkOrgId },
    select: { id: true },
  })
  if (!org) notFound()

  const series = await db.meetingSeries.findFirst({
    where: { id, orgId: org.id },
    include: {
      recordings: {
        include: {
          recording: {
            select: {
              id: true,
              title: true,
              createdAt: true,
              status: true,
              duration: true,
              notes: {
                take: 1,
                orderBy: { createdAt: 'desc' },
                select: { summary: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!series) notFound()

  const meetingCount = series.recordings.length
  const subtitleSuffix = series.autoDetected ? ' · Auto-detected' : ''

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-line bg-app/60 px-4 py-4 backdrop-blur-sm dark:bg-[#0F0F13]/70 sm:px-8 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10"
                style={{
                  background:
                    'linear-gradient(135deg, color-mix(in srgb, var(--accent) 20%, transparent) 0%, color-mix(in srgb, var(--accent) 5%, transparent) 100%)',
                }}
              >
                <Layers className="h-4 w-4 text-accent sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <EditableSeriesTitle seriesId={series.id} initialName={series.name} />
                <p className="mt-0.5 text-xs text-secondary">
                  {meetingCount} {meetingCount === 1 ? 'meeting' : 'meetings'}
                  {subtitleSuffix}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Meetings list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
        {meetingCount === 0 ? (
          <p className="text-sm text-secondary">No meetings in this series yet.</p>
        ) : (
          <ul className="space-y-2">
            {series.recordings.map(({ recording: r }) => {
              const summary = r.notes[0]?.summary ?? null
              const trimmed =
                summary && summary.length > 200
                  ? `${summary.slice(0, 200)}…`
                  : summary
              return (
                <li key={r.id}>
                  <Link
                    href={`/dashboard/recordings/${r.id}`}
                    className="block rounded-xl border border-line bg-white p-3 shadow-sm transition hover:border-neutral-300 dark:border-white/10 dark:bg-[#1A1A24] dark:hover:border-white/20"
                  >
                    <div className="flex items-start gap-3">
                      <Mic2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-primary">
                            {r.title}
                          </p>
                          <span className="flex-shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500 dark:bg-white/10 dark:text-gray-400">
                            {r.status}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-secondary">
                          {relativeTime(r.createdAt)}
                          {r.duration ? ` · ${formatDuration(r.duration)}` : ''}
                        </p>
                        {trimmed && (
                          <p className="mt-1 line-clamp-2 text-xs text-secondary">
                            {trimmed}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Ask AI input */}
      <div className="flex-shrink-0 border-t border-line bg-app/60 px-4 py-3 backdrop-blur-sm dark:bg-[#0F0F13]/70 sm:px-8 sm:py-4">
        <SeriesAskAiInput seriesName={series.name} />
      </div>
    </div>
  )
}
