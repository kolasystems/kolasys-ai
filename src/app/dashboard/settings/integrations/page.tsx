'use client'

// Kolasys AI — Integrations settings page (Slack, Notion)

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Loader2, CheckCircle2, AlertCircle, Hash, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function IntegrationsPage() {
  const { data: settings, isLoading, refetch } = trpc.integrations.getSettings.useQuery()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900">Integrations</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Push meeting notes to Slack and Notion automatically after processing.
        </p>
      </div>

      <div className="space-y-6">
        <SlackSection
          savedWebhookUrl={settings?.slackWebhookUrl ?? ''}
          onSaved={() => refetch()}
        />
        <NotionSection
          connected={settings?.notionConnected ?? false}
          savedDatabaseId={settings?.notionDatabaseId ?? ''}
          onSaved={() => refetch()}
        />
      </div>
    </div>
  )
}

// ── Slack Section ─────────────────────────────────────────────────────────────

function SlackSection({
  savedWebhookUrl,
  onSaved,
}: {
  savedWebhookUrl: string
  onSaved: () => void
}) {
  const [webhookUrl, setWebhookUrl] = useState(savedWebhookUrl)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const saveMutation = trpc.integrations.saveSlack.useMutation({
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Slack webhook saved.' })
      onSaved()
    },
    onError: (e) => setFeedback({ type: 'error', message: e.message }),
  })

  const testMutation = trpc.integrations.testSlack.useMutation({
    onSuccess: () => setFeedback({ type: 'success', message: 'Test message sent to Slack!' }),
    onError: (e) => setFeedback({ type: 'error', message: e.message }),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    saveMutation.mutate({ webhookUrl })
  }

  const isBusy = saveMutation.isPending || testMutation.isPending

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4">
        <Hash className="h-4 w-4 text-neutral-500" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-neutral-900">Slack</h2>
          <p className="text-xs text-neutral-500">
            Post meeting notes to a Slack channel via an incoming webhook.
          </p>
        </div>
        {savedWebhookUrl && (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
            Connected
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-4 px-6 py-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Incoming Webhook URL
          </label>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/…"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <p className="mt-1 text-xs text-neutral-400">
            Create one at{' '}
            <span className="text-neutral-600">api.slack.com → Your Apps → Incoming Webhooks</span>
          </p>
        </div>

        {feedback && (
          <FeedbackBanner type={feedback.type} message={feedback.message} />
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isBusy}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          {savedWebhookUrl && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => { setFeedback(null); testMutation.mutate({ webhookUrl: savedWebhookUrl }) }}
              className="flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
            >
              {testMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Send Test
            </button>
          )}
          {savedWebhookUrl && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => { setWebhookUrl(''); setFeedback(null); saveMutation.mutate({ webhookUrl: '' }) }}
              className="ml-auto text-xs text-red-500 underline hover:text-red-700"
            >
              Disconnect
            </button>
          )}
        </div>
      </form>
    </section>
  )
}

// ── Notion Section ────────────────────────────────────────────────────────────

function NotionSection({
  connected,
  savedDatabaseId,
  onSaved,
}: {
  connected: boolean
  savedDatabaseId: string
  onSaved: () => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [databaseId, setDatabaseId] = useState(savedDatabaseId)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const saveMutation = trpc.integrations.saveNotion.useMutation({
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Notion credentials saved.' })
      setApiKey('')
      onSaved()
    },
    onError: (e) => setFeedback({ type: 'error', message: e.message }),
  })

  const testMutation = trpc.integrations.testNotion.useMutation({
    onSuccess: () => setFeedback({ type: 'success', message: 'Test page created in Notion!' }),
    onError: (e) => setFeedback({ type: 'error', message: e.message }),
  })

  const disconnectMutation = trpc.integrations.disconnectNotion.useMutation({
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Notion disconnected.' })
      setApiKey('')
      setDatabaseId('')
      onSaved()
    },
    onError: (e) => setFeedback({ type: 'error', message: e.message }),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    saveMutation.mutate({ apiKey, databaseId })
  }

  const isBusy = saveMutation.isPending || testMutation.isPending || disconnectMutation.isPending

  return (
    <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-neutral-100 px-6 py-4">
        <BookOpen className="h-4 w-4 text-neutral-500" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-neutral-900">Notion</h2>
          <p className="text-xs text-neutral-500">
            Create a Notion page with full meeting notes after each recording.
          </p>
        </div>
        {connected && (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
            Connected
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-4 px-6 py-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Notion Integration Secret
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={connected ? '••••••••••••••••• (saved)' : 'secret_…'}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <p className="mt-1 text-xs text-neutral-400">
            Create an internal integration at{' '}
            <span className="text-neutral-600">notion.so/my-integrations</span>
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Target Database ID
          </label>
          <input
            type="text"
            value={databaseId}
            onChange={(e) => setDatabaseId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
          <p className="mt-1 text-xs text-neutral-400">
            The ID is the part of the database URL after the workspace name and before the{' '}
            <code className="rounded bg-neutral-100 px-0.5">?</code>
          </p>
        </div>

        {feedback && (
          <FeedbackBanner type={feedback.type} message={feedback.message} />
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isBusy || !apiKey || !databaseId}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
          {connected && (
            <>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => { setFeedback(null); testMutation.mutate() }}
                className="flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
              >
                {testMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Test
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => { setFeedback(null); disconnectMutation.mutate() }}
                className="ml-auto text-xs text-red-500 underline hover:text-red-700"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </form>
    </section>
  )
}

function FeedbackBanner({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg px-3 py-2 text-sm',
        type === 'success'
          ? 'border border-green-200 bg-green-50 text-green-800'
          : 'border border-red-200 bg-red-50 text-red-800'
      )}
    >
      {type === 'success' ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
      )}
      {message}
    </div>
  )
}
