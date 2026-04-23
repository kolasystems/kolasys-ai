'use client'

// Kolasys AI — People / Topics / Projects chip row shown beneath the notes
// on the recording detail page. Queries trpc.knowledge.getForRecording and
// groups the results by entity type.

import { Briefcase, Hash, Users } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

type Props = { recordingId: string }

function capitalize(name: string): string {
  return name.replace(/\b\w/g, (c) => c.toUpperCase())
}

export function RecordingKnowledgeChips({ recordingId }: Props) {
  const { data, isLoading } = trpc.knowledge.getForRecording.useQuery({ recordingId })

  if (isLoading || !data || data.length === 0) return null

  const people = data.filter((e) => e.type === 'PERSON')
  const topics = data.filter((e) => e.type === 'TOPIC')
  const projects = data.filter((e) => e.type === 'PROJECT')

  return (
    <section
      className="mt-3 rounded-2xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#1A1A24] sm:p-5"
      aria-label="People and topics extracted from this recording"
    >
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-neutral-500 dark:text-gray-400" strokeWidth={1.75} />
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
          People &amp; Topics
        </h3>
      </div>

      <div className="space-y-2.5">
        <ChipGroup
          label="People"
          icon={<Users className="h-3 w-3" strokeWidth={1.75} />}
          items={people}
        />
        <ChipGroup
          label="Topics"
          icon={<Hash className="h-3 w-3" strokeWidth={1.75} />}
          items={topics}
        />
        <ChipGroup
          label="Projects"
          icon={<Briefcase className="h-3 w-3" strokeWidth={1.75} />}
          items={projects}
        />
      </div>
    </section>
  )
}

type Entity = { id: string; name: string; mentions: number; totalMentions: number }

function ChipGroup({
  label,
  icon,
  items,
}: {
  label: string
  icon: React.ReactNode
  items: Entity[]
}) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-gray-500">
        {icon}
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((e) => (
          <span
            key={e.id}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
              'bg-[color-mix(in_srgb,#CA2625_8%,transparent)] text-[#CA2625]',
              'dark:bg-[color-mix(in_srgb,#CA2625_14%,transparent)]',
            )}
            title={`${e.totalMentions} mention${e.totalMentions === 1 ? '' : 's'} across all meetings`}
          >
            {capitalize(e.name)}
            {e.mentions > 1 && (
              <span className="rounded bg-white/40 px-1 text-[10px] dark:bg-white/20">
                ×{e.mentions}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
