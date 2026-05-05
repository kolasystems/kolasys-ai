// Kolasys AI — Auth proxy (Next.js 16 renamed middleware → proxy)
// Protects /dashboard and API routes; allows public access to webhooks and auth pages.

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/pricing(.*)',
  // Public share pages — anyone with the slug can view a recording's
  // notes / transcript when the owner has flipped isPublic=true.
  '/share/(.*)',
  '/api/webhooks/(.*)',
  // Public REST API — bearer-token authenticated, not Clerk-session.
  // The route handlers themselves call `authenticateApiKey` and return 401
  // on missing/invalid tokens.
  '/api/v1/(.*)',
  // Stripe routes — webhook is signature-verified (no Clerk session
  // possible from Stripe's IPs), checkout/portal handlers gate themselves
  // via auth() and return 401 if missing.
  '/api/stripe/(.*)',
  // Web push routes — vapid-public-key returns a public value; subscribe
  // self-gates via auth(). Letting the middleware skip them avoids
  // redirect loops if the service worker fetches before Clerk is ready.
  '/api/push/(.*)',
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
