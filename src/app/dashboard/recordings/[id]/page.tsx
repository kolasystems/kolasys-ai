// Kolasys AI — Recording detail page
// params is a Promise in Next.js 16 — must be awaited.

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { StatusBadge, isStuck, formatStuckAge } from '@/components/status-badge'
import { DeleteRecordingButton } from '@/components/delete-recording-button'
import { RetryStuckButton } from '@/components/retry-stuck-button'
import { EditableNoteSection } from '@/components/editable-note-section'
import { EditableActionItem } from '@/components/editable-action-item'
import { TranscriptPaginated } from '@/components/transcript-paginated'
import { RecordingStatusPoller } from '@/components/recording-status-poller'
import { AskAIPanel } from '@/components/ask-ai-panel'
import { GenerateEmbeddingsButton } from '@/components/generate-embeddings-button'
import { RecordingActionsMenu } from '@/components/recording-actions-menu'
import { GenerateWithTemplateButton } from '@/components/generate-with-template-button'
import { NameSpeakersModal } from '@/components/name-speakers-modal'
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

  const latestNote = recording.notes[0]

  const allSegments = recording.transcript?.segments ?? []
  const initialSegments = allSegments.slice(0, 100)
  const initialHasMore = allSegments.length > 100

  const hasDiarization = initialSegments.some((s) => s.speaker)
  const uniqueSpeakerIds = Array.from(
    new Set(initialSegments.map((s) => s.speaker).filter((s): s is string => !!s))
  )
  const hasTranscript = !!recording.transcript
  const canRetranscribe = !!recording.s3Key

  return (
    <div className="mx-auto max-w-4xl p-4 pb-12 sm:p-8">
      {/* Invisible poller */}
      <RecordingStatusPoller status={recording.status} />

      {/* Header */}
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
            <h1 className="text-xl font-bold text-primary sm:text-2xl">{recording.title}</h1>
          </div>
          {recording.description && (
            <p className="mt-2 text-sm text-secondary">{recording.description}</p>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <StatusBadge status={recording.status} createdAt={recording.createdAt} />
          {recording.status === 'READY' && recording.transcript && (
            <>
              <GenerateEmbeddingsButton recordingId={recording.id} />
              <AskAIPanel recordingId={recording.id} recordingTitle={recording.title} />
            </>
          )}
          <RecordingActionsMenu
            recordingId={recording.id}
            hasTranscript={hasTranscript}
            canRetranscribe={canRetranscribe}
          />
          <DeleteRecordingButton recordingId={recording.id} />
        </div>
      </div>

      {/* Meta */}
      <div className="mt-3 flex flex-wrap gap-3 text-sm text-secondary sm:mt-4 sm:gap-4">
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

      {/* Processing / Stuck banner */}
      {IN_PROGRESS_STATUSES.has(recording.status) && (
        isStuck(recording.status, recording.createdAt) ? (
          <div className="mt-5 rounded-xl border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10 sm:mt-6">
            <div className="flex items-start gap-3">
              <span aria-hidden className="mt-0.5 text-lg leading-none">⚠</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  This recording appears stuck
                </p>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200/80">
                  Stuck for {formatStuckAge(recording.createdAt)}. The transcription worker may have failed silently.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <RetryStuckButton recordingId={recording.id} />
                  <DeleteRecordingButton recordingId={recording.id} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass mt-5 flex items-center gap-2 px-4 py-3 text-sm text-accent sm:mt-6">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
            {recording.status === 'TRANSCRIBING' && 'Transcribing your recording…'}
            {recording.status === 'SUMMARIZING' && 'Generating meeting notes…'}
            {(recording.status === 'PROCESSING' || recording.status === 'PENDING') &&
              'Processing your recording… this may take a few minutes.'}
          </div>
        )
      )}

      {/* Notes */}
      {latestNote && (
        <section className="mt-7 sm:mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-semibold text-primary">Meeting Notes</h2>
            </div>
            {recording.transcript && (
              <GenerateWithTemplateButton
                recordingId={recording.id}
                currentTemplateId={latestNote.templateId ?? null}
              />
            )}
          </div>

          {latestNote.summary && (
            <div
              className="glass relative mt-3 p-4 sm:p-5"
              style={{ borderLeft: '3px solid var(--accent)' }}
            >
              <p className="text-sm font-medium text-secondary">Summary</p>
              <p className="mt-2 text-sm leading-relaxed text-primary">
                {latestNote.summary}
              </p>
            </div>
          )}

          {latestNote.sections.length > 0 && (
            <div className="mt-3 space-y-3">
              {latestNote.sections.map((section) => (
                <div
                  key={section.id}
                  className="glass relative"
                  style={{ borderLeft: '3px solid var(--accent)' }}
                >
                  <EditableNoteSection
                    sectionId={section.id}
                    title={section.title}
                    initialContent={section.content}
                  />
                </div>
              ))}
            </div>
          )}

          {latestNote.actionItems.length > 0 && (
            <div
              className="glass mt-3 p-4 sm:p-5"
              style={{ borderLeft: '3px solid var(--accent)' }}
            >
              <div className="mb-3 flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-accent" />
                <p className="text-sm font-semibold text-primary">Action Items</p>
              </div>
              <ul className="space-y-3">
                {latestNote.actionItems.map((item) => (
                  <EditableActionItem
                    key={item.id}
                    itemId={item.id}
                    title={item.title}
                    initialStatus={item.status as 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'}
                    initialPriority={item.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'}
                    dueDate={item.dueDate}
                  />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Transcript */}
      {recording.transcript && (
        <section className="mt-7 sm:mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-primary">
              <Mic2 className="h-5 w-5 text-accent" />
              Transcript
              {recording.transcript.language && (
                <span className="ml-1 text-sm font-normal text-muted">
                  · {recording.transcript.language}
                </span>
              )}
              {hasDiarization && (
                <span className="ml-1 text-sm font-normal text-muted">
                  · speaker labels
                </span>
              )}
            </h2>
            {uniqueSpeakerIds.length > 0 && (
              <NameSpeakersModal
                recordingId={recording.id}
                speakerIds={uniqueSpeakerIds}
                speakerLabels={recording.speakerLabels}
              />
            )}
          </div>

          <div className="glass mt-3 overflow-y-auto p-4 sm:p-5" style={{ maxHeight: 'min(600px, 70dvh)' }}>
            <TranscriptPaginated
              transcriptId={recording.transcript.id}
              recordingId={recording.id}
              initialSegments={initialSegments}
              initialHasMore={initialHasMore}
              fullText={recording.transcript.text}
              speakerLabels={recording.speakerLabels}
              duration={recording.duration}
            />
          </div>
        </section>
      )}

      {/* Empty state while pending */}
      {!recording.transcript && recording.status === 'PENDING' && (
        <div className="glass mt-8 flex flex-col items-center justify-center py-16 text-center">
          <Mic2 className="mb-3 h-10 w-10 text-muted" />
          <p className="text-sm font-medium text-secondary">
            Transcript will appear here once processing is complete.
          </p>
        </div>
      )}
    </div>
  )
}
