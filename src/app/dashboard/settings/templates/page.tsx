// Kolasys AI — Templates settings page (shell)

import { TemplatesManager } from '@/components/templates-manager'

export const metadata = { title: 'Templates — Kolasys AI' }

export default function TemplatesPage() {
  return (
    <div className="p-4 sm:p-8">
      <div className="mb-8 max-w-3xl">
        <h1 className="text-2xl font-bold text-neutral-900">AI Skills &amp; Templates</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Control how Kolasys AI structures your notes. Built-in templates are read-only.
          Create your own templates with custom sections and prompts to match your workflow.
        </p>
      </div>
      <TemplatesManager />
    </div>
  )
}
