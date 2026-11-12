/**
 * Dry-run. No escribe en la base.
 *
 *   npx tsx scripts/drive-ingesta-dry-run.ts --muestras /ruta
 *     Parsea las muestras locales (listas, planilla, facturas de texto) y
 *     mide el match de cada lista contra los nombres de la pestaña
 *     «Listas de precios». No usa credenciales.
 *
 *   npx tsx scripts/drive-ingesta-dry-run.ts
 *     Con GOOGLE_OAUTH_* y un refresh token en DRIVE_REFRESH_TOKEN (o la fila
 *     no está: este modo lista las carpetas DRIVE_FOLDER_IDS). Sin escribir.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import * as XLSX from 'xlsx'

import { clasificar } from '../lib/drive/clasificar'
import { parsearFacturaTexto } from '../lib/drive/facturas-texto'
import { parsearGrilla, parsearMayorsur } from '../lib/drive/listas'
import { matchearProducto, porcentajeMatch } from '../lib/drive/match'
import { parsearArchivosCargados, parsearPestanaCompras, parsearPestanaPrecios } from '../lib/drive/planilla'
import { precioNetoPagado } from '../lib/compras/vigencia-precios'

function grilla(path: string, hoja?: string): unknown[][] {
  const wb = XLSX.read(readFileSync(path), { type: 'buffer', cellDates: false })
  const name = hoja && wb.SheetNames.includes(hoja) ? hoja : wb.SheetNames[0]
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null })
}

function hojasDe(path: string): Record<string, unknown[][]> {
  const wb = XLSX.read(readFileSync(path), { type: 'buffer', cellDates: false })
  const out: Record<string, unknown[][]> = {}
  for (const n of wb.SheetNames) {
    out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null })
  }
  return out
}

async function muestras(dir: string) {
  const listasDir = join(dir, 'listas')
  const sheets = hojasDe(join(dir, 'sheets/compras_y_precios_por_drogueria.xlsx'))
  const precios = parsearPestanaPrecios(sheets['Listas de precios'] ?? [])
  const compras = parsearPestanaCompras(sheets['Compras'] ?? [])
  const archivos = parsearArchivosCargados(sheets['Archivos cargados'] ?? [])
  const catalogo = precios.flatMap((g) => g.filas.map((f, i) => ({
    id: `${g.proveedor}-${i}`,
    nombre: [f.nombre, f.droga, f.concentracion, f.unidades].filter(Boolean).join(' '),
    droga: f.droga,
    presentacion: f.unidades,
  })))

  console.log('Planilla Compras y precios por droguería')
  console.log(`  precios: ${precios.reduce((a, g) => a + g.filas.length, 0)} en ${precios.length} listas`)
  for (const g of precios) console.log(`    ${g.proveedor}: ${g.filas.length}`)
  const comps = new Set(compras.map((c) => `${c.drogueria}|${c.comprobante}`))
  const comprasConPrecio = compras.filter((c) => precioNetoPagado({
    unitario: c.precioNeto ?? c.precioCaja, descuento: c.descuento, importe: c.subtotal, cantidad: c.cantidad,
  }) != null)
  console.log(`  compras: ${compras.length} líneas, ${comps.size} comprobantes`)
  console.log(`  precios de factura en la planilla (unitario neto): ${comprasConPrecio.length}`)
  console.log(`  archivos ya cargados (no reprocesar): ${archivos.length}`)

  console.log('\nListas sueltas (match contra los nombres de la pestaña, umbral 0.62)')
  for (const nombre of readdirSync(listasDir)) {
    const path = join(listasDir, nombre)
    if (!statSync(path).isFile()) continue
    const clas = clasificar({ nombre, mime: '', ruta: 'compras/listas' })
    if (nombre.endsWith('.txt')) {
      const lista = parsearMayorsur(readFileSync(path, 'utf8'))
      const scores = lista.filas.map((f) => matchearProducto({ nombre: f.nombre }, catalogo, [], 0.62))
      console.log(`  ${nombre}: ${lista.filas.length} precios, match ${porcentajeMatch(scores)}%, clase ${clas}`)
      continue
    }
    if (/\.(jpe?g|png)$/i.test(nombre)) {
      console.log(`  ${nombre}: sin precios, clase ${clas}`)
      continue
    }
    if (!/\.(xls|xlsx)$/i.test(nombre)) {
      console.log(`  ${nombre}: no es planilla, clase ${clas}`)
      continue
    }
    const filas = grilla(path)
    const lista = parsearGrilla(filas, nombre)
    if (!lista) {
      console.log(`  ${nombre}: no se pudo parsear, clase ${clas}`)
      continue
    }
    const scores = lista.filas.map((f) => matchearProducto({
      nombre: [f.nombre, f.droga, f.concentracion, f.unidades].filter(Boolean).join(' '),
    }, catalogo, [], 0.62))
    console.log(`  ${nombre}: ${lista.filas.length} precios, ${lista.titulosCategoria} títulos, formato ${lista.formato}, match ${porcentajeMatch(scores)}%, clase ${clas}`)
  }

  const txtDir = join(dir, 'facturas/txt')
  let lineas = 0
  let facturas = 0
  let preciosPdf = 0
  for (const nombre of readdirSync(txtDir)) {
    const f = parsearFacturaTexto(readFileSync(join(txtDir, nombre), 'utf8'), nombre)
    facturas++
    lineas += f.lineas.length
    preciosPdf += f.lineas.filter((l) => precioNetoPagado({
      unitario: l.precioUnitario, importe: l.importe, cantidad: l.cantidad,
    }) != null).length
    console.log(`  factura ${nombre}: ${f.proveedor ?? '?'} ${f.numero ?? 'sin número'} ${f.lineas.length} líneas total ${f.total ?? '—'}`)
  }
  console.log(`Facturas con texto: ${facturas}, líneas ${lineas}, precios netos ${preciosPdf}`)
  console.log(`Precios de factura que entrarían al historial (planilla + PDF, si el producto matchea): ${comprasConPrecio.length + preciosPdf}`)
  const manifest = JSON.parse(readFileSync(join(dir, 'facturas/facturas_manifest.json'), 'utf8')) as { files: { mimeType: string }[] }
  const fotos = manifest.files.filter((f) => f.mimeType.startsWith('image/')).length
  const pdfs = manifest.files.filter((f) => f.mimeType === 'application/pdf').length
  console.log(`Manifest de facturas: ${manifest.files.length} archivos, ${pdfs} PDF, ${fotos} fotos (las fotos van a documentos pendientes)`)
}

async function drive() {
  const token = process.env.DRIVE_REFRESH_TOKEN
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!token || !id || !secret) {
    console.log('Sin DRIVE_REFRESH_TOKEN / OAuth. Nada que listar en Drive. Usá --muestras para el ensayo local.')
    return
  }
  const body = new URLSearchParams({
    client_id: id, client_secret: secret, refresh_token: token, grant_type: 'refresh_token',
  })
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })
  const j = await r.json() as { access_token?: string; error?: string }
  if (!j.access_token) {
    console.log('No se pudo refrescar el token:', j.error ?? r.status)
    return
  }
  const q = encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and trashed = false and (name contains 'compras farmacias')")
  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,owners)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=20`
  const lista = await fetch(url, { headers: { authorization: `Bearer ${j.access_token}` } })
  const data = await lista.json() as { files?: { id: string; name: string }[] }
  console.log('Carpetas (sin escribir):')
  for (const f of data.files ?? []) console.log(`  ${f.name}  ${f.id}`)
}

const dir = process.argv.includes('--muestras')
  ? process.argv[process.argv.indexOf('--muestras') + 1]
  : ''

if (dir) {
  muestras(dir).catch((e) => { console.error(e); process.exit(1) })
} else {
  drive().catch((e) => { console.error(e); process.exit(1) })
}
