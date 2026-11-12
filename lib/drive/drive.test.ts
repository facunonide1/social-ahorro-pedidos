import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import { clasificar } from './clasificar'
import { cifrarToken, claveDesdeEnv, descifrarToken } from './crypto'
import { esElMismoContenido } from './dedupe'
import { parsearFacturaTexto } from './facturas-texto'
import { parsearCeos, parsearDistrifarm, parsearMayorsur, parsearNorma, parsearPrecio, parsearVannier } from './listas'
import {
  clavesBarras, fusionarBarras, matchearLineaCompra, prepararFilasCompra, updatesDeRematch,
} from './compras-match'
import { catalogoAcotado, indiceDeNombres, matchearProducto, porcentajeMatch, scoreNombre } from './match'
import { parsearArchivosCargados, parsearPestanaCompras, parsearPestanaPrecios } from './planilla'
import { detectarProveedor, sucursalDeArchivo } from './proveedor'
import {
  MINUTOS_TRABADO, TOPE_BYTES, UMBRAL_PESADO, decisionTrabado, planificarCorrida, sigueEnPresupuesto,
} from './lote'
import { tomarPagina, tareasIniciales } from './recorrer'
import { avisoPlazo, proximoIntento } from './vencimiento'

test('el precio argentino y el número de Excel conviven', () => {
  assert.equal(parsearPrecio('16.173,03'), 16173.03)
  assert.equal(parsearPrecio('$ 2.647,61'), 2647.61)
  assert.equal(parsearPrecio(2750), 2750)
  assert.equal(parsearPrecio(''), null)
})

test('norma es una fila por producto, con el grupo como categoría', () => {
  const lista = parsearNorma([
    ['Grupo', 'Ítem', 'Descripción', 'Precio '],
    ['ACCESORIOS', 'W1', 'BANDA TERMICA x 40', 1000],
    ['ACCESORIOS', 'W2', 'GUANTES NITRILO L', 2000],
  ])
  assert.equal(lista?.formato, 'norma')
  assert.equal(lista?.filas.length, 2)
  assert.equal(lista?.filas[0].categoria, 'ACCESORIOS')
  assert.equal(lista?.filas[0].sku, 'W1')
})

test('ceos y distrifarm no cargan el título de categoría como producto', () => {
  const ceos = parsearCeos([
    ['', 'ceosmédica SA', '', 'OCTUBRE'],
    ['', 'APOSITOS/SUTURAS', '', ''],
    ['', 'Aposito quirurgico esteril 10x10', '', 3677],
    ['', 'Aposito quirurgico esteril 7x20', '', 3677],
  ])
  assert.equal(ceos?.filas.length, 2)
  assert.equal(ceos?.filas[0].categoria, 'APOSITOS/SUTURAS')
  assert.equal(ceos?.titulosCategoria, 1)

  const dis = parsearDistrifarm([
    ['AERO CAMARAS'],
    ['PRODUCTO', 'PRECIO UNITARIO', 'BULTO'],
    ['AEROCAMARA ADULTO', 2750],
    ['APOSITOS'],
    ['PRODUCTO', 'PRECIO UNITARIO', 'BULTO'],
    ['CURITA TELA', 400],
  ])
  assert.equal(dis?.filas.length, 2)
  assert.equal(dis?.filas[1].categoria, 'APOSITOS')
  assert.ok((dis?.titulosCategoria ?? 0) >= 2)
})

test('vannier junta producto y presentación y no cuenta filas vacías', () => {
  const v = parsearVannier([
    [null, null, null, null, null, '06/10/2026'],
    ['ARTICULO', 'CERT', 'PRINCIPIO ACTIVO', 'PRODUCTO', 'PRESENTACIÓN', 'PRECIO OCTUBRE'],
    ['P1', 1, 'ACIDO FOLICO 1 MGS', 'ACIDO FOLICO MARCA 1', 'x 1000 compr.', 76.2],
    [null, null, null, null, null, null],
  ])
  assert.equal(v?.filas.length, 1)
  assert.match(v!.filas[0].nombre, /x 1000/)
  assert.equal(v?.vigenteDesde, '06/10/2026')
})

