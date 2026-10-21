/**
 * DE CUÁNDO ES EL DATO, DICHO IGUAL EN TODAS LAS PANTALLAS.
 *
 * ── ESTE ARCHIVO NO TOCA LA BASE, A PROPÓSITO ───────────────────────────────
 *
 * Lo leen pantallas de servidor y componentes de cliente. Si importara
 * `lib/supabase/server` —que usa `next/headers`— cualquier `'use client'` que
 * quisiera la frase arrastraría el cliente de servidor y el build se cae. La
 * consulta vive en `edad-del-dato.server.ts`; acá quedan el tipo y la frase.
 *
 * ── EL ERROR QUE VIENE A CERRAR ─────────────────────────────────────────────
 *
 * El plan de compra decía «el archivo de stock del 30 de agosto» y el archivo
 * era del **28**. El 30 era el día en que se importó: la pantalla leía
 * `producto_stock_sifaco.leido_at`, que es cuándo lo leímos nosotros, no cuándo
 * lo sacó SIFACO.
 *
 * Dos días no cambian ninguna decisión. Lo que la cambia es el caso general: un
 * export que alguien guardó el viernes y subió el martes se muestra tres días
 * más fresco de lo que es, y todo el plan de compra cuelga de esa foto.
 *
 * ── POR QUÉ UN SOLO LUGAR ───────────────────────────────────────────────────
 *
 * Porque el umbral de «viejo» es un parámetro del dueño, y si cada pantalla
 * tiene su propio `> 7` escrito a mano, cambiarlo en Configuración no cambia
 * nada en tres de ellas. El umbral vive en `compras_parametros` y se lee acá.
 */

export interface EdadDelDato {
  /** La fecha del ARCHIVO. Null si el archivo no la declaró. */
  fechaArchivo: string | null
  /** Cuándo lo importamos. Es otra cosa y se muestra aparte. */
  importadoAt: string | null
  /** Cuántos días tiene el dato. Null cuando no se puede saber. */
  dias: number | null
  /** A partir de cuántos días se considera viejo. Lo decide el dueño. */
  limite: number
  /** Null cuando no se puede saber: no es «está fresco». */
  estaViejo: boolean | null
  archivo: string | null
  filas: number | null
  /** Se aplicó teniendo avisos. No es un error: es una decisión que quedó escrita. */
  conAvisos: boolean
}

/**
 * La frase, armada una sola vez.
 *
 * Tres casos y tres frases distintas, porque son tres situaciones distintas:
 * no se sabe de cuándo es, está fresco, está viejo. La del medio no necesita
 * alarma y la primera no puede fingir tranquilidad.
 */
export function frase(e: EdadDelDato | null, queSeCalcula = 'Todo esto'): {
  texto: string; alarma: boolean; sinSaber: boolean
} {
  if (!e) {
    return {
      texto: 'Todavía no se importó ningún maestro de SIFACO, así que no hay foto de stock sobre la que calcular.',
      alarma: true, sinSaber: true,
    }
  }

  if (!e.fechaArchivo || e.dias === null) {
    return {
      texto: `${queSeCalcula} se calcula sobre el último archivo importado${e.archivo ? ` (${e.archivo})` : ''}, que no declara de qué día es. No se puede saber si el dato está fresco.`,
      alarma: true, sinSaber: true,
    }
  }

  const cuando = new Date(`${e.fechaArchivo}T12:00:00`).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'long',
  })
  const hace = e.dias === 0 ? 'de hoy' : e.dias === 1 ? 'de ayer' : `de hace ${e.dias} días`
  const base = `${queSeCalcula} se calcula sobre el archivo de stock del ${cuando} — ${hace}.`

  if (e.estaViejo) {
    return {
      texto: `${base} El cálculo está bien; la foto está vieja. Importá el maestro de SIFACO otra vez antes de decidir.`,
      alarma: true, sinSaber: false,
    }
  }
  return { texto: base, alarma: false, sinSaber: false }
}
