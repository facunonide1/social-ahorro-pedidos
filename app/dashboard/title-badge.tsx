'use client'

import { useEffect } from 'react'

const BASE_TITLE = 'Social Ahorro · Pedidos'

/**
 * Setea `document.title` con un prefijo `(N)` indicando pedidos
 * pendientes, para que se vea en la pestaña del browser aunque el
 * operador esté en otra app. Se limpia al desmontar.
 */
export default function TitleBadge({ pendientes }: { pendientes: number }) {
  useEffect(() => {
    document.title = pendientes > 0 ? `(${pendientes}) ${BASE_TITLE}` : BASE_TITLE
    return () => { document.title = BASE_TITLE }
  }, [pendientes])
  return null
}
