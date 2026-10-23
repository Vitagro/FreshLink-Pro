const CACHE_NAME = 'freshlink-v6'
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
        keys.filter(k => k.startsWith("freshlink-") && k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  )
})

// API responses may contain private data: never intercept, persist, or replay them.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, {cache:'no-store'}).then(res => {
      if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
        const copy=res.clone()
        event.waitUntil(caches.open(CACHE_NAME).then(c=>c.put(OFFLINE_URL,copy)))
      }
      return res
    }).catch(async()=> (await caches.match(OFFLINE_URL)) || new Response('Connexion indisponible. Reconnectez-vous puis rechargez.', {status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})))
    return
  }
  const isScript=/\.js$/.test(url.pathname),isCss=/\.css$/.test(url.pathname)
  const isStatic=isScript||isCss||/\.(png|jpg|jpeg|svg|webp|woff2?|ttf|ico)$/.test(url.pathname)
  if (!isStatic) return
  const valid=res=>!!res && res.ok && (isScript ? /(?:javascript|ecmascript)/i.test(res.headers.get('content-type')||'') : isCss ? (res.headers.get('content-type')||'').includes('text/css') : !(res.headers.get('content-type')||'').includes('text/html'))
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME),cached=await cache.match(event.request)
    if(valid(cached))return cached
    try {
      const res=await fetch(event.request)
      if(!valid(res))return new Response('Ressource indisponible. Rechargez la version courante.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})
      await cache.put(event.request,res.clone())
      return res
    }catch{return new Response('Ressource indisponible hors connexion.',{status:503})}
  })())
})

// ── Background sync message handler ───────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ── Web Push (VAPID) → notification système même app fermée/réduite ───────────
// Réceptionne le push envoyé par l'api-server (lib/webPush.ts) et l'affiche via
// registration.showNotification — seul chemin qui fonctionne app fermée (une
// notification créée depuis une page ouverte, comme notify.ts, ne peut pas
// s'afficher si aucune page n'est chargée pour l'exécuter).
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }
  const title = data.title || 'FreshLink Pro'
  const options = {
    body: data.body,
    tag: data.tag,
    renotify: !!data.tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
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
