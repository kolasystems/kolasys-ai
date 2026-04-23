'use client'

// Kolasys AI — Split-pane recording detail layout.
// Desktop (>= 1024px): 60/40 side-by-side. Notes on the left, Transcript / Ask AI on the right.
// Mobile (< 1024px): single-panel view with a Notes | Transcript | Ask AI tab bar.
// A sticky audio player lives at the bottom of the right pane.

import { useRef, useState } from 'react'
import { CheckSquare, FileText, Mic2, Search, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EditableActionItem } from './editable-action-item'
import { EditableNoteSection } from './editable-note-section'
import { TranscriptPaginated } from './transcript-paginated'
import { NameSpeakersModal } from './name-speakers-modal'
import { GenerateWithTemplateButton } from './generate-with-template-button'
import { RefineSummaryButton } from './refine-summary-button'
import { RecordingAudioPlayer } from './recording-audio-player'
import { InlineAskAI } from './inline-ask-ai'
import { MarkdownContent } from './markdown-content'
import { RecordingKnowledgeChips } from './recording-knowledge-chips'

// Plain-object shapes that travel across the RSC boundary.
type Segment = {
  id: string
  startTime: number
  endTime: number
  speaker: string | null
  text: string
  // JSON-encoded array of { word, start, end } — parsed in TranscriptPaginated
  // to render clickable word buttons that seek the audio player.
  wordsJson?: string | null
}

type SpeakerLabel = { speakerId: string; displayName: string }
type NoteSection = { id: string; title: string; content: string }
type ActionItem = {
  id: string
  title: string
  description: string | null
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  dueDate: Date | null
}

type NoteProp = {
  id: string
  summary: string | null
  templateId: string | null
  sections: NoteSection[]
  actionItems: ActionItem[]
}

type TranscriptProp = {
  id: string
  text: string
  language: string
  initialSegments: Segment[]
  initialHasMore: boolean
  uniqueSpeakerIds: string[]
}

type Props = {
  recordingId: string
  recordingTitle: string
  note: NoteProp | null
  transcript: TranscriptProp | null
  speakerLabels: SpeakerLabel[]
  duration: number | null
  /** True only once the server has a complete transcript + notes. */
  ready: boolean
}

type Tab = 'notes' | 'transcript' | 'ai'

// Solid note-section card surface — replaces the translucent `.glass` look
// that was blending into the off-white page background in light mode.
//   Light: crisp white card, subtle 1px neutral-200/80 border, shadow-sm depth.
//   Dark:  existing #1A1A24 surface with a white/10 border (no shadow).
// Kept at module scope so every note card is styled identically.
const NOTE_CARD =
  'rounded-2xl bg-white shadow-sm border border-neutral-200/80 ' +
  'dark:bg-[#1A1A24] dark:border-white/10'

