import type { ClienteLector } from './comparador'
import { MANIFIESTOS } from './manifiestos'
import type { Manifiesto, SectorCenso } from './tipos'

/**
 * Chequeo CENSO ↔ MANIFIESTO ↔ CÓDIGO.
 *
 * El censo se escribió a mano en v0.58, mirando el repo. Los manifiestos se
 * escribieron después, mirando el esquema. Nada garantizaba que dijeran lo
 * mismo, y no lo decían: Tareas figuraba genérico y era núcleo, y el censo le
 * contaba 8 entidades cuando tenía 10. Las dos cosas se encontraron mirando una
 * pantalla a ojo.
 *
 * Esto es para que fallen solas.
 *
 * EN LOS DOS SENTIDOS. No sólo "lo declarado existe" sino también "lo que
 * existe está declarado". El segundo es el que la mayoría de los validadores no
 * mira, y es el que encontró las dos entidades que faltaban: una declaración
 * incompleta pasa todas las pruebas que sólo miran hacia adelante.
 */

export interface Contradiccion {
  sector: string
  campo: string
  /** Qué dice el censo. */
  censo: string
  /** Qué dice el manifiesto, o el código cuando no hay manifiesto. */
  real: string
  /** Sentido en el que se encontró. */
  sentido: 'censo→real' | 'real→censo'
  gravedad: 'error' | 'aviso'
  /** El valor con el que habría que corregir el censo, si corresponde. */
  correccion?: { campo: string; valor: unknown }
}

/** Comparación de conjuntos que devuelve las dos direcciones por separado. */
function diferencia(a: string[], b: string[]): { soloA: string[]; soloB: string[] } {
  const sa = new Set(a)
  const sb = new Set(b)
  return {
    soloA: a.filter((x) => !sb.has(x)).sort(),
    soloB: b.filter((x) => !sa.has(x)).sort(),
  }
}

