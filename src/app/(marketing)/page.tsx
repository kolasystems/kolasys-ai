// Kolasys AI — Marketing landing page
//
// Layout wrapper (src/app/(marketing)/layout.tsx) keeps a dark base. Every
// section here paints both bg and text explicitly so the dark→light→dark
// rhythm works without touching the layout (which is shared with
// /privacy and /terms).

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import {
  ArrowRight,
  BarChart3,
  Calendar,
  Check,
  Code2,
  FileText,
  Layers,
  Laptop,
  Mic2,
  Quote,
  Search,
  Share2,
  Smartphone,
  Watch,
} from 'lucide-react'

export default async function MarketingPage() {
  // Signed-in users skip the marketing page entirely (commit a178732).
  const { userId } = await auth()
  if (userId) redirect('/dashboard')

  return (
    <>
      <Hero />
      <Platforms />
      <Features />
      <SocialProof />
      <Pricing />
      <FinalCTA />
    </>
  )
}

// ── 1. Hero ───────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#0F0F13] px-6 pb-20 pt-20 text-white sm:pt-28">
      {/* Radial brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[600px]"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(202,38,37,0.22) 0%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        {/* Left: copy + CTAs */}
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-white/60">
            <span className="h-1.5 w-1.5 rounded-full bg-[#CA2625]" />
            New: Apple Watch + Mac desktop app
          </div>

          <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
            Your meetings,{' '}
            <span style={{ color: '#CA2625' }}>intelligently</span> captured
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/60">
            Kolasys AI transcribes, summarizes, and surfaces action items from every
            meeting — across web, iPhone, Apple Watch, and desktop.
          </p>

          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link
              href="https://app.kolasys.ai/sign-up"
              className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#CA2625] px-7 text-sm font-semibold text-white shadow-lg shadow-[#CA2625]/30 transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              Start free trial
            </Link>
            <a
              href="#features"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-7 text-sm font-semibold text-white transition-colors hover:bg-white/[0.08]"
            >
              See how it works
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          {/* Trust bar */}
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/40">
            <TrustItem>No AI credit limits</TrustItem>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <TrustItem>Claude-powered</TrustItem>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <TrustItem>SOC2 in progress</TrustItem>
          </div>
        </div>

        {/* Right: stylized meeting-detail mockup */}
        <HeroMockup />
      </div>
    </section>
  )
}

function TrustItem({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Check className="h-3.5 w-3.5 text-[#CA2625]" />
      {children}
    </span>
  )
}

function HeroMockup() {
  return (
    <div className="relative">
      {/* Faux window chrome */}
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50"
        style={{
          background:
            'linear-gradient(135deg, #1A1A24 0%, #0F0F13 100%)',
        }}
      >
        {/* Title bar */}
        <div className="flex items-center gap-1.5 border-b border-white/[0.06] bg-black/30 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          <span className="ml-4 truncate text-xs text-white/40">
            May 4 — Q3 budget alignment
          </span>
        </div>

        {/* Body */}
        <div className="grid gap-0 sm:grid-cols-[1fr_180px]">
          {/* Left pane: notes */}
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: 'rgba(202,38,37,0.15)' }}
              >
                <Mic2 className="h-3.5 w-3.5 text-[#CA2625]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Q3 budget alignment</p>
                <p className="text-[10px] text-white/40">May 4 · 32 min · 4 speakers</p>
              </div>
            </div>

            <MockSection title="Meeting Overview">
              Aligned on Q3 priorities: ship the desktop app, raise Pro pricing
              to $14.99, and freeze hiring through August.
            </MockSection>

            <MockSection title="Key Decisions">
              <ul className="space-y-1">
                <li className="flex gap-1.5">
                  <span className="text-[#CA2625]">•</span>
                  <span>Defer the Meet integration to Q4</span>
                </li>
                <li className="flex gap-1.5">
                  <span className="text-[#CA2625]">•</span>
                  <span>Greenlight Apple Watch Phase 3</span>
                </li>
              </ul>
            </MockSection>

            <MockSection title="Action Items" badge="3">
              <div className="space-y-1.5">
                <MockAction>Paul ships desktop alpha by May 18</MockAction>
                <MockAction>Tara revises pricing page</MockAction>
              </div>
            </MockSection>
          </div>

          {/* Right pane: AI insights */}
          <div className="hidden border-l border-white/[0.06] bg-black/20 p-4 sm:block">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              AI Insights
            </div>
            <MockChip color="emerald">Positive sentiment</MockChip>
            <MockChip color="amber">2 risks flagged</MockChip>
            <MockChip color="violet">4 commitments</MockChip>
            <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
              <p className="text-[10px] font-semibold text-white/60">Follow-up</p>
              <p className="mt-1 text-[10px] leading-relaxed text-white/40">
                Did the team agree on a final price point?
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Soft red glow under mockup */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-12 left-1/2 h-32 w-3/4 -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: 'rgba(202,38,37,0.25)' }}
      />
    </div>
  )
}

