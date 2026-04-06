'use client'

// Kolasys AI — tRPC React client
// 'use client' is required so Next.js RSC transform strips the type-only
// import below before the bundler sees it — preventing Prisma from leaking
// into the client bundle through the server router type chain.

import { createTRPCReact } from '@trpc/react-query'
import type { AppRouter } from '@/server/root'

export const trpc = createTRPCReact<AppRouter>()
