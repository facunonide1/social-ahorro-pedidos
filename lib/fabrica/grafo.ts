import type { ClienteLector } from './comparador'
import { MANIFIESTOS } from './manifiestos'

/**
 * El grafo de dependencias entre pools.
 *
 * Sirve para tres preguntas que ningún manifiesto solo puede responder:
 * si hay un ciclo, si hay un pool que nadie usa y no usa a nadie, y en qué
 * orden habría que instalar.
 */

export interface NodoPool {
  clave: string
  nombre: string
  categoria: 'nucleo' | 'generico' | 'vertical'
  /** Distancia a la raíz: 0 = no depende de nadie. */
  nivel: number
  depende_de: string[]
  usado_por: string[]
  /** Aplica a los pools base, de los que todos dependen sin declararlo. */
  base: boolean
}

export interface Grafo {
  nodos: NodoPool[]
  /** Aristas dirigidas: de → a significa "de necesita a". */
  aristas: { de: string; a: string }[]
  /** Ciclos encontrados, cada uno como la lista de pools que lo forman. */
  ciclos: string[][]
  /** Declarados que no dependen de nadie y de los que nadie depende. */
  huerfanos: string[]
  /** Dependencias hacia pools que todavía no se declararon. */
  colgadas: { de: string; a: string }[]
}

export function construirGrafo(): Grafo {
  const entradas = Object.values(MANIFIESTOS).map((e) => e.manifiesto)
  const declarados = new Set(entradas.map((m) => m.pool))

  const aristas: { de: string; a: string }[] = []
  const colgadas: { de: string; a: string }[] = []
  for (const m of entradas) {
    for (const dep of m.depende_de) {
      if (declarados.has(dep)) aristas.push({ de: m.pool, a: dep })
      else colgadas.push({ de: m.pool, a: dep })
    }
  }

  /* ── Ciclos ────────────────────────────────────────────────────────── */
  // DFS con pila. Un ciclo de dependencias no es un detalle de diseño: hace
  // imposible decidir en qué orden instalar, y por lo tanto imposible instalar.
  const salientes = new Map<string, string[]>()
  for (const a of aristas) {
    salientes.set(a.de, [...(salientes.get(a.de) ?? []), a.a])
  }
  const ciclos: string[][] = []
  const estado = new Map<string, 'abierto' | 'cerrado'>()
  const pila: string[] = []

  function visitar(n: string) {
    const e = estado.get(n)
    if (e === 'cerrado') return
    if (e === 'abierto') {
      const desde = pila.indexOf(n)
      if (desde >= 0) ciclos.push([...pila.slice(desde), n])
      return
    }
    estado.set(n, 'abierto')
    pila.push(n)
    for (const sig of salientes.get(n) ?? []) visitar(sig)
    pila.pop()
    estado.set(n, 'cerrado')
  }
  for (const m of entradas) visitar(m.pool)

  /* ── Niveles ───────────────────────────────────────────────────────── */
  // Profundidad = cuántos saltos hasta un pool sin dependencias. Con ciclos el
  // cálculo no converge, así que se corta y se reporta el ciclo aparte.
  const nivelDe = new Map<string, number>()
  function nivel(n: string, visto = new Set<string>()): number {
    if (nivelDe.has(n)) return nivelDe.get(n)!
    if (visto.has(n)) return 0
    visto.add(n)
    const deps = (salientes.get(n) ?? []).filter((d) => declarados.has(d))
    const v = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((d) => nivel(d, visto)))
    nivelDe.set(n, v)
    return v
  }

  const entrantes = new Map<string, string[]>()
  for (const a of aristas) {
    entrantes.set(a.a, [...(entrantes.get(a.a) ?? []), a.de])
  }

  const nodos: NodoPool[] = entradas.map((m) => ({
    clave: m.pool,
    nombre: m.nombre,
    categoria: m.categoria,
    nivel: nivel(m.pool),
    depende_de: m.depende_de,
    usado_por: entrantes.get(m.pool) ?? [],
    base: m.usado_por_todos === true,
  }))

  const huerfanos = nodos
    .filter((n) => !n.base && n.depende_de.length === 0 && n.usado_por.length === 0)
    .map((n) => n.clave)

  return { nodos, aristas, ciclos, huerfanos, colgadas }
}

