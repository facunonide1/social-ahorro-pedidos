import { coberturaDe, type Veredicto } from './cobertura-lector'
import { defectos } from './defectos'
import { estadoDelLector, type EstadoLector } from './flag'
import { overridesActuales } from './overrides'
import { resumenCableado, revisarCableado, type RevisionDeParametro } from './cableado'
import { versionActual } from './versiones'

/**
 * EL ESTADO REAL DE LA FÁBRICA.
 *
 * ── POR QUÉ HACE FALTA UNA FOTO ─────────────────────────────────────────────
 *
 * Diecisiete indicadores mintieron, arreglados en seis sesiones distintas. Cada
 * arreglo cambió lo que significaba un número, y los números viven repartidos
 * en cinco pantallas. Sin una foto que los junte con el mismo criterio, la
 * pregunta "¿dónde está todo?" se contesta sumando de memoria — que es la forma
 * más barata de volver a creerle a un número viejo.
 *
 * ── LAS DOS REGLAS QUE ORDENAN ESTA PANTALLA ────────────────────────────────
 *
 * DENOMINADOR HONESTO. Nunca "1 de 23". Lo revisado y lo que no se pudo revisar
 * se cuentan por separado, siempre, y lo segundo se muestra igual de grande.
 *
 * LO QUE NO SE PUEDE AFIRMAR ES PARTE DEL ESTADO. Una lista de límites conocidos
 * no es una nota al pie: es la mitad de la foto. Un sistema que sólo muestra lo
 * que verificó se lee como si lo hubiera verificado todo.
 */

export interface EstadoDePool {
  clave: string
  nombre: string
  lector: EstadoLector
  formato: string | null
  version: number | null
  /** Pantallas gobernables y cuántas verificaron contra el código. */
  pantallas: { gobernables: number; verificadas: number; veredicto: Veredicto; motivo?: string }
  diferencias: number
  fallbacks: number
  /** Parámetros, con el denominador partido. */
  parametros: {
    total: number
    gobernados: number
    completos: number
    parciales: number
    sinCablear: number
    sinDeclarar: number
    sinConsumo: number
    conBrecha: number
    conflictos: number
    sensibles: number
  }
  /** Lo que la pieza HACE y no se puede configurar. Desde 1.8.0 no son parámetros. */
  hechos: number
  /** Overrides de este proyecto sobre la pieza. */
  overrides: number
  defectosAbiertos: number
  brechas: number
}

export async function estadoDeLaFabrica(proyectoId: string): Promise<{
  pools: EstadoDePool[]
  revisiones: RevisionDeParametro[]
}> {
  const estados = await estadoDelLector(proyectoId, { conAdmin: true })
  const todosLosDefectos = await defectos({ soloAbiertos: true })

  const manifiestos: { clave: string; manifiesto: import('./tipos').Manifiesto }[] = []
  const pools: EstadoDePool[] = []

  for (const e of estados) {
    const version = await versionActual(e.clave)
    const m = version?.manifiesto ?? null
    if (m) manifiestos.push({ clave: e.clave, manifiesto: m })

    const propios = await overridesActuales(e.instalacionId)
    const cob = await coberturaDe(proyectoId, e.clave, e.lector, { conAdmin: true })
    const revs = m ? revisarCableado([{ clave: e.clave, manifiesto: m }]) : []
    const r = resumenCableado(revs)

    pools.push({
      clave: e.clave,
      nombre: m?.nombre ?? e.nombre,
      lector: e.lector,
      formato: m?.formato ?? null,
      version: version?.numero ?? null,
      pantallas: {
        gobernables: cob.gobernables,
        verificadas: cob.verificadas,
        veredicto: cob.veredicto,
        motivo: cob.motivo,
      },
      diferencias: e.diferencias,
      fallbacks: e.fallbacks,
      parametros: {
        total: (m?.configurable ?? []).length,
        gobernados: r.gobernados,
        completos: r.completos,
        parciales: r.parciales,
        sinCablear: r.sinCablear,
        sinDeclarar: r.sinDeclarar,
        sinConsumo: r.sinConsumo,
        conflictos: r.conflictosDeFuente,
        conBrecha: r.conBrecha,
        sensibles: (m?.configurable ?? []).filter((c) => c.peso === 'sensible').length,
      },
      hechos: (m?.hechos ?? []).length,
      // Se cuentan las CLAVES de override, no los objetos: `titulos` con tres
      // rutas son tres decisiones, no una.
      overrides: Object.values(propios?.overrides ?? {}).reduce(
        (a, v) => a + (Array.isArray(v) ? v.length : typeof v === 'object' && v ? Object.keys(v).length : 1),
        0,
      ),
      defectosAbiertos: todosLosDefectos.filter((d) => d.poolClave === e.clave).length,
      brechas: (m?.agentes ?? []).reduce(
        (a, ag) => a + ag.acciones.filter((x) => x.brecha).length,
        0,
      ),
    })
  }

  return { pools, revisiones: revisarCableado(manifiestos) }
}

