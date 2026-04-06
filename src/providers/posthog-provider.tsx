'use client'

// Kolasys AI — PostHog client-side provider
// Initialises PostHog, tracks page views on route change, and identifies the Clerk user.

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react'
import { useEffect, useRef, Suspense } from 'react'
import { useUser } from '@clerk/nextjs'
import { usePathname, useSearchParams } from 'next/navigation'

// ── Page view tracking ────────────────────────────────────────────────────────
// Wrapped in Suspense because useSearchParams() requires it in App Router.

function PostHogPageViewInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const phog = usePostHog()
  const prevUrl = useRef<string>('')

  useEffect(() => {
    if (!phog || typeof window === 'undefined') return
    const url = window.location.href
    if (url !== prevUrl.current) {
      prevUrl.current = url
      phog.capture('$pageview', { $current_url: url })
    }
  }, [pathname, searchParams, phog])

  return null
}

function PostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageViewInner />
    </Suspense>
  )
}

// ── User identification ───────────────────────────────────────────────────────
// Ties PostHog anonymous events to a Clerk user once they sign in.

function PostHogIdentify() {
  const { user, isLoaded } = useUser()
  const phog = usePostHog()

  useEffect(() => {
    if (!phog || !isLoaded) return

    if (user) {
      phog.identify(user.id, {
        email: user.emailAddresses[0]?.emailAddress,
        name: user.fullName,
      })
    } else {
      // User signed out — reset so next session gets a fresh anonymous ID
      phog.reset()
    }
  }, [user, isLoaded, phog])

  return null
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      // 'identified_only' — only create person profiles for identified users
      person_profiles: 'identified_only',
      // We manage page views manually so they fire on route change, not just page load
      capture_pageview: false,
      capture_pageleave: true,
    })
  }, [])

  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      <PostHogIdentify />
      {children}
    </PHProvider>
  )
}
