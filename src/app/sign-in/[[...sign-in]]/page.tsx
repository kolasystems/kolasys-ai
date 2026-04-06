// Kolasys AI — Sign-in page

import { SignIn } from '@clerk/nextjs'
import { Mic2 } from 'lucide-react'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600">
          <Mic2 className="h-6 w-6 text-white" />
        </div>
        <span className="text-xl font-semibold tracking-tight text-neutral-900">Kolasys AI</span>
        <p className="text-sm text-neutral-500">AI-powered meeting notes</p>
      </div>

      <SignIn />
    </div>
  )
}
