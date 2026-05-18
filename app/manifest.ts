import type { MetadataRoute } from 'next'

/**
 * PWA manifest (F6.22). Permite "agregar a pantalla de inicio" en
 * mobile y desktop, dejando la app más cerca de las pantallas más
 * usadas (mi-panel, tareas, captura de evidencias).
 *
 * Los iconos referenciados deben existir en /public — agregar
 * icon-192.png e icon-512.png para que el install prompt aparezca.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Social Ahorro · ERP',
    short_name: 'SA ERP',
    description: 'Sistema interno de Social Ahorro Farmacias',
    start_url: '/admin',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    lang: 'es-AR',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Mi panel',
        url: '/admin/mi-panel',
        description: 'Tareas de hoy y objetivos personales',
      },
      {
        name: 'Tareas',
        url: '/admin/tareas',
        description: 'Bandeja de tareas',
      },
      {
        name: 'Mi equipo',
        url: '/admin/mi-equipo',
        description: 'Vista de supervisor',
      },
    ],
  }
}
