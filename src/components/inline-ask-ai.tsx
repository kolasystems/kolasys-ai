'use client'

// Kolasys AI — Inline Ask AI chat for the recording detail right pane.
// Mirrors the modal AskAIPanel but renders inline (no modal chrome) and
// fills the container it's embedded in.

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { Bot, ExternalLink, Loader2, Send, Sparkles, User } from 'lucide-react'
import { cn, formatDuration } from '@/lib/utils'
import { useAIChat, type ChatMessage, type ChatSource } from '@/hooks/use-ai-chat'

type Props = {
  recordingId: string
  recordingTitle: string
}

export function InlineAskAI({ recordingId, recordingTitle }: Props) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useAIChat({
    api: '/api/ai/ask',
    body: { recordingId },
  })

  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-5 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Sparkles className="mb-3 h-8 w-8 text-muted" />
            <p className="text-sm font-medium text-primary">
              Ask anything about this recording
            </p>
            <p className="mt-1 max-w-xs text-xs text-secondary">
              Index the transcript first from the recording header, then ask follow-up questions about{' '}
              <span className="font-medium">{recordingTitle}</span>.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}

        {isLoading && (
          <div className="flex gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 dark:bg-white/10">
              <Bot className="h-3.5 w-3.5 text-neutral-600 dark:text-gray-300" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-secondary dark:border-white/10 dark:bg-white/5">
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

      <div className="border-t border-line px-4 py-3 sm:px-5">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 shadow-sm transition-shadow focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/20 dark:border-white/10 dark:bg-white/5 dark:focus-within:border-accent dark:focus-within:ring-accent/30">
            <input
              className="flex-1 bg-transparent text-sm text-primary placeholder:text-muted focus:outline-none"
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about this recording…"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-colors hover:opacity-90 disabled:opacity-40"
            >
              <Send className="h-3 w-3" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MessageRow({ message }: { message: ChatMessage }) {
  return (
    <div>
      <div
        className={cn(
          'flex gap-2.5',
          message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
        )}
      >
        <div
          className={cn(
            'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
            message.role === 'user'
              ? 'bg-accent text-white'
              : 'bg-neutral-100 text-neutral-600 dark:bg-white/10 dark:text-gray-300'
          )}
        >
          {message.role === 'user' ? (
            <User className="h-3.5 w-3.5" />
          ) : (
            <Bot className="h-3.5 w-3.5" />
          )}
        </div>
        <div
          className={cn(
            'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
            message.role === 'user'
              ? 'bg-accent text-white'
              : 'border border-neutral-200 bg-white text-neutral-800 dark:border-white/10 dark:bg-[#1A1A24] dark:text-white'
          )}
        >
          {message.content || (
            <span className="flex items-center gap-2 text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </span>
          )}
        </div>
      </div>

      {message.sources && message.sources.length > 0 && (
        <div className="mt-2 ml-9 space-y-1.5">
          {message.sources.map((s) => (
            <SourceChip key={s.index} source={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function SourceChip({ source }: { source: ChatSource }) {
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-neutral-100 bg-white p-2 dark:border-white/10 dark:bg-white/5">
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-accent/20 dark:text-accent">
        {source.index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {source.startTime != null && (
            <span className="font-mono text-xs text-muted">
              {formatDuration(Math.floor(source.startTime))}
            </span>
          )}
          <Link
            href={`/dashboard/recordings/${source.recordingId}`}
            className="ml-auto text-muted hover:text-secondary"
          >
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-secondary">{source.chunkText}</p>
      </div>
    </div>
  )
}
