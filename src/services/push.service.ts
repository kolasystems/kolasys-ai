// Kolasys AI — Expo push notification service.
// Thin wrapper over exp.host's push API. Callers are expected to hold an
// Expo push token obtained client-side on the mobile app and registered
// via trpc.settings.updatePushToken.

type Args = {
  token: string
  title: string
  body: string
  data?: Record<string, string>
}

export async function sendExpoPush({ token, title, body, data }: Args) {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      to: token,
      title,
      body,
      data: data ?? {},
      sound: 'default',
      badge: 1,
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[push] Expo push failed:', res.status, text)
  }
}
