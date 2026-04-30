'use client'

// Kolasys AI — Registers /sw.js, requests Notification permission, and
// subscribes the browser to Web Push if granted. Runs once per session
// (the localStorage flag avoids re-prompting after the user dismisses).
//
// Renders nothing.

import { useEffect } from 'react'

const ATTEMPT_KEY = 'kolasys-webpush-attempt-v1'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function WebPushRegistrar() {
  useEffect(() => {
    let cancelled = false

    async function go() {
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)
      ) {
        return
      }

      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready

        // Already subscribed → re-POST to /api/push/subscribe so the row
        // exists for any newly-added member, then bail.
        const existing = await reg.pushManager.getSubscription()
        if (existing) {
          if (!cancelled) await postSubscription(existing)
          return
        }

        // Don't auto-prompt after a previous decline this session.
        if (Notification.permission === 'denied') return
        if (
          Notification.permission === 'default' &&
          sessionStorage.getItem(ATTEMPT_KEY) === '1'
        ) {
          return
        }

        if (Notification.permission === 'default') {
          sessionStorage.setItem(ATTEMPT_KEY, '1')
          const permission = await Notification.requestPermission()
          if (permission !== 'granted') return
        }

        const keyRes = await fetch('/api/push/vapid-public-key')
        if (!keyRes.ok) return
        const { publicKey } = (await keyRes.json()) as { publicKey: string }
        if (!publicKey) return

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          // Cast to BufferSource — modern lib.dom narrows applicationServerKey
          // to a backing-buffer-aware Uint8Array which our generic helper
          // doesn't satisfy on every TS lib version.
          applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
        })
        if (!cancelled) await postSubscription(sub)
      } catch (err) {
        // Push isn't critical — just log and move on.
        console.error('[web-push] registration failed:', err)
      }
    }

    async function postSubscription(sub: PushSubscription) {
      const json = sub.toJSON() as {
        endpoint?: string
        keys?: { p256dh?: string; auth?: string }
      }
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        }),
      }).catch((err) => console.error('[web-push] subscribe POST failed:', err))
    }

    go()
    return () => {
      cancelled = true
    }
  }, [])

  return null
}
