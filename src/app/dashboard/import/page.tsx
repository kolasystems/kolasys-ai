'use client'

import { useRef, useState } from 'react'
import { Upload, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

type Platform = {
  id: 'fireflies' | 'otter' | 'fathom' | 'readai'
  name: string
  color: string
  initial: string
  accepts: string
  what: string[]
  instructions: string
  exportPath: string
}

const PLATFORMS: Platform[] = [
  {
    id: 'fireflies',
    name: 'Fireflies.ai',
    color: '#7C3AED',
    initial: 'F',
    accepts: '.zip',
    what: ['Full transcripts', 'AI summaries', 'Action items', 'Speaker labels'],
    instructions: 'In Fireflies, go to Settings → Integrations → Export → Download ZIP.',
    exportPath: 'Settings → Export → Download ZIP',
  },
  {
    id: 'otter',
    name: 'Otter.ai',
    color: '#0284C7',
    initial: 'O',
    accepts: '.txt,.srt',
    what: ['Full transcripts', 'Speaker-labeled segments'],
    instructions:
      'In Otter, go to workspace.otter.ai → Conversations → open a conversation → Export as TXT.',
    exportPath: 'Conversations → Export as TXT',
  },
  {
    id: 'fathom',
    name: 'Fathom',
    color: '#059669',
    initial: 'Fa',
    accepts: '.csv',
    what: ['Meeting titles & dates', 'AI summaries', 'Action items', 'Duration'],
    instructions: 'In Fathom, go to fathom.video → Past calls → Export CSV.',
    exportPath: 'Past calls → Export CSV',
  },
  {
    id: 'readai',
    name: 'Read AI',
    color: '#DC2626',
    initial: 'R',
    accepts: '.pdf',
    what: ['Meeting summaries', 'Key topics', 'Action items', 'Transcripts (if included)'],
    instructions: 'In Read AI, go to app.read.ai → Reports → open a report → Export PDF.',
    exportPath: 'Reports → Export PDF',
  },
]

type ImportResult = {
  imported: number
  skipped: number
  meetings: Array<{ id: string; title: string }>
}

export default function ImportPage() {
  const router = useRouter()
  const [selected, setSelected] = useState<Platform | null>(null)
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function openModal(p: Platform) {
    setSelected(p)
    setFile(null)
    setResult(null)
    setError(null)
  }

  function closeModal() {
    if (loading) return
    setSelected(null)
    setFile(null)
    setResult(null)
    setError(null)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) setFile(dropped)
  }

  async function handleUpload() {
    if (!file || !selected) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const fd = new FormData()
      fd.append('platform', selected.id)
      fd.append('file', file)

      const res = await fetch('/api/v1/import', { method: 'POST', body: fd })
      const data = (await res.json()) as ImportResult & { error?: string }

      if (!res.ok) {
        setError(data.error ?? 'Import failed')
      } else {
        setResult(data)
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-10">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
          Import your meetings
        </h1>
        <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          Switch to Kolasys and bring your meeting history with you.
        </p>
      </div>

      {/* Platform cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PLATFORMS.map((p) => (
          <div
            key={p.id}
            className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5 dark:border-white/10 dark:bg-[#1A1A24]"
          >
            {/* Logo + name */}
            <div className="mb-4 flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white"
                style={{ backgroundColor: p.color }}
              >
                {p.initial}
              </div>
              <span className="font-medium text-neutral-900 dark:text-white">{p.name}</span>
            </div>

            {/* What you can import */}
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
              What you can import
            </p>
            <ul className="mb-5 flex-1 space-y-1">
              {p.what.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
                  <span className="h-1.5 w-1.5 flex-none rounded-full bg-neutral-300 dark:bg-neutral-600" />
                  {item}
                </li>
              ))}
            </ul>

            <button
              onClick={() => openModal(p)}
              className="mt-auto w-full rounded-lg bg-[#CA2625] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Import from {p.name}
            </button>
          </div>
        ))}
      </div>

      {/* Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#1A1A24]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white"
                  style={{ backgroundColor: selected.color }}
                >
                  {selected.initial}
                </div>
                <h2 className="font-semibold text-neutral-900 dark:text-white">
                  Import from {selected.name}
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="rounded-md p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Instructions */}
            <div className="mb-4 rounded-lg bg-neutral-50 px-4 py-3 dark:bg-white/5">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                How to export from {selected.name}
              </p>
              <p className="mt-0.5 text-sm text-neutral-700 dark:text-neutral-200">
                {selected.instructions}
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                Accepts: <span className="font-mono">{selected.accepts}</span>
              </p>
            </div>

            {/* Result */}
            {result ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-green-600 dark:text-green-400" />
                  <div>
                    <p className="font-medium text-green-800 dark:text-green-300">
                      Import complete
                    </p>
                    <p className="mt-0.5 text-sm text-green-700 dark:text-green-400">
                      {result.imported} meeting{result.imported !== 1 ? 's' : ''} imported
                      {result.skipped > 0 ? `, ${result.skipped} skipped` : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { closeModal(); router.push('/dashboard/recordings') }}
                  className="mt-3 w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  View imported meetings
                </button>
              </div>
            ) : (
              <>
                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
                    dragging
                      ? 'border-[#CA2625] bg-red-50 dark:bg-red-950/20'
                      : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20'
                  }`}
                >
                  <Upload className="mb-3 h-8 w-8 text-neutral-400" />
                  {file ? (
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                      {file.name}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
                        Drop your file here or click to browse
                      </p>
                      <p className="mt-1 text-xs text-neutral-400">{selected.accepts}</p>
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept={selected.accepts}
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </div>

                {/* Error */}
                {error && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
                    {error}
                  </div>
                )}

                <button
                  onClick={handleUpload}
                  disabled={!file || loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#CA2625] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Importing…
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Import meetings
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
