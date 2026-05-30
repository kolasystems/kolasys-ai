import Link from 'next/link'
import { KolasysLogoMark } from '@/components/kolasys-logo'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0F0F13] text-white">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0F0F13]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <KolasysLogoMark size={32} className="text-white" />
            <span className="text-base font-semibold tracking-tight">
              Kolasys <span style={{ color: '#CA2625' }}>AI</span>
            </span>
          </Link>

          <nav className="flex items-center gap-3">
            <Link
              href="https://app.kolasys.ai/sign-in"
              className="rounded-lg px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="https://app.kolasys.ai/sign-up"
              className="rounded-lg bg-[#CA2625] px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
            >
              Start free
            </Link>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            {/* Logo + tagline */}
            <div className="max-w-sm">
              <div className="flex items-center gap-2">
                <KolasysLogoMark size={22} className="text-white/60" />
                <span className="text-sm font-semibold text-white/80">
                  Kolasys <span style={{ color: '#CA2625' }}>AI</span>
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-white/40">
                Your meetings, intelligently captured.
              </p>
              {/* App Store badge — coming soon placeholder. Swap for the real
                  badge SVG once Apple approves. */}
              <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/45">
                <span aria-hidden></span>
                <span>App Store · Coming soon</span>
              </div>
            </div>

            {/* Links */}
            <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/45">
              <Link href="/privacy" className="hover:text-white/70 transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-white/70 transition-colors">
                Terms
              </Link>
              <a
                href="mailto:hi@kolasys.ai"
                className="hover:text-white/70 transition-colors"
              >
                Contact
              </a>
            </nav>
          </div>

          <div className="mt-10 border-t border-white/[0.04] pt-6 text-xs text-white/30">
            © 2026 Kola Systems LLC
          </div>
        </div>
      </footer>
    </div>
  )
}
