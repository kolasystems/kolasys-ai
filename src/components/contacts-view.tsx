'use client'

// Kolasys AI — Contacts grid view. Fetches aggregated speakers from
// trpc.contacts.list, filters client-side by name, and renders a
// gradient-avatar card per person.

import { useMemo, useState } from 'react'
import { Search, Users, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'

// Stable, deterministic gradient per initial letter so the same name always
// lands on the same card colour. Values are small Tailwind-friendly tuples.
const AVATAR_GRADIENTS: Array<[string, string]> = [
  ['#667eea', '#764ba2'],
  ['#f093fb', '#f5576c'],
  ['#4facfe', '#00f2fe'],
  ['#43e97b', '#38f9d7'],
  ['#fa709a', '#fee140'],
  ['#30cfd0', '#330867'],
  ['#a8edea', '#fed6e3'],
  ['#ff9a9e', '#fad0c4'],
]

function gradientFor(name: string): [string, string] {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatTalkTime(seconds: number): string {
  if (!seconds) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m === 0) return `${s}s`
  return `${m}m ${s}s`
}

function formatDate(d: Date | string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ContactsView() {
  const { data, isLoading, error } = trpc.contacts.list.useQuery()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    if (!q) return data
    return data.filter((c) => c.name.toLowerCase().includes(q))
  }, [data, query])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
        Failed to load contacts: {error.message}
      </div>
    )
  }

  const contacts = data ?? []

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-gray-500" />
        <input
          type="text"
          placeholder="Filter by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-9 text-sm shadow-sm placeholder:text-neutral-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 dark:border-white/10 dark:bg-[#1A1A24] dark:text-white dark:placeholder:text-gray-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600 dark:text-gray-500 dark:hover:text-gray-300"
            aria-label="Clear filter"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Empty states */}
      {contacts.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white py-16 text-center shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
          <Users className="mx-auto mb-3 h-10 w-10 text-neutral-300 dark:text-gray-500" />
          <p className="text-sm font-medium text-neutral-700 dark:text-white">No contacts yet</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-neutral-500 dark:text-gray-400">
            Process a meeting with multiple speakers — Kolasys AI will derive a contact list from the
            transcript automatically.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white py-12 text-center shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
          <p className="text-sm text-neutral-500 dark:text-gray-400">
            No contacts match &ldquo;{query}&rdquo;.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const [g0, g1] = gradientFor(c.name)
            return (
              <div
                key={c.name}
                className="group rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-[#1A1A24]"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${g0} 0%, ${g1} 100%)` }}
                    aria-hidden
                  >
                    {initialsOf(c.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-neutral-900 dark:text-white">
                      {c.name}
                    </p>
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 text-xs font-medium text-accent">
                      {c.meetings} meeting{c.meetings === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-neutral-400 dark:text-gray-500">First seen</dt>
                    <dd className="mt-0.5 font-medium text-neutral-700 dark:text-gray-300">
                      {formatDate(c.firstSeen)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-neutral-400 dark:text-gray-500">Last seen</dt>
                    <dd className="mt-0.5 font-medium text-neutral-700 dark:text-gray-300">
                      {formatDate(c.lastSeen)}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-neutral-400 dark:text-gray-500">Total talk time</dt>
                    <dd className="mt-0.5 font-medium tabular-nums text-neutral-700 dark:text-gray-300">
                      {formatTalkTime(c.totalTalkSeconds)}
                    </dd>
                  </div>
                </dl>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
