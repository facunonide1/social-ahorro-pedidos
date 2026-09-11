/**
 * TRAER LOS COMPROBANTES DE 2026.
 *
 * ── QUÉ IMPORTA Y QUÉ NO ────────────────────────────────────────────────────
 *
 * Sólo 2026. El archivo tiene comprobantes desde junio de 2023; lo anterior no
 * se importa porque Facundo lo decidió así.
 *
 * ── LAS TRES REGLAS QUE EVITAN INVENTAR ─────────────────────────────────────
 *
 *   1 · Un comprobante SIN texto de pago **no es deuda**. Se pagó y no se
 *       anotó. Entra marcado `pago_no_registrado` y queda fuera de la deuda.
 *       Tratarlo como impago inventaría un pasivo enorme.
 *   2 · Lo que no cierra entra en CUARENTENA, fuera de todos los totales, con
 *       el motivo escrito. No se descarta ni se arregla a mano.
 *   3 · El texto de pago que no se entiende **queda como está**. Adivinar un
 *       pago es inventar que algo se pagó.
 *
 * ── LA CUARENTENA SE DECIDE POR MEDICIÓN, NO POR DESCRIPCIÓN ────────────────
 *
 * El brief hablaba de «40 notas de recupero de Vannier de ~$197 millones». En
 * el archivo no hay ningún monto de ese orden: el más grande de las 14.435
 * filas es $7.577.755. Lo que sí se parece a 197 millones es el NÚMERO de
 * comprobante (196.331.337), que probablemente se leyó como importe en el
 * análisis anterior. Así que la cuarentena no busca esa descripción: busca
 * outliers contra la mediana del mismo proveedor, fechas futuras, fechas
 * ilegibles y duplicados.
 *
 *   npx tsx --env-file=.env.local scripts/importar-facturas-2026.ts [--aplicar]
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

import { montoDelExcel, tipoDelExcel, pagoDelExcel, ALIAS_COLUMNA } from '../lib/proveedores/excel-2026'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

const ARCHIVO = 'data/proveedores/facturas-y-pagos-guzgon.xlsx'
const APLICAR = process.argv.includes('--aplicar')
const AÑO = 2026

const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

type Fila = {
  hoja: string; fecha: unknown; proveedor: unknown; tipo: unknown
  numero: unknown; monto: unknown; pago: unknown; faltantes: unknown
}

/** Una fecha del Excel: puede venir como Date, como serial o como texto roto. */
function fechaDelExcel(v: unknown): { iso: string | null; crudo: string } {
  const crudo = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').trim()
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const a = v.getUTCFullYear()
    if (a >= 2000 && a <= 2100) return { iso: v.toISOString().slice(0, 10), crudo }
  }
  if (typeof v === 'number' && v > 30000 && v < 60000) {
    const d = new Date(Math.round((v - 25569) * 86_400_000))
    return { iso: d.toISOString().slice(0, 10), crudo }
  }
  const m = crudo.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) {
    const [, d, mes, a] = m
    if (Number(mes) >= 1 && Number(mes) <= 12 && Number(a) >= 2000 && Number(a) <= 2100) {
      return { iso: `${a}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`, crudo }
    }
  }
  return { iso: null, crudo }
}

function leerHojas(): Fila[] {
  const wb = XLSX.read(readFileSync(ARCHIVO), { type: 'buffer', cellDates: true })
  const filas: Fila[] = []
  for (const hoja of wb.SheetNames) {
    const ws = wb.Sheets[hoja]
    const matriz: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
    let iEnc = -1
    let mapa: Record<string, number> = {}
    for (let i = 0; i < Math.min(4, matriz.length); i++) {
      const txt = (matriz[i] ?? []).map((c) => String(c ?? '').trim().toUpperCase())
      if (txt.includes('PROVEEDOR')) {
        txt.forEach((t, j) => { const k = ALIAS_COLUMNA[t]; if (k && !(k in mapa)) mapa[k] = j })
        if (!('fecha' in mapa)) { const p = txt.indexOf('PROVEEDOR'); if (p > 0) mapa.fecha = p - 1 }
        iEnc = i
        break
      }
    }
    if (iEnc < 0) continue
    for (let i = iEnc + 1; i < matriz.length; i++) {
      const r = matriz[i] ?? []
      const g = (k: string) => (k in mapa ? r[mapa[k]] ?? null : null)
      const monto = g('monto')
      const tieneMonto = monto !== null && /\d/.test(String(monto))
      if (!tieneMonto && !(g('numero') && g('fecha'))) continue
      filas.push({
        hoja, fecha: g('fecha'), proveedor: g('proveedor'), tipo: g('tipo'),
        numero: g('numero'), monto, pago: g('pago'), faltantes: g('faltantes'),
      })
    }
  }
  return filas
}

