'use client'

// Kolasys AI — Ask AI side panel for the recording detail page

import { useRef, useEffect } from 'react'
import Link from 'next/link'
import { Sparkles, X, Send, Bot, User, Loader2, ExternalLink } from 'lucide-react'
import { cn, formatDuration } from '@/lib/utils'
import { useAIChat, type ChatSource, type ChatMessage } from '@/hooks/use-ai-chat'
import { useState } from 'react'

type Props = {
  recordingId: string
  recordingTitle: string
}

export function AskAIPanel({ recordingId, recordingTitle }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100"
      >
        <Sparkles className="h-4 w-4" />
        Ask AI
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <ChatPanel
              recordingId={recordingId}
              recordingTitle={recordingTitle}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}

function ChatPanel({
  recordingId,
  recordingTitle,
  onClose,
}: {
  recordingId: string
  recordingTitle: string
  onClose: () => void
}) {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useAIChat({
    api: '/api/ai/ask',
    body: { recordingId },
  })

  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <>
      <div className="flex items-center gap-3 border-b border-neutral-200 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50">
          <Sparkles className="h-4 w-4 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-neutral-900">Ask AI</p>
          <p className="truncate text-xs text-neutral-500">{recordingTitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Sparkles className="mb-3 h-8 w-8 text-neutral-300" />
            <p className="text-sm font-medium text-neutral-600">Ask anything about this recording</p>
            <p className="mt-1 text-xs text-neutral-400">
              Click &ldquo;Index for AI&rdquo; first to enable semantic search.
            </p>
          </div>
        )}

        {messages.map((message) => (
          <PanelMessage key={message.id} message={message} onClose={onClose} />
        ))}

        {isLoading && (
          <div className="flex gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100">
              <Bot className="h-3.5 w-3.5 text-neutral-600" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Thinking…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-neutral-200 p-4">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/20 transition-shadow">
            <input
              className="flex-1 bg-transparent text-sm placeholder:text-neutral-400 focus:outline-none"
              value={input}
              onChange={handleInputChange}
              placeholder="Ask about this recording…"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
            >
              <Send className="h-3 w-3" />
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

function PanelMessage({
  message,
  onClose,
}: {
  message: ChatMessage
  onClose: () => void
}) {
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
              ? 'bg-brand-600 text-white'
              : 'bg-neutral-100 text-neutral-600'
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
              ? 'bg-brand-600 text-white'
              : 'bg-neutral-50 border border-neutral-200 text-neutral-800'
          )}
        >
          {message.content || (
            <span className="flex items-center gap-2 text-neutral-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            </span>
          )}
        </div>
      </div>

      {message.sources && message.sources.length > 0 && (
        <div className="mt-2 ml-9 space-y-1.5">
          {message.sources.map((s) => (
            <SourceChip key={s.index} source={s} onClose={onClose} />
          ))}
        </div>
      )}
    </div>
  )
}

function SourceChip({ source, onClose }: { source: ChatSource; onClose: () => void }) {
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-neutral-100 bg-white p-2">
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
        {source.index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          {source.startTime != null && (
            <span className="font-mono text-xs text-neutral-400">
              {formatDuration(Math.floor(source.startTime))}
            </span>
          )}
          <Link
            href={`/dashboard/recordings/${source.recordingId}`}
            className="ml-auto text-neutral-300 hover:text-neutral-500"
            onClick={onClose}
          >
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-neutral-600">{source.chunkText}</p>
      </div>
    </div>
  )
}
