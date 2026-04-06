// Next.js instrumentation hook — loads Sentry for the correct runtime.
// Next.js 16 looks for this file at src/instrumentation.ts (src/ layout).
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

// Capture unhandled errors in server components / route handlers (Next.js 15+)
export const onRequestError = Sentry.captureRequestError