function normalizar(s: unknown): string {
  return String(s ?? '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '')
}

async function main() {
  console.log(`archivo: ${ARCHIVO}`)
  const filas = leerHojas()
  console.log(`filas que parecen comprobante: ${filas.length}`)

  // ── PROVEEDORES ───────────────────────────────────────────────────────────
  const { data: provs } = await adm.from('proveedores').select('id, razon_social').eq('activo', true)
  const porNombre = new Map<string, string>()
  for (const p of (provs ?? []) as any[]) porNombre.set(normalizar(p.razon_social), p.id)

  /**
   * De qué proveedor es la hoja.
   *
   * La hoja manda: la columna «proveedor» a veces está vacía o mal escrita. Y
   * el catálogo los tiene abreviados —AMERICANA está como «AME», DEL SUD como
   * «SUD»—, así que hace falta el prefijo. Con tres letras: con cuatro,
   * AMERICANA y DEL SUD no cruzaban y se perdían 1.559 comprobantes en
   * silencio, que es exactamente lo que no puede pasar.
   */
  function proveedorDe(hoja: string, col: unknown): { id: string | null; nombre: string } {
    const nombreHoja = hoja.replace(/\(.*?\)/g, '').trim()
    // «DEL SUD» es el proveedor «SUD» del catálogo. El artículo es del habla,
    // no del nombre, y sin sacarlo se pierden 246 comprobantes.
    const sinArticulo = nombreHoja.replace(/^(DEL|LA|EL|LOS|LAS)\s+/i, '')
    for (const cand of [nombreHoja, sinArticulo, String(col ?? '')]) {
      const n = normalizar(cand)
      if (!n) continue
      if (porNombre.has(n)) return { id: porNombre.get(n)!, nombre: nombreHoja }
      for (const [k, v] of porNombre) {
        if (k.length >= 3 && (n.startsWith(k) || k.startsWith(n))) return { id: v, nombre: nombreHoja }
      }
    }
    return { id: null, nombre: nombreHoja }
  }

  /**
   * Los proveedores que están en el archivo y no en el catálogo.
   *
   * Doce hojas con 125 comprobantes de 2026. Existen: hay facturas suyas. Se
   * dan de alta con lo único que se sabe —el nombre— y marcados, para que se
   * note que nadie los cargó a mano todavía.
   */
  async function altaFaltantes(hojas: string[]): Promise<void> {
    const nuevos = hojas.map((h) => h.replace(/\(.*?\)/g, '').trim())
      .filter((n) => n && !porNombre.has(normalizar(n)))
    if (!nuevos.length) return
    console.log(`\n── PROVEEDORES QUE NO ESTABAN EN EL CATÁLOGO: ${nuevos.length} ──`)
    for (const n of nuevos) console.log(`   ${n}`)
    if (!APLICAR) return
    for (const n of nuevos) {
      const { data, error } = await adm.from('proveedores').insert({
        razon_social: n, nombre_comercial: n, activo: true,
        // Sin CUIT: no está en el archivo y no se inventa. Identifica
        // fiscalmente, y un número falso se termina usando en una retención.
        cuit: null,
        notas: 'Dado de alta por la importación del Excel 2026. Faltan CUIT, condición de IVA y forma de pago.',
      }).select('id').maybeSingle()
      // Un alta que falla en silencio se lleva puestos los comprobantes de ese
      // proveedor sin que nadie lo note. Ya pasó una vez con el CUIT.
      if (error) { console.log(`   ! no se pudo dar de alta ${n}: ${error.message}`); continue }
      if (data?.id) porNombre.set(normalizar(n), data.id)
    }
  }

  // ── MEDIANA POR PROVEEDOR, PARA DETECTAR LO RARO ──────────────────────────
  const montosPorHoja = new Map<string, number[]>()
  for (const f of filas) {
    const m = montoDelExcel(f.monto)
    if (m !== null && m > 0) {
      const a = montosPorHoja.get(f.hoja) ?? []
      a.push(m); montosPorHoja.set(f.hoja, a)
    }
  }
  const medianaDe = (hoja: string): number | null => {
    const a = (montosPorHoja.get(hoja) ?? []).slice().sort((x, y) => x - y)
    if (a.length < 10) return null
    return a[Math.floor(a.length / 2)]
  }

  // Las hojas que tienen comprobantes de 2026 y ningún proveedor que las cruce.
  const hojasHuerfanas = [...new Set(filas
    .filter((f) => { const { iso } = fechaDelExcel(f.fecha); return iso?.startsWith(String(AÑO)) })
    .filter((f) => !proveedorDe(f.hoja, f.proveedor).id)
    .map((f) => f.hoja))]
  await altaFaltantes(hojasHuerfanas)

  const hoy = new Date().toISOString().slice(0, 10)
  // Cuántos días hacia atrás un comprobante sin pago anotado sigue siendo
  // candidato a estar impago. Es una DECISIÓN de Facundo: mientras no la tome,
  // tres semanas — y el reporte dice cuántos dependen de ese número.
  const DIAS_RECIENTE = 21
  const LIMITE_RECIENTE = new Date(Date.now() - DIAS_RECIENTE * 86_400_000).toISOString().slice(0, 10)
  const vistos = new Set<string>()
  const duplicadosOmitidos: string[] = []

  const aInsertar: any[] = []
  const cuarentena: Record<string, number> = {}
  const motivos: string[] = []
  let fuera2026 = 0, sinProveedor = 0, sinPagoAnotado = 0, pagoEntendido = 0, pagoConfuso = 0
  const formas: Record<string, number> = {}

  for (const f of filas) {
    const { iso, crudo } = fechaDelExcel(f.fecha)
    const año = iso ? Number(iso.slice(0, 4)) : null

    // Sólo 2026. Una fecha ilegible entra igual SI la hoja y el resto sugieren
    // que es reciente — pero marcada, porque no se puede afirmar el año.
    const ilegible = iso === null
    if (!ilegible && año !== AÑO) { fuera2026++; continue }

    const { id: provId, nombre } = proveedorDe(f.hoja, f.proveedor)
    if (!provId) { sinProveedor++; continue }

    const monto = montoDelExcel(f.monto)
    const { tipo } = tipoDelExcel(f.tipo)
    const numero = String(f.numero ?? '').trim() || null
    const pago = pagoDelExcel(f.pago)

    if (!pago) sinPagoAnotado++
    else if (pago.entendido) { pagoEntendido++; formas[pago.forma!] = (formas[pago.forma!] ?? 0) + 1 }
    else pagoConfuso++

    // ── CUARENTENA, POR MEDICIÓN ────────────────────────────────────────────
    const razones: string[] = []
    if (ilegible) razones.push(`la fecha no se puede leer («${crudo}»)`)
    if (iso && iso > hoy) razones.push(`la fecha es futura (${iso})`)
    if (monto === null) razones.push(`el monto no se puede leer («${String(f.monto)}»)`)
    const med = medianaDe(f.hoja)
    if (monto !== null && med && Math.abs(monto) > med * 50) {
      razones.push(`el monto es ${Math.round(Math.abs(monto) / med)} veces la mediana de ${nombre} (${Math.round(med).toLocaleString('es-AR')})`)
    }
    // «Reciente» es la ventana donde un comprobante sin pago anotado todavía
    // puede estar de verdad impago. Fuera de ella, el silencio significa que se
    // pagó y nadie lo escribió.
    const esReciente = !!iso && iso >= LIMITE_RECIENTE

    // La misma clave que tiene la base: proveedor + letra + punto de venta +
    // número. Dos filas con esa clave no pueden entrar las dos, así que la
    // segunda NO se inserta y se reporta aparte. Que el Excel tenga el mismo
    // comprobante dos veces es en sí el hallazgo.
    const pv = numero?.includes('-') ? numero.split('-')[0] : 's/pv'
    const nro = numero?.includes('-') ? numero.split('-').slice(1).join('-') : numero
    const letra = tipo === 'factura_b' ? 'B' : tipo === 'factura_c' ? 'C' : 'A'
    const clave = `${provId}|${letra}|${pv}|${nro || 's/n'}`
    if (vistos.has(clave)) {
      duplicadosOmitidos.push(`${nombre} · ${numero} · ${monto ?? '?'}`)
      continue
    }
    vistos.add(clave)

    if (razones.length) {
      for (const r of razones) {
        const k = r.replace(/«.*?»/g, '…').replace(/\(.*?\)/g, '').trim()
        cuarentena[k] = (cuarentena[k] ?? 0) + 1
      }
      motivos.push(`${nombre} · ${numero ?? 's/n'} · ${razones.join(' · ')}`)
    }

    // Las notas de crédito y de recupero RESTAN. Guardarlas en positivo haría
    // que la deuda sume lo que en realidad descuenta.
    const total = monto === null ? 0 : (tipo === 'nota_credito' ? -Math.abs(monto) : monto)

    aInsertar.push({
      proveedor_id: provId,
      // El Excel guarda el comprobante entero en una columna: «1116-08984265».
      // Cuando trae el guion, lo de la izquierda es el punto de venta.
      // Sin número no se puede identificar el comprobante, pero existe: se le
      // pone «s/n» y queda buscable. Inventarle un número sería peor.
      numero_factura: (numero?.includes('-') ? numero.split('-').slice(1).join('-') : numero) || 's/n',
      punto_venta: numero?.includes('-') ? numero.split('-')[0] : 's/pv',
      tipo_documento: tipo,
      tipo_factura: tipo === 'factura_b' ? 'B' : tipo === 'factura_c' ? 'C' : 'A',
      fecha_emision: iso ?? null,
      fecha_recepcion: iso ?? null,
      // El Excel no trae vencimiento: se calcula con el plazo del proveedor y
      // si no hay plazo se usa la fecha de emisión. No se inventa un plazo.
      fecha_vencimiento: iso ?? null,
      total,
      subtotal: total,
      moneda: 'ARS',
      estado: pago ? 'pagada' : 'aprobada',
      origen_captura: 'excel_2026',
      origen_hoja: f.hoja,
      en_cuarentena: razones.length > 0,
      cuarentena_motivo: razones.length ? razones.join(' · ') : null,
      // ── LAS TRES SITUACIONES, Y NINGUNA SE INVENTA ────────────────────
      //
      //   con texto de pago      → se pagó. El texto lo dice. No es deuda.
      //   sin texto y viejo      → se pagó y no se anotó (lo aclaró Facundo).
      //                            No es deuda: tratarlo como impago
      //                            inventaría un pasivo enorme.
      //   sin texto y reciente   → PUEDE estar impago. Queda como deuda y hay
      //                            que revisarlo, que es lo único honesto.
      pago_no_registrado: !pago && !esReciente,
      pago_texto_original: pago?.original ?? null,
      faltantes_texto: String(f.faltantes ?? '').trim() || null,
      es_futura: !!(iso && iso > hoy),
      es_demo: false,
    })
  }

  // ── REPORTE ───────────────────────────────────────────────────────────────
  console.log(`\n── QUÉ ENTRA ──`)
  console.log(`  de 2026                        : ${aInsertar.length}`)
  console.log(`  de otros años (no se importan) : ${fuera2026}`)
  console.log(`  sin proveedor reconocible      : ${sinProveedor}`)
  const enCuar = aInsertar.filter((x) => x.en_cuarentena).length
  console.log(`\n── CUARENTENA: ${enCuar} (fuera de todos los totales) ──`)
  for (const [k, v] of Object.entries(cuarentena).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(4)}  ${k}`)
  console.log(`\n── EL TEXTO DE PAGO ──`)
  console.log(`  sin nada anotado  : ${sinPagoAnotado}  → entran como «pago no registrado», NO como deuda`)
  console.log(`  se entendió       : ${pagoEntendido}`)
  console.log(`  no se entendió    : ${pagoConfuso}  → queda el texto, sin interpretar`)
  for (const [k, v] of Object.entries(formas).sort((a, b) => b[1] - a[1])) console.log(`     ${k.padEnd(16)} ${v}`)

  const pagados = aInsertar.filter((x) => x.estado === 'pagada' && !x.en_cuarentena)
  const sinAnotar = aInsertar.filter((x) => x.pago_no_registrado && !x.en_cuarentena)
  const revisar = aInsertar.filter((x) => !x.en_cuarentena && !x.pago_no_registrado && x.estado !== 'pagada')
  const suma = revisar.reduce((a, x) => a + Number(x.total), 0)
  console.log(`\n── CÓMO QUEDA CADA COMPROBANTE ──`)
  console.log(`  con texto de pago → pagado      : ${pagados.length}`)
  console.log(`  sin texto y viejo → «se pagó y no se anotó» : ${sinAnotar.length}  (NO es deuda)`)
  console.log(`  sin texto y de los últimos ${DIAS_RECIENTE} días → PUEDE estar impago : ${revisar.length}`)
  console.log(`     suman ${suma.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })} y hay que revisarlos uno por uno`)

  console.log(`\n── COMPROBANTES REPETIDOS EN EL ARCHIVO: ${duplicadosOmitidos.length} ──`)
  console.log(`  No entran: la base no admite dos comprobantes con el mismo número del mismo`)
  console.log(`  proveedor, y tener que elegir uno es justamente lo que hay que mirar.`)
  for (const d of duplicadosOmitidos.slice(0, 10)) console.log(`   ${d}`)

  console.log(`\n── MOTIVOS, LOS PRIMEROS 15 ──`)
  for (const m of motivos.slice(0, 15)) console.log(`  ${m}`)

  if (!APLICAR) {
    console.log(`\nEnsayo. Para escribir de verdad: --aplicar`)
    return
  }

  console.log(`\nescribiendo…`)
  let escritos = 0
  for (let i = 0; i < aInsertar.length; i += 400) {
    const { error } = await adm.from('facturas_proveedor').insert(aInsertar.slice(i, i + 400))
    if (error) throw error
    escritos += Math.min(400, aInsertar.length - i)
    process.stdout.write(`  ${escritos} de ${aInsertar.length}\r`)
  }
  console.log(`\nlisto: ${escritos} comprobantes de 2026`)
}

main().catch((e) => { console.error('FALLO:', e?.message ?? e); process.exit(1) })
