// Kolasys AI — Root tRPC router
import 'server-only'

import { router } from './trpc'
import { recordingsRouter } from './routers/recordings.router'
import { searchRouter } from './routers/search.router'
import { calendarRouter } from './routers/calendar.router'
import { integrationsRouter } from './routers/integrations.router'
import { templatesRouter } from './routers/templates.router'

export const appRouter = router({
  recordings: recordingsRouter,
  search: searchRouter,
  calendar: calendarRouter,
  integrations: integrationsRouter,
  templates: templatesRouter,
})

export type AppRouter = typeof appRouter
