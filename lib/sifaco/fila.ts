/**
 * UNA FILA DEL ARCHIVO → UNA FILA DE LA PILA DE ORIGEN.
 *
 * Vive fuera de `parseo-cliente.ts` —que es `'use client'`— porque la usan dos:
 * la pantalla, cuando alguien sube el archivo desde el navegador, y el script
 * de carga inicial, que corre en una terminal contra la base.
 *
 * Es la misma función en los dos casos a propósito. Dos normalizadores que
 * hacen «lo mismo» se separan en la tercera corrección y nadie se entera hasta
 * que el catálogo tiene dos versiones de la verdad.
 */

import { arreglarTexto } from './codificacion'
import {
  MESES_MAESTRO,
  fechaSifaco, numeroSifaco, codigoSifaco, esFilaDeEncabezado,
} from './columnas'

export type Fila = Record<string, unknown>

/**
 * Los campos de texto pasan por `arreglarTexto`; los numéricos por
 * `numeroSifaco`; las fechas por `fechaSifaco`. Lo que no tiene columna propia
 * va a `extra`, para no perder nada de las 68.
 *
 * Con los archivos ya convertidos a CSV UTF-8, `arreglarTexto` con el candidato
 * `tal-cual` no toca nada — y sigue estando porque el día que vuelva a entrar
 * un .xls crudo, entra por acá.
 */
export function normalizarFila(cruda: unknown[], fila: number, cod: string): Fila | null {
  const T = (i: number) => arreglarTexto(cruda[i], cod)
  const N = (i: number) => numeroSifaco(cruda[i])
  const F = (i: number) => fechaSifaco(cruda[i])

  const codigo = codigoSifaco(cruda[24])
  const descrip = T(0)
  if (!codigo) return null
  if (esFilaDeEncabezado(codigo, descrip)) return null

  // Los doce meses cerrados, del más nuevo al más viejo. El índice 2 es jul26.
  const vtaMeses = MESES_MAESTRO.map((_, k) => N(2 + k))

  return {
    fila,
    codigo,
    descrip,
    barras: T(25),
    barras2: T(26),
    registro: T(27),
    vta_este: N(1),
    vta_meses: vtaMeses,
    stock: N(14), pun_ped: N(15), st_min: N(16),
    prec_vta: N(17), costo: N(18), margen: N(19),
    iva_prod: N(20), utilidad: N(21), publico: N(22),
    fec_actu: F(23),
    categoria: T(28), num_lab: T(29), nom_lab: T(30),
    num_depto: T(31), nom_depto: T(32), iva_depto: N(33),
    num_grupo: T(34), nom_grupo: T(35), rubro: T(36),
    ubic: T(37), seccion: T(38),
    ult_vta: F(44), ult_cpa: F(45), fec_alta: F(46),
    prod_nom: T(47), prod_pres: T(48), descripx: T(49),
    droga: T(50), familia: T(51), forma: T(52),
    potencia: T(53), uni_pot: T(54), unidades: N(55), tip_uni: T(56),
    psi: T(42),
    pami: T(59), pre_pami: N(60), ioma: T(61), dmv_30: N(62),
    categ_3: T(64), segme_3: T(65), ssegm_3: T(66), ppedir: N(67),
    extra: {
      aux1: T(39), gcom: T(40), vl: T(41), od: T(43),
      varios: T(57), marca_3: T(58), unine_3: T(63),
    },
  }
}