function MockSection({
  title,
  badge,
  children,
}: {
  title: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
          {title}
        </p>
        {badge && (
          <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-white/60">
            {badge}
          </span>
        )}
      </div>
      <div className="text-xs leading-relaxed text-white/65">{children}</div>
    </div>
  )
}

function MockAction({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
      <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#CA2625]" />
      <span className="text-[11px] text-white/65">{children}</span>
    </div>
  )
}

const CHIP_COLORS = {
  emerald: 'bg-emerald-500/10 text-emerald-300',
  amber: 'bg-amber-500/10 text-amber-300',
  violet: 'bg-violet-500/10 text-violet-300',
} as const

function MockChip({
  color,
  children,
}: {
  color: keyof typeof CHIP_COLORS
  children: React.ReactNode
}) {
  return (
    <span
      className={`mb-1.5 mr-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${CHIP_COLORS[color]}`}
    >
      {children}
    </span>
  )
}

// ── 2. Platforms ───────────────────────────────────────────────────────────

const PLATFORMS = [
  {
    icon: Smartphone,
    name: 'Web',
    desc: 'Full meeting intelligence at app.kolasys.ai — notes, search, insights.',
  },
  {
    icon: Smartphone,
    name: 'iPhone',
    desc: 'Record, transcribe, and review on the go with the iOS app.',
  },
  {
    icon: Watch,
    name: 'Apple Watch',
    desc: 'Tap the mic on your wrist to start recordings instantly.',
  },
  {
    icon: Laptop,
    name: 'Mac',
    desc: 'Floating overlay + auto-join for calendar meetings.',
  },
]

