'use client'

// Kolasys AI — Templates manager (list + create + edit + delete)

import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Sparkles,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  X,
  GripVertical,
  AlertCircle,
} from 'lucide-react'
import { trpc } from '@/lib/trpc'

type Section = { title: string; prompt: string }

type Template = {
  id: string
  name: string
  description: string | null
  prompt: string | null
  category: string | null
  structure: unknown
  isDefault: boolean
  isGlobal: boolean
  orgId: string | null
}

function parseSections(structure: unknown): Section[] {
  if (!Array.isArray(structure)) return []
  return (structure as unknown[]).flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const r = row as Record<string, unknown>
    const title = typeof r.title === 'string' ? r.title : ''
    const prompt = typeof r.prompt === 'string' ? r.prompt : ''
    if (!title) return []
    return [{ title, prompt }]
  })
}

export function TemplatesManager() {
  const { data, isLoading, refetch } = trpc.templates.list.useQuery()
  const [editing, setEditing] = useState<Template | null>(null)
  const [creating, setCreating] = useState(false)

  const { globals, customs } = useMemo(() => {
    const globals: Template[] = []
    const customs: Template[] = []
    for (const t of data ?? []) {
      if (t.isGlobal) globals.push(t)
      else customs.push(t)
    }
    return { globals, customs }
  }, [data])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-neutral-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Custom templates */}
      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Your templates</h2>
            <p className="text-xs text-neutral-500">Custom templates for your workspace.</p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            <Plus className="h-3.5 w-3.5" />
            New template
          </button>
        </div>

        {customs.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-neutral-300" />
            <p className="text-sm font-medium text-neutral-700">No custom templates yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-neutral-500">
              Create one to tailor the way Claude structures notes for your team.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {customs.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                onEdit={() => setEditing(t)}
                onDeleted={() => refetch()}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Built-in templates */}
      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-neutral-900">Built-in templates</h2>
          <p className="text-xs text-neutral-500">
            Ready-made skills for common meeting styles. Read-only.
          </p>
        </div>
        <ul className="divide-y divide-neutral-100">
          {globals.map((t) => (
            <TemplateRow key={t.id} template={t} readOnly />
          ))}
        </ul>
      </section>

      {/* Create / edit modal */}
      <TemplateEditorModal
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false)
            setEditing(null)
          }
        }}
        template={editing}
        onSaved={() => {
          setCreating(false)
          setEditing(null)
          refetch()
        }}
      />
    </div>
  )
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function TemplateRow({
  template,
  onEdit,
  onDeleted,
  readOnly,
}: {
  template: Template
  onEdit?: () => void
  onDeleted?: () => void
  readOnly?: boolean
}) {
  const sections = parseSections(template.structure)
  const deleteMutation = trpc.templates.delete.useMutation({
    onSuccess: () => onDeleted?.(),
  })

  return (
    <li className="flex items-start gap-4 px-6 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-neutral-900">{template.name}</p>
          {template.category && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
              {template.category}
            </span>
          )}
          {template.isDefault && (
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-medium text-brand-700">
              Default
            </span>
          )}
        </div>
        {template.description && (
          <p className="mt-1 text-xs text-neutral-500">{template.description}</p>
        )}
        <p className="mt-2 text-xs text-neutral-400">
          {sections.length} section{sections.length === 1 ? '' : 's'}
          {sections.length > 0 && ` · ${sections.map((s) => s.title).slice(0, 3).join(' · ')}${sections.length > 3 ? '…' : ''}`}
        </p>
      </div>

      {!readOnly && (
        <div className="flex flex-shrink-0 gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => deleteMutation.mutate({ id: template.id })}
            disabled={deleteMutation.isPending}
            className="flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
            Delete
          </button>
        </div>
      )}
    </li>
  )
}

// ─── Editor modal ────────────────────────────────────────────────────────────

function emptySection(): Section {
  return { title: '', prompt: '' }
}

