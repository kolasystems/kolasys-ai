'use client'

// Kolasys AI — tRPC + React Query provider

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchStreamLink } from '@trpc/client'
import superjson from 'superjson'
import { trpc } from '@/lib/trpc'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1_000,
        refetchOnWindowFocus: false,
      },
    },
  })
}

// Singleton on the browser side only — avoids creating new clients on every render.
let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always create a fresh client per request.
    return makeQueryClient()
  }
  if (!browserQueryClient) browserQueryClient = makeQueryClient()
  return browserQueryClient
}

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient()

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchStreamLink({
          url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/trpc`,
          transformer: superjson,
        }),
      ],
    })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        {children}
      </trpc.Provider>
    </QueryClientProvider>
  )
}
