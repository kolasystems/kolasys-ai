// Sentry server-side (Node.js runtime) initialization
// Loaded via src/instrumentation.ts register() when NEXT_RUNTIME === 'nodejs'
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  debug: false,
})
