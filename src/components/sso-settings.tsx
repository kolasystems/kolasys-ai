'use client'

// Kolasys AI — Single Sign-On settings on /dashboard/settings.
// Non-Enterprise plans see an upgrade prompt; Enterprise sees the real SAML
// config form (toggle + email domain + metadata URL + Kolasys SP details).

import { useState } from 'react'
import { Copy, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/utils'

type Plan = 'FREE' | 'PRO' | 'ENTERPRISE'

type Props = {
  plan: Plan
  initialEnabled: boolean
  initialDomain: string | null
  initialMetadataUrl: string | null
}

// Kolasys acts as the Service Provider (SP) in the SAML flow. Customers paste
// these values into their IdP (Okta, Azure AD, etc.) to register Kolasys.
const KOLASYS_ACS_URL = 'https://app.kolasys.ai/api/auth/saml/acs'
const KOLASYS_ENTITY_ID = 'https://app.kolasys.ai'

export function SsoSettings({
  plan,
  initialEnabled,
  initialDomain,
  initialMetadataUrl,
}: Props) {
  if (plan !== 'ENTERPRISE') {
    return <SsoUpgradePrompt />
  }
  return (
    <SsoForm
      initialEnabled={initialEnabled}
      initialDomain={initialDomain}
      initialMetadataUrl={initialMetadataUrl}
    />
  )
}

// ── Non-Enterprise: upgrade prompt ─────────────────────────────────────────

function SsoUpgradePrompt() {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
      <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4 dark:border-white/10">
        <Lock className="h-4 w-4 text-neutral-500 dark:text-gray-400" />
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Single Sign-On (SAML 2.0)
        </h2>
        <span className="ml-auto rounded-full bg-[#CA2625]/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#CA2625]">
          Enterprise
        </span>
      </div>

      <div className="space-y-4 px-6 py-5">
        <p className="text-sm text-neutral-700 dark:text-gray-300">
          Enforce SAML sign-in with Okta, Azure AD, Google Workspace, or any
          SAML 2.0 identity provider. Available on the Enterprise plan.
        </p>
        <ul className="space-y-1.5 text-xs text-neutral-500 dark:text-gray-400">
          <li>• Map your email domain to your IdP</li>
          <li>• Enforce SSO for every user in your workspace</li>
          <li>• Audit log + SCIM provisioning (coming soon)</li>
        </ul>
        <a
          href="mailto:hi@kolasys.ai?subject=Enterprise%20upgrade%20%E2%80%94%20SSO"
          className="inline-flex items-center gap-2 rounded-lg bg-[#CA2625] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#b21f1f]"
        >
          Contact sales
        </a>
      </div>
    </section>
  )
}

// ── Enterprise: the real form ──────────────────────────────────────────────

type FormProps = {
  initialEnabled: boolean
  initialDomain: string | null
  initialMetadataUrl: string | null
}

function SsoForm({ initialEnabled, initialDomain, initialMetadataUrl }: FormProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [domain, setDomain] = useState(initialDomain ?? '')
  const [metadataUrl, setMetadataUrl] = useState(initialMetadataUrl ?? '')
  const [feedback, setFeedback] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null)

  const mutation = trpc.settings.updateOrgSettings.useMutation({
    onSuccess: (data) => {
      setEnabled(data.ssoEnabled)
      setDomain(data.ssoDomain ?? '')
      setMetadataUrl(data.samlMetadataUrl ?? '')
      setFeedback({ type: 'success', message: 'SSO settings saved.' })
    },
    onError: (err) => setFeedback({ type: 'error', message: err.message }),
  })

  function save() {
    setFeedback(null)
    mutation.mutate({
      ssoEnabled: enabled,
      ssoDomain: domain.trim() || null,
      samlMetadataUrl: metadataUrl.trim() || null,
    })
  }

  const busy = mutation.isPending

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
      <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4 dark:border-white/10">
        <ShieldCheck className="h-4 w-4 text-neutral-500 dark:text-gray-400" />
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Single Sign-On (SAML 2.0)
        </h2>
      </div>

      <div className="space-y-5 px-6 py-5">
        {/* Enable toggle */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900 dark:text-white">
              Enforce SSO for this workspace
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-gray-400">
              When enabled, users on the configured email domain are redirected
              to your IdP on every sign-in.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={cn(
              'relative h-6 w-11 flex-shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#CA2625]/30',
              enabled ? 'bg-[#CA2625]' : 'bg-neutral-300 dark:bg-white/15',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                enabled ? 'translate-x-[22px]' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>

        {/* Email domain */}
        <Field
          label="Email domain"
          hint="e.g. acme.com — users signing in from this domain will SSO."
        >
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="acme.com"
            className={inputClass}
          />
        </Field>

        {/* SAML metadata URL */}
        <Field
          label="SAML metadata URL"
          hint="Your IdP publishes this. Okta / Azure AD / Google Workspace all expose it in the SAML app config."
        >
          <input
            type="url"
            value={metadataUrl}
            onChange={(e) => setMetadataUrl(e.target.value)}
            placeholder="https://idp.example.com/app/xxxx/sso/saml/metadata"
            className={inputClass}
          />
        </Field>

        {/* Kolasys SP details (for the customer's IdP) */}
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs dark:border-white/10 dark:bg-white/5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-gray-400">
            Kolasys service-provider details
          </p>
          <SpDetailRow label="ACS URL" value={KOLASYS_ACS_URL} />
          <SpDetailRow label="Entity ID" value={KOLASYS_ENTITY_ID} />
          <p className="mt-3 text-xs text-neutral-500 dark:text-gray-400">
            Paste these into your IdP when registering Kolasys as a SAML app.
          </p>
        </div>

        {feedback && (
          <p
            className={cn(
              'rounded-lg px-3 py-2 text-xs',
              feedback.type === 'success'
                ? 'border border-green-200 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200'
                : 'border border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200',
            )}
          >
            {feedback.message}
          </p>
        )}

        <div>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[#CA2625] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#b21f1f] disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save SSO settings
          </button>
        </div>
      </div>
    </section>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 ' +
  'focus:outline-none focus:ring-2 focus:border-[#CA2625] focus:ring-[#CA2625]/30 ' +
  'dark:border-white/15 dark:bg-white/5 dark:text-white'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-neutral-700 dark:text-gray-300">
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-1 text-xs text-neutral-500 dark:text-gray-400">{hint}</p>
      )}
    </div>
  )
}

function SpDetailRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="mb-2 flex items-center gap-3 last:mb-0">
      <span className="w-20 flex-shrink-0 text-xs font-medium text-neutral-500 dark:text-gray-400">
        {label}
      </span>
      <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 font-mono text-[11px] text-neutral-700 dark:bg-black/30 dark:text-gray-200">
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="flex-shrink-0 rounded p-1 text-neutral-400 transition-colors hover:bg-white hover:text-neutral-700 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <Copy className="h-3.5 w-3.5" />
        <span className="sr-only">{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  )
}
