// Kolasys AI — Sign-in page

import { SignIn } from '@clerk/nextjs'
import { KolasysLogoMark } from '@/components/kolasys-logo'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 dark:bg-[#0F0F13] px-4">
      <div className="mb-8 flex flex-col items-center gap-3">
        <KolasysLogoMark size={52} className="text-black dark:text-white" />
        <span className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          Kolasys <span style={{ color: '#CA2625' }}>AI</span>
        </span>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">AI-powered meeting notes</p>
      </div>

      <SignIn />
    </div>
  )
}