function TemplateEditorModal({
  open,
  onOpenChange,
  template,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  template: Template | null
  onSaved: () => void
}) {
  const isEdit = template !== null
  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [category, setCategory] = useState(template?.category ?? '')
  const [prompt, setPrompt] = useState(template?.prompt ?? '')
  const [sections, setSections] = useState<Section[]>(
    template ? parseSections(template.structure) : [emptySection()]
  )
  const [error, setError] = useState<string | null>(null)

  // Reset form state when the modal opens or switches to a different template.
  useEffect(() => {
    if (!open) return
    setName(template?.name ?? '')
    setDescription(template?.description ?? '')
    setCategory(template?.category ?? '')
    setPrompt(template?.prompt ?? '')
    setSections(template ? parseSections(template.structure) : [emptySection()])
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, template?.id])

  const createMutation = trpc.templates.create.useMutation({
    onSuccess: () => onSaved(),
    onError: (e) => setError(e.message),
  })
  const updateMutation = trpc.templates.update.useMutation({
    onSuccess: () => onSaved(),
    onError: (e) => setError(e.message),
  })
  const busy = createMutation.isPending || updateMutation.isPending

  function updateSection(i: number, patch: Partial<Section>) {
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  function moveSection(i: number, dir: -1 | 1) {
    setSections((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function addSection() {
    setSections((prev) => [...prev, emptySection()])
  }
  function removeSection(i: number) {
    setSections((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)))
  }

  function handleSave() {
    setError(null)
    const cleaned = sections
      .map((s) => ({ title: s.title.trim(), prompt: s.prompt.trim() }))
      .filter((s) => s.title && s.prompt)
    if (!name.trim()) return setError('Name is required.')
    if (cleaned.length === 0)
      return setError('Add at least one section with a title and prompt.')

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      prompt: prompt.trim() || undefined,
      structure: cleaned,
    }
    if (isEdit && template) {
      updateMutation.mutate({ id: template.id, ...payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 flex max-h-[90dvh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-white shadow-xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-start justify-between border-b border-neutral-100 px-6 py-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-neutral-900">
                {isEdit ? 'Edit template' : 'New template'}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-neutral-500">
                Structure determines what sections Claude produces. The system prompt sets the tone.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-md p-1 transition-colors hover:bg-neutral-100">
                <X className="h-4 w-4 text-neutral-500" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" required>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Customer Discovery Call"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </Field>
              <Field label="Category">
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Sales"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </Field>
            </div>

            <Field label="Description" className="mt-4">
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Discovery questions, qualification, objections, next steps"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </Field>

            <Field label="System prompt" className="mt-4" hint="Tone and instructions applied across all sections.">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="You are a concise sales ops assistant…"
                rows={3}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </Field>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Sections
                </p>
                <button
                  type="button"
                  onClick={addSection}
                  className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  <Plus className="h-3 w-3" />
                  Add section
                </button>
              </div>

              <ul className="space-y-3">
                {sections.map((s, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-neutral-200 bg-neutral-50 p-3"
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex flex-col items-center gap-1 pt-2 text-neutral-400">
                        <GripVertical className="h-3.5 w-3.5" />
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => moveSection(i, -1)}
                            disabled={i === 0}
                            aria-label="Move up"
                            className="text-[10px] text-neutral-500 disabled:opacity-30"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => moveSection(i, 1)}
                            disabled={i === sections.length - 1}
                            aria-label="Move down"
                            className="text-[10px] text-neutral-500 disabled:opacity-30"
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <input
                          type="text"
                          value={s.title}
                          onChange={(e) => updateSection(i, { title: e.target.value })}
                          placeholder="Section title"
                          className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm font-medium focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        />
                        <textarea
                          value={s.prompt}
                          onChange={(e) => updateSection(i, { prompt: e.target.value })}
                          placeholder="Tell Claude what to write in this section"
                          rows={2}
                          className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        />
                      </div>
                      {sections.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSection(i)}
                          aria-label="Remove section"
                          className="p-1 text-neutral-400 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-neutral-100 px-6 py-4">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? 'Save changes' : 'Create template'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-neutral-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  )
}
