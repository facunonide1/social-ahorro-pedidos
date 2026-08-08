import { MANIFIESTOS } from './manifiestos'
import { validarManifiesto } from './validador'
import type { Manifiesto } from './tipos'

/**
 * ¿Qué tan seguro es prender el lector en cada pool?
 *
 * El lector —la pieza que hace que la declaración MANDE sobre el código— no se
 * prende en todos lados el mismo día. Se prende en uno, se mira, y se sigue.
 * Esto ordena en qué orden, y el orden no es una opinión: sale de contar cosas
 * del manifiesto.
 *
 * La lógica es al revés de lo intuitivo. No gana el pool más completo: gana el
 * que hace menos daño si la declaración está mal. Un pool con muchos elementos
 * constitucionales es más peligroso justamente porque tiene más para romper.
 */

export interface Preparacion {
  clave: string
  nombre: string
  categoria: string
  /** Menos es más seguro. */
  riesgo: number
  /** De qué está hecho el número. */
  factores: string[]
  entidades: number
  /** Tablas que este pool escribe sin ser dueño. */
  escrituraCruzada: number
  pantallas: number
  agentes: number
  constitucionales: number
  /** Acciones de agente que tocan plata o salen del equipo. */
  accionesDeRiesgo: number
  brechas: string[]
  avisos: number
  /** Qué falta declarar, si algo falta. */
  incompleto: string[]
  veredicto: string
}

function evaluar(m: Manifiesto): Preparacion {
  const factores: string[] = []
  let riesgo = 0

  const propias = m.entidades.filter((e) => e.acceso === 'propia').length
  const escritas = m.entidades.filter((e) => e.acceso === 'escrita').length

  // Tamaño. Un pool grande tiene más superficie donde equivocarse.
  const porTamano = Math.floor(propias / 5)
  if (porTamano > 0) {
    riesgo += porTamano
    factores.push(`${propias} entidades propias`)
  }

  // Escritura cruzada: si la declaración está mal, el daño sale del pool.
  if (escritas > 0) {
    riesgo += escritas * 3
    factores.push(`escribe en ${escritas} tabla(s) de otros pools`)
  }

  // Constitucional: más elementos, más para apagar sin querer.
  const consti = (m.constitucional ?? []).length
  if (consti > 0) {
    riesgo += consti * 2
    factores.push(`${consti} elemento(s) constitucionales`)
  }

  // Acciones de agente que tocan plata o salen del equipo.
  const deRiesgo = (m.agentes ?? []).flatMap((a) =>
    a.acciones.filter(
      (x) => x.participacion !== 'nunca' && (x.toca_dinero || x.compromete_tercero),
    ),
  )
  if (deRiesgo.length > 0) {
    riesgo += deRiesgo.length * 4
    factores.push(`${deRiesgo.length} acción(es) que tocan plata o salen del equipo`)
  }

  // Una brecha abierta es una declaración que YA sabemos que no se cumple.
  const brechas = (m.agentes ?? []).flatMap((a) =>
    a.acciones.filter((x) => x.brecha).map((x) => `${a.clave}.${x.clave}: ${x.brecha}`),
  )
  if (brechas.length > 0) {
    riesgo += brechas.length * 5
    factores.push(`${brechas.length} brecha(s) abierta(s)`)
  }

  // Un núcleo del que todos dependen rompe a todos si se rompe.
  if (m.usado_por_todos) {
    riesgo += 6
    factores.push('todos los pools dependen de él')
  } else if ((m.usado_por ?? []).length > 0) {
    riesgo += (m.usado_por ?? []).length
    factores.push(`${(m.usado_por ?? []).length} pool(s) dependen de él`)
  }

  const problemas = validarManifiesto(m)
  const avisos = problemas.filter((p) => p.gravedad === 'aviso').length

  // Qué quedó sin declarar. No es un defecto: es información para el lector.
  const incompleto: string[] = []
  if (m.acciones.length === 0) incompleto.push('sin acciones de asistente declaradas')
  if ((m.agentes ?? []).length === 0) incompleto.push('sin agentes')
  if (!m.configurable || m.configurable.length === 0) incompleto.push('sin parámetros configurables')
  if ((m.deprecadas ?? []).length > 0) {
    incompleto.push(`${(m.deprecadas ?? []).length} tabla(s) deprecada(s) todavía en la base`)
  }

  return {
    clave: m.pool,
    nombre: m.nombre,
    categoria: m.categoria,
    riesgo,
    factores,
    entidades: propias,
    escrituraCruzada: escritas,
    pantallas: m.pantallas.length,
    agentes: (m.agentes ?? []).length,
    constitucionales: consti,
    accionesDeRiesgo: deRiesgo.length,
    brechas,
    avisos,
    incompleto,
    veredicto: '',
  }
}

const VEREDICTOS: { hasta: number; texto: string }[] = [
  { hasta: 5, texto: 'Seguro. Si la declaración está mal, el daño no sale del pool.' },
  { hasta: 12, texto: 'Razonable. Mirar una corrida antes de seguir.' },
  { hasta: 22, texto: 'Con cuidado. Tiene con qué romper algo ajeno.' },
  { hasta: Infinity, texto: 'Último. Acá una declaración mal aplicada apaga un control o mueve plata.' },
]

export function informePreparacion(): Preparacion[] {
  return Object.values(MANIFIESTOS)
    .map((e) => evaluar(e.manifiesto))
    .map((p) => ({ ...p, veredicto: VEREDICTOS.find((v) => p.riesgo <= v.hasta)!.texto }))
    .sort((a, b) => a.riesgo - b.riesgo || a.clave.localeCompare(b.clave))
}
