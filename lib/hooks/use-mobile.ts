'use client'

import { useEffect, useState } from 'react'

const MOBILE_BREAKPOINT = 768

/**
 * Retorna `true` si el viewport es < 768px (mobile/portrait tablet).
 *
 * SSR-safe: en server siempre retorna `false`. El primer render en
 * cliente puede mostrar desktop por una fracción de segundo y luego
 * recalcular — usar con `useUIStore.isHydrated` o un skeleton si
 * importa evitar el flash.
 */
export function useMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [breakpoint])

  return isMobile
}
