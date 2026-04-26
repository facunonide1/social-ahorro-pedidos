'use client'

import { useEffect, useState } from 'react'

/**
 * Debounce simple para inputs de búsqueda u otros valores que cambian
 * frecuentemente.
 *
 * @example
 *   const [q, setQ] = useState('')
 *   const dq = useDebounce(q, 250)
 *   useEffect(() => { fetchResults(dq) }, [dq])
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}
