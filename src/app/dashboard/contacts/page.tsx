// Kolasys AI — Contacts directory (auto-derived from meeting speakers).

import type { Metadata } from 'next'
import { ContactsView } from '@/components/contacts-view'

export const metadata: Metadata = { title: 'Contacts' }

export default function ContactsPage() {
  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl font-bold text-neutral-900 dark:text-white sm:text-2xl">
          Contacts
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
          People mentioned across your meetings, auto-derived from speaker labels.
        </p>
      </div>

      <ContactsView />
    </div>
  )
}
