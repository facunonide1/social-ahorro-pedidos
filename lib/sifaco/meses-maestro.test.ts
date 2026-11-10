import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MESES_MAESTRO } from './columnas'
import { normalizarFila } from './fila'
import {
  esMesesDelMaestro,
  fraseMeses,
  parsearEtiquetaMes,
  resolverMesesMaestro,
} from './meses-maestro'

/** oct26 .. nov25, el orden del maestro de Guzmán del 09/11/2026. */
const OCT_A_NOV = [
  'oct26', 'sep26', 'ago26', 'jul26', 'jun26', 'may26',
  'abr26', 'mar26', 'feb26', 'ene26', 'dic25', 'nov25',
]

/** jul26 .. ago25, el export de agosto. */
const JUL_A_AGO = [
  'jul26', 'jun26', 'may26', 'abr26', 'mar26', 'feb26',
  'ene26', 'dic25', 'nov25', 'oct25', 'sep25', 'ago25',
]

const PERIODOS_NOV = [
  '2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05',
  '2026-04', '2026-03', '2026-02', '2026-01', '2025-12', '2025-11',
]

function filaDe(celdas: Record<number, unknown>): unknown[] {
  const f: unknown[] = Array(68).fill(null)
  for (const [k, v] of Object.entries(celdas)) f[Number(k)] = v
  return f
}

function encabezado(meses: string[], este: unknown = 'este'): unknown[] {
  const f = filaDe({ 0: 'descrip', 1: este })
  meses.forEach((m, i) => { f[2 + i] = m })
  return f
}

test('el maestro del 09/11/2026 etiqueta oct26..nov25 y este es nov26', () => {
  const filas = [
    encabezado(OCT_A_NOV, '10/26'),
    filaDe({ 0: '*** 09/11/26 ***', 24: 9999999 }),
    filaDe({ 0: 'Mes En Curso: 10/26 (Ventas mes)' }),
  ]
  const m = resolverMesesMaestro(filas)

  assert.equal(m.origen, 'encabezado')
  assert.equal(m.coherente, true)
  assert.equal(m.fechaArchivo, '2026-11-09')
  assert.deepEqual(m.este, { campo: 'nov26', periodo: '2026-11', parcial: true })
  assert.deepEqual(m.cerrados.map((c) => c.campo), OCT_A_NOV)
  assert.deepEqual(m.cerrados.map((c) => c.periodo), PERIODOS_NOV)
  assert.equal(m.cerrados.every((c) => c.parcial === false), true)
  assert.match(fraseMeses(m), /nov26/)
  assert.match(fraseMeses(m), /oct26/)
  assert.match(fraseMeses(m), /nov25/)
})

test('la leyenda «Mes En Curso: 10/26» no corre los meses cuando no hay encabezado', () => {
  const m = resolverMesesMaestro([
    filaDe({ 0: '*** 09/11/26 ***' }),
    filaDe({ 0: 'Mes En Curso: 10/26 (Ventas mes)' }),
  ])
  assert.equal(m.origen, 'fecha')
  assert.equal(m.este.periodo, '2026-11')
  assert.equal(m.cerrados[0].periodo, '2026-10')
  assert.equal(m.cerrados[11].periodo, '2025-11')
})

test('el export de agosto sigue siendo jul26..ago25, con ago25 parcial', () => {
  const m = resolverMesesMaestro([
    encabezado(JUL_A_AGO),
    filaDe({ 0: '*** 28/08/26 ***', 24: 9999999 }),
  ])
  assert.equal(m.origen, 'encabezado')
  assert.equal(m.coherente, true)
  assert.equal(m.fechaArchivo, '2026-08-28')
  assert.deepEqual(m.este, { campo: 'ago26', periodo: '2026-08', parcial: true })
  assert.deepEqual(
    m.cerrados.map(({ campo, periodo, parcial }) => ({ campo, periodo, parcial })),
    MESES_MAESTRO.map(({ campo, periodo, parcial }) => ({ campo, periodo, parcial })),
  )
})

test('si el encabezado y la fecha no coinciden, ganan las columnas', () => {
  const m = resolverMesesMaestro([
    encabezado(OCT_A_NOV),
    filaDe({ 0: '*** 09/10/26 ***' }),
  ])
  assert.equal(m.coherente, false)
  assert.equal(m.origen, 'encabezado')
  assert.equal(m.este.periodo, '2026-11')
  assert.equal(m.fechaArchivo, '2026-10-09')
  assert.match(fraseMeses(m), /columnas/)
})

