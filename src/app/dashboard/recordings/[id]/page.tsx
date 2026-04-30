// Kolasys AI — Recording detail page
// Fireflies-style split pane: Notes on the left, Transcript / Ask AI on the right.
// params is a Promise in Next.js 16 — must be awaited.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { StatusBadge, isStuck, formatStuckAge } from '@/components/status-badge'
import { DeleteRecordingButton } from '@/components/delete-recording-button'
import { RetryStuckButton } from '@/components/retry-stuck-button'
import { RecordingStatusPoller } from '@/components/recording-status-poller'
import { GenerateEmbeddingsButton } from '@/components/generate-embeddings-button'
import { RecordingActionsMenu } from '@/components/recording-actions-menu'
import { RecordingSplitView } from '@/components/recording-split-view'
import { ShareRecordingButton } from '@/components/share-recording-button'
import { formatDuration, relativeTime } from '@/lib/utils'
import { Mic2, Clock, Calendar, User } from 'lucide-react'

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

const IN_PROGRESS_STATUSES = new Set(['PENDING', 'PROCESSING', 'TRANSCRIBING', 'SUMMARIZING'])

export default async function RecordingDetailPage({ params }: Props) {
  const { id } = await params

  const recording = await db.recording.findUnique({
    where: { id },
    include: {
      transcript: {
        select: {
          id: true,
          text: true,
          language: true,
          segments: { orderBy: { startTime: 'asc' }, take: 101 },
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
      speakerLabels: {
        select: { speakerId: true, displayName: true },
        orderBy: { speakerId: 'asc' },
      },
    },
  })

  if (!recording) notFound()

  const latestNote = recording.notes[0] ?? null

  const allSegments = recording.transcript?.segments ?? []
  const initialSegments = allSegments.slice(0, 100).map((s) => ({
    id: s.id,
    startTime: s.startTime,
    endTime: s.endTime,
    speaker: s.speaker,
    text: s.text,
    wordsJson: s.wordsJson,
  }))
  const initialHasMore = allSegments.length > 100
  const uniqueSpeakerIds = Array.from(
    new Set(initialSegments.map((s) => s.speaker).filter((s): s is string => !!s)),
  )

  const hasTranscript = !!recording.transcript
  const canRetranscribe = !!recording.s3Key

  // Serialisable props for the split view (plain JSON — no class instances, no functions).
  const noteProp = latestNote
    ? {
        id: latestNote.id,
        summary: latestNote.summary,
        templateId: latestNote.templateId,
        sections: latestNote.sections.map((s) => ({
          id: s.id,
          title: s.title,
          content: s.content,
        })),
        actionItems: latestNote.actionItems.map((a) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          status: a.status as 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
          priority: a.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
          dueDate: a.dueDate,
        })),
      }
    : null

  const transcriptProp = recording.transcript
    ? {
        id: recording.transcript.id,
        text: recording.transcript.text,
        language: recording.transcript.language,
        initialSegments,
        initialHasMore,
        uniqueSpeakerIds,
      }
    : null

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <RecordingStatusPoller status={recording.status} />

      {/* Header — stays above the split pane */}
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
                <Mic2 className="h-4 w-4 text-accent sm:h-5 sm:w-5" />
              </div>
              <h1 className="truncate text-lg font-bold text-primary sm:text-xl">
                {recording.title}
              </h1>
            </div>

            {/* Meta row */}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-secondary sm:gap-4">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {relativeTime(recording.createdAt)}
              </span>
              {recording.duration !== null && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(recording.duration)}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {recording.source.replace('_', ' ').toLowerCase()}
              </span>
            </div>
          </div>

          {/* Header actions — note: Ask AI lives in the right pane now */}
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            <StatusBadge status={recording.status} createdAt={recording.createdAt} />
            {recording.status === 'READY' && (
              <ShareRecordingButton
                recordingId={recording.id}
                initialIsPublic={recording.isPublic}
                initialSlug={recording.publicSlug}
              />
            )}
            {recording.status === 'READY' && recording.transcript && (
              <GenerateEmbeddingsButton recordingId={recording.id} />
            )}
            <RecordingActionsMenu
              recordingId={recording.id}
              hasTranscript={hasTranscript}
              canRetranscribe={canRetranscribe}
            />
            <DeleteRecordingButton recordingId={recording.id} />
          </div>
        </div>

        {/* Processing / Stuck banner — below header actions so it stays visible */}
        {IN_PROGRESS_STATUSES.has(recording.status) &&
          (isStuck(recording.status, recording.createdAt) ? (
            <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <div className="flex items-start gap-3">
                <span aria-hidden className="mt-0.5 text-lg leading-none">
                  ⚠
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    This recording appears stuck
                  </p>
                  <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/80">
                    Stuck for {formatStuckAge(recording.createdAt)}. The transcription worker may
                    have failed silently.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <RetryStuckButton recordingId={recording.id} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass mt-4 flex items-center gap-2 px-4 py-2.5 text-sm text-accent">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
              {recording.status === 'TRANSCRIBING' && 'Transcribing your recording…'}
              {recording.status === 'SUMMARIZING' && 'Generating meeting notes…'}
              {(recording.status === 'PROCESSING' || recording.status === 'PENDING') &&
                'Processing your recording… this may take a few minutes.'}
            </div>
          ))}
      </div>

      {/* Split view fills the rest of the viewport */}
      <RecordingSplitView
        recordingId={recording.id}
        recordingTitle={recording.title}
        note={noteProp}
        transcript={transcriptProp}
        speakerLabels={recording.speakerLabels}
        duration={recording.duration}
        ready={recording.status === 'READY'}
      />
    </div>
  )
}
