// Kolasys AI — Root layout

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { TRPCReactProvider } from '@/providers/trpc-provider'
import { PostHogProvider } from '@/providers/posthog-provider'
import './globals.css'

// Inter is the single UI font. `variable: '--font-inter'` writes the resolved
// font-family + feature settings to the `--font-inter` custom property; the
// class `inter.variable` is applied to <html> so the property cascades to
// everything.
//
// `display: 'swap'` shows a fallback immediately and swaps in Inter once
// loaded — avoids blocking first paint.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

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
      <html lang="en" className={inter.variable} suppressHydrationWarning>
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
