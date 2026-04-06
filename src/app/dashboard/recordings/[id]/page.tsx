// Kolasys AI — Recording detail page
// params is a Promise in Next.js 16 — must be awaited.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { StatusBadge } from '@/components/status-badge'
import { formatDuration, relativeTime } from '@/lib/utils'
import { Mic2, Clock, Calendar, User, FileText, CheckSquare } from 'lucide-react'

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const recording = await db.recording.findUnique({
    where: { id },
    select: { title: true },
  })
  return { title: recording?.title ?? 'Recording' }
}

export default async function RecordingDetailPage({ params }: Props) {
  const { id } = await params

  const recording = await db.recording.findUnique({
    where: { id },
    include: {
      transcript: {
        include: {
          segments: { orderBy: { startTime: 'asc' }, take: 200 },
        },
      },
      notes: {
        include: {
          sections: { orderBy: { order: 'asc' } },
          actionItems: { orderBy: { priority: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      jobs: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  })

  if (!recording) notFound()

  const latestNote = recording.notes[0]

  return (
    <div className="mx-auto max-w-4xl p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50">
              <Mic2 className="h-5 w-5 text-brand-600" />
            </div>
            <h1 className="truncate text-2xl font-bold text-neutral-900">{recording.title}</h1>
          </div>
          {recording.description && (
            <p className="mt-2 text-sm text-neutral-500">{recording.description}</p>
          )}
        </div>
        <StatusBadge status={recording.status} className="mt-1 flex-shrink-0" />
      </div>

      {/* Meta */}
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-neutral-500">
        <span className="flex items-center gap-1.5">
          <Calendar className="h-4 w-4" />
          {relativeTime(recording.createdAt)}
        </span>
        {recording.duration !== null && (
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {formatDuration(recording.duration)}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <User className="h-4 w-4" />
          {recording.source.replace('_', ' ').toLowerCase()}
        </span>
      </div>

      {/* Processing jobs */}
      {recording.jobs.length > 0 && recording.status === 'PROCESSING' && (
        <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          Processing your recording… this may take a few minutes.
        </div>
      )}

      {/* Notes */}
      {latestNote && (
        <section className="mt-8">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-neutral-900">Meeting Notes</h2>
          </div>

          {latestNote.summary && (
            <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-5">
              <p className="text-sm font-medium text-neutral-700">Summary</p>
              <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
                {latestNote.summary}
              </p>
            </div>
          )}

          {latestNote.sections.length > 0 && (
            <div className="mt-3 space-y-3">
              {latestNote.sections.map((section) => (
                <div
                  key={section.id}
                  className="rounded-xl border border-neutral-200 bg-white p-5"
                >
                  <p className="mb-2 text-sm font-semibold text-neutral-800">{section.title}</p>
                  <div className="prose prose-sm max-w-none text-neutral-600">
                    {section.content.split('\n').map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action items */}
          {latestNote.actionItems.length > 0 && (
            <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-brand-600" />
                <p className="text-sm font-semibold text-neutral-800">Action Items</p>
              </div>
              <ul className="mt-3 space-y-2">
                {latestNote.actionItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 text-sm text-neutral-700"
                  >
                    <span
                      className={`inline-flex h-2 w-2 flex-shrink-0 rounded-full ${
                        item.priority === 'URGENT'
                          ? 'bg-red-500'
                          : item.priority === 'HIGH'
                          ? 'bg-orange-400'
                          : item.priority === 'MEDIUM'
                          ? 'bg-yellow-400'
                          : 'bg-neutral-300'
                      }`}
                    />
                    {item.title}
                    {item.dueDate && (
                      <span className="text-xs text-neutral-400">
                        due {new Date(item.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Transcript */}
      {recording.transcript && (
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-900">
            <Mic2 className="h-5 w-5 text-brand-600" />
            Transcript
          </h2>

          <div className="mt-3 max-h-[500px] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-5">
            {recording.transcript.segments.length > 0 ? (
              <div className="space-y-4">
                {recording.transcript.segments.map((seg) => (
                  <div key={seg.id} className="flex gap-3">
                    <span className="mt-0.5 w-14 flex-shrink-0 font-mono text-xs text-neutral-400">
                      {formatDuration(seg.startTime)}
                    </span>
                    <div className="min-w-0">
                      {seg.speaker && (
                        <p className="mb-0.5 text-xs font-semibold text-brand-600">{seg.speaker}</p>
                      )}
                      <p className="text-sm text-neutral-700 leading-relaxed">{seg.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-600 leading-relaxed">
                {recording.transcript.text}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Empty state while processing */}
      {!recording.transcript && recording.status === 'PENDING' && (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 py-16 text-center">
          <Mic2 className="mb-3 h-10 w-10 text-neutral-300" />
          <p className="text-sm font-medium text-neutral-500">
            Transcript will appear here once processing is complete.
          </p>
        </div>
      )}
    </div>
  )
}
