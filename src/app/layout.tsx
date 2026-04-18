// Kolasys AI — Root layout

import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { ClerkProvider } from '@clerk/nextjs'
import { TRPCReactProvider } from '@/providers/trpc-provider'
import { PostHogProvider } from '@/providers/posthog-provider'
import './globals.css'

// Geist is Vercel's UI font, shipped as a local npm package (`geist`) rather
// than via Google Fonts. Unlike next/font/google (which had been failing to
// load intermittently and producing Times New Roman fallbacks), the `geist`
// package bundles the font files into the build — no network round-trip at
// request time, so the font is always available.
//
// `GeistSans.variable`  writes `--font-geist-sans` onto the element it's on.
// `GeistMono.variable`  writes `--font-geist-mono`.
// Both classes go on <html> so the custom properties cascade to everything,
// including portalled modal/dropdown surfaces.

export const metadata: Metadata = {
  title: { default: 'Kolasys AI', template: '%s — Kolasys AI' },
  description: 'AI-powered meeting notes, transcription, and action items.',
}

// Inline pre-hydration script — reads localStorage ("kolasys-theme") and
// applies the `dark` class to <html> before the first paint so users never
// see a flash of the wrong theme on reload or across navigations.
const themeInitScript = `
(function() {
  try {
    var theme = localStorage.getItem('kolasys-theme');
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch(e) {}
})();
`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${GeistSans.variable} ${GeistMono.variable}`}
        suppressHydrationWarning
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        </head>
        <body className="antialiased">
          <TRPCReactProvider>
            <PostHogProvider>
              {children}
            </PostHogProvider>
          </TRPCReactProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
