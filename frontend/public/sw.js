// OBRO ilovasi. Faqat sahifa ochilmay qolganda "Internet yo'q" ko'rsatadi; ma'lumot (API) keshlanmaydi,
// shuning uchun kabinetda doim yangi ma'lumot turadi.
const CACHE = 'obro-shell-v1'
const SHELL = ['/offline.html', '/icon-192.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')))
})