test('mayorsur parte las dos columnas y deja el título como categoría', () => {
  const texto = [
    'Lista de Precios: 06 DE NOVIEMBRE DE 2026',
    'LOS PRECIOS ESTÁN CON IVA INCLUÍDO',
    'PAÑALES BEBÉ',
    'HUGGIES CLASSIC PEQUEÑO 2X48    $ 12.368,28 PAMPERS CONFORT SEC    $ 12.007,26',
  ].join('\n')
  const m = parsearMayorsur(texto)
  assert.equal(m.filas.length, 2)
  assert.equal(m.filas[0].precio, 12368.28)
  assert.equal(m.filas[1].precio, 12007.26)
  assert.equal(m.filas[0].categoria, 'PAÑALES BEBÉ')
  assert.equal(m.ivaIncluido, true)
})

test('clasifica por la carpeta, y el folleto y la importación temporal no son precios', () => {
  assert.equal(clasificar({ nombre: 'foto.jpg', mime: 'image/jpeg', ruta: 'compras/facturas' }), 'factura')
  assert.equal(clasificar({ nombre: 'irma_saint_gotard.jpeg', mime: 'image/jpeg', ruta: 'compras/listas' }), 'sin_clasificar')
  assert.equal(clasificar({ nombre: 'lista_importación temporal.xlsx', mime: 'application/vnd.ms-excel', ruta: 'listas' }), 'ignorar')
  assert.equal(clasificar({ nombre: 'mayorsur.pdf', mime: 'application/pdf', ruta: 'compras/listas' }), 'precios')
  assert.equal(clasificar({
    nombre: 'guz gon 11-11.xls', mime: 'application/vnd.ms-excel', ruta: 'ventas y stock',
    hojas: ['pla_3d_10'], celdas: ['*** 11/11/26 ***'],
  }), 'maestro')
  assert.equal(clasificar({
    nombre: 'Compras y precios por droguería', mime: 'application/vnd.google-apps.spreadsheet', ruta: 'compras',
  }), 'planilla')
})

test('el cifrado roundtrip no deja el token en claro', () => {
  const key = claveDesdeEnv(Buffer.alloc(32, 7).toString('base64'))
  const blob = cifrarToken('refresh-secreto', key)
  assert.notEqual(blob.cifrado, 'refresh-secreto')
  assert.equal(descifrarToken(blob, key), 'refresh-secreto')
})

test('dedupe por file id: el mismo md5 no se reprocesa, uno nuevo sí', () => {
  const a = { fileId: 'abc', md5: '1', modifiedTime: 't' }
  assert.equal(esElMismoContenido(a, { ...a }), true)
  assert.equal(esElMismoContenido(a, { ...a, md5: '2' }), false)
  assert.equal(esElMismoContenido(a, { fileId: 'otro', md5: '1', modifiedTime: 't' }), false)
})

test('el proveedor sale del nombre y la sucursal del archivo', () => {
  const provs = [
    { id: '1', razonSocial: 'Ceos Médica SA' },
    { id: '2', razonSocial: 'Distribuidora Norma' },
  ]
  const c = detectarProveedor({ nombreArchivo: 'ceos_octubre.xlsx' }, provs)
  assert.equal(c?.id, '1')
  assert.equal(detectarProveedor({ nombreArchivo: 'ceos.xlsx' }, [
    { id: '1', razonSocial: 'Ceos uno' },
    { id: '2', razonSocial: 'Ceos dos' },
  ]), null)
  assert.equal(sucursalDeArchivo('guz gon 11-11.xls', 'ventas y stock'), 'GUZ')
  assert.equal(sucursalDeArchivo('figueiras 11-11.xls'), 'FIG')
})

