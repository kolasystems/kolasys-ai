// Kolasys AI — Conversation intelligence dashboard

import type { Metadata } from 'next'
import { AnalyticsView } from '@/components/analytics-view'

export const metadata: Metadata = { title: 'Analytics' }

export default function AnalyticsPage() {
  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl font-bold text-neutral-900 dark:text-white sm:text-2xl">
          Analytics
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
          Conversation intelligence across every meeting in your workspace.
        </p>
      </div>

      <AnalyticsView />
    </div>
  )
}
