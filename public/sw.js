// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  SERVICE WORKER                                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// Era mínimo —sólo para que la PWA fuera instalable— y la v1.2 le agrega lo
// único que de verdad necesita cachear: el mostrador.
//
// ── F.5 · POR QUÉ ─────────────────────────────────────────────────────────
//
// «Una farmacia que se queda sin internet sigue vendiendo.» Sin service
// worker, quedarse sin internet con la pantalla cerrada significa no poder
// abrirla: el navegador no tiene el HTML.
//
// ── QUÉ SE CACHEA Y QUÉ NO ────────────────────────────────────────────────
//
// SÍ: el documento de /mostrador y sus assets estáticos (/_next/static).
// NO: nada de /api/*. Jamás. Una respuesta de API cacheada es un stock de
//     ayer presentado como de ahora, que es exactamente el error que este
//     sistema se pasó seis versiones sacando.
//
// Los datos del mostrador sin conexión NO salen del cache del SW: salen de
// IndexedDB, donde se guardan con la fecha de la última sincronización y la
// pantalla la muestra. Un dato sin fecha es un dato que miente por omisión.
//
// ── LO QUE ESTO ACEPTA ────────────────────────────────────────────────────
//
// El documento de /mostrador está detrás de sesión, y cachearlo significa que
// el HTML queda en el dispositivo. Se acepta porque el dispositivo es el del
// local, no uno personal, y porque el HTML cacheado no trae datos: los trae
// de IndexedDB, que se borra al cerrar sesión.

const CACHE = 'nora-mostrador-v1'
const SHELL = ['/mostrador']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => undefined)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // NUNCA el API. Un stock cacheado es peor que no tener stock.
  if (url.pathname.startsWith('/api/')) return

  const esMostrador = url.pathname === '/mostrador' || url.pathname.startsWith('/mostrador/')
  const esEstatico = url.pathname.startsWith('/_next/static/')

  if (!esMostrador && !esEstatico) return

  // Red primero, cache como red de contención. Al revés —cache primero— el
  // mostrador mostraría una versión vieja de la pantalla teniendo internet.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copia = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => undefined)
        }
        return res
      })
      .catch(async () => {
        const hit = await caches.match(req)
        if (hit) return hit
        // Si pidió una ruta del mostrador que no está cacheada, se le da la
        // pantalla principal: desde ahí puede buscar con lo que hay guardado.
        if (esMostrador) {
          const base = await caches.match('/mostrador')
          if (base) return base
        }
        return new Response(
          '<!doctype html><meta charset="utf-8"><title>Sin conexión</title>' +
          '<body style="font-family:system-ui;padding:2rem;line-height:1.5">' +
          '<h1 style="font-size:1.1rem">Sin conexión y sin nada guardado</h1>' +
          '<p>Esta pantalla no se abrió nunca con internet, así que no hay nada ' +
          'en el dispositivo. Cuando vuelva la conexión, abrila una vez y queda ' +
          'disponible sin conexión.</p></body>',
          { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 200 },
        )
      }),
  )
})
