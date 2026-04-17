// Kolasys AI — Root layout

import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { TRPCReactProvider } from '@/providers/trpc-provider'
import { PostHogProvider } from '@/providers/posthog-provider'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
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
      <html lang="en" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        </head>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
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