test('match por nombre, y el mapeo manual gana', () => {
  const catalogo = [
    { id: 'p1', nombre: 'TAFIROL 1 g comp x 80', droga: 'paracetamol', presentacion: 'x 80' },
    { id: 'p2', nombre: 'TAFIROL 500 mg comp x 20', droga: 'paracetamol', presentacion: 'x 20' },
  ]
  const mal = matchearProducto({ nombre: 'TAFIROL 1 g comp x 80' }, catalogo, [], 0.62)
  assert.equal(mal.productoId, 'p1')
  assert.equal(mal.via, 'nombre')
  const mapa = matchearProducto(
    { nombre: 'apodo interno raro' },
    catalogo,
    [{ nombreNorm: 'apodo interno raro', productoId: 'p2' }],
    0.62,
  )
  assert.equal(mapa.via, 'mapeo')
  assert.equal(mapa.productoId, 'p2')
  assert.ok(scoreNombre('ibuprofeno 400 mg', 'ibuprofeno 600 mg') < 0.5)
  assert.equal(porcentajeMatch([{ via: 'nombre' }, { via: 'sin_match' }]), 50)
})

test('una compra cruza primero por la tabla de barras y después por nombre', () => {
  const catalogo = [
    { id: 'p1', nombre: 'TAFIROL 1 g comp x 80', droga: 'paracetamol', presentacion: 'x 80', codigoBarras: '7791111111111' },
    { id: 'p2', nombre: 'TAFIROL 500 mg comp x 20', droga: 'paracetamol', presentacion: 'x 20', codigoBarras: null },
    { id: 'p3', nombre: 'IBUPROFENO 400 mg comp x 10', droga: 'ibuprofeno', presentacion: 'x 10' },
  ]
  const barras = fusionarBarras([['7792 2222 22222', 'p2']], catalogo)
  assert.equal(barras.get('7792222222222'), 'p2')
  assert.equal(barras.get('7791111111111'), 'p1')
  assert.deepEqual(clavesBarras('007791111111111'), ['007791111111111', '7791111111111'])

  const indice = indiceDeNombres(catalogo)
  const porBarras = matchearLineaCompra(
    { nombre: 'TAFIROL 1 g comp x 80', ean: '7792-2222-22222' },
    catalogo, barras, [], 0.62, indice,
  )
  assert.equal(porBarras.productoId, 'p2')
  assert.equal(porBarras.via, 'ean')
  assert.equal(porBarras.score, 1)

  const porNombre = matchearLineaCompra(
    { nombre: 'TAFIROL 1 g comp x 80', ean: null },
    catalogo, barras, [], 0.62, indice,
  )
  assert.equal(porNombre.productoId, 'p1')
  assert.equal(porNombre.via, 'nombre')

  const bajo = matchearLineaCompra(
    { nombre: 'algo que no existe en el catalogo', ean: '123' },
    catalogo, barras, [], 0.62, indice,
  )
  assert.equal(bajo.productoId, null)
  assert.equal(bajo.via, 'sin_match')

  for (const nombre of ['TAFIROL 1 g comp x 80', 'IBUPROFENO 600 mg', 'algo que no existe', 'TAFIROL 500 mg comp x 20']) {
    const full = matchearProducto({ nombre }, catalogo, [], 0.62)
    const acot = matchearProducto({ nombre }, catalogoAcotado(nombre, catalogo, indice), [], 0.62)
    assert.equal(acot.productoId, full.productoId)
    assert.equal(acot.score, full.score)
    assert.equal(acot.via, full.via)
  }

  const tablaGana = fusionarBarras(
    [['7791111111111', 'p2']],
    [{ id: 'p1', nombre: 'TAFIROL 1 g comp x 80', codigoBarras: '7791111111111' }],
  )
  assert.equal(tablaGana.get('7791111111111'), 'p2')
})

