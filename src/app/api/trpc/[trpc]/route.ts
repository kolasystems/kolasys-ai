// Kolasys AI — tRPC route handler (Next.js 16 App Router)

import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server/root'
import { createTRPCContext } from '@/server/trpc'

export const runtime = 'nodejs'

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
    onError:
      process.env.NODE_ENV === 'development'
        ? ({ path, error }) => {
            console.error(`tRPC error on /${path}:`, error)
          }
        : undefined,
  })
}

export { handler as GET, handler as POST }
