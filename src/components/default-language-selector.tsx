'use client'

// Kolasys AI — Default transcription language selector on /dashboard/settings.
// Controls Organization.defaultTranscriptionLanguage.

import { useState } from 'react'
import { Loader2, Languages } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

export const TRANSCRIPTION_LANGUAGES = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'nl', label: 'Dutch' },
  { code: 'ru', label: 'Russian' },
  { code: 'pl', label: 'Polish' },
  { code: 'sv', label: 'Swedish' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
] as const

export type LanguageCode = (typeof TRANSCRIPTION_LANGUAGES)[number]['code']

type Props = {
  initialLanguage: string
}

export function DefaultLanguageSelector({ initialLanguage }: Props) {
  const [language, setLanguage] = useState(initialLanguage)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  )

  const mutation = trpc.settings.updateOrgSettings.useMutation({
    onSuccess: (data) => {
      setLanguage(data.defaultTranscriptionLanguage)
      const label =
        TRANSCRIPTION_LANGUAGES.find((l) => l.code === data.defaultTranscriptionLanguage)?.label ??
        data.defaultTranscriptionLanguage
      setFeedback({
        type: 'success',
        message: `Default transcription language set to ${label}.`,
      })
    },
    onError: (e) => {
      setFeedback({ type: 'error', message: e.message })
    },
  })

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value
    setLanguage(next)
    setFeedback(null)
    mutation.mutate({ defaultTranscriptionLanguage: next })
  }

  const busy = mutation.isPending
  const currentLabel =
    TRANSCRIPTION_LANGUAGES.find((l) => l.code === language)?.label ?? language

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
      <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4 dark:border-white/10">
        <Languages className="h-4 w-4 text-neutral-500 dark:text-gray-400" />
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Transcription language
        </h2>
      </div>

      <div className="space-y-4 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900 dark:text-white">
              Default language for new recordings
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-gray-400">
              Whisper uses this language when transcribing. Selecting the correct language
              produces faster, more accurate results than auto-detection. You can override
              the language per-recording at upload time or via Re-transcribe.{' '}
              <span className="font-medium">Auto-detect</span> works well when your meetings
              switch languages frequently.
            </p>
          </div>

          <div className="relative flex-shrink-0">
            <select
              value={language}
              onChange={handleChange}
              disabled={busy}
              className={cn(
                'appearance-none rounded-lg border border-neutral-300 bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-neutral-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60',
                'dark:border-white/15 dark:bg-[#23232F] dark:text-white',
              )}
            >
              {TRANSCRIPTION_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-gray-400">
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 12 12">
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          </div>
        </div>

        {feedback && (
          <p
            className={cn(
              'rounded-lg px-3 py-2 text-xs',
              feedback.type === 'success'
                ? 'border border-green-200 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200'
                : 'border border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200',
            )}
          >
            {feedback.message}
          </p>
        )}
      </div>
    </section>
  )
}
