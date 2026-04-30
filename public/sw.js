/* Kolasys AI — Web Push service worker.
 *
 * Receives push events from our backend and renders a system notification.
 * On click, focuses an existing app tab pointed at the URL or opens a new
 * one. Payload shape: { title, body, url?, icon? }.
 */

self.addEventListener('install', (event) => {
  // Activate this worker on the very next page load instead of waiting
  // for tabs to close.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = { title: 'Kolasys AI', body: 'You have a new update.' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch (err) {
    // Non-JSON payload — fall through with defaults plus the raw text body.
    if (event.data) data.body = event.data.text()
  }

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: data.url || '/' },
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(data.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      // If a tab on our origin is already open, focus it and navigate.
      for (const client of allClients) {
        try {
          const u = new URL(client.url)
          if (u.origin === self.location.origin && 'focus' in client) {
            await client.focus()
            if ('navigate' in client) {
              await client.navigate(targetUrl)
            }
            return
          }
        } catch (_) {
          // ignore unparseable client urls
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl)
      }
    })(),
  )
})
