'use client'

import { useEffect, useState } from 'react'

const GREETINGS = {
  morning: [
    'Good morning',
    'Rise and ship it',
    "Wakey wakey, standup's in 5",
    'Another day, another agenda',
    "Today's forecast: 100% chance of meetings",
    'Your calendar is already judging you',
    'Caffeine loading…',
  ],
  afternoon: [
    'Good afternoon',
    'You survived the morning',
    'The afternoon slump stops here',
    'Coffee levels stable. Meeting levels: critical',
    'Post-lunch productivity unlocked',
    "You're doing great. Probably.",
    'Halfway to the finish line',
  ],
  evening: [
    'Good evening',
    'Burning the midnight Zoom link',
    'Still here? The bot is impressed',
    'Evening, you magnificent overachiever',
    'The meetings are done. The action items live on.',
    'No more meetings today. Probably.',
  ],
}

export function DashboardGreeting({ firstName }: { firstName: string }) {
  const [greeting, setGreeting] = useState('')

  useEffect(() => {
    const hour = new Date().getHours()
    const pool =
      hour < 12 ? GREETINGS.morning
      : hour < 17 ? GREETINGS.afternoon
      : GREETINGS.evening
    const text = pool[Math.floor(Math.random() * pool.length)]
    setGreeting(`${text}, ${firstName}!`)
  }, [firstName])

  return (
    <h1 className="text-xl font-semibold text-neutral-800 dark:text-white/95 sm:text-2xl">
      {greeting || <span className="invisible">…</span>}
    </h1>
  )
}