/**
 * QUÉ GOBIERNA LA FÁBRICA HOY, EN UNA LÍNEA.
 *
 * Se calcula, no se escribe. Y no se redondea para arriba: si el número da
 * vergüenza, se publica igual — es el que hay, y publicarlo es lo único que
 * hace que suba por trabajo y no por redacción.
 *
 * Cuenta SÓLO lo que gobierna de verdad: un parámetro con brecha, uno sensible,
 * un hecho o un conflicto de fuente no cuentan. Durante cuatro sesiones el
 * sistema dijo "23 parámetros gobernados" y gobernaba 2.
 */
export function laCifra(pools: EstadoDePool[]): string {
  const prendidos = pools.filter((p) => p.lector === 'prendido')
  const pantallas = prendidos.reduce((a, p) => a + p.pantallas.gobernables, 0)
  const gobernados = pools.reduce((a, p) => a + p.parametros.completos, 0)
  const parametros = pools.reduce((a, p) => a + p.parametros.total + p.hechos, 0)
  return (
    `Presentación en ${prendidos.length} de ${pools.length} pools ` +
    `(${pantallas} pantallas) · ${gobernados} parámetros de ${parametros}`
  )
}

/* ── Lo que NO se puede afirmar ──────────────────────────────────────────── */

export interface Limite {
  que: string
  porque: string
  /** Qué haría falta para poder afirmarlo. */
  paraPoder: string
}

/**
 * Los límites conocidos del sistema, escritos a mano y a propósito.
 *
 * No se derivan de los datos: son afirmaciones sobre lo que el mecanismo NO
 * puede hacer, y eso no se puede calcular desde adentro. Cada uno salió de un
 * hallazgo o de una limitación que ya se probó en la práctica.
 *
 * Si alguna deja de ser cierta, se saca de acá. Una lista de límites vieja es
 * tan mala como un indicador viejo.
 */
export const LO_QUE_NO_SE_PUEDE_AFIRMAR: Limite[] = [
  {
    que: 'Que un título declarado sea el que la pantalla muestra, sin abrirla.',
    porque:
      'El literal vive dentro del componente y sólo se conoce al renderizar. La verificación provocada contesta "¿la declaración resuelve?", no "¿coincide con lo que se ve?".',
    paraPoder: 'Que alguien abra la pantalla con el lector en sombra, o leer el literal del código como hace el comparador de piezas.',
  },
  {
    que: 'Que un parámetro esté cableado en todos los lugares donde se usa.',
    porque:
      'Se verifica contra `depende_de`, que es una lista escrita por una persona. Si esa lista está incompleta, la verificación da verde sobre lo que no miró.',
    paraPoder: 'Un detector que entienda el código en vez de buscar texto. Hoy hay uno que busca identificadores exactos y lo dice.',
  },
  {
    que: 'Que un parámetro "revisado y no consumido" de verdad no se use en ninguna parte.',
    porque:
      'Se buscó la clave literal y anclas por concepto. Un consumo escrito de otra forma se escapa; se declara "no consumido" y no "verificado que no existe".',
    paraPoder: 'Lo mismo que arriba: análisis del código, no búsqueda de texto.',
  },
  {
    que: 'Que cambiar un parámetro tenga el efecto que dice el impacto.',
    porque:
      'El efecto se estima con un estimador escrito a mano por parámetro, y hoy hay uno solo. Para el resto la respuesta es "no sé cómo calcularlo".',
    paraPoder: 'Un estimador por parámetro, o aceptar que para la mayoría no se puede y decirlo cada vez.',
  },
  {
    que: 'Que el efecto medido se vea en la pantalla.',
    porque:
      'Los dos parámetros gobernados se miden sobre datos que hoy no existen: 26 vencimientos y los 26 son es_demo; 0 filas de historial de precios.',
    paraPoder: 'Datos reales cargados por el negocio. La fábrica sólo lee: cargarlos para que una prueba dé lindo sería falsear el resultado.',
  },
  {
    que: 'Que un diff viejo describa lo que su propuesta hizo.',
    porque:
      'Hasta v0.70 el diferenciador cubría menos aspectos. 12 de 12 propuestas tienen versión desconocida y 3 tienen el diff vacío sobre un cambio real.',
    paraPoder: 'Nada: el historial no se reescribe. Lo que se puede es saber con qué versión se calculó, y desde v0.70 se sabe.',
  },
  {
    que: 'Que el carril verde funcione en producción.',
    porque:
      'El mecanismo está probado con el interruptor prendido a mano, nunca con una propuesta que haya caído en verde sola: no hay ningún parámetro inocuo en un pool prendido.',
    paraPoder: 'Un inocuo en un pool prendido, y encender el interruptor de ese tipo de campo.',
  },
]
