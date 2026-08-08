import { createAdminClient, createClient } from '@/lib/supabase/server'
import type { EstadoPedido, QueFalta } from './pedidos-etiquetas'

/**
 * LOS PEDIDOS DE CONSTRUCCIÓN.
 *
 * Lo que se pidió y todavía no existe.
 *
 * ── POR QUÉ ES UN OBJETO Y NO UNA NOTA ──────────────────────────────────────
 *
 * En v0.66 el chat ofreció seis veces "lo anoto como pedido de construcción" y
 * no había dónde anotarlo. Quedaba como prosa en la bitácora: legible, no
 * contable.
 *
 * Contable importa porque esto no es una molestia que se resuelve, es la cola
 * de construcción de la fábrica sacada de DEMANDA REAL en vez de intuición.
 * Cuántas veces se pidió lo mismo, en cuántos proyectos distintos, por cuánta
 * gente. Eso no se puede sacar de un párrafo.
 *
 * ── LO QUE NO HACE ──────────────────────────────────────────────────────────
 *
 * No agrupa solo. Sugiere candidatos por similitud de texto y una persona
 * decide. Un motor de agrupación semántica que se equivoca fusiona dos pedidos
 * distintos en uno y borra el que menos gente pidió, que suele ser el que más
 * falta hace.
 */

// Los tipos y las etiquetas viven aparte para que los controles del portal
// —componentes de cliente— puedan importarlos sin arrastrar `next/headers`.
export type { EstadoPedido, QueFalta } from './pedidos-etiquetas'
export { ETIQUETA_ESTADO, ETIQUETA_FALTA } from './pedidos-etiquetas'

export interface Pedido {
  id: string
  proyectoId: string
  proyectoNombre: string
  poolClave: string | null
  pedido: string
  contexto: string | null
  falta: QueFalta
  seParece: string | null
  estado: EstadoPedido
  motivoCierre: string | null
  turnoId: string | null
  duplicadoDe: string | null
  creadoAt: string
  creadoPor: string | null
}

interface Fila {
  id: string
  proyecto_id: string
  pool_id: string | null
  pedido: string
  contexto: string | null
  falta: QueFalta
  se_parece_a: string | null
  estado: EstadoPedido
  motivo_cierre: string | null
  turno_id: string | null
  duplicado_de: string | null
  creado_at: string
  creado_por: string | null
  proyecto: { nombre: string } | null
  pool: { clave: string } | null
}

const aPedido = (f: Fila): Pedido => ({
  id: f.id,
  proyectoId: f.proyecto_id,
  proyectoNombre: f.proyecto?.nombre ?? '—',
  poolClave: f.pool?.clave ?? null,
  pedido: f.pedido,
  contexto: f.contexto,
  falta: f.falta,
  seParece: f.se_parece_a,
  estado: f.estado,
  motivoCierre: f.motivo_cierre,
  turnoId: f.turno_id,
  duplicadoDe: f.duplicado_de,
  creadoAt: f.creado_at,
  creadoPor: f.creado_por,
})

const SELECT =
  '*, proyecto:fab_proyectos(nombre), pool:fab_pools(clave)'

/* ── Anotar ──────────────────────────────────────────────────────────────── */

export interface ResultadoAnotar {
  ok: boolean
  pedido?: Pedido
  /** Pedidos parecidos que ya existían. NO se fusionan solos. */
  parecidos?: Pedido[]
  error?: string
}

/**
 * Anotar un pedido.
 *
 * Devuelve los parecidos que ya existían, pero NO los fusiona: quien mira la
 * cola decide si son el mismo. Fusionar solo es cómodo hasta el día que junta
 * dos pedidos distintos y borra el que menos gente pidió.
 */
export async function anotarPedido(args: {
  proyectoId: string
  poolClave?: string | null
  pedido: string
  contexto?: string
  falta: QueFalta
  seParece?: string
  turnoId?: string | null
  autorId: string | null
}): Promise<ResultadoAnotar> {
  const texto = args.pedido.trim()
  if (!texto) return { ok: false, error: 'Un pedido sin texto no se puede leer después.' }

  const adm = createAdminClient()

  let poolId: string | null = null
  if (args.poolClave) {
    const { data } = await adm.from('fab_pools').select('id').eq('clave', args.poolClave).maybeSingle()
    poolId = (data as { id: string } | null)?.id ?? null
  }

  const { data, error } = await adm
    .from('fab_pedidos_construccion')
    .insert({
      proyecto_id: args.proyectoId,
      pool_id: poolId,
      pedido: texto,
      contexto: args.contexto?.trim() || null,
      falta: args.falta,
      se_parece_a: args.seParece?.trim() || null,
      turno_id: args.turnoId ?? null,
      creado_por: args.autorId,
    })
    .select(SELECT)
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'No se pudo anotar el pedido.' }

  const pedido = aPedido(data as unknown as Fila)
  return { ok: true, pedido, parecidos: await parecidosA(pedido) }
}

/* ── Similitud, sin motor ────────────────────────────────────────────────── */

/**
 * Candidatos a ser el mismo pedido.
 *
 * Palabras en común sobre el texto normalizado, y nada más. No es un motor
 * semántico y no pretende serlo: su trabajo es poner dos pedidos uno al lado
 * del otro para que una persona los mire, no decidir.
 *
 * El umbral es alto (la mitad de las palabras significativas) porque el costo
 * de un falso positivo —dos pedidos distintos ofrecidos como el mismo— es que
 * alguien los fusione de apuro.
 */
