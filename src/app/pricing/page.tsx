// Kolasys AI — Public pricing page
// No auth required. Accessible at /pricing.

import type { Metadata } from 'next'
import Link from 'next/link'
import { Check, Minus, Zap } from 'lucide-react'
import { KolasysLogoMark } from '@/components/kolasys-logo'

export const metadata: Metadata = {
  title: 'Pricing — Kolasys AI',
  description: 'Simple, transparent pricing. No AI credits. No hidden fees.',
}

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Try Kolasys with no commitment.',
    cta: 'Get started free',
    ctaHref: '/sign-up',
    highlight: false,
    features: [
      { label: '300 minutes / month transcription', included: true },
      { label: '5 AI summaries / month', included: true },
      { label: 'Ask Kolasys (5 queries / month)', included: true },
      { label: 'Action items extraction', included: true },
      { label: '1 workspace', included: true },
      { label: 'Post-meeting email', included: false },
      { label: 'Daily digest', included: false },
      { label: 'Semantic search', included: false },
      { label: 'Analytics', included: false },
    ],
  },
  {
    name: 'Pro',
    price: '$12',
    period: 'per month',
    description: 'Unlimited AI for solo professionals and consultants.',
    cta: 'Start Pro',
    ctaHref: '/sign-up?plan=pro',
    highlight: true,
    badge: 'Most popular',
    features: [
      { label: 'Unlimited transcription', included: true },
      { label: 'Unlimited AI summaries', included: true },
      { label: 'Unlimited Ask Kolasys', included: true },
      { label: 'Action items extraction', included: true },
      { label: '1 workspace', included: true },
      { label: 'Post-meeting email', included: true },
      { label: 'Daily digest', included: true },
      { label: 'Semantic search', included: true },
      { label: 'Analytics', included: true },
    ],
  },
  {
    name: 'Team',
    price: '$10',
    period: 'per seat / month',
    description: 'Shared workspace and admin controls for growing teams.',
    cta: 'Start Team trial',
    ctaHref: '/sign-up?plan=team',
    highlight: false,
    note: 'Minimum 2 seats. Billed annually.',
    features: [
      { label: 'Everything in Pro', included: true },
      { label: 'Shared workspace', included: true },
      { label: 'Team admin controls', included: true },
      { label: 'Custom bot name', included: true },
      { label: 'Analytics (team-wide)', included: true },
      { label: 'Priority support', included: true },
      { label: 'SSO (add-on)', included: false },
      { label: 'HIPAA compliance', included: false },
      { label: 'Custom data retention', included: false },
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'Compliance, SSO, and white-glove onboarding for large orgs.',
    cta: 'Contact us',
    ctaHref: 'mailto:hi@kolasys.ai?subject=Enterprise Plan',
    highlight: false,
    features: [
      { label: 'Everything in Team', included: true },
      { label: 'SSO (SAML / OIDC)', included: true },
      { label: 'HIPAA compliance', included: true },
      { label: 'Custom data retention', included: true },
      { label: 'Audit logs', included: true },
      { label: 'Dedicated support', included: true },
      { label: 'Custom onboarding', included: true },
      { label: 'SLA guarantee', included: true },
      { label: 'On-prem option', included: true },
    ],
  },
]

