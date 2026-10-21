import { frase, type EdadDelDato } from '@/lib/sifaco/edad-del-dato'

/**
 * DE CUÁNDO ES EL DATO, EN UNA LÍNEA.
 *
 * Va en toda pantalla que muestre plata o unidades salidas del maestro. No es
 * decoración: los $63,3 M urgentes del plan de compra son exactos sobre una
 * foto que puede tener semanas, y quien decide tiene que ver las dos cosas.
 *
 * El umbral de «viejo» no está acá: lo decide el dueño en Configuración y lo
 * lee `maestro_estado()`. Una pantalla no elige cuándo un dato está viejo.
 *
 * Recibe el dato ya leído en vez de pedirlo: así la usan igual las pantallas de
 * servidor y los componentes de cliente, que son la mayoría de las que muestran
 * estos números.
 */
export function FechaDelDatoLinea({ e, queSeCalcula, className }: {
  e: EdadDelDato | null
  queSeCalcula?: string
  className?: string
}) {
  const f = frase(e, queSeCalcula)
  const tono = f.alarma
    ? 'font-medium text-amber-600 dark:text-amber-400'
    : 'text-muted-foreground'

  return (
    <p className={`text-xs leading-snug ${tono} ${className ?? ''}`}>
      {f.alarma ? '\u26a0 ' : ''}{f.texto}
    </p>
  )
}
