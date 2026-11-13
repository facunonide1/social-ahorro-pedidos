import { test } from 'node:test'
import assert from 'node:assert/strict'

import { elegirLote, liberarTrabado, lockVencido, maestroSinBajar, quedaTiempo, tramoDePlanilla } from './cola'
import { clasificar } from './clasificar'
import { fechaDeLista, fechaEnTexto } from './fecha-lista'
import { cronAutorizado } from './cron-auth'
import { LOCK_MS, MAX_INTENTOS, carpetasDeCompras } from './flag'

const AHORA = new Date('2026-11-12T17:00:00Z')

// ── El lock con vencimiento ────────────────────────────────────────────────

test('«procesando» con el lock vigente no se toca; vencido, se libera', () => {
  const vigente = { estado: 'procesando', intentos: 1, proximo_intento_at: '2026-11-12T17:04:00Z', updated_at: null }
  const vencido = { ...vigente, proximo_intento_at: '2026-11-12T16:59:59Z' }
  assert.equal(lockVencido(vigente, AHORA, LOCK_MS), false)
  assert.equal(lockVencido(vencido, AHORA, LOCK_MS), true)
  assert.equal(lockVencido({ ...vencido, estado: 'pendiente' }, AHORA, LOCK_MS), false)
})

test('el trabado desde las 16:36 (fila vieja, sin lock) se libera por updated_at', () => {
  const viejo = { estado: 'procesando', intentos: 1, proximo_intento_at: null, updated_at: '2026-11-12T16:36:00Z' }
  assert.equal(lockVencido(viejo, AHORA, LOCK_MS), true)
  const reciente = { ...viejo, updated_at: '2026-11-12T16:58:00Z' }
  assert.equal(lockVencido(reciente, AHORA, LOCK_MS), false, 'dos minutos: puede estar corriendo de verdad')
})

test('liberado vuelve a la cola, y gastados los intentos va a error con el motivo', () => {
  assert.equal(liberarTrabado({ estado: 'procesando', intentos: 1, proximo_intento_at: null, updated_at: null }, MAX_INTENTOS).estado, 'pendiente')
  const r = liberarTrabado({ estado: 'procesando', intentos: MAX_INTENTOS, proximo_intento_at: null, updated_at: null }, MAX_INTENTOS)
  assert.equal(r.estado, 'error')
  assert.match(r.error, /Se cortó a mitad de camino/)
})

// ── La cola: los maestros no la bloquean ───────────────────────────────────

test('los maestros van al final y de a uno; lo demás pasa primero', () => {
  const cola = [
    { id: 'm1', clasificacion: 'maestro', bytes: 42e6, proximo_intento_at: null, created_at: '1' },
    { id: 'm2', clasificacion: 'maestro', bytes: 42e6, proximo_intento_at: null, created_at: '2' },
    { id: 'm3', clasificacion: 'maestro', bytes: 42e6, proximo_intento_at: null, created_at: '3' },
    { id: 'p1', clasificacion: 'precios', bytes: 1e5, proximo_intento_at: null, created_at: '4' },
    { id: 'pl', clasificacion: 'planilla', bytes: 2e6, proximo_intento_at: null, created_at: '5' },
  ]
  const lote = elegirLote(cola, AHORA, { maxArchivos: 4, maxMaestros: 1 })
  assert.deepEqual(lote.map((a) => a.id), ['pl', 'p1', 'm1'])
})

test('un archivo con reintento en el futuro espera', () => {
  const cola = [{ id: 'a', clasificacion: 'precios', bytes: 1, proximo_intento_at: '2026-11-12T18:00:00Z' }]
  assert.equal(elegirLote(cola, AHORA, { maxArchivos: 4, maxMaestros: 1 }).length, 0)
})

test('un maestro más pesado que el tope no se baja', () => {
  const tope = 12 * 1024 * 1024
  assert.equal(maestroSinBajar(42 * 1024 * 1024, tope), true)
  assert.equal(maestroSinBajar(5 * 1024 * 1024, tope), false)
  assert.equal(maestroSinBajar(null, tope), false)
})

// ── Por partes y con presupuesto ───────────────────────────────────────────

test('no se empieza un archivo sin tiempo para terminarlo', () => {
  assert.equal(quedaTiempo(0, 39_999, 40_000), true)
  assert.equal(quedaTiempo(0, 40_000, 40_000), false)
})

test('la planilla se hace por tramos hasta terminar', () => {
  assert.deepEqual(tramoDePlanilla(10, 0, 4), { desde: 0, hasta: 4, termina: false })
  assert.deepEqual(tramoDePlanilla(10, 4, 4), { desde: 4, hasta: 8, termina: false })
  assert.deepEqual(tramoDePlanilla(10, 8, 4), { desde: 8, hasta: 10, termina: true })
  assert.deepEqual(tramoDePlanilla(0, 0, 4), { desde: 0, hasta: 0, termina: true })
})