export function RecordingSplitView({
  recordingId,
  recordingTitle,
  note,
  transcript,
  speakerLabels,
  duration,
  ready,
}: Props) {
  const [tab, setTab] = useState<Tab>('notes')
  const [summary, setSummary] = useState<string | null>(note?.summary ?? null)

  // Word-level audio sync — the audio player registers a seek function here
  // whenever its URL loads; clicking a word in the transcript invokes it.
  // `playhead` is updated on every audio timeupdate so the currently-spoken
  // word can be highlighted.
  const seekFnRef = useRef<((secs: number) => void) | null>(null)
  const [playhead, setPlayhead] = useState(0)

  function handleSeek(secs: number) {
    seekFnRef.current?.(secs)
  }
  const [findQuery, setFindQuery] = useState('')

  // Right pane content: "Transcript" shows whenever tab != 'ai'.
  // On desktop, notes stays visible on the left even when tab='transcript'.
  const rightTabIsAI = tab === 'ai'

  // Visibility flags for mobile single-panel mode.
  const showLeftOnMobile = tab === 'notes'
  const showRightOnMobile = tab !== 'notes'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Mobile tab bar — hidden on lg+ where both panes are visible */}
      <div className="flex border-b border-line bg-surface lg:hidden">
        <MobileTab active={tab === 'notes'} onClick={() => setTab('notes')} icon={<FileText className="h-3.5 w-3.5" />}>
          Notes
        </MobileTab>
        <MobileTab active={tab === 'transcript'} onClick={() => setTab('transcript')} icon={<Mic2 className="h-3.5 w-3.5" />}>
          Transcript
        </MobileTab>
        <MobileTab active={tab === 'ai'} onClick={() => setTab('ai')} icon={<Sparkles className="h-3.5 w-3.5" />}>
          Ask AI
        </MobileTab>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ── Left pane — Notes ───────────────────────────────────────── */}
        <section
          className={cn(
            'flex min-h-0 flex-col overflow-hidden bg-app lg:flex-[3]',
            'dark:bg-[#0F0F13]',
            showLeftOnMobile ? 'flex-1' : 'hidden lg:flex lg:flex-[3]',
          )}
        >
          {/* Notes header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold text-primary">Meeting Notes</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ready && note && (
                <RefineSummaryButton
                  recordingId={recordingId}
                  onRefined={(s) => setSummary(s)}
                />
              )}
              {ready && transcript && (
                <GenerateWithTemplateButton
                  recordingId={recordingId}
                  currentTemplateId={note?.templateId ?? null}
                />
              )}
            </div>
          </div>

          {/* Notes body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            {!note && (
              <div className="glass flex flex-col items-center justify-center py-16 text-center">
                <FileText className="mb-3 h-10 w-10 text-muted" />
                <p className="text-sm font-medium text-secondary">
                  Notes will appear here once processing is complete.
                </p>
              </div>
            )}

            {note && (
              <div className="space-y-3">
                {summary && (
                  <div
                    className={`${NOTE_CARD} relative p-4 sm:p-5`}
                    style={{ borderLeft: '3px solid var(--accent)' }}
                  >
                    <p
                      className="text-xs font-semibold uppercase tracking-widest"
                      style={{ color: 'color-mix(in srgb, var(--accent) 80%, transparent)' }}
                    >
                      Summary
                    </p>
                    <div className="mt-2">
                      <MarkdownContent content={summary} />
                    </div>
                  </div>
                )}

                {note.sections.map((section) => (
                  <div
                    key={section.id}
                    className={`${NOTE_CARD} relative`}
                    style={{ borderLeft: '3px solid var(--accent)' }}
                  >
                    <EditableNoteSection
                      sectionId={section.id}
                      title={section.title}
                      initialContent={section.content}
                    />
                  </div>
                ))}

                {note.actionItems.length > 0 && (
                  <div
                    className={`${NOTE_CARD} p-4 sm:p-5`}
                    style={{ borderLeft: '3px solid var(--accent)' }}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <CheckSquare className="h-4 w-4 text-accent" />
                      <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                        Action Items
                      </p>
                    </div>
                    <ul className="space-y-3">
                      {note.actionItems.map((item) => (
                        <EditableActionItem
                          key={item.id}
                          itemId={item.id}
                          title={item.title}
                          description={item.description}
                          initialStatus={item.status}
                          initialPriority={item.priority}
                          dueDate={item.dueDate}
                        />
                      ))}
                    </ul>
                  </div>
                )}

                {/* People / Topics / Projects extracted by the knowledge graph */}
                {ready && <RecordingKnowledgeChips recordingId={recordingId} />}
              </div>
            )}
          </div>
        </section>

        {/* ── Divider — desktop only ──────────────────────────────────── */}
        <div className="hidden w-px bg-[var(--border)] lg:block" aria-hidden />

        {/* ── Right pane — Transcript / Ask AI ────────────────────────── */}
        <section
          className={cn(
            'flex min-h-0 flex-col overflow-hidden lg:flex-[2]',
            'bg-neutral-50 dark:bg-[#111118]',
            showRightOnMobile ? 'flex-1' : 'hidden lg:flex lg:flex-[2]',
          )}
        >
          {/* Right pane tab bar + find-in-transcript */}
          <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:px-5">
            <div className="flex items-center gap-1">
              <PaneTab
                active={!rightTabIsAI}
                onClick={() => setTab('transcript')}
                icon={<Mic2 className="h-3.5 w-3.5" />}
              >
                Transcript
              </PaneTab>
              <PaneTab
                active={rightTabIsAI}
                onClick={() => setTab('ai')}
                icon={<Sparkles className="h-3.5 w-3.5" />}
              >
                Ask AI
              </PaneTab>

              {/* Name Speakers button (transcript tab only) */}
              {!rightTabIsAI &&
                transcript &&
                transcript.uniqueSpeakerIds.length > 0 && (
                  <div className="ml-auto">
                    <NameSpeakersModal
                      recordingId={recordingId}
                      speakerIds={transcript.uniqueSpeakerIds}
                      speakerLabels={speakerLabels}
                    />
                  </div>
                )}
            </div>

            {/* Find-in-transcript input (UI only for now) */}
            {!rightTabIsAI && transcript && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={findQuery}
                  onChange={(e) => setFindQuery(e.target.value)}
                  placeholder="Find in transcript…"
                  className="w-full rounded-lg border border-line bg-white py-1.5 pl-8 pr-3 text-xs text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/25 dark:bg-white/5"
                />
              </div>
            )}
          </div>

          {/* Right pane content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {rightTabIsAI ? (
              <InlineAskAI recordingId={recordingId} recordingTitle={recordingTitle} />
            ) : transcript ? (
              <div className="h-full overflow-y-auto px-4 py-4 sm:px-5">
                <TranscriptPaginated
                  transcriptId={transcript.id}
                  recordingId={recordingId}
                  initialSegments={transcript.initialSegments}
                  initialHasMore={transcript.initialHasMore}
                  fullText={transcript.text}
                  speakerLabels={speakerLabels}
                  duration={duration}
                  onSeek={handleSeek}
                  playhead={playhead}
                />
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <Mic2 className="mb-3 h-10 w-10 text-muted" />
                <p className="text-sm font-medium text-secondary">
                  Transcript will appear here once processing is complete.
                </p>
              </div>
            )}
          </div>

          {/* Sticky audio player — pinned at the bottom of the right pane */}
          <RecordingAudioPlayer
            recordingId={recordingId}
            onSeekReady={(fn) => { seekFnRef.current = fn }}
            onTimeUpdate={(secs) => setPlayhead(secs)}
          />
        </section>
      </div>
    </div>
  )
}

// ── Mobile tab bar button ──────────────────────────────────────────────────

function MobileTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-xs font-semibold transition-colors',
        active
          ? 'border-accent text-accent'
          : 'border-transparent text-secondary hover:text-primary',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

// ── Right-pane tab button ──────────────────────────────────────────────────

function PaneTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-accent'
          : 'text-secondary hover:bg-[color-mix(in_srgb,var(--text-muted)_10%,transparent)] hover:text-primary',
      )}
    >
      {icon}
      {children}
    </button>
  )
}
