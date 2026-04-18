'use client'

import { useState, useRef, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { MarkdownContent } from './markdown-content'

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

  // The wrapper is intentionally transparent — parent .glass card owns
  // background, border, border-left accent, and shadow. We only own padding +
  // the internal title/edit/content layout.
  return (
    <div className="group p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-primary">{title}</p>
        <div className="flex items-center gap-2">
          {mutation.isPending && (
            <Loader2 className="h-3 w-3 animate-spin text-muted" />
          )}
          {!editing && !mutation.isPending && (
            <button
              type="button"
              onClick={enterEdit}
              className="text-xs text-muted opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
            >
              Edit
            </button>
          )}
          {editing && (
            <span className="text-xs text-muted">
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
          className="w-full resize-y rounded-lg border border-accent/50 bg-white/70 p-2 text-sm leading-relaxed text-primary focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 dark:bg-white/5"
        />
      ) : (
        <div onClick={enterEdit} className="cursor-text">
          {saved.trim()
            ? <MarkdownContent content={saved} />
            : <p className="text-muted">Click to add content…</p>}
        </div>
      )}
    </div>
  )
}
