'use client'

// Kolasys AI — Dark mode toggle.
// Toggles the `.dark` class on <html> and persists the choice in localStorage
// under "kolasys-theme". The initial class is set by the pre-hydration script
// in the root layout so there's no FOUC.

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

const STORAGE_KEY = 'kolasys-theme'

type Theme = 'light' | 'dark'

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function DarkModeToggle({ compact = false }: { compact?: boolean }) {
  // Avoid hydration mismatch — render a neutral shell until mounted.
  const [mounted, setMounted] = useState(false)
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    setTheme(readInitialTheme())
    setMounted(true)
  }, [])

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* noop — storage blocked */
    }
  }

  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={
        compact
          ? 'flex h-9 w-9 items-center justify-center rounded-full text-secondary transition-colors hover:bg-[color-mix(in_srgb,var(--text-muted)_10%,transparent)]'
          : 'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-secondary transition-colors hover:bg-[color-mix(in_srgb,var(--text-muted)_10%,transparent)]'
      }
    >
      {/* Label + icon show the DESTINATION — click to go to the OTHER mode. */}
      {!compact && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
      <span
        className="relative flex h-5 w-5 items-center justify-center"
        aria-hidden
      >
        {mounted ? (
          theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )
        ) : (
          /* stable placeholder pre-hydration */
          <span className="h-4 w-4 rounded-full" />
        )}
      </span>
    </button>
  )
}
