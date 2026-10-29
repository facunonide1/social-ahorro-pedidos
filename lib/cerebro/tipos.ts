/**
 * EL CEREBRO · LO QUE PUEDE LEER EL NAVEGADOR.
 *
 * Tipos y formato, sin nada de servidor. `lectura.ts` importa la lectura de
 * agentes, que usa el cliente de sesión del servidor: si el componente de la
 * pantalla importara de ahí, arrastraría `next/headers` al navegador.
 */
import type { Nivel } from '@/lib/agentes/elenco'

/** Lo que tarda como mucho la lectura antes de decir «no pude». */
export const TOPE_LECTURA_MS = 5000

/** Más viejo que esto, el dato se avisa como viejo en la pantalla. */
export const SNAPSHOT_VIEJO_S = 180

export type Tono = 'ok' | 'al' | 'ma' | 'off'

export type Linea = { k: string; v: string | null; tono?: Tono | ''; de_cuando?: string | null }

export type NodoAgente = {
  id: string
  nombre: string
  queHace: string
  /** false = el prototipo lo dibuja, pero nadie construyó ese agente. */
  construido: boolean
  encendido: boolean
  /** B.2 · verde trabajando · ámbar le falta un dato · rojo necesita firma · off apagado. */
  estado: Tono
  /** Lo que tiene para decir hoy. Null si está apagado. */
  frase: string | null
  motivoApagado: string | null
  queLoEnciende: string | null
  nivel: Nivel | null
  href: string
  /** La etiqueta corta debajo del nódulo. Null = no hay número que poner. */
  corto: string | null
  /** Cuántas cosas esperan firma de este agente. */
  esperanFirma: number
  /** A.5 · de cuándo es el dato que dice. */
  de_cuando: string | null
  de_donde: string
}

export type ValorConFecha = {
  valor: number | null
  de_cuando: string | null
  procedencia?: 'medido' | 'estimado'
  por_que_no: string | null
  periodo?: string | null
  de_donde?: string
}

export type Persona = { nombre: string; puesto: string | null; user_id: string | null; presente: boolean | null }

export type NodoSucursal = {
  id: string
  nombre: string
  codigo: string
  es_ecommerce: boolean
  vendido_hoy: ValorConFecha
  venta_estimada: ValorConFecha
  stock: ValorConFecha
  rotacion: { cobertura_meses: number | null; margen_pct: number | null; de_cuando: string | null; por_que_no: string | null }
  caja: {
    ultimo_cierre: string | null; quien: string | null; diferencia: number | null
    turno_estado: string | null; turno_fecha: string | null
    de_cuando: string | null; por_que_no: string | null
  }
  personas: { lista: Persona[]; presencia_registrada: boolean; por_que_no: string | null }
  tareas: { abiertas: number; vencidas: number; completadas_hoy: number; de_cuando: string | null }
  ultimos_hechos: { at: string; texto: string }[]
  /** B.7 · en gris, y lo dice. */
  sin_datos: boolean
  estado: Tono
}

export type Espera = {
  cuantos: number
  plata_total: number | null
  costo_por_dia: number | null
  no_se_pueden_costear: number
  de_riesgo: number
  esperando_turno: number
  por_fuente: Record<string, { cuantos: number; plata: number | null }>
  por_agente: Record<string, number>
  primeros: {
    fuente: string; clave: string; titulo: string; que_pasa: string
    plata: number | null; costo_por_dia: number | null
    sucursal_id: string | null; sucursal: string | null
    vence_at: string | null; vencido: boolean
    accion: string; href: string; riesgo: boolean
  }[]
}

export type Evento = { at: string; fuente: string; nodo: string | null; texto: string }

export type EstadoCerebro = {
  agentes: NodoAgente[]
  sucursales: NodoSucursal[]
  espera: Espera
  actividad: Evento[]
  calculado_at: string
  tardo_ms: number | null
  edad_s: number
  ultimo_error: string | null
  ultimo_error_at: string | null
}

export type LecturaCerebro =
  | { ok: true; estado: EstadoCerebro; leido_en_ms: number }
  | { ok: false; estado: null; por_que: string; leido_en_ms: number }


/** Pesos en corto, para la etiqueta del nódulo y para lo que se dice. */
export function arsCorto(x: number | null | undefined): string | null {
  if (x == null || !Number.isFinite(Number(x))) return null
  const v = Number(x)
  const a = Math.abs(v)
  if (a >= 1_000_000) return `$${(v / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`
  if (a >= 10_000) return `$${Math.round(v / 1000).toLocaleString('es-AR')} mil`
  return `$${Math.round(v).toLocaleString('es-AR')}`
}

export function ars(x: number | null | undefined): string | null {
  if (x == null || !Number.isFinite(Number(x))) return null
  return `$${Math.round(Number(x)).toLocaleString('es-AR')}`
}

