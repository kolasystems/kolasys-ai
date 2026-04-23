'use client'

// Kolasys AI — Knowledge graph client view. Three tabs (People / Topics /
// Projects); each tab shows a grid of entity cards with mention counts,
// meetings-appeared-in, first/last seen dates.

import { useState } from 'react'
import { Briefcase, Hash, Loader2, Users } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

type Tab = 'PERSON' | 'TOPIC' | 'PROJECT'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'PERSON', label: 'People', icon: <Users className="h-3.5 w-3.5" strokeWidth={1.75} /> },
  { id: 'TOPIC', label: 'Topics', icon: <Hash className="h-3.5 w-3.5" strokeWidth={1.75} /> },
  { id: 'PROJECT', label: 'Projects', icon: <Briefcase className="h-3.5 w-3.5" strokeWidth={1.75} /> },
]

function capitalize(name: string): string {
  return name.replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function KnowledgeView() {
  const [tab, setTab] = useState<Tab>('PERSON')

  const { data, isLoading, error } = trpc.knowledge.getTopEntities.useQuery({
    type: tab,
    limit: 30,
  })

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-neutral-100 bg-neutral-50 p-1 dark:border-white/10 dark:bg-white/5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              tab === t.id
                ? 'bg-white text-[#CA2625] shadow-sm dark:bg-[#1A1A24]'
                : 'text-neutral-500 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-white',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          Failed to load knowledge: {error.message}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white py-16 text-center shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
          <Loader2 className="mb-3 h-8 w-8 text-muted" />
          <p className="text-sm font-medium text-neutral-700 dark:text-white">
            Nothing learned yet
          </p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-neutral-500 dark:text-gray-400">
            Process a couple of meetings — Kolasys AI will start picking up
            recurring {tab === 'PERSON' ? 'people' : tab === 'TOPIC' ? 'topics' : 'projects'}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((e) => (
            <article
              key={e.id}
              className="rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-neutral-300 dark:border-white/10 dark:bg-[#1A1A24] dark:hover:border-white/20"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="truncate font-semibold text-neutral-900 dark:text-white">
                  {capitalize(e.name)}
                </p>
                <span className="flex-shrink-0 rounded-full bg-[color-mix(in_srgb,#CA2625_12%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[#CA2625]">
                  {e.mentions}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500 dark:text-gray-400">
                {e.recordingLinks.length} meeting{e.recordingLinks.length === 1 ? '' : 's'}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-neutral-400 dark:text-gray-500">First seen</dt>
                  <dd className="mt-0.5 font-medium text-neutral-700 dark:text-gray-300">
                    {formatDate(e.firstSeen)}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-400 dark:text-gray-500">Last seen</dt>
                  <dd className="mt-0.5 font-medium text-neutral-700 dark:text-gray-300">
                    {formatDate(e.lastSeen)}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