/* ── Tablas sin dueño ────────────────────────────────────────────────── */

export interface TablasSinDueno {
  total: number
  conDueno: number
  sinDueno: string[]
  /** Las sin dueño agrupadas por el sector que las va a reclamar. */
  porSectorPendiente: { sector: string; tablas: string[] }[]
}

/**
 * A qué sector pendiente pertenece cada tabla sin dueño.
 *
 * Sale de los prefijos del sector, igual que el comparador. Es una conjetura
 * sobre sectores que todavía no se declararon —por eso `sin_clasificar` existe
 * y no se fuerza— pero convierte una lista de 58 nombres sueltos en una cola de
 * trabajo con orden.
 */
const SECTORES_PENDIENTES: { sector: string; prefijos: RegExp }[] = [
  { sector: 'personas', prefijos: /^(empleado|niveles_empleados|turnos_sucursal|cobertura_config|supervisores_metricas)/ },
  { sector: 'comunicacion', prefijos: /^(canales|canal_|mensajes|mensaje_|encuesta|recordatorios_programados|clima_chats)/ },
  { sector: 'compliance', prefijos: /^compliance_/ },
  { sector: 'pedidos', prefijos: /^(orders|order_|users_pedidos|customers|whatsapp_messages|zonas_reparto)/ },
  { sector: 'cuponera', prefijos: /^(coupons?|coupon_|offers|user_points|point_transactions|notifications|categories|users$|tickets_validacion)/ },
  { sector: 'deprecadas · se borran', prefijos: /^zz_deprecated/ },
  { sector: 'respaldos · se borran', prefijos: /^backup_/ },
]

/**
 * Qué tablas de la base no pertenecen a ningún pool declarado.
 *
 * Es la lista de lo que falta declarar sacada de LA BASE, no de la memoria.
 * Una tabla sin dueño es una tabla que nadie se lleva al mudarse: si el
 * proyecto se rearma en otro lado, esos datos no existen.
 *
 * Se cuentan las propias y las escritas: si un pool la toca, alguien responde
 * por ella. Las leídas no alcanzan — leer no es hacerse cargo.
 */
export async function tablasSinDueno(sb: ClienteLector): Promise<TablasSinDueno> {
  const { data } = await sb.rpc('fab_tablas_con_prefijo', { p_prefijos: [''] })
  const todas = ((data ?? []) as { tabla: string }[]).map((r) => r.tabla)

  const conDueno = new Set<string>()
  for (const e of Object.values(MANIFIESTOS)) {
    for (const ent of e.manifiesto.entidades) {
      if (ent.acceso === 'propia') conDueno.add(ent.tabla)
    }
  }

  // Las tablas de la propia fábrica no cuentan: son de otro producto.
  const relevantes = todas.filter((t) => !t.startsWith('fab_'))

  const sinDueno = relevantes.filter((t) => !conDueno.has(t)).sort()

  const grupos = new Map<string, string[]>()
  for (const t of sinDueno) {
    const s = SECTORES_PENDIENTES.find((x) => x.prefijos.test(t))
    const clave = s?.sector ?? 'sin clasificar'
    grupos.set(clave, [...(grupos.get(clave) ?? []), t])
  }

  return {
    total: relevantes.length,
    conDueno: relevantes.filter((t) => conDueno.has(t)).length,
    sinDueno,
    porSectorPendiente: [...grupos.entries()]
      .map(([sector, tablas]) => ({ sector, tablas }))
      .sort((a, b) => b.tablas.length - a.tablas.length),
  }
}
