/**
 * QUÉ SE VERIFICA ANTES DE ACEPTAR UN MAESTRO.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ─────────────────────────────────────────────
 *
 * Dos veces nos engañó el mismo archivo. `pla_3d_24` traía un solo valor en
 * `NOM_GRU` —«Farmacia Normal»— y se tomó como el catálogo completo: era un
 * export filtrado por grupo. Y `ago25` entró como mes normal con 3.509 unidades
 * contra 28.000 de los demás, que no era un mes flojo sino un mes cortado.
 *
 * Las dos veces el archivo no estaba roto. Estaba incompleto, y un archivo
 * incompleto se lee igual que uno completo: por eso no se nota.
 *
 * ── LA DISTINCIÓN QUE ORDENA TODO ───────────────────────────────────────────
 *
 * `corta`  el archivo no entra. Cargarlo dejaría datos que afirman algo falso.
 * `avisa`  entra, y queda escrito qué hay que mirar. Un aviso no es un defecto:
 *          «el valor subió 72%» puede ser un hallazgo y no un error.
 * `pasa`   se miró y está bien.
 *
 * Lo que NUNCA hace: decidir por el que importa. Un aviso se muestra y la
 * persona aplica o no. Lo único que decide solo es el `corta`, y corta por
 * cosas que no son opinables: falta una columna, el archivo está vacío.
 */

import { COLUMNAS_OBLIGATORIAS, periodosDelArchivo, resolverColumnas } from './columnas-sucursales'

export type Nivel = 'pasa' | 'avisa' | 'corta'

export interface Chequeo {
  clave: string
  titulo: string
  nivel: Nivel
  /** Qué se vio. Una frase, en castellano, sin jerga. */
  dice: string
  /** Qué hacer si avisa o corta. Null cuando pasa. */
  queHacer: string | null
}

export interface DatosParaVerificar {
  /** La fila 0 del archivo, tal como vino. */
  encabezados: unknown[]
  /** Cuántas filas de datos trae. */
  filas: number
  /** La fecha del archivo, no la de importación. */
  fechaArchivo: string | null
  /** Valores distintos de NOM_GRU y cuántas filas tiene cada uno. */
  gruposNomGru: { valor: string; filas: number }[]
  /** El valor al costo que da este archivo. */
  valorCosto: number | null
  /** Códigos que aparecen más de una vez, con cuántas veces. */
  duplicados: { codigo: string; veces: number }[]
  /** La importación anterior del mismo tipo, para comparar. Null si es la primera. */
  anterior: { filas: number; valorCosto: number | null; fechaArchivo: string | null } | null
}

/** Cuánto puede cambiar la cantidad de filas sin que valga la pena avisar. */
const TOLERANCIA_FILAS = 0.1
/** Lo mismo para el valor al costo. Seis semanas de inflación mueven bastante. */
const TOLERANCIA_VALOR = 0.15

function pct(a: number, b: number): number {
  if (!b) return a ? Infinity : 0
  return (a - b) / b
}

function comoPct(x: number): string {
  if (!Number.isFinite(x)) return 'de cero a algo'
  return `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)}%`
}

