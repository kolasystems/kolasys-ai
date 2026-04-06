'use client'

import { useState, useRef, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'

type Props = {
  sectionId: string
  title: string
  initialContent: string
}

export function EditableNoteSection({ sectionId, title, initialContent }: Props) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(initialContent)
  const [saved, setSaved] = useState(initialContent)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const mutation = trpc.recordings.updateNoteSection.useMutation({
    onSuccess: (data) => {
      setSaved(data.content)
      setEditing(false)
    },
    onError: () => {
      // Revert optimistic content on error.
      setContent(saved)
      setEditing(false)
    },
  })

  const handleBlur = useCallback(() => {
    if (content.trim() === saved.trim()) {
      setEditing(false)
      return
    }
    mutation.mutate({ id: sectionId, content })
  }, [content, saved, sectionId, mutation])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        setContent(saved)
        setEditing(false)
      }
      // Cmd/Ctrl+Enter saves immediately.
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        textareaRef.current?.blur()
      }
    },
    [saved]
  )

  function enterEdit() {
    setEditing(true)
    // Focus after state update.
    setTimeout(() => {
      textareaRef.current?.focus()
      const len = textareaRef.current?.value.length ?? 0
      textareaRef.current?.setSelectionRange(len, len)
    }, 0)
  }

  return (
    <div className="group rounded-xl border border-neutral-200 bg-white p-5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-800">{title}</p>
        <div className="flex items-center gap-2">
          {mutation.isPending && (
            <Loader2 className="h-3 w-3 animate-spin text-neutral-400" />
          )}
          {!editing && !mutation.isPending && (
            <button
              type="button"
              onClick={enterEdit}
              className="text-xs text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-brand-600"
            >
              Edit
            </button>
          )}
          {editing && (
            <span className="text-xs text-neutral-400">
              Blur to save · Esc to cancel
            </span>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          rows={Math.max(4, content.split('\n').length + 1)}
          className="w-full resize-y rounded-lg border border-brand-300 p-2 text-sm leading-relaxed text-neutral-700 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
      ) : (
        <div
          className="prose prose-sm max-w-none cursor-text text-neutral-600"
          onClick={enterEdit}
        >
          {saved.split('\n').map((line, i) => (
            <p key={i} className="my-1">
              {line || <span className="text-neutral-300">—</span>}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
