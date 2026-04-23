'use client'

// Kolasys AI — Post-meeting AI Suggestions panel. Fetches Claude-generated
// insights from /api/ai/suggestions once on mount and renders four
// collapsible sections: follow-ups, risks, commitments, sentiment.

import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Handshake,
  HelpCircle,
  MessageCircle,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Suggestions = {
  followUpQuestions: string[]
  risks: string[]
  commitments: Array<{ person: string; commitment: string }>
  sentiment: {
    overall: 'positive' | 'neutral' | 'mixed' | 'negative'
    keywords: string[]
  }
}

type SectionKey = 'followUps' | 'risks' | 'commitments' | 'sentiment'

const SENTIMENT_STYLE: Record<
  Suggestions['sentiment']['overall'],
  { label: string; cls: string }
> = {
  positive: { label: 'Positive', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  neutral: { label: 'Neutral', cls: 'bg-neutral-500/10 text-neutral-700 dark:text-neutral-300' },
  mixed: { label: 'Mixed', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  negative: { label: 'Concern', cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
}

export function AISuggestionsPanel({ recordingId }: { recordingId: string }) {
  const [data, setData] = useState<Suggestions | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    followUps: true,
    risks: true,
    commitments: true,
    sentiment: true,
  })

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/ai/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordingId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Request failed' }))
          throw new Error((body as { error?: string }).error ?? 'Request failed')
        }
        return res.json() as Promise<Suggestions>
      })
      .then((json) => {
        if (!cancelled) setData(json)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [recordingId])

  function toggle(key: SectionKey) {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (loading) return <SuggestionsSkeleton />

  if (error) {
    return (
      <div className="h-full overflow-y-auto px-4 py-4 sm:px-5">
        <div className="glass flex flex-col items-center justify-center rounded-xl p-6 text-center">
          <AlertTriangle className="mb-2 h-6 w-6 text-rose-500" />
          <p className="text-sm font-medium text-primary">Couldn&apos;t generate insights</p>
          <p className="mt-1 text-xs text-secondary">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const sentiment = SENTIMENT_STYLE[data.sentiment.overall] ?? SENTIMENT_STYLE.neutral

  return (
    <div className="h-full overflow-y-auto px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-primary">AI Insights</h3>
      </div>

      <div className="space-y-2.5">
        <Section
          icon={<HelpCircle className="h-4 w-4 text-sky-500" />}
          title="Follow-up questions"
          count={data.followUpQuestions.length}
          isOpen={open.followUps}
          onToggle={() => toggle('followUps')}
        >
          {data.followUpQuestions.length === 0 ? (
            <EmptyRow>No unanswered questions detected.</EmptyRow>
          ) : (
            <ul className="space-y-1.5 text-sm text-primary">
              {data.followUpQuestions.map((q, i) => (
                <li key={i} className="leading-relaxed">
                  • {q}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          title="Risks & blockers"
          count={data.risks.length}
          isOpen={open.risks}
          onToggle={() => toggle('risks')}
        >
          {data.risks.length === 0 ? (
            <EmptyRow>No risks or blockers surfaced.</EmptyRow>
          ) : (
            <ul className="space-y-1.5 text-sm text-primary">
              {data.risks.map((r, i) => (
                <li key={i} className="leading-relaxed">
                  • {r}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          icon={<Handshake className="h-4 w-4 text-violet-500" />}
          title="Commitments"
          count={data.commitments.length}
          isOpen={open.commitments}
          onToggle={() => toggle('commitments')}
        >
          {data.commitments.length === 0 ? (
            <EmptyRow>No explicit commitments detected.</EmptyRow>
          ) : (
            <ul className="space-y-2 text-sm text-primary">
              {data.commitments.map((c, i) => (
                <li key={i} className="leading-relaxed">
                  <span className="font-semibold">{c.person}:</span>{' '}
                  <span className="text-secondary">{c.commitment}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          icon={<MessageCircle className="h-4 w-4 text-emerald-500" />}
          title="Sentiment"
          isOpen={open.sentiment}
          onToggle={() => toggle('sentiment')}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                sentiment.cls,
              )}
            >
              {sentiment.label}
            </span>
            {data.sentiment.keywords.map((kw, i) => (
              <span
                key={i}
                className="rounded-full bg-[color-mix(in_srgb,var(--text-muted)_12%,transparent)] px-2.5 py-0.5 text-xs text-secondary"
              >
                {kw}
              </span>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}

// ── Collapsible section shell ─────────────────────────────────────────────

function Section({
  icon,
  title,
  count,
  isOpen,
  onToggle,
  children,
}: {
  icon: React.ReactNode
  title: string
  count?: number
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-line bg-white shadow-sm dark:bg-[#1A1A24] dark:border-white/10">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        {icon}
        <span className="flex-1 text-sm font-semibold text-primary">{title}</span>
        {typeof count === 'number' && (
          <span className="rounded-full bg-[color-mix(in_srgb,var(--text-muted)_14%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-secondary">
            {count}
          </span>
        )}
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted" />
        )}
      </button>
      {isOpen && <div className="border-t border-line px-3.5 py-3">{children}</div>}
    </div>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>
}

// ── Loading state ─────────────────────────────────────────────────────────

function SuggestionsSkeleton() {
  return (
    <div className="h-full overflow-y-auto px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent animate-pulse" />
        <h3 className="text-sm font-semibold text-primary">Generating insights…</h3>
      </div>
      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-line bg-white p-3.5 dark:bg-[#1A1A24] dark:border-white/10"
          >
            <div className="h-4 w-1/3 animate-pulse rounded bg-[color-mix(in_srgb,var(--text-muted)_18%,transparent)]" />
            <div className="mt-3 h-3 w-full animate-pulse rounded bg-[color-mix(in_srgb,var(--text-muted)_12%,transparent)]" />
            <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-[color-mix(in_srgb,var(--text-muted)_12%,transparent)]" />
          </div>
        ))}
      </div>
    </div>
  )
}