export function verificarMaestro(d: DatosParaVerificar): Chequeo[] {
  const r: Chequeo[] = []

  // ── 1 · LAS COLUMNAS ──────────────────────────────────────────────────────
  const mapa = resolverColumnas(d.encabezados)
  if (mapa.faltan.length) {
    r.push({
      clave: 'columnas',
      titulo: 'Faltan columnas',
      nivel: 'corta',
      dice: `El archivo no trae ${mapa.faltan.length} de las ${COLUMNAS_OBLIGATORIAS.length} columnas necesarias: ${mapa.faltan.join(', ')}.`,
      queHacer: 'Volvé a exportar de SIFACO con todas las columnas. Si falta el stock de una sucursal y se carga igual, esa sucursal queda en cero — y cero quiere decir «lo miré y no hay».',
    })
  } else {
    r.push({
      clave: 'columnas',
      titulo: 'Las columnas están',
      nivel: 'pasa',
      dice: `Están las ${COLUMNAS_OBLIGATORIAS.length} columnas necesarias${mapa.deMas.length ? `, y ${mapa.deMas.length} más que el archivo trae y nosotros no usamos` : ''}.`,
      queHacer: null,
    })
  }

  // ── 2 · QUE TENGA FILAS ───────────────────────────────────────────────────
  if (d.filas <= 0) {
    r.push({
      clave: 'vacio', titulo: 'El archivo está vacío', nivel: 'corta',
      dice: 'No tiene ni una fila de datos.',
      queHacer: 'Revisá el export: puede haber salido con un filtro que no deja pasar nada.',
    })
  }

  // ── 3 · ¿VIENE FILTRADO? ──────────────────────────────────────────────────
  //
  // Un solo valor en NOM_GRU es la señal que ya nos engañó dos veces. No prueba
  // que esté filtrado —puede ser que la cadena tenga un solo grupo— y por eso
  // avisa en vez de cortar. Pero se dice, y se dice fuerte.
  const grupos = d.gruposNomGru.filter((g) => g.valor.trim() !== '')
  if (grupos.length === 1) {
    r.push({
      clave: 'filtrado',
      titulo: 'Puede venir filtrado por grupo',
      nivel: 'avisa',
      dice: `Las ${d.filas.toLocaleString('es-AR')} filas dicen el mismo grupo: «${grupos[0].valor}». Esto ya nos engañó dos veces: un export filtrado se lee igual que el catálogo completo.`,
      queHacer: 'En SIFACO, verificá si hay otros grupos además de ése. Si hay, este archivo es una parte del catálogo y no el catálogo: lo que falte NO está dado de baja, está afuera del export.',
    })
  } else if (grupos.length === 0) {
    r.push({
      clave: 'filtrado', titulo: 'Sin grupo declarado', nivel: 'avisa',
      dice: 'Ninguna fila declara grupo, así que no se puede saber si el archivo está filtrado.',
      queHacer: 'No es un error del archivo: es una verificación que no se puede hacer. Queda anotado.',
    })
  } else {
    r.push({
      clave: 'filtrado', titulo: 'Trae más de un grupo', nivel: 'pasa',
      dice: `Hay ${grupos.length} grupos distintos: no parece un export filtrado.`,
      queHacer: null,
    })
  }

  // ── 4 · CUÁNTAS FILAS, CONTRA LA IMPORTACIÓN ANTERIOR ─────────────────────
  if (!d.anterior) {
    r.push({
      clave: 'filas', titulo: 'Es la primera importación', nivel: 'pasa',
      dice: `Trae ${d.filas.toLocaleString('es-AR')} filas. No hay con qué compararla.`,
      queHacer: null,
    })
  } else {
    const dif = pct(d.filas, d.anterior.filas)
    const menos = d.filas < d.anterior.filas
    r.push({
      clave: 'filas',
      titulo: menos && Math.abs(dif) > TOLERANCIA_FILAS ? 'Trae bastante menos filas' : 'La cantidad de filas',
      nivel: Math.abs(dif) > TOLERANCIA_FILAS ? 'avisa' : 'pasa',
      dice: `${d.filas.toLocaleString('es-AR')} filas contra ${d.anterior.filas.toLocaleString('es-AR')} de la importación anterior (${comoPct(dif)}).`,
      queHacer: Math.abs(dif) > TOLERANCIA_FILAS
        ? (menos
            ? 'Un archivo con menos productos puede ser una limpieza real o un export cortado. Los productos que no vengan NO se dan de baja: quedan como estaban y se listan aparte.'
            : 'Más productos que antes. Si el salto es grande, puede que el export anterior viniera filtrado.')
        : null,
    })
  }

  // ── 5 · CUÁNTO CAMBIÓ EL VALOR ────────────────────────────────────────────
  if (d.valorCosto === null) {
    r.push({
      clave: 'valor', titulo: 'No se puede calcular el valor', nivel: 'avisa',
      dice: 'El archivo no trae costo, o no se pudo leer.',
      queHacer: 'El stock se puede importar igual; lo que no se va a poder es decir cuánta plata hay.',
    })
  } else if (!d.anterior || d.anterior.valorCosto === null) {
    r.push({
      clave: 'valor', titulo: 'El valor al costo', nivel: 'pasa',
      dice: `Da $${Math.round(d.valorCosto).toLocaleString('es-AR')}. No hay anterior con qué compararlo.`,
      queHacer: null,
    })
  } else {
    const dif = pct(d.valorCosto, d.anterior.valorCosto)
    const salto = Math.abs(dif) > TOLERANCIA_VALOR
    r.push({
      clave: 'valor',
      titulo: salto ? 'El valor al costo saltó' : 'El valor al costo',
      nivel: salto ? 'avisa' : 'pasa',
      dice: `$${Math.round(d.valorCosto).toLocaleString('es-AR')} contra $${Math.round(d.anterior.valorCosto).toLocaleString('es-AR')} (${comoPct(dif)}).`,
      queHacer: salto
        ? 'Un salto así puede ser tres cosas distintas: productos nuevos, costos que subieron, o que el archivo anterior viniera incompleto. Son explicaciones distintas con consecuencias distintas: la comparación producto por producto está en el detalle de la importación.'
        : null,
    })
  }

  // ── 6 · LOS CÓDIGOS DUPLICADOS ────────────────────────────────────────────
  if (d.duplicados.length) {
    r.push({
      clave: 'duplicados',
      titulo: 'Códigos repetidos',
      nivel: 'avisa',
      dice: `${d.duplicados.length} códigos aparecen más de una vez: ${d.duplicados.slice(0, 5).map((x) => `${x.codigo} (${x.veces})`).join(', ')}${d.duplicados.length > 5 ? '…' : ''}.`,
      queHacer: 'Se carga la primera aparición y las otras quedan listadas, sin pisar nada en silencio. Si son dos productos distintos con el mismo código, hay que arreglarlo en SIFACO.',
    })
  } else {
    r.push({
      clave: 'duplicados', titulo: 'Sin códigos repetidos', nivel: 'pasa',
      dice: 'Cada código aparece una sola vez.', queHacer: null,
    })
  }

  // ── 7 · LA FECHA DEL ARCHIVO Y LOS MESES QUE DICE TRAER ────────────────────
  if (!d.fechaArchivo) {
    r.push({
      clave: 'fecha', titulo: 'Sin fecha del archivo', nivel: 'avisa',
      dice: 'No se pudo determinar de qué día es el archivo.',
      queHacer: 'Hay que ponerla a mano. Sin eso, todas las pantallas van a decir «no se sabe de cuándo es este dato», que es lo correcto pero es peor que saberlo.',
    })
  } else {
    const malos = periodosDelArchivo(d.fechaArchivo).filter((p) => !p.coherente)
    r.push({
      clave: 'fecha',
      titulo: malos.length ? 'Los meses no cierran con la fecha' : 'La fecha del archivo',
      nivel: malos.length ? 'corta' : 'pasa',
      dice: malos.length
        ? `El archivo dice ser del ${d.fechaArchivo}, pero las columnas de mes no caen donde deberían: ${malos.map((m) => `${m.sufijo}→${m.periodo}`).join(', ')}.`
        : `Es del ${d.fechaArchivo}, y los cuatro meses que trae caen donde tienen que caer.`,
      queHacer: malos.length
        ? 'Corregí la fecha del archivo, o verificá de qué meses son esas columnas. Cargar cuatro meses de ventas en los períodos equivocados es peor que no cargarlos.'
        : null,
    })
  }

  return r
}

/** El veredicto: si hay un solo `corta`, el archivo no entra. */
export function veredicto(chequeos: Chequeo[]): { entra: boolean; cortes: number; avisos: number } {
  const cortes = chequeos.filter((c) => c.nivel === 'corta').length
  const avisos = chequeos.filter((c) => c.nivel === 'avisa').length
  return { entra: cortes === 0, cortes, avisos }
}
