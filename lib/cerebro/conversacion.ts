/**
 * D · LA FORMA DE UNA RESPUESTA, sin nada de servidor.
 *
 * Lo importan la ruta, la pantalla y la prueba. Está aparte de
 * `responder.ts` porque ése lee la base, y el navegador no puede importarlo.
 */
import type { Intencion } from './entender'

export type Tono = 'ok' | 'al' | 'ma' | ''

export type Accion = {
  label: string
  tipo: 'navegar' | 'confirmar' | 'descartar' | 'preguntar' | 'abrir'
  href?: string
  /** Para `preguntar`: lo que se le vuelve a decir. */
  texto?: string
  primaria?: boolean
}

export type Respuesta = {
  /** El id de la bitácora. Null sólo si ni siquiera se pudo registrar. */
  id: string | null
  cosa: Intencion['cosa']
  /** Lo que se habla. Corto y sin montos. */
  dicho: string
  /** Lo que se escribe, si dice más que lo hablado. Puede tener **negritas**. */
  texto: string | null
  cifras: { k: string; v: string; tono?: Tono }[]
  acciones: Accion[]
  pie: string | null
  /** C.4 · hacia dónde mira la entidad. */
  mirar: string | null
  /** B.5 · qué panel abre. */
  abrir: { tipo: 'agente' | 'sucursal' | 'nucleo'; id?: string } | null
  navegar: string | null
  voz: 'off' | 'on' | null
  /** Si hay algo para confirmar con un toque. */
  propone: boolean
}


/** D.4 · un monto en voz alta es lo que no se dice. Lo usa la prueba. */
export function tieneMontos(s: string): boolean {
  return /\$\s?\d|\d{1,3}(\.\d{3})+|\d{4,}|millones|mil pesos/.test(s)
}

/* ── lo que se le puede pedir, para cuando no entiende ─────────────────── */
export const EJEMPLOS = [
  '¿Cómo venimos?',
  '¿Qué espera mi firma?',
  '¿Cómo viene Arabia?',
  'Mostrame lo que está apagado',
  'Llevame a la bandeja',
  'Pedime para 1 mes',
]