test('un encabezado que no es una serie se ignora y se usa la fecha', () => {
  const roto = [...OCT_A_NOV]
  roto[3] = 'jul26'
  roto[4] = 'jul26'
  const m = resolverMesesMaestro([
    encabezado(roto),
    filaDe({ 0: '*** 09/11/26 16:49:47 ***' }),
  ])
  assert.equal(m.origen, 'fecha')
  assert.equal(m.este.campo, 'nov26')
  assert.equal(m.fechaArchivo, '2026-11-09')
})

test('la fecha puede ir antes del encabezado', () => {
  const m = resolverMesesMaestro([
    filaDe({ 0: '*** 09/11/26 ***' }),
    encabezado(OCT_A_NOV.map((x) => x.toUpperCase())),
  ])
  assert.equal(m.origen, 'encabezado')
  assert.equal(m.cerrados[0].campo, 'oct26')
  assert.equal(m.coherente, true)
})

test('sin nombres ni fecha quedan los meses de agosto, y se dice', () => {
  const m = resolverMesesMaestro([
    filaDe({ 0: 'IBUPROFENO 600', 24: 4242 }),
  ])
  assert.equal(m.origen, 'constante')
  assert.equal(m.fechaArchivo, null)
  assert.equal(m.cerrados[0].campo, 'jul26')
  assert.equal(m.cerrados[11].campo, 'ago25')
  assert.equal(m.cerrados[11].parcial, true)
  assert.match(fraseMeses(m), /agosto de 2026/)
})

test('etiquetas sueltas: variantes de mes, y lo que no es un mes', () => {
  assert.deepEqual(parsearEtiquetaMes('OCT-26'), { campo: 'oct26', periodo: '2026-10' })
  assert.deepEqual(parsearEtiquetaMes('10/26'), { campo: 'oct26', periodo: '2026-10' })
  assert.deepEqual(parsearEtiquetaMes('set26'), { campo: 'sep26', periodo: '2026-09' })
  assert.deepEqual(parsearEtiquetaMes('vta_nov25'), { campo: 'nov25', periodo: '2025-11' })
  assert.equal(parsearEtiquetaMes('09/11/26'), null)
  assert.equal(parsearEtiquetaMes('Mes En Curso: 10/26'), null)
  assert.equal(parsearEtiquetaMes(''), null)
  assert.equal(parsearEtiquetaMes(10), null)
})

test('normalizar una fila no mueve ninguna otra columna', () => {
  const cruda = filaDe({
    0: 'IBUPROFENO',
    1: 7,
    2: 100,
    13: 13,
    14: 50,
    15: 3,
    16: 2,
    17: 1000,
    18: 400,
    19: 60,
    20: 21,
    21: 10,
    22: 1200,
    24: 4242,
    25: '779',
    39: 'aux',
    40: 'g',
    41: 'vl',
    43: 'od',
    57: 'var',
    58: 'marca',
    63: 'uni',
  })
  const n = normalizarFila(cruda, 5, 'tal-cual')
  assert.ok(n)
  assert.equal(n.fila, 5)
  assert.equal(n.codigo, '4242')
  assert.equal(n.descrip, 'IBUPROFENO')
  assert.equal(n.vta_este, 7)
  assert.deepEqual(n.vta_meses, [100, null, null, null, null, null, null, null, null, null, null, 13])
  assert.equal(n.stock, 50)
  assert.equal(n.pun_ped, 3)
  assert.equal(n.st_min, 2)
  assert.equal(n.prec_vta, 1000)
  assert.equal(n.costo, 400)
  assert.equal(n.margen, 60)
  assert.equal(n.iva_prod, 21)
  assert.equal(n.utilidad, 10)
  assert.equal(n.publico, 1200)
  assert.equal(n.barras, '779')
  assert.deepEqual(n.extra, {
    aux1: 'aux', gcom: 'g', vl: 'vl', od: 'od',
    varios: 'var', marca_3: 'marca', unine_3: 'uni',
  })
  assert.equal('meses' in n, false)
})

test('lo que se guarda con la importación tiene que tener doce meses', () => {
  const m = resolverMesesMaestro([
    encabezado(OCT_A_NOV),
    filaDe({ 0: '*** 09/11/26 ***' }),
  ])
  assert.equal(esMesesDelMaestro(m), true)
  assert.equal(esMesesDelMaestro({ ...m, cerrados: m.cerrados.slice(0, 11) }), false)
  assert.equal(esMesesDelMaestro(null), false)
})