export async function chequearCenso(
  censo: SectorCenso[],
  sb: ClienteLector,
): Promise<Contradiccion[]> {
  const out: Contradiccion[] = []
  const porClave = new Map(censo.map((s) => [s.clave, s]))

  for (const [clave, entrada] of Object.entries(MANIFIESTOS)) {
    const m = entrada.manifiesto
    const s = porClave.get(clave)

    if (!s) {
      out.push({
        sector: clave,
        campo: 'sector',
        censo: 'no figura',
        real: 'declarado como pool',
        sentido: 'real→censo',
        gravedad: 'error',
        // No se autocorrige: dar de alta una fila de censo desde un manifiesto
        // invierte la relación. El censo observa el sistema, no la declaración.
      })
      continue
    }

    /* ── Categoría ──────────────────────────────────────────────────── */
    if (s.clasificacion !== m.categoria) {
      out.push({
        sector: clave,
        campo: 'clasificacion',
        censo: s.clasificacion,
        real: m.categoria,
        sentido: 'real→censo',
        gravedad: 'error',
        correccion: { campo: 'clasificacion', valor: m.categoria },
      })
    }

    /* ── Entidades: censo vs manifiesto ─────────────────────────────── */
    const propiasManifiesto = m.entidades
      .filter((e) => e.acceso === 'propia')
      .map((e) => e.tabla)
    const { soloA: soloCenso, soloB: soloManifiesto } = diferencia(
      s.entidades_propias,
      propiasManifiesto,
    )
    for (const t of soloCenso) {
      out.push({
        sector: clave,
        campo: `entidades_propias.${t}`,
        censo: 'propia',
        real: 'el manifiesto no la declara propia',
        sentido: 'censo→real',
        gravedad: 'error',
      })
    }
    for (const t of soloManifiesto) {
      out.push({
        sector: clave,
        campo: `entidades_propias.${t}`,
        censo: 'no figura',
        real: 'propia del pool',
        sentido: 'real→censo',
        gravedad: 'error',
      })
    }
    if (soloCenso.length > 0 || soloManifiesto.length > 0) {
      out.push({
        sector: clave,
        campo: 'entidades_propias',
        censo: `${s.entidades_propias.length}`,
        real: `${propiasManifiesto.length}`,
        sentido: 'real→censo',
        gravedad: 'aviso',
        correccion: { campo: 'entidades_propias', valor: propiasManifiesto.sort() },
      })
    }

    /* ── Entidades del manifiesto vs esquema real ───────────────────── */
    const { data } = await sb.rpc('fab_tablas_existentes', {
      p_nombres: propiasManifiesto,
    })
    const enEsquema = new Set(((data ?? []) as { tabla: string }[]).map((r) => r.tabla))
    for (const t of propiasManifiesto) {
      if (!enEsquema.has(t)) {
        out.push({
          sector: clave,
          campo: `entidades_propias.${t}`,
          censo: '—',
          real: 'no existe en la base',
          sentido: 'censo→real',
          gravedad: 'error',
        })
      }
    }

    /* ── Pantallas ──────────────────────────────────────────────────── */
    // Se compara la CANTIDAD, no las rutas: el censo nunca guardó rutas. Es
    // una comparación más débil y se dice, en vez de aparentar precisión.
    const propias = m.pantallas.filter((p) => p.pertenencia !== 'prestada').length
    if (s.pantallas !== propias) {
      out.push({
        sector: clave,
        campo: 'pantallas',
        censo: `${s.pantallas}`,
        real: `${propias} propias en el manifiesto`,
        sentido: 'real→censo',
        gravedad: 'aviso',
        correccion: { campo: 'pantallas', valor: propias },
      })
    }

    /* ── Acciones del asistente ─────────────────────────────────────── */
    if (s.acciones_chat !== m.acciones.length) {
      out.push({
        sector: clave,
        campo: 'acciones_chat',
        censo: `${s.acciones_chat}`,
        real: `${m.acciones.length}`,
        sentido: 'real→censo',
        gravedad: 'aviso',
        correccion: { campo: 'acciones_chat', valor: m.acciones.length },
      })
    }

    /* ── Dependencias ───────────────────────────────────────────────── */
    const depsCenso = (s.depende_de ?? []).filter((d) => d !== '*')
    const { soloA: depSoloCenso, soloB: depSoloManifiesto } = diferencia(
      depsCenso,
      m.depende_de,
    )
    if (depSoloCenso.length > 0 || depSoloManifiesto.length > 0) {
      out.push({
        sector: clave,
        campo: 'depende_de',
        censo: depsCenso.join(', ') || '—',
        real: m.depende_de.join(', ') || '—',
        sentido: 'real→censo',
        gravedad: 'aviso',
        correccion: { campo: 'depende_de', valor: [...m.depende_de].sort() },
      })
    }
  }

  /* ── Sentido inverso: sectores del censo sin manifiesto ───────────── */
  // No es una contradicción: es cobertura. Se informa aparte para que no se
  // confunda "todavía no declarado" con "declarado mal".
  return out
}

/** Sectores censados que todavía no tienen manifiesto. Cobertura, no error. */
export function sinDeclarar(censo: SectorCenso[]): SectorCenso[] {
  return censo.filter((s) => !MANIFIESTOS[s.clave])
}

/** Las correcciones a aplicar sobre `fab_censo_sectores`, agrupadas por sector. */
export function correcciones(
  contradicciones: Contradiccion[],
): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>()
  for (const c of contradicciones) {
    if (!c.correccion) continue
    const actual = out.get(c.sector) ?? {}
    actual[c.correccion.campo] = c.correccion.valor
    out.set(c.sector, actual)
  }
  return out
}

/** Resumen en una línea, para el portal y para la consola. */
export function resumir(contradicciones: Contradiccion[]): string {
  if (contradicciones.length === 0) return 'El censo coincide con los manifiestos.'
  const errores = contradicciones.filter((c) => c.gravedad === 'error').length
  const avisos = contradicciones.length - errores
  const partes: string[] = []
  if (errores > 0) partes.push(`${errores} ${errores === 1 ? 'contradicción' : 'contradicciones'}`)
  if (avisos > 0) partes.push(`${avisos} ${avisos === 1 ? 'diferencia menor' : 'diferencias menores'}`)
  return partes.join(' y ') + '.'
}

export type { Manifiesto }
