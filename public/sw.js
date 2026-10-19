/* H.K Motors Bike POS — service worker
 * Strategy: keep the app installable and fast, but never serve stale business data.
 * - Static build assets / icons: cache-first (they are versioned by Next.js)
 * - Everything else (pages, auth, server actions, Supabase calls): network-only
 */
const CACHE = 'hk-pos-v1'
const STATIC_ASSETS = ['/manifest.webmanifest', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only intercept same-origin GET requests; POST (server actions) always hits the network
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // Immutable static assets: cache-first with background fill
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icon-')) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit
        return fetch(request).then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
          return res
        })
      }),
    )
    return
  }

  // Pages and API traffic: network-only so inventory/sales data is never stale
  event.respondWith(fetch(request))
})
