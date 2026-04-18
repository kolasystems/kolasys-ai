// Kolasys AI — Root tRPC router
import 'server-only'

import { router } from './trpc'
import { recordingsRouter } from './routers/recordings.router'
import { searchRouter } from './routers/search.router'
import { calendarRouter } from './routers/calendar.router'
import { integrationsRouter } from './routers/integrations.router'
import { templatesRouter } from './routers/templates.router'
import { settingsRouter } from './routers/settings.router'
import { analyticsRouter } from './routers/analytics.router'
import { contactsRouter } from './routers/contacts.router'

export const appRouter = router({
  recordings: recordingsRouter,
  search: searchRouter,
  calendar: calendarRouter,
  integrations: integrationsRouter,
  templates: templatesRouter,
  settings: settingsRouter,
  analytics: analyticsRouter,
  contacts: contactsRouter,
})

export type AppRouter = typeof appRouter