// ── Las carpetas de compras ────────────────────────────────────────────────

test('las dos carpetas de compras, por defecto', () => {
  assert.deepEqual(carpetasDeCompras(), ['compras farmacias', 'compras farmacias (privado)'])
})

test('en «compras farmacias» (y la privada), con subcarpetas, una planilla o un PDF es una lista', () => {
  const x = (ruta: string, nombre: string, mime: string) => clasificar({ nombre, mime, ruta: `${ruta}/${nombre}` })
  assert.equal(x('compras farmacias/Monroe', 'Monroe nov.xls', 'application/vnd.ms-excel'), 'precios')
  assert.equal(x('compras farmacias (privado)/Ceos/2026', 'ceos.pdf', 'application/pdf'), 'precios')
  // Una foto ahí es un folleto, no una factura.
  assert.equal(x('compras farmacias/Distrifarm', 'promo.jpg', 'image/jpeg'), 'sin_clasificar')
  // Lo que dice factura sigue siendo factura, y un maestro sigue siendo maestro.
  assert.equal(x('compras farmacias/facturas', 'factura 0001.pdf', 'application/pdf'), 'factura')
  assert.equal(x('compras farmacias/maestros', 'maestro guz gon.xls', 'application/vnd.ms-excel'), 'maestro')
})

test('una lista con título arriba del encabezado se reconoce por el contenido', () => {
  const c = clasificar({
    nombre: 'precios.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ruta: 'otra/precios.xlsx',
    encabezados: ['DROGUERÍA SUR', '', ''],
    filas: [['DROGUERÍA SUR'], ['Lista al 10/11/2026'], ['Código', 'Descripción', 'Precio']],
  })
  assert.equal(c, 'precios')
})

// ── La fecha de cada lista ─────────────────────────────────────────────────

test('fecha en el nombre, en formato argentino, ISO, compacta o con el mes', () => {
  assert.equal(fechaEnTexto('Monroe 10-11-2026'), '2026-11-10')
  assert.equal(fechaEnTexto('ceos 05.11.26'), '2026-11-05')
  assert.equal(fechaEnTexto('lista_2026-11-03'), '2026-11-03')
  assert.equal(fechaEnTexto('lista20261101'), '2026-11-01')
  assert.equal(fechaEnTexto('Distrifarm noviembre 2026'), '2026-11-01')
  assert.equal(fechaEnTexto('lista de precios'), null)
  assert.equal(fechaEnTexto('31-02-2026'), null, 'una fecha imposible no es fecha')
})

test('la fecha sale del nombre, después de la carpeta, después del contenido, último de Drive', () => {
  const base = { ahora: AHORA, modifiedTime: '2026-11-09T12:00:00Z' }
  assert.deepEqual(fechaDeLista({ ...base, nombre: 'Monroe 10-11-2026.xls', ruta: 'compras farmacias/Monroe/Monroe 10-11-2026.xls' }), { fecha: '2026-11-10', fuente: 'nombre' })
  assert.deepEqual(fechaDeLista({ ...base, nombre: 'monroe.xls', ruta: 'compras farmacias/Monroe/2026-11-02/monroe.xls' }), { fecha: '2026-11-02', fuente: 'ruta' })
  assert.deepEqual(fechaDeLista({ ...base, nombre: 'monroe.xls', ruta: 'compras farmacias/Monroe/monroe.xls', vigenteDesde: '2026-11-04' }), { fecha: '2026-11-04', fuente: 'contenido' })
  assert.deepEqual(fechaDeLista({ ...base, nombre: 'monroe.xls', ruta: 'compras farmacias/Monroe/monroe.xls' }), { fecha: '2026-11-09', fuente: 'modificado' })
})

test('una fecha muy en el futuro es un error de lectura y se descarta', () => {
  const f = fechaDeLista({ nombre: 'lista 01-01-2030.xls', ruta: null, modifiedTime: '2026-11-09T12:00:00Z', ahora: AHORA })
  assert.deepEqual(f, { fecha: '2026-11-09', fuente: 'modificado' })
})

// ── El cron ────────────────────────────────────────────────────────────────

test('el cron exige exactamente Bearer CRON_SECRET, y sin la variable lo dice', () => {
  assert.equal(cronAutorizado('Bearer abc', 'abc'), 'ok')
  assert.equal(cronAutorizado('Bearer abd', 'abc'), 'rechazado')
  assert.equal(cronAutorizado(null, 'abc'), 'rechazado')
  assert.equal(cronAutorizado('Bearer abc', undefined), 'sin_configurar')
  assert.equal(cronAutorizado('Bearer ', ''), 'sin_configurar')
})
