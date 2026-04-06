// Kolasys AI — PostHog server-side singleton (posthog-node)
// Use this in tRPC procedures and workers for server-side event tracking.
// Fire-and-forget: never await these calls in request handlers.
import { PostHog } from 'posthog-node'

let _client: PostHog | null = null

/**
 * Returns the PostHog Node client, or null if the key is not configured.
 * The client is a process-level singleton — safe for long-running workers.
 *
 * In serverless functions (short-lived), call posthog.shutdown() at the end of
 * the invocation to flush queued events before the process is frozen.
 * In workers (long-running), leave it running — it will batch and flush automatically.
 */
export function getPostHogServer(): PostHog | null {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return null
  if (!_client) {
    _client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      // Flush immediately — important for serverless where processes are short-lived
      flushAt: 1,
      flushInterval: 0,
    })
  }
  return _client
}

/**
 * Convenience: capture a server-side event. Never throws — PostHog is non-fatal.
 */
export function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  try {
    getPostHogServer()?.capture({ distinctId, event, properties })
  } catch {
    // PostHog is non-fatal — never let it break a request or job
  }
}
