'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { COOKIE_SIN_DEMO } from '@/lib/demo/estado-nombre'

/**
 * EL AVISO DE QUE LO QUE SE ESTÁ MIRANDO ES INVENTADO.
 *
 * Va ARRIBA de los números, no al pie. Un aviso debajo del número llega tarde:
 * para cuando se lee, la persona ya sacó su conclusión.
 *
 * Y dice hechos, no adjetivos. «7.620 movimientos de demostración» se puede
 * verificar; «atención: datos de prueba» no dice cuántos ni de qué.
 */
export function AvisoDemo({
  conceptos,
  total,
  sinDemo,
}: {
  conceptos: { concepto: string; filas: number }[]
  total: number
  sinDemo: boolean
}) {
  const router = useRouter()
  const [pendiente, empezar] = useTransition()

  function alternar() {
    // La cookie es la lente. Un año de vida para que no se apague sola en el
    // medio de una revisión.
    document.cookie = `${COOKIE_SIN_DEMO}=${sinDemo ? '' : '1'}; path=/; max-age=${sinDemo ? 0 : 31536000}`
    empezar(() => router.refresh())
  }

  if (sinDemo) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3">
        <p className="text-sm">
          <b>Estás viendo el sistema sin la demostración.</b> Lo que aparezca acá es lo
          que hay de verdad cargado. Si está vacío, está vacío.
        </p>
        <Button variant="ghost" size="sm" className="mt-1 h-7 px-2 text-xs" onClick={alternar} disabled={pendiente}>
          Volver a mostrar la demostración
        </Button>
      </div>
    )
  }

  if (total === 0) return null

  return (
    <div className="rounded-lg border border-amber-400/60 bg-amber-50 px-4 py-3 dark:bg-amber-950/20">
      <p className="text-sm text-amber-900 dark:text-amber-200">
        <b>Los números de abajo son de demostración.</b> Hay{' '}
        {total.toLocaleString('es-AR')} registros sembrados —{' '}
        {conceptos.map((c) => `${c.filas.toLocaleString('es-AR')} ${c.concepto}`).join(', ')} —
        y ninguno pasó por el negocio. Cuando cargues los datos reales, esto va a
        cambiar solo.
      </p>
      <Button variant="ghost" size="sm" className="mt-1 h-7 px-2 text-xs text-amber-900 dark:text-amber-200" onClick={alternar} disabled={pendiente}>
        Ver el sistema sin la demostración
      </Button>
    </div>
  )
}
