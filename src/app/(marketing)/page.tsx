import Link from 'next/link'
import { Mic2, FileText, MessageSquare, Watch, Check } from 'lucide-react'

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-24 pt-20 sm:pt-32 text-center">
      {/* Radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[500px]"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(202,38,37,0.18) 0%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-3xl">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-1.5 text-xs font-medium text-white/60">
          <span className="h-1.5 w-1.5 rounded-full bg-[#CA2625]" />
          Available on Web, iOS &amp; Apple Watch
        </div>

        <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-6xl">
          AI-powered{' '}
          <span style={{ color: '#CA2625' }}>meeting notes</span>
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/55">
          Kolasys AI transcribes, summarizes, and surfaces action items from every meeting.
          Available on web, iOS, and Apple Watch.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#CA2625] px-8 text-sm font-semibold text-white shadow-lg shadow-[#CA2625]/30 transition-all hover:-translate-y-0.5 hover:shadow-xl sm:w-auto"
          >
            Start free trial
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-8 text-sm font-semibold text-white transition-colors hover:bg-white/[0.08] sm:w-auto"
          >
            Sign in
          </Link>
        </div>
      </div>
    </section>
  )
}

// ── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Mic2,
    title: 'AI Meeting Notes',
    body: 'Automatic transcription and structured summaries ready minutes after your meeting ends. Supports 16 languages.',
  },
  {
    icon: FileText,
    title: 'Action Items',
    body: 'Every commitment and follow-up extracted automatically — assigned, prioritized, and tracked across all your meetings.',
  },
  {
    icon: MessageSquare,
    title: 'Ask AI',
    body: 'Ask anything about your meetings. Semantic search finds the answer even when you can\'t remember the exact words.',
  },
  {
    icon: Watch,
    title: 'Apple Watch',
    body: 'Tap the mic on your wrist to start recording. A live timer ticks on your watch face; tap again to stop.',
  },
]

function Features() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Everything your meetings deserve
        </h2>
        <p className="mt-3 text-center text-base text-white/45">
          From recording to action — in minutes, not hours.
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/[0.07] bg-[#1A1A24] p-6"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#CA2625]/15">
                <Icon className="h-5 w-5 text-[#CA2625]" />
              </div>
              <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>
              <p className="text-sm leading-relaxed text-white/50">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Pricing ───────────────────────────────────────────────────────────────────

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Try it out with no credit card.',
    highlight: false,
    cta: 'Get started',
    href: '/sign-up',
    features: [
      '3 recordings per month',
      'AI transcription',
      'Meeting summaries',
      'Action item extraction',
    ],
  },
  {
    name: 'Pro',
    price: '$9.99',
    period: 'per month',
    description: 'For individuals who meet often.',
    highlight: true,
    cta: 'Start free trial',
    href: '/sign-up',
    features: [
      'Unlimited recordings',
      'AI transcription',
      'Meeting summaries',
      'Action items + Ask AI',
      'Apple Watch recording',
      'Shareable meeting links',
      '14-day free trial',
    ],
  },
  {
    name: 'Team',
    price: '$8.99',
    period: 'per seat / month',
    description: 'For teams that need shared workspace.',
    highlight: false,
    cta: 'Start free trial',
    href: '/sign-up',
    features: [
      'Everything in Pro',
      'Shared workspace',
      'Min. 3 seats',
      'Team action items',
      '14-day free trial',
    ],
  },
]

function Pricing() {
  return (
    <section className="px-6 py-20" id="pricing">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Simple pricing
        </h2>
        <p className="mt-3 text-center text-base text-white/45">
          Start free. Upgrade when you&apos;re ready.
        </p>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                plan.highlight
                  ? 'border-[#CA2625]/60 bg-[#1A1A24] ring-1 ring-[#CA2625]/30'
                  : 'border-white/[0.07] bg-[#1A1A24]'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#CA2625] px-3 py-0.5 text-[11px] font-semibold text-white">
                  Most popular
                </div>
              )}

              <div className="mb-5">
                <p className="text-sm font-semibold text-white/60">{plan.name}</p>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white">{plan.price}</span>
                  <span className="text-sm text-white/40">{plan.period}</span>
                </div>
                <p className="mt-1.5 text-xs text-white/40">{plan.description}</p>
              </div>

              <ul className="mb-7 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-white/65">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#CA2625]" />
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.href}
                className={`inline-flex min-h-[44px] items-center justify-center rounded-xl text-sm font-semibold transition-all ${
                  plan.highlight
                    ? 'bg-[#CA2625] text-white shadow-md shadow-[#CA2625]/25 hover:opacity-90'
                    : 'border border-white/10 text-white hover:bg-white/[0.06]'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-white/30">
          Enterprise?{' '}
          <a href="mailto:hi@kolasys.ai" className="text-white/50 underline hover:text-white/70">
            Contact us
          </a>
        </p>
      </div>
    </section>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  return (
    <>
      <Hero />
      <Features />
      <Pricing />
    </>
  )
}
