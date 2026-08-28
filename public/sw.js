const CACHE = 'electioncanon-v1'

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
      await clients.claim()
    })()
  )
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request)

        if (response && response.status === 200) {
          const cache = await caches.open(CACHE)
          cache.put(event.request, response.clone())
        }

        return response
      } catch (error) {
        const cached = await caches.match(event.request)
        if (cached) return cached
        throw error
      }
    })()
  )
})
