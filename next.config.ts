// Kolasys AI — Next.js Configuration
// Next.js 16 · Turbopack is the default bundler

import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',
        pathname: '/**',
      },
    ],
  },
  // Silence import warnings from server-only packages used in workers
  serverExternalPackages: ['ioredis', 'bullmq'],
}

export default withSentryConfig(nextConfig, {
  // Sentry org/project for source map uploads (optional — skipped if not set)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Silence build-time Sentry messages when auth token is absent (local dev)
  silent: !process.env.SENTRY_AUTH_TOKEN,

  // Opt out of Sentry telemetry
  telemetry: false,
})