const FAQS = [
  {
    q: 'Are there hidden AI credits or usage fees?',
    a: 'No. Kolasys charges a flat rate — unlimited AI summaries, unlimited Ask Kolasys queries, and unlimited transcription on paid plans. We will never introduce AI credits.',
  },
  {
    q: 'What counts as a "minute" of transcription?',
    a: 'One minute of audio uploaded or recorded. A 60-minute meeting uses 60 minutes. The Free plan includes 300 minutes per calendar month, which resets on the 1st.',
  },
  {
    q: 'What languages are supported?',
    a: 'Kolasys supports 16 languages at upload time: English, Spanish, French, German, Italian, Portuguese, Dutch, Japanese, Chinese, Korean, Hindi, Arabic, Turkish, Polish, Swedish, and Norwegian — plus auto-detect.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from Settings at any time. Your plan stays active until the end of the billing period.',
  },
  {
    q: 'Is my data private?',
    a: 'Audio files are deleted from our servers immediately after transcription. Transcripts and notes are stored encrypted and scoped to your workspace. We do not train AI models on your data.',
  },
  {
    q: 'What is the Apple Watch app?',
    a: 'The Kolasys Apple Watch app (coming soon) lets you start and stop recording from your wrist with a single tap — no phone needed. No competitor offers this. No hardware device required.',
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#F8F9FC] dark:bg-[#0F0F13]">

      {/* Nav */}
      <header className="border-b border-neutral-200/80 bg-white/90 backdrop-blur-sm dark:border-white/10 dark:bg-[#0F0F13]/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <KolasysLogoMark size={24} className="text-black dark:text-white" />
            <span className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white">
              Kolasys <span style={{ color: '#CA2625' }}>AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="text-sm text-neutral-600 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#CA2625' }}
            >
              Get started free
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">

        {/* Hero */}
        <div className="mb-14 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#CA2625]/20 bg-[#CA2625]/5 px-3 py-1 text-xs font-medium text-[#CA2625]">
            <Zap className="h-3 w-3" />
            No AI credits. No hidden fees. Ever.
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 max-w-xl mx-auto text-lg text-neutral-500 dark:text-gray-400">
            Flat-rate plans. Unlimited AI on every paid tier. Cancel anytime.
          </p>
        </div>

        {/* Plans grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-20">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                plan.highlight
                  ? 'border-[#CA2625] bg-white shadow-lg dark:bg-[#1A1A24]'
                  : 'border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1A1A24]'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ backgroundColor: '#CA2625' }}>
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-6">
                <p className="text-sm font-semibold text-neutral-500 dark:text-gray-400">{plan.name}</p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-neutral-900 dark:text-white">{plan.price}</span>
                  {plan.period && (
                    <span className="text-sm text-neutral-500 dark:text-gray-400">{plan.period}</span>
                  )}
                </div>
                {plan.note && (
                  <p className="mt-1 text-xs text-neutral-400">{plan.note}</p>
                )}
                <p className="mt-2 text-sm text-neutral-500 dark:text-gray-400">{plan.description}</p>
              </div>

              <ul className="mb-8 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f.label} className="flex items-start gap-2.5 text-sm">
                    {f.included ? (
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#CA2625]" />
                    ) : (
                      <Minus className="mt-0.5 h-4 w-4 flex-shrink-0 text-neutral-300 dark:text-white/20" />
                    )}
                    <span className={f.included ? 'text-neutral-700 dark:text-gray-200' : 'text-neutral-400 dark:text-gray-500'}>
                      {f.label}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.ctaHref}
                className={`block rounded-xl py-2.5 text-center text-sm font-semibold transition-opacity hover:opacity-90 ${
                  plan.highlight
                    ? 'text-white'
                    : 'border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10'
                }`}
                style={plan.highlight ? { backgroundColor: '#CA2625' } : {}}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Differentiators */}
        <div className="mb-20 rounded-2xl border border-neutral-200 bg-white p-8 dark:border-white/10 dark:bg-[#1A1A24]">
          <h2 className="mb-6 text-center text-xl font-bold text-neutral-900 dark:text-white">
            Why Kolasys AI?
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: '🤖',
                title: 'Claude-powered',
                body: 'The only meeting AI natively powered by Anthropic\'s Claude. Better summaries for nuanced business context — not just GPT.',
              },
              {
                icon: '⌚',
                title: 'Apple Watch app',
                body: 'Tap your crown to start recording from your wrist. No competitor offers this. No $179 hardware device required.',
              },
              {
                icon: '💰',
                title: 'No hidden credits',
                body: 'Fireflies\' #1 complaint is hidden AI credits that run out. Kolasys charges a flat rate — unlimited AI on every paid plan.',
              },
              {
                icon: '🌍',
                title: '16 languages',
                body: 'Select language at upload time per recording. Org-level default. Auto-detect option. More languages than Granola.',
              },
            ].map((item) => (
              <div key={item.title} className="text-center">
                <div className="mb-3 text-3xl">{item.icon}</div>
                <h3 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-white">{item.title}</h3>
                <p className="text-sm text-neutral-500 dark:text-gray-400 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-16">
          <h2 className="mb-8 text-center text-xl font-bold text-neutral-900 dark:text-white">
            Frequently asked questions
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {FAQS.map((faq) => (
              <div key={faq.q} className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-white/10 dark:bg-[#1A1A24]">
                <h3 className="mb-2 text-sm font-semibold text-neutral-900 dark:text-white">{faq.q}</h3>
                <p className="text-sm text-neutral-500 dark:text-gray-400 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center rounded-2xl border border-[#CA2625]/20 bg-[#CA2625]/5 p-10">
          <h2 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-white">
            Start for free today
          </h2>
          <p className="mb-6 text-neutral-500 dark:text-gray-400">
            No credit card required. 300 minutes free every month.
          </p>
          <Link
            href="/sign-up"
            className="inline-block rounded-xl px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#CA2625' }}
          >
            Create free account
          </Link>
          <p className="mt-3 text-xs text-neutral-400">
            Questions? Email us at{' '}
            <a href="mailto:hi@kolasys.ai" className="text-[#CA2625] hover:underline">
              hi@kolasys.ai
            </a>
          </p>
        </div>

      </main>

      <footer className="border-t border-neutral-200 py-8 text-center text-xs text-neutral-400 dark:border-white/10">
        © {new Date().getFullYear()} Kola Systems. All rights reserved.{' '}
        <Link href="/sign-in" className="hover:text-neutral-600 dark:hover:text-gray-300 ml-4">Sign in</Link>
        <Link href="mailto:hi@kolasys.ai" className="hover:text-neutral-600 dark:hover:text-gray-300 ml-4">Contact</Link>
      </footer>

    </div>
  )
}
