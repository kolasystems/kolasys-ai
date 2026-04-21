// Kolasys AI — Auth proxy (Next.js 16 renamed middleware → proxy)
// Protects /dashboard and API routes; allows public access to webhooks and auth pages.

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/pricing(.*)',
  '/api/webhooks/(.*)',
  // tRPC routes handle their own auth via protectedProcedure / orgProcedure.
  // Letting the middleware redirect here produces a 302 → /sign-in response
  // that httpBatchStreamLink can't parse, causing "Stream closed before head
  // was received". tRPC will return a proper UNAUTHORIZED / FORBIDDEN JSON
  // error instead.
  '/api/trpc/(.*)',
])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and static assets.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
