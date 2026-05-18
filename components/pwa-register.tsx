'use client'

import { useEffect } from 'react'

/**
 * Registra el service worker en clientes con soporte. Silencioso —
 * cualquier fallo se reporta solo en consola.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => console.warn('PWA register failed', err))
  }, [])
  return null
}