function Platforms() {
  return (
    <section className="bg-white px-6 py-20 text-neutral-900 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Works everywhere you work
          </h2>
          <p className="mt-4 text-base text-neutral-600">
            One account, every device. Notes sync the moment a meeting ends.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLATFORMS.map(({ icon: Icon, name, desc }) => (
            <div
              key={name}
              className="group rounded-2xl border border-neutral-200/80 bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md"
            >
              <div
                className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'rgba(202,38,37,0.10)' }}
              >
                <Icon className="h-5 w-5" style={{ color: '#CA2625' }} />
              </div>
              <h3 className="text-base font-semibold text-neutral-900">{name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── 3. Features ────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: FileText,
    title: 'AI Meeting Notes',
    body:
      'Claude-powered summaries with sections, action items, and key decisions. Not just a transcript dump.',
  },
  {
    icon: Mic2,
    title: 'Live Transcription',
    body:
      'Words appear in real-time as you speak via Deepgram (Pro). Follow along without missing a beat.',
  },
  {
    icon: Calendar,
    title: 'Calendar Integration',
    body:
      'Connect Google or Microsoft calendar. Kolasys automatically joins meetings so you never miss one.',
  },
  {
    icon: Search,
    title: 'Semantic Search',
    body:
      'Search across all your meetings by meaning, not just keywords. "What did we decide about the budget?" works.',
  },
  {
    icon: Layers,
    title: 'Meeting Series',
    body:
      'AI automatically groups recurring meetings. See all your Rising Hope board meetings in one place.',
  },
  {
    icon: Share2,
    title: 'Share & Collaborate',
    body:
      'Share meeting notes with a link. Control who sees the audio, transcript, or full summary.',
  },
  {
    icon: BarChart3,
    title: 'Conversation Intelligence',
    body:
      'Talk time, sentiment analysis, follow-up questions, risks and blockers — surfaced automatically.',
  },
  {
    icon: Code2,
    title: 'Developer API',
    body:
      'REST API + webhooks. Build on top of Kolasys or connect to your existing tools.',
  },
]

function Features() {
  return (
    <section
      id="features"
      className="scroll-mt-20 bg-[#F8F9FC] px-6 py-20 text-neutral-900 sm:py-24"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything your team needs
          </h2>
          <p className="mt-4 text-base text-neutral-600">
            From the moment a meeting starts to the action items in your inbox — one
            unified workflow.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="flex gap-4 rounded-2xl border border-neutral-200/80 bg-white p-6 transition-shadow hover:shadow-md"
            >
              <div
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
                style={{ background: 'rgba(202,38,37,0.10)' }}
              >
                <Icon className="h-5 w-5" style={{ color: '#CA2625' }} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── 4. Social proof ────────────────────────────────────────────────────────

const QUOTES = [
  {
    quote:
      'Kolasys changed how our board tracks decisions. Every meeting is now searchable.',
    name: 'Tom R.',
    role: 'Nonprofit Executive Director',
  },
  {
    quote:
      'I use the Apple Watch feature to start recordings without touching my phone. Game changer.',
    name: 'Paul K.',
    role: 'Founder',
  },
]

function SocialProof() {
  return (
    <section className="bg-white px-6 py-20 text-neutral-900 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Trusted by teams that meet a lot
          </h2>
          <p className="mt-4 text-base text-neutral-600">
            Founders, nonprofit boards, and product teams use Kolasys every day.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {QUOTES.map((q) => (
            <figure
              key={q.name}
              className="rounded-2xl border border-neutral-200/80 bg-white p-7"
            >
              <Quote className="h-5 w-5" style={{ color: '#CA2625' }} />
              <blockquote className="mt-4 text-lg leading-relaxed text-neutral-800">
                “{q.quote}”
              </blockquote>
              <figcaption className="mt-5 text-sm">
                <span className="font-semibold text-neutral-900">{q.name}</span>
                <span className="text-neutral-500"> · {q.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── 5. Pricing ─────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: 'Free Trial',
    price: '$0',
    period: '14 days',
    description: 'Full Pro access. No credit card required.',
    highlight: false,
    cta: 'Start free trial',
    href: 'https://app.kolasys.ai/sign-up',
    features: [
      'Full Pro access for 14 days',
      'No credit card required',
      'All features unlocked',
      'Cancel anytime',
    ],
  },
  {
    name: 'Pro',
    price: '$9.99',
    period: 'per month',
    description: 'For individuals who meet often.',
    highlight: true,
    cta: 'Get started',
    href: 'https://app.kolasys.ai/sign-up',
    features: [
      'Unlimited meetings',
      'AI notes + insights',
      'All platforms (web, iOS, Mac, Watch)',
      'Semantic search',
      'API access',
    ],
  },
  {
    name: 'Team',
    price: '$8.99',
    period: 'per seat / month',
    description: 'For teams with a shared workspace.',
    highlight: false,
    cta: 'Start team trial',
    href: 'https://app.kolasys.ai/sign-up',
    features: [
      'Everything in Pro',
      'Shared workspace',
      'Team analytics',
      'Admin controls',
      'Minimum 3 seats',
    ],
  },
]

function Pricing() {
  return (
    <section
      id="pricing"
      className="scroll-mt-20 bg-[#F8F9FC] px-6 py-20 text-neutral-900 sm:py-24"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-base text-neutral-600">
            Start free. Upgrade when you&apos;re ready. No surprises.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border bg-white p-7 ${
                plan.highlight
                  ? 'border-[#CA2625] shadow-xl shadow-[#CA2625]/10 ring-1 ring-[#CA2625]/30'
                  : 'border-neutral-200/80'
              }`}
            >
              {plan.highlight && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[11px] font-semibold text-white"
                  style={{ background: '#CA2625' }}
                >
                  Most popular
                </div>
              )}

              <div className="mb-5">
                <p className="text-sm font-semibold text-neutral-500">{plan.name}</p>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tracking-tight text-neutral-900">
                    {plan.price}
                  </span>
                  <span className="text-sm text-neutral-500">{plan.period}</span>
                </div>
                <p className="mt-2 text-sm text-neutral-600">{plan.description}</p>
              </div>

              <ul className="mb-7 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-neutral-700">
                    <Check
                      className="mt-0.5 h-4 w-4 flex-shrink-0"
                      style={{ color: '#CA2625' }}
                    />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`inline-flex min-h-[44px] items-center justify-center rounded-xl text-sm font-semibold transition-all ${
                  plan.highlight
                    ? 'text-white shadow-md shadow-[#CA2625]/30 hover:-translate-y-0.5 hover:shadow-lg'
                    : 'border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50'
                }`}
                style={plan.highlight ? { background: '#CA2625' } : undefined}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-neutral-500">
          Need Enterprise?{' '}
          <a
            href="mailto:hi@kolasys.ai"
            className="font-medium text-neutral-700 underline-offset-2 hover:underline"
          >
            Contact us
          </a>
        </p>
      </div>
    </section>
  )
}

// ── 6. Final CTA ───────────────────────────────────────────────────────────

function FinalCTA() {
  return (
    <section className="relative overflow-hidden bg-[#0F0F13] px-6 py-20 text-white sm:py-24">
      {/* Brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[300px]"
        style={{
          background:
            'radial-gradient(ellipse 60% 80% at 50% 100%, rgba(202,38,37,0.25) 0%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Start your free 14-day trial
        </h2>
        <p className="mt-4 text-base text-white/60">
          No credit card required. Full access. Cancel anytime.
        </p>
        <div className="mt-8">
          <Link
            href="https://app.kolasys.ai/sign-up"
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#CA2625] px-9 text-base font-semibold text-white shadow-xl shadow-[#CA2625]/30 transition-all hover:-translate-y-0.5 hover:shadow-2xl"
          >
            Get started free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
