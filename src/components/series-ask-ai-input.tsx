'use client'

// Kolasys AI — "Ask AI about this series" input on the series detail page.
//
// Minimum-viable hook: on submit we navigate to /dashboard/search with the
// question pre-filled and prefixed by the series name. Re-uses the existing
// AskAI page so we don't have to touch /api/ai/ask to support multi-recording
// context in this pass. Swap for a streamed series-aware call later.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles } from 'lucide-react'

export function SeriesAskAiInput({ seriesName }: { seriesName: string }) {
  const router = useRouter()
  const [question, setQuestion] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = question.trim()
    if (!trimmed) return
    const prompt = `About the meeting series "${seriesName}": ${trimmed}`
    router.push(`/dashboard/search?q=${encodeURIComponent(prompt)}`)
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Sparkles className="h-4 w-4 text-accent" />
      <input
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={`Ask AI about "${seriesName}"…`}
        className="flex-1 rounded-md border border-line bg-white px-3 py-1.5 text-sm text-primary outline-none focus:border-accent dark:bg-[#1A1A24]"
      />
      <button
        type="submit"
        disabled={!question.trim()}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white transition disabled:opacity-40"
        style={{ background: '#CA2625' }}
      >
        Ask
      </button>
    </form>
  )
}
