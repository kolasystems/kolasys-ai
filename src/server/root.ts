// Kolasys AI — Root tRPC router
import 'server-only'

import { router } from './trpc'
import { recordingsRouter } from './routers/recordings.router'

export const appRouter = router({
  recordings: recordingsRouter,
})

export type AppRouter = typeof appRouter