test('preparar una compra guarda producto, score y vía sin cambiar el hash', () => {
  const fila = {
    fecha: '2026-11-02',
    drogueria: 'Farmasun',
    comprobante: 'N-0001-00000001',
    sucursal: 'Figueiras',
    producto: 'TAFIROL 1 g comp x 80',
    droga: null,
    concentracion: null,
    unidades: null,
    codigoBarras: '7792222222222',
    cantidad: 2,
    precioCaja: 50,
    descuento: null,
    precioNeto: 50,
    subtotal: 100,
    observaciones: null,
  }
  const [row] = prepararFilasCompra([fila], 'planilla', 'file-1', [
    { id: 'prov-farmasun', razonSocial: 'Farmasun' },
  ], {
    catalogo: [{ id: 'p2', nombre: 'Otro nombre', codigoBarras: null }],
    barras: new Map([['7792222222222', 'p2']]),
    mapeos: [],
    umbral: 0.62,
  })
  assert.equal(row.producto_id, 'p2')
  assert.equal(row.match_via, 'ean')
  assert.equal(row.match_score, 1)
  assert.equal(row.proveedor_id, 'prov-farmasun')
  assert.equal(row.sucursal_codigo, 'FIG')
  const hashViejo = createHash('sha256').update([
    fila.drogueria, fila.comprobante, fila.producto, fila.cantidad, fila.precioNeto ?? fila.precioCaja,
  ].join('|')).digest('hex')
  assert.equal(row.hash_linea, hashViejo)

  const [sin] = prepararFilasCompra([{ ...fila, codigoBarras: null, producto: 'no esta' }], 'planilla', 'file-1', [
    { id: 'prov-farmasun', razonSocial: 'Farmasun' },
  ], {
    catalogo: [{ id: 'p2', nombre: 'Otro nombre', codigoBarras: null }],
    barras: new Map(),
    mapeos: [],
    umbral: 0.62,
  })
  assert.equal(sin.producto_id, null)
  assert.equal(sin.match_via, 'sin_match')
  assert.equal(row.hash_linea === sin.hash_linea, false)
})

test('el rematch escribe el cruce una vez y no pisa un producto ya puesto', () => {
  const ctx = {
    catalogo: [{ id: 'p2', nombre: 'Otro', codigoBarras: null }],
    barras: new Map([['7792222222222', 'p2']]),
    mapeos: [],
    umbral: 0.62,
  }
  const base = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    proveedor_id: null,
    producto_nombre: 'X',
    droga: null,
    concentracion: null,
    unidades: null,
    codigo_barras: '7792222222222',
    producto_id: null as string | null,
    match_score: null as number | null,
    match_via: null as string | null,
  }
  const primera = updatesDeRematch([base], ctx)
  assert.equal(primera.length, 1)
  assert.equal(primera[0].producto_id, 'p2')
  assert.equal(primera[0].match_via, 'ean')
  const ya = updatesDeRematch([{
    ...base,
    producto_id: 'p2',
    match_score: 1,
    match_via: 'ean',
  }], ctx)
  assert.equal(ya.length, 0)

  const sinBase = { ...base, id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', codigo_barras: null, producto_nombre: 'nada de esto' }
  const sin = updatesDeRematch([sinBase], ctx)
  assert.equal(sin.length, 1)
  assert.equal(sin[0].producto_id, null)
  assert.equal(sin[0].match_via, 'sin_match')
  const sinOtra = updatesDeRematch([{
    ...sinBase,
    match_score: sin[0].match_score,
    match_via: sin[0].match_via,
  }], ctx)
  assert.equal(sinOtra.length, 0)
})

