// Kolasys AI — Settings page

import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { Building2, User, Key, CreditCard, Wand2, ArrowRight } from 'lucide-react'
import { AudioRetentionToggle } from '@/components/audio-retention-toggle'
import { PostMeetingEmailToggle } from '@/components/post-meeting-email-toggle'
import { DailyDigestToggle } from '@/components/daily-digest-toggle'
import { DefaultLanguageSelector } from '@/components/default-language-selector'
import { BotDisplayNameInput } from '@/components/bot-display-name-input'
import { SsoSettings } from '@/components/sso-settings'

export const metadata = { title: 'Settings — Kolasys AI' }

export default async function SettingsPage() {
  const { userId, orgId: clerkOrgId } = await auth()
  if (!userId || !clerkOrgId) redirect('/dashboard')

  const [user, org] = await Promise.all([
    currentUser(),
    db.organization.findFirst({
      where: { clerkOrgId },
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        createdAt: true,
        deleteAudioAfterTranscription: true,
        postMeetingEmail: true,
        dailyDigest: true,
        defaultTranscriptionLanguage: true,
        botDisplayName: true,
        ssoEnabled: true,
        ssoDomain: true,
        samlMetadataUrl: true,
      },
    }),
  ])

  const memberCount = org
    ? await db.orgMember.count({ where: { orgId: org.id } })
    : 0

  return (
    <div className="max-w-2xl p-4 dark:bg-[#0F0F13] sm:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Settings</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
          Manage your workspace and account preferences.
        </p>
      </div>

      <div className="space-y-6">
        {/* Workspace */}
        <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
          <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4 dark:border-white/10">
            <Building2 className="h-4 w-4 text-neutral-500 dark:text-gray-400" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Workspace</h2>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-white/10">
            <Row label="Name" value={org?.name ?? '—'} />
            <Row label="Slug" value={org?.slug ?? '—'} />
            <Row label="Plan" value={org?.plan ?? '—'} />
            <Row label="Members" value={String(memberCount)} />
            <Row
              label="Created"
              value={org ? new Date(org.createdAt).toLocaleDateString() : '—'}
            />
          </div>
        </section>

        {/* Account */}
        <section className="rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1A1A24]">
          <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4 dark:border-white/10">
            <User className="h-4 w-4 text-neutral-500 dark:text-gray-400" />
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Account</h2>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-white/10">
            <Row
              label="Name"
              value={[user?.firstName, user?.lastName].filter(Boolean).join(' ') || '—'}
            />
            <Row
              label="Email"
              value={user?.emailAddresses[0]?.emailAddress ?? '—'}
            />
          </div>
        </section>

        {/* Audio retention */}
        <AudioRetentionToggle
          initialDeleteAfterTranscription={org?.deleteAudioAfterTranscription ?? false}
        />

        {/* Post-meeting email */}
        <PostMeetingEmailToggle
          initialPostMeetingEmail={org?.postMeetingEmail ?? true}
        />

        {/* Daily digest */}
        <DailyDigestToggle
          initialDailyDigest={org?.dailyDigest ?? true}
        />

        {/* Recording capture — bot display name */}
        <BotDisplayNameInput
          initialBotDisplayName={org?.botDisplayName ?? 'Kolasys AI'}
        />

        {/* Single Sign-On (Enterprise) */}
        <SsoSettings
          plan={(org?.plan ?? 'FREE') as 'FREE' | 'PRO' | 'ENTERPRISE'}
          initialEnabled={org?.ssoEnabled ?? false}
          initialDomain={org?.ssoDomain ?? null}
          initialMetadataUrl={org?.samlMetadataUrl ?? null}
        />

        {/* Default transcription language */}
        <DefaultLanguageSelector
          initialLanguage={org?.defaultTranscriptionLanguage ?? 'en'}
        />

        {/* Templates — live */}
        <Link
          href="/dashboard/settings/templates"
          className="block rounded-xl border border-neutral-200 bg-white shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/30 dark:border-white/10 dark:bg-[#1A1A24] dark:hover:border-accent/50 dark:hover:bg-accent/10"
        >
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <Wand2 className="h-4 w-4 text-brand-600 dark:text-accent" />
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">AI Skills &amp; Templates</p>
                <p className="text-xs text-neutral-500 dark:text-gray-400">
                  Customise the structure and tone of AI-generated notes.
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-neutral-400 dark:text-gray-500" />
          </div>
        </Link>

        {/* Coming soon */}
        {[
          { icon: <Key className="h-4 w-4 text-neutral-500 dark:text-gray-400" />, title: 'API Keys', note: 'Generate keys to access the Kolasys AI API.' },
          { icon: <CreditCard className="h-4 w-4 text-neutral-500 dark:text-gray-400" />, title: 'Billing', note: 'Manage your plan and payment method.' },
        ].map(({ icon, title, note }) => (
          <section
            key={title}
            className="rounded-xl border border-neutral-200 bg-white opacity-60 shadow-sm dark:border-white/10 dark:bg-[#1A1A24]"
          >
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                {icon}
                <div>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</p>
                  <p className="text-xs text-neutral-500 dark:text-gray-400">{note}</p>
                </div>
              </div>
              <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-500 dark:bg-white/10 dark:text-gray-300">
                Coming soon
              </span>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-6 py-3">
      <span className="text-xs font-medium text-neutral-500 dark:text-gray-400">{label}</span>
      <span className="text-sm text-neutral-900 dark:text-white">{value}</span>
    </div>
  )
}
