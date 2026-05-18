// Service worker mínimo para que la PWA sea installable.
// Estrategia: network-first; sin precaching agresivo (datos del ERP
// no deberían cachearse sin estrategia explícita).
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  // Network-first — no interceptar nada de /api/*, /auth/*, etc.
  // Default behavior: dejar pasar la request al navegador.
  return
})