test('factura de texto: proveedor, número y líneas, sin usar un CUIT real', () => {
  const aso = parsearFacturaTexto([
    'Factura',
    'A                                     0014-00000001',
    '11/11/2026',
    'FCIA FIGUEIRAS',
    '7790000000001      2   EJEMPLO MARCA X 10                                      100.00      10.00%      20.00                 180.00',
  ].join('\n'), 'asopro_ejemplo.txt')
  assert.equal(aso.proveedor, 'Asoprofarma')
  assert.equal(aso.numero, '0014-00000001')
  assert.equal(aso.lineas.length, 1)
  assert.equal(aso.lineas[0].descripcion, 'EJEMPLO MARCA X 10')
  assert.equal(aso.sucursal, 'FIG')

  const mon = parsearFacturaTexto([
    'Factura A                                          3116-00000002',
    'Monroe Americana S.A.',
    'Fecha: 11/11/2026',
    '7790000000002 EJEMPLO MONROE COMPR. X30                                                    1     1.000,00           10,00             900,00        900,00',
    'Total General                        900,00',
  ].join('\n'))
  assert.equal(mon.proveedor, 'Monroe Americana')
  assert.equal(mon.numero, '3116-00000002')
  assert.equal(mon.total, 900)
  assert.equal(mon.lineas.length, 1)
  assert.equal(mon.lineas[0].importe, 900)
})

test('la planilla parte precios, compras y archivos ya cargados', () => {
  const precios = parsearPestanaPrecios([
    ['Vigente desde', 'Laboratorio / proveedor', 'Producto', 'Droga', 'Concentración', 'Unidades por caja', 'Código de barras', 'Precio por caja', 'Descuento %', 'Precio neto por caja', 'Precio por unidad', 'Condiciones (mínimo, transfer, plazo)', 'Archivo'],
    ['2026-10-06', 'Vannier', 'EJEMPLO 10', 'ejemplo', '10 mg', '1', '', 100, 0.3, 70, 70, 'Hospitalaria', 'vannier.xlsx'],
  ])
  assert.equal(precios[0].filas.length, 1)
  assert.equal(precios[0].filas[0].precio, 100)

  const compras = parsearPestanaCompras([
    ['Fecha factura', 'Droguería', 'N° factura', 'Sucursal', 'Producto (nombre comercial)', 'Droga', 'Concentración', 'Unidades por caja', 'Código de barras', 'Cantidad (cajas)', 'Precio por caja (sin IVA)', 'Descuento %', 'Precio neto por caja', 'Subtotal neto', 'Precio por unidad', 'Observaciones'],
    ['2026-11-02', 'Farmasun', 'N-0001-00000001', 'Figueiras', 'EJEMPLO COMP', 'ejemplo', '10 mg', '1', '', 2, 50, '', 50, 100, 50, ''],
    ['2026-11-02', 'REVISAR: droguería', 'X', 'Figueiras', 'NO ENTRA', '', '', '', '', 1, 1, '', 1, 1, 1, ''],
  ])
  assert.equal(compras.length, 1)
  assert.equal(compras[0].comprobante, 'N-0001-00000001')

  const archivos = parsearArchivosCargados([
    ['Archivo', 'ID del archivo', 'Cargado el', 'N° comprobante', 'Filas cargadas', 'Notas'],
    ['algo.jpg', 'id-drive-1', '2026-11-12', 'A-1', 4, 'ya está'],
  ])
  assert.equal(archivos[0].fileId, 'id-drive-1')
})

test('el recorrido es BFS, no baja de la profundidad y no duplica el file id', async () => {
  const arbol: Record<string, { id: string; name: string; mimeType: string }[]> = {
    raiz: [
      { id: 'f1', name: 'lista.xlsx', mimeType: 'application/vnd.ms-excel' },
      { id: 'sub', name: 'facturas', mimeType: 'application/vnd.google-apps.folder' },
    ],
    sub: [
      { id: 'f1', name: 'lista.xlsx', mimeType: 'application/vnd.ms-excel' },
      { id: 'foto', name: 'comp.jpg', mimeType: 'image/jpeg' },
    ],
  }
  const vistos = new Set<string>()
  let tareas = tareasIniciales([{ folderId: 'raiz', folderNombre: 'compras farmacias', incluirSubcarpetas: true }])
  const vistosArch: string[] = []
  while (tareas.length) {
    const paso = await tomarPagina(tareas, async (id) => ({ files: arbol[id] ?? [] }), {
      maxProfundidad: 5, modificadoDespues: null, vistos,
    })
    tareas = paso.tareas
    vistosArch.push(...paso.archivos.map((a) => a.fileId))
  }
  assert.deepEqual(vistosArch.sort(), ['f1', 'foto'])
})

