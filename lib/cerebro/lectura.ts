/**
 * EL CEREBRO · LA LECTURA CONSOLIDADA.
 *
 * ── QUÉ HACE ESTE ARCHIVO ───────────────────────────────────────────────────
 *
 * Lee UNA fila —`cerebro_estado()`— y la convierte en lo que dibuja la
 * pantalla: catorce nódulos, cinco sucursales, lo que espera firma y la
 * actividad real. No calcula ningún número: los números vienen de la base, y
 * las frases de los agentes las arma `lib/agentes/lectura.ts` con las mismas
 * funciones que usa la pantalla de agentes. Si el cerebro y esa pantalla
 * dijeran cosas distintas, nadie sabría a cuál creerle.
 *
 * ── CON LA SESIÓN, NUNCA CON EL CLIENTE DE SERVICIO ─────────────────────────
 *
 * `cerebro_estado()` mira el rol adentro con `auth.uid()`. Llamada con la
 * sesión de quien mira, el que no es dueño no recibe nada. Llamada con
 * service_role no habría `auth.uid()` y tampoco: por eso este archivo recibe
 * el cliente de sesión y no tiene forma de usar otro.
 *
 * ── SI TARDA, NULL ──────────────────────────────────────────────────────────
 *
 * Se corre contra un reloj. Si la lectura no vuelve a tiempo, devuelve
 * `estado: null` con el motivo, y la pantalla dice que no pudo mirar. No se
 * rellena con ceros: un cero en un dibujo se ve como «no hay nada».
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { ELENCO, type Nivel } from '@/lib/agentes/elenco'
import {
  leerCanal, leerConvenio, leerUno, sinCalcular, type LecturaDeAgente,
} from '@/lib/agentes/lectura'

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

const n = (x: unknown) => Number(x ?? 0)
const mil = (x: number) => x.toLocaleString('es-AR')

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

/* ── LOS CINCO SECTORES QUE NADIE CONSTRUYÓ ──────────────────────────────────
 *
 * El prototipo dibuja catorce. El elenco tiene nueve. Los otros cinco se
 * dibujan igual —apagados, punteados, sin pulso— porque un sector que
 * desaparece del dibujo parece cubierto. Cada uno dice qué contó para saber
 * que está vacío, y qué haría falta. Ninguno tiene nivel: no hay agente.
 */
function sinConstruir(sc: Record<string, any>): NodoAgente[] {
  const base = {
    construido: false, encendido: false, estado: 'off' as Tono, frase: null,
    nivel: null, esperanFirma: 0, de_cuando: null,
  }
  const mo = sc?.mostrador ?? {}
  const co = sc?.conteo ?? {}
  const tu = sc?.turno ?? {}
  const ba = sc?.balance ?? {}
  const vi = sc?.vinculo ?? {}
  return [
    {
      ...base, id: 'mostrador', nombre: 'Mostrador', queHace: 'La demanda que no se ve',
      motivoApagado: `no hay un agente de mostrador construido, y hay ${mil(n(mo.faltantes_registrados))} faltantes registrados`,
      queLoEnciende: 'registrar en el mostrador lo que piden y no hay. Con un mes de faltantes se puede decir qué comprar',
      href: '/mostrador', corto: `${mil(n(mo.faltantes_registrados))} faltantes`,
      de_donde: 'demanda_invisible',
    },
    {
      ...base, id: 'conteo', nombre: 'Conteo', queHace: 'Verificar el stock de SIFACO',
      motivoApagado: `sin construir: hay ${mil(n(co.conteos))} conteos cargados, así que nadie verifica lo que declara SIFACO`,
      queLoEnciende: 'contar una zona por semana desde el celular',
      href: '/admin/operaciones/conteos', corto: 'sin construir', de_donde: 'cnt_conteos',
    },
    {
      ...base, id: 'turno', nombre: 'Turno', queHace: 'Quién está y quién cubre',
      motivoApagado: `sin construir: ${mil(n(tu.empleados))} empleado(s) cargados, ${mil(n(tu.con_sucursal))} con sucursal, ${mil(n(tu.turnos_registrados))} entradas registradas`,
      queLoEnciende: 'cargar a las personas de cada sucursal y que marquen la entrada',
      href: '/admin/rrhh', corto: `${mil(n(tu.empleados))} persona(s)`, de_donde: 'empleados y empleado_turnos',
    },
    {
      ...base, id: 'balance', nombre: 'Balance', queHace: 'Si cada sucursal gana plata',
      motivoApagado: `sin construir: hay ${mil(n(ba.gastos_fijos))} gastos fijos cargados, así que hay margen bruto y no resultado`,
      queLoEnciende: 'cargar alquiler, luz y sueldos por sucursal',
      href: '/admin/sucursales/gastos', corto: 'sin gastos', de_donde: 'gastos_fijos',
    },
    {
      ...base, id: 'vinculo', nombre: 'Vínculo', queHace: 'Los clientes',
      motivoApagado: `sin construir: ${mil(n(vi.clientes_reales))} clientes reales y ${mil(n(vi.clientes_demo))} de demostración`,
      queLoEnciende: 'que SIFACO registre el cliente en la venta: el padrón se arma solo',
      href: '/admin/clientes', corto: `${mil(n(vi.clientes_reales))} reales`, de_donde: 'clientes',
    },
  ]
}

