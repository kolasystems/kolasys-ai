import { redirect } from 'next/navigation'

// Calendar connection lives at /dashboard/calendar.
// Redirect any deep link from mobile settings → that page.
export default function SettingsCalendarPage() {
  redirect('/dashboard/calendar')
}
