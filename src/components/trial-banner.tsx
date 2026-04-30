'use client'

// Kolasys AI — Sticky trial-status banner shown at the top of the
// dashboard layout when an org's trial is ending soon (yellow, ≤7d
// remaining) or has lapsed without upgrade (red). Dismissible per
// session via localStorage keyed on the trial-end ISO so a fresh
// trial-end date or upgrade naturally resets the dismissal state.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, X } from 'lucide-react'

type Props = {
  /** Plan + trial state resolved server-side. Null = nothing to show. */
  state:
    | { kind: 'expiring'; daysLeft: number; trialEndIso: string }
    | { kind: 'expired'; trialEndIso: string }
    | null
}

const STORAGE_PREFIX = 'kolasys-trial-banner-dismissed-'

export function TrialBanner({ state }: Props) {
  // Hydrate from localStorage to avoid SSR/CSR drift while still respecting
  // the dismiss action client-side.
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (!state) return
    const key = STORAGE_PREFIX + state.trialEndIso
    setDismissed(localStorage.getItem(key) === '1')
  }, [state])

  if (!state || dismissed) return null

  const isExpiring = state.kind === 'expiring'
  const wrapper = isExpiring
    ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
    : 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'

  function dismiss() {
    if (!state) return
    localStorage.setItem(STORAGE_PREFIX + state.trialEndIso, '1')
    setDismissed(true)
  }

  return (
    <div
      className={`sticky top-0 z-30 border-b ${wrapper}`}
      role="status"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <p className="flex-1 text-sm">
          {isExpiring ? (
            <>
              Your free trial ends in <strong>{state.daysLeft} day
              {state.daysLeft === 1 ? '' : 's'}</strong> —{' '}
              <Link href="/dashboard/billing" className="font-semibold underline">
                Upgrade to Pro
              </Link>{' '}
              to keep access.
            </>
          ) : (
            <>
              Your trial has ended —{' '}
              <Link href="/dashboard/billing" className="font-semibold underline">
                Upgrade
              </Link>{' '}
              to continue using Kolasys AI.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