/** La etiqueta corta, con los mismos números de la frase. */
function cortoDe(id: string, raw: Record<string, any>, lec: LecturaDeAgente): string | null {
  if (!lec.encendido) return lec.motivoApagado ? 'apagado' : null
  const r = raw?.resumen?.[id] ?? {}
  switch (id) {
    case 'abasto': return `${mil(n(r.items_urgentes))} urgentes`
    case 'tesoro': return arsCorto(n(r.monto_impago)) ?? `${mil(n(r.impagas))} impagas`
    case 'reparto': return `${mil(n(r.quietos))} quietos`
    case 'margen': return `${mil(n(r.vigentes))} ofertas`
    case 'despacho': return `${mil(n(r.abiertos))} abiertos`
    case 'vigia': return `${mil(n(r.vencen_30))} vencen`
    case 'documentos': return `${mil(n(r.recepciones))} recepciones`
    case 'canal': return raw?.canales ? `${mil(n(raw.canales.errores_abiertos))} errores` : null
    case 'convenio': {
      const d = raw?.convenios?.debitos?.cantidad
      return d ? `${mil(n(d))} débitos` : 'sin débitos'
    }
    default: return null
  }
}

function nivelDe(config: any[], id: string): Nivel {
  const filas = (config ?? []).filter((c) => c.agente === id)
  if (!filas.length) return 'sugiere'
  const orden: Nivel[] = ['nunca', 'sugiere', 'prepara', 'hace_y_avisa']
  return filas.reduce<Nivel>((max, f) =>
    orden.indexOf(f.nivel) > orden.indexOf(max) ? f.nivel : max, 'nunca')
}

/**
 * A.1 · Los catorce.
 *
 * Los nueve del elenco con la misma lectura que la pantalla de agentes; los
 * cinco que faltan, apagados y diciendo por qué.
 */
function armarAgentes(raw: Record<string, any>, espera: Espera): NodoAgente[] {
  const resumen = raw?.resumen ?? null
  const calc: string | null = resumen?.calculado_at ?? null
  const config = (raw?.config ?? []) as any[]
  const marc = (raw?.marcador ?? {}) as Record<string, any>

  const del_elenco = ELENCO.map((a): NodoAgente => {
    const nivel = nivelDe(config, a.id)
    const marcador = marc[a.id] ?? null
    const lec: LecturaDeAgente =
      a.id === 'convenio' ? leerConvenio(a, raw?.convenios ?? null, nivel, marcador)
      : a.id === 'canal' ? leerCanal(a, raw?.canales ?? null, nivel, marcador)
      : resumen ? leerUno(a, resumen[a.id] ?? {}, nivel, marcador)
      : sinCalcular(a, nivel, marcador)

    const esperanFirma = n(espera?.por_agente?.[a.id])
    const estado: Tono = !lec.encendido ? 'off'
      : esperanFirma > 0 ? 'ma'
      // Encendido pero diciendo qué lo completaría: le falta un dato.
      : lec.queLoEnciende || /sin confirmar|no puedo|falta/i.test(lec.frase ?? '') ? 'al'
      : 'ok'

    return {
      id: a.id, nombre: a.nombre, queHace: a.queHace, construido: true,
      encendido: lec.encendido, estado, frase: lec.frase,
      motivoApagado: lec.motivoApagado, queLoEnciende: lec.queLoEnciende,
      nivel, href: lec.href, corto: cortoDe(a.id, raw, lec), esperanFirma,
      // Canal y Convenio se leen en vivo; el resto, del snapshot diario.
      de_cuando: a.id === 'canal' || a.id === 'convenio' ? null : calc,
      de_donde: a.deDondeLee,
    }
  })

  return [...del_elenco, ...sinConstruir(raw?.sin_construir ?? {})]
}

function estadoSucursal(s: Omit<NodoSucursal, 'estado'>): Tono {
  if (s.sin_datos) return 'off'
  if (s.vendido_hoy.valor == null || s.caja.por_que_no || s.personas.por_que_no) return 'al'
  return 'ok'
}

/**
 * La única puerta. Recibe el cliente de SESIÓN.
 */
export async function leerCerebro(
  sb: Pick<SupabaseClient, 'rpc'>,
  topeMs = TOPE_LECTURA_MS,
): Promise<LecturaCerebro> {
  const t0 = Date.now()
  const reloj = new Promise<'tarde'>((res) => setTimeout(() => res('tarde'), topeMs))
  const lectura = Promise.resolve(sb.rpc('cerebro_estado')).then((r) => r)

  const r = await Promise.race([lectura, reloj])
  const leido_en_ms = Date.now() - t0

  if (r === 'tarde') {
    return {
      ok: false, estado: null, leido_en_ms,
      por_que: `la lectura tardó más de ${topeMs / 1000} s y la corté. No muestro números: un dibujo con ceros se lee como «no hay nada».`,
    }
  }
  const { data, error } = r as { data: any; error: any }
  if (error) {
    console.error('[cerebro] cerebro_estado:', error.message)
    return { ok: false, estado: null, leido_en_ms, por_que: `no pude leer el estado: ${error.message}` }
  }
  if (data == null) {
    return {
      ok: false, estado: null, leido_en_ms,
      por_que: 'el estado todavía no se calculó nunca. Se calcula cada minuto: en un minuto debería estar.',
    }
  }
  if (data.autorizado === false) {
    return { ok: false, estado: null, leido_en_ms, por_que: data.por_que ?? 'no autorizado' }
  }

  const espera = (data.espera ?? null) as Espera
  const sucursales = ((data.sucursales ?? []) as Omit<NodoSucursal, 'estado'>[])
    .map((s) => ({ ...s, estado: estadoSucursal(s) }))

  return {
    ok: true, leido_en_ms,
    estado: {
      agentes: armarAgentes(data.agentes ?? {}, espera),
      sucursales,
      espera,
      actividad: (data.actividad ?? []) as Evento[],
      calculado_at: data.calculado_at,
      tardo_ms: data.tardo_ms ?? null,
      edad_s: n(data.edad_s),
      ultimo_error: data.ultimo_error ?? null,
      ultimo_error_at: data.ultimo_error_at ?? null,
    },
  }
}