export async function parecidosA(pedido: Pedido): Promise<Pedido[]> {
  const adm = createAdminClient()
  const { data } = await adm
    .from('fab_pedidos_construccion')
    .select(SELECT)
    .neq('id', pedido.id)
    .is('duplicado_de', null)
    .limit(200)

  const mias = significativas(pedido.pedido)
  if (mias.size === 0) return []

  return ((data ?? []) as unknown as (Fila & { pedido_norm: string | null })[])
    .map((f) => {
      const otras = significativas(f.pedido)
      let comunes = 0
      for (const p of mias) if (otras.has(p)) comunes++
      return { f, puntaje: comunes / Math.min(mias.size, Math.max(otras.size, 1)) }
    })
    .filter((x) => x.puntaje >= 0.5)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, 5)
    .map((x) => aPedido(x.f))
}

/** Palabras vacías: aparecen en todos los pedidos y no distinguen ninguno. */
const VACIAS = new Set([
  'que', 'de', 'la', 'el', 'los', 'las', 'un', 'una', 'para', 'por', 'con', 'sin',
  'en', 'del', 'al', 'se', 'lo', 'es', 'como', 'mas', 'pero', 'esto', 'eso',
  'quiero', 'necesito', 'poder', 'hacer', 'tener', 'ver', 'nora', 'sistema',
])

function significativas(texto: string): Set<string> {
  const norm = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
  return new Set(norm.split(/\s+/).filter((p) => p.length > 2 && !VACIAS.has(p)))
}

/* ── Vincular a mano ─────────────────────────────────────────────────────── */

/** Marca un pedido como duplicado de otro. Lo decide una persona, siempre. */
export async function vincularPedido(
  id: string,
  duplicadoDe: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (id === duplicadoDe) return { ok: false, error: 'Un pedido no puede ser duplicado de sí mismo.' }
  const { error } = await createAdminClient()
    .from('fab_pedidos_construccion')
    .update({ duplicado_de: duplicadoDe })
    .eq('id', id)
  return { ok: !error, error: error?.message }
}

export async function cambiarEstadoPedido(args: {
  id: string
  estado: EstadoPedido
  motivo?: string
  autorId: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const cierra = args.estado === 'resuelto' || args.estado === 'descartado'
  if (cierra && !args.motivo?.trim()) {
    // Un pedido que desaparece sin motivo se vuelve a pedir, y la próxima vez
    // nadie sabe que ya se había decidido.
    return { ok: false, error: 'Cerrar un pedido exige decir por qué.' }
  }
  const { error } = await createAdminClient()
    .from('fab_pedidos_construccion')
    .update({
      estado: args.estado,
      motivo_cierre: cierra ? args.motivo!.trim() : null,
      cerrado_at: cierra ? new Date().toISOString() : null,
      cerrado_por: cierra ? args.autorId : null,
    })
    .eq('id', args.id)
  return { ok: !error, error: error?.message }
}

/* ── Leer ────────────────────────────────────────────────────────────────── */

/**
 * Un grupo de pedidos que piden lo mismo.
 *
 * `veces` y `proyectos` son el punto entero de esta sesión: es lo que ordena la
 * cola por demanda en vez de por fecha.
 */
export interface GrupoDePedidos {
  cabeza: Pedido
  miembros: Pedido[]
  veces: number
  proyectos: string[]
  personas: number
  /** Qué se destraba si se construye: pools y proyectos que lo esperan. */
  desbloquea: { pools: string[]; proyectos: string[] }
}

export async function colaDeConstruccion(opciones: { conAdmin?: boolean } = {}): Promise<GrupoDePedidos[]> {
  const sb = opciones.conAdmin ? createAdminClient() : createClient()
  const { data } = await sb
    .from('fab_pedidos_construccion')
    .select(SELECT)
    .order('creado_at', { ascending: true })
    .limit(500)

  const todos = ((data ?? []) as unknown as Fila[]).map(aPedido)
  const porId = new Map(todos.map((p) => [p.id, p]))

  const grupos = new Map<string, Pedido[]>()
  for (const p of todos) {
    // Un duplicado cuya cabeza no está a la vista se agrupa consigo mismo: es
    // mejor un grupo de uno que un pedido que desaparece de la cola.
    const cabezaId = p.duplicadoDe && porId.has(p.duplicadoDe) ? p.duplicadoDe : p.id
    grupos.set(cabezaId, [...(grupos.get(cabezaId) ?? []), p])
  }

  return [...grupos.entries()]
    .map(([cabezaId, miembros]) => {
      const cabeza = porId.get(cabezaId)!
      const abiertos = miembros.filter((m) => m.estado !== 'descartado' && m.estado !== 'resuelto')
      return {
        cabeza,
        miembros,
        veces: miembros.length,
        proyectos: [...new Set(miembros.map((m) => m.proyectoNombre))],
        personas: new Set(miembros.map((m) => m.creadoPor).filter(Boolean)).size,
        desbloquea: {
          pools: [...new Set(abiertos.map((m) => m.poolClave).filter(Boolean) as string[])],
          proyectos: [...new Set(abiertos.map((m) => m.proyectoNombre))],
        },
      }
    })
    .sort((a, b) => {
      // Por demanda, no por fecha: primero en cuántos proyectos distintos se
      // pidió, después cuántas veces, y recién al final la antigüedad.
      if (b.proyectos.length !== a.proyectos.length) return b.proyectos.length - a.proyectos.length
      if (b.veces !== a.veces) return b.veces - a.veces
      return a.cabeza.creadoAt.localeCompare(b.cabeza.creadoAt)
    })
}
