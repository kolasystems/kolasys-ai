'use client'

// Kolasys AI — Pricing-page CTA. When signed in, POSTs to
// /api/stripe/checkout and redirects to Stripe; otherwise falls through
// to the sign-up page so the post-signup flow can pick the plan back up
// from the ?plan= query param.

import { useState } from 'react'
import Link from 'next/link'

type Props = {
  signedIn: boolean
  priceId?: string | null
  seats?: number
  /** Sign-up href used when the user is not signed in. */
  signupHref: string
  /** Where to send the user when no priceId is configured (Enterprise / mailto). */
  fallbackHref?: string
  className?: string
  highlight?: boolean
  children: React.ReactNode
}

export function PricingCTA({
  signedIn,
  priceId,
  seats,
  signupHref,
  fallbackHref,
  className,
  highlight,
  children,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const baseCls =
    'block w-full rounded-xl py-2.5 text-center text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed'
  const styleCls = highlight
    ? 'text-white'
    : 'border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10'
  const cls = `${baseCls} ${styleCls} ${className ?? ''}`.trim()
  const inlineStyle = highlight ? { backgroundColor: '#CA2625' } : {}

  // Enterprise / mailto / no priceId → just render a link.
  if (!priceId && fallbackHref) {
    return (
      <Link href={fallbackHref} className={cls} style={inlineStyle}>
        {children}
      </Link>
    )
  }

  // Not signed in → kick to sign-up so Clerk handles auth first.
  if (!signedIn) {
    return (
      <Link href={signupHref} className={cls} style={inlineStyle}>
        {children}
      </Link>
    )
  }

  // Signed in + priceId → POST to checkout and redirect.
  async function handleClick() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, seats }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Checkout failed' }))
        throw new Error((body as { error?: string }).error ?? 'Checkout failed')
      }
      const { url } = (await res.json()) as { url: string }
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={cls}
        style={inlineStyle}
      >
        {loading ? 'Redirecting…' : children}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}
