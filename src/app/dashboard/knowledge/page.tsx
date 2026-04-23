// Kolasys AI — Personal knowledge graph dashboard
// People / Topics / Projects auto-extracted from every meeting transcript.

import type { Metadata } from 'next'
import { KnowledgeView } from '@/components/knowledge-view'

export const metadata: Metadata = { title: 'Knowledge' }

export default function KnowledgePage() {
  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl font-bold text-neutral-900 dark:text-white sm:text-2xl">
          Knowledge
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
          People, topics, and projects Kolasys AI has learned from your meetings.
        </p>
      </div>

      <KnowledgeView />
    </div>
  )
}
