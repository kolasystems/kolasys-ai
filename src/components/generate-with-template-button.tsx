'use client'

// Kolasys AI — "Generate with Template" dropdown on the recording detail page.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { Sparkles, ChevronDown, Loader2, Check } from 'lucide-react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'

type Props = {
  recordingId: string
  currentTemplateId?: string | null
}

export function GenerateWithTemplateButton({ recordingId, currentTemplateId }: Props) {
  const router = useRouter()
  const [regenerating, setRegenerating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const templates = trpc.templates.list.useQuery()
  const mutation = trpc.recordings.regenerateWithTemplate.useMutation({
    onSuccess: () => router.refresh(),
    onError: (e) => {
      setError(e.message)
      setRegenerating(null)
    },
  })

  function pick(templateId: string) {
    setError(null)
    setRegenerating(templateId)
    mutation.mutate({ recordingId, templateId })
  }

  const busy = mutation.isPending

  return (
    <div className="relative">
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <button
            type="button"
            disabled={busy}
            className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-100 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {busy ? 'Regenerating…' : 'Generate with Template'}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </Dropdown.Trigger>

        <Dropdown.Portal>
          <Dropdown.Content
            align="end"
            sideOffset={6}
            className="z-50 max-h-[70vh] w-[320px] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-lg focus:outline-none"
          >
            {templates.isLoading && (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-neutral-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading templates…
              </div>
            )}

            {templates.data && templates.data.length === 0 && (
              <p className="px-3 py-3 text-sm text-neutral-500">No templates available.</p>
            )}

            {templates.data?.map((t) => (
              <Dropdown.Item
                key={t.id}
                onSelect={(e) => {
                  e.preventDefault()
                  pick(t.id)
                }}
                disabled={busy || regenerating === t.id}
                className="flex cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2 text-sm text-neutral-700 outline-none data-[highlighted]:bg-neutral-100 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-medium">{t.name}</span>
                  {t.isDefault && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-700">
                      Default
                    </span>
                  )}
                  {!t.isGlobal && (
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                      Custom
                    </span>
                  )}
                  {currentTemplateId === t.id && (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  )}
                </div>
                {t.description && (
                  <span className="text-xs text-neutral-500">{t.description}</span>
                )}
              </Dropdown.Item>
            ))}

            <Dropdown.Separator className="my-1 h-px bg-neutral-100" />
            <Link
              href="/dashboard/settings/templates"
              className="block rounded-lg px-3 py-2 text-xs font-medium text-brand-600 hover:bg-brand-50"
            >
              Manage templates →
            </Link>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>

      {error && (
        <p className="absolute right-0 top-full mt-2 whitespace-nowrap rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700 shadow-sm">
          {error}
        </p>
      )}
    </div>
  )
}