test('lo que pesa más de 12 MB no ocupa lugar en el lote', () => {
  const grande = { id: 'g', bytes: TOPE_BYTES + 1, clasificacion: 'precios', clasificacionForzada: null }
  const chicos = [1, 2, 3, 4, 5].map((n) => ({
    id: `c${n}`, bytes: 1000, clasificacion: 'factura', clasificacionForzada: null,
  }))
  const plan = planificarCorrida([grande, ...chicos], { max: 4 })
  assert.deepEqual(plan.omitidos.map((a) => a.id), ['g'])
  assert.equal(plan.elegir.length, 4)
  assert.equal(plan.elegir.some((a) => a.id === 'g'), false)
  assert.deepEqual(plan.dejar.map((a) => a.id), ['c5'])
})

test('entra un solo pesado por corrida y el presupuesto corta a los 45 segundos', () => {
  const planilla = { id: 'p', bytes: null, clasificacion: 'planilla', clasificacionForzada: null }
  const otra = { id: 'p2', bytes: null, clasificacion: 'planilla', clasificacionForzada: null }
  const maestro = { id: 'm', bytes: 100, clasificacion: 'factura', clasificacionForzada: 'maestro' }
  const mediano = { id: 'med', bytes: UMBRAL_PESADO, clasificacion: 'precios', clasificacionForzada: null }
  const chico = { id: 'c', bytes: UMBRAL_PESADO - 1, clasificacion: 'factura', clasificacionForzada: null }
  const plan = planificarCorrida([planilla, otra, maestro, mediano, chico], { max: 4 })
  assert.deepEqual(plan.elegir.map((a) => a.id), ['p', 'c'])
  assert.deepEqual(plan.dejar.map((a) => a.id), ['p2', 'm', 'med'])
  assert.equal(plan.omitidos.length, 0)
  assert.equal(sigueEnPresupuesto(44_999), true)
  assert.equal(sigueEnPresupuesto(45_000), false)
})

test('un procesando de más de 10 minutos vuelve a pendiente y al tope queda en error', () => {
  const ahora = new Date('2026-11-12T15:00:00Z')
  const hace = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString()
  assert.equal(decisionTrabado({
    updatedAt: hace(MINUTOS_TRABADO - 1), ahora, intentos: 1, maxIntentos: 3,
  }).accion, 'esperar')
  const retry = decisionTrabado({
    updatedAt: hace(MINUTOS_TRABADO + 1), ahora, intentos: 1, maxIntentos: 3,
  })
  assert.equal(retry.accion, 'reintentar')
  assert.equal(retry.intentos, 2)
  const agotado = decisionTrabado({
    updatedAt: hace(30), ahora, intentos: 2, maxIntentos: 3,
  })
  assert.equal(agotado.accion, 'error')
  assert.equal(agotado.intentos, 3)
  assert.equal(decisionTrabado({
    updatedAt: null, ahora, intentos: 1, maxIntentos: 3,
  }).accion, 'reintentar')
})

test('el refresh de testing avisa el último día y el reintento espera', () => {
  const conectado = new Date('2026-11-01T12:00:00Z')
  assert.equal(avisoPlazo(new Date('2026-11-07T12:00:00Z'), conectado), 'por_vencer')
  assert.equal(avisoPlazo(new Date('2026-11-09T12:00:00Z'), conectado), 'vencido')
  const p = proximoIntento(1, new Date('2026-11-12T00:00:00Z'))
  assert.equal(p.toISOString(), '2026-11-12T00:02:00.000Z')
})
