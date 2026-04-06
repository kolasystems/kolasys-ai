'use client'

// Kolasys AI — Custom AI chat hook that reads the SSE stream from /api/ai/ask

import { useState, useCallback } from 'react'
import { nanoid } from 'nanoid'

export type ChatSource = {
  index: number
  recordingId: string
  recordingTitle: string
  chunkText: string
  startTime: number | null
  similarity: number
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: ChatSource[]
}

type Options = {
  api?: string
  body?: Record<string, unknown>
}

export function useAIChat({ api = '/api/ai/ask', body = {} }: Options = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendMessage = useCallback(
    async (userContent: string) => {
      if (!userContent.trim() || isLoading) return
      setError(null)

      const userMsg: ChatMessage = { id: nanoid(), role: 'user', content: userContent }
      const allMessages = [...messages, userMsg]
      setMessages(allMessages)
      setIsLoading(true)

      const assistantId = nanoid()

      try {
        const response = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
            ...body,
          }),
        })

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(err.error ?? `HTTP ${response.status}`)
        }

        // Add empty assistant message to stream into
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: 'assistant', content: '', sources: [] },
        ])

        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? '' // keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue

            try {
              const event = JSON.parse(raw) as {
                type: 'text' | 'sources' | 'done' | 'error'
                text?: string
                sources?: ChatSource[]
                message?: string
              }

              if (event.type === 'text' && event.text) {
                setMessages((prev) => {
                  const idx = prev.findIndex((m) => m.id === assistantId)
                  if (idx === -1) return prev
                  const updated = [...prev]
                  updated[idx] = { ...updated[idx], content: updated[idx].content + event.text! }
                  return updated
                })
              } else if (event.type === 'sources' && event.sources) {
                setMessages((prev) => {
                  const idx = prev.findIndex((m) => m.id === assistantId)
                  if (idx === -1) return prev
                  const updated = [...prev]
                  updated[idx] = { ...updated[idx], sources: event.sources }
                  return updated
                })
              } else if (event.type === 'error') {
                throw new Error(event.message ?? 'Streaming error')
              }
            } catch (parseErr) {
              // Non-JSON line — skip
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
        // Remove the empty assistant placeholder if we never got content
        setMessages((prev) => {
          const last = prev.at(-1)
          if (last?.id === assistantId && !last.content) {
            return prev.slice(0, -1)
          }
          return prev
        })
      } finally {
        setIsLoading(false)
      }
    },
    [api, body, isLoading, messages]
  )

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setInput(e.target.value)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const content = input.trim()
    if (!content) return
    setInput('')
    sendMessage(content)
  }

  return { messages, input, handleInputChange, handleSubmit, isLoading, error, setInput }
}
