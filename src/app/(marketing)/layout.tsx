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
      <footer className="border-t border-white/[0.06] py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <KolasysLogoMark size={20} className="text-white/40" />
            <span className="text-sm text-white/40">© {new Date().getFullYear()} Kolasys AI</span>
          </div>
          <nav className="flex gap-5 text-sm text-white/40">
            <Link href="/privacy" className="hover:text-white/70 transition-colors">Privacy Policy</Link>
            <a href="mailto:hi@kolasys.ai" className="hover:text-white/70 transition-colors">Contact</a>
            <a href="https://apps.apple.com/app/id6764396351" className="hover:text-white/70 transition-colors">iOS App</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
