const CACHE_NAME = 'freshlink-v4'
const OFFLINE_URL = '/'

// Assets to precache on install
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/icon.svg',
  '/vita-fresh-logo.png',
]

// ── Install: precache critical assets ─────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
  )
})

// ── Activate: delete old caches ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// ── Fetch: network-first with cache fallback ───────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  if (!event.request.url.startsWith(self.location.origin)) return

  // For navigation requests (HTML pages) — network first, fallback to cached /
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()))
          }
          return res
        })
        .catch(() => caches.match(OFFLINE_URL))
    )
    return
  }

  // For static assets (images, fonts, JS, CSS) — cache first, then network
  const url = event.request.url
  const isStatic = /\.(png|jpg|jpeg|svg|webp|woff2?|ttf|ico)$/.test(url)
    || url.includes('/_next/static/')

  if (isStatic) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached
        return fetch(event.request).then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()))
          }
          return res
        }).catch(() => cached)
      })
    )
    return
  }

  // For API/data requests — network first, no cache
  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res && res.status === 200) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone))
        }
        return res
      })
      .catch(() => caches.match(event.request))
  )
})

// ── Background sync message handler ───────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ── Notification click → ouvre / focus l'app (cut-offs Vita Fresh) ─────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    })
  )
})
