'use client'

// Kolasys AI — Ask AI: full-page semantic search + streaming chat

import { useRef, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Send, Bot, User, Loader2, Sparkles, ExternalLink } from 'lucide-react'
import { cn, formatDuration } from '@/lib/utils'
import { useAIChat, type ChatSource, type ChatMessage } from '@/hooks/use-ai-chat'

const SUGGESTED_QUESTIONS = [
  'What were the main decisions made last week?',
  'What action items are still open from recent meetings?',
  'Who was responsible for the product launch?',
  'Summarise the key themes from my last 5 meetings.',
]

export default function AskAIPage() {
  // Suspense is required because AskAIPageInner reads ?q= via useSearchParams,
  // which the Next.js App Router only allows inside a Suspense boundary.
  // Pattern mirrors src/providers/posthog-provider.tsx.
  return (
    <Suspense fallback={null}>
      <AskAIPageInner />
    </Suspense>
  )
}

function AskAIPageInner() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setInput } =
    useAIChat()

  const bottomRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const searchParams = useSearchParams()
  const q = searchParams.get('q')
  const autoSubmittedRef = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ?q= prefill — prime `input` from the URL on first render after the
  // param resolves. Series detail page navigates here with a synthesized
  // prompt; chat input components can do the same.
  useEffect(() => {
    if (q && !autoSubmittedRef.current) {
      setInput(q)
    }
  }, [q, setInput])

  // Two-phase: once React has committed the prefilled value into `input`,
  // fire the form's submit exactly once. requestSubmit() goes through the
  // existing <form onSubmit={handleSubmit}>, so the prefilled value flows
  // through useAIChat the same way a normal submission would. The ref
  // guard makes this idempotent across re-renders / input edits.
  useEffect(() => {
    if (q && input === q && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true
      formRef.current?.requestSubmit()
    }
  }, [q, input])

  return (
    <div className="flex h-full flex-col dark:bg-[#0F0F13]">
      {/* Header */}
      <div className="border-b border-neutral-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-[#1A1A24] sm:px-8 sm:py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 dark:bg-accent/15">
            <Sparkles className="h-5 w-5 text-brand-600 dark:text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">Ask AI</h1>
            <p className="text-xs text-neutral-500 dark:text-gray-400">
              Ask questions across all your meeting recordings
            </p>
          </div>
        </div>
      </div>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6">
        {messages.length === 0 ? (
          <EmptyState onSuggest={(q) => setInput(q)} />
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((message) => (
              <MessageRow key={message.id} message={message} />
            ))}

            {isLoading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-white/10">
                  <Bot className="h-4 w-4 text-neutral-600 dark:text-gray-300" />
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-500 shadow-sm dark:border-white/10 dark:bg-[#1A1A24] dark:text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Thinking…
                </div>
              </div>
            )}

            {error && (
              <p className="text-center text-sm text-red-500 dark:text-red-400">{error}</p>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-neutral-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#1A1A24] sm:px-8 sm:py-4">
        <div className="mx-auto max-w-3xl">
          <form ref={formRef} onSubmit={handleSubmit}>
            <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm transition-shadow focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/20 dark:border-white/10 dark:bg-white/5 dark:focus-within:border-accent dark:focus-within:ring-accent/30">
              <input
                className="flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none dark:text-white dark:placeholder:text-gray-500"
                value={input}
                onChange={handleInputChange}
                placeholder="Ask about your meetings…"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
          <p className="mt-2 text-center text-xs text-neutral-400 dark:text-gray-500">
            Click &ldquo;Index for AI&rdquo; on a recording detail page to include it in search.
          </p>
        </div>
      </div>
    </div>
  )
}

function MessageRow({ message }: { message: ChatMessage }) {
  return (
    <div>
      <div
        className={cn(
          'flex gap-3',
          message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        <div
          className={cn(
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full',
            message.role === 'user'
              ? 'bg-brand-600 text-white'
              : 'bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-gray-300'
          )}
        >
          {message.role === 'user' ? (
            <User className="h-4 w-4" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
        </div>
        <div
          className={cn(
            'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
            message.role === 'user'
              ? 'bg-brand-600 text-white'
              : 'border border-neutral-200 bg-white text-neutral-800 shadow-sm dark:border-white/10 dark:bg-[#1A1A24] dark:text-white'
          )}
        >
          {message.content || (
            <span className="flex items-center gap-2 text-neutral-400 dark:text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </span>
          )}
        </div>
      </div>

      {message.sources && message.sources.length > 0 && (
        <div className="mt-3 ml-11 space-y-2">
          <p className="text-xs font-medium text-neutral-400 dark:text-gray-500">Sources:</p>
          {message.sources.map((s) => (
            <CitationCard key={s.index} source={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ onSuggest }: { onSuggest: (q: string) => void }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-10 flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 dark:bg-accent/15">
          <Sparkles className="h-8 w-8 text-brand-600 dark:text-accent" />
        </div>
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Ask anything about your meetings</h2>
        <p className="mt-2 max-w-sm text-sm text-neutral-500 dark:text-gray-400">
          Semantic search across all your meeting transcripts, powered by Claude.
        </p>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-gray-500">
          Suggested questions
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onSuggest(q)}
              className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left text-sm text-neutral-700 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-white/10 dark:bg-[#1A1A24] dark:text-gray-300 dark:hover:border-accent/50 dark:hover:bg-accent/10 dark:hover:text-white"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function CitationCard({ source }: { source: ChatSource }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-neutral-100 bg-neutral-50 p-3 dark:border-white/10 dark:bg-white/5">
      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-accent/20 dark:text-accent">
        {source.index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/recordings/${source.recordingId}`}
            className="truncate text-xs font-semibold text-brand-600 hover:underline dark:text-accent"
          >
            {source.recordingTitle}
          </Link>
          {source.startTime != null && (
            <span className="flex-shrink-0 font-mono text-xs text-neutral-400 dark:text-gray-500">
              {formatDuration(Math.floor(source.startTime))}
            </span>
          )}
          <Link
            href={`/dashboard/recordings/${source.recordingId}`}
            className="ml-auto flex-shrink-0 text-neutral-400 hover:text-neutral-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-gray-400">{source.chunkText}</p>
      </div>
    </div>
  )
}
