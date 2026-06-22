import { type NextRequest } from 'next/server'
import * as XLSX from 'xlsx'

import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Genera archivos de ejemplo estilo SIFACO para practicar la importación del
 * Centro de Datos. GET ?tipo=productos|ventas|clientes. Self-contained
 * (datos ficticios determinísticos) — no depende de que el demo esté cargado.
 */
const DESCRIPS = ['IBUPROFENO 400MG X10', 'PARACETAMOL 500MG X20', 'AMOXICILINA 875 X14', 'OMEPRAZOL 20MG X28', 'LORATADINA 10MG X10', 'VITAMINA C X30', 'SHAMPOO ANTICASPA 200ML', 'CREMA HIDRATANTE 250ML', 'PROTECTOR SOLAR FPS50', 'PAÑALES TALLE G X30', 'ALCOHOL EN GEL 250ML', 'BARBIJO TRICAPA X50', 'TERMOMETRO DIGITAL', 'ALGODON 100G', 'SUERO FISIOLOGICO 500ML', 'ASPIRINETA 100MG X28', 'ENALAPRIL 10MG X30', 'METFORMINA 850 X30', 'LOSARTAN 50MG X30', 'ATORVASTATINA 20 X30']
const LABS = ['BAYER', 'ROEMMERS', 'BAGO', 'ELEA', 'GADOR', 'RAFFO', 'CASASCO']
const RUBROS = ['FARMACIA', 'FARMACIA', 'FARMACIA', 'PERFUMERIA', 'SUPER']
const DROGAS = ['IBUPROFENO', 'PARACETAMOL', 'AMOXICILINA', 'OMEPRAZOL', 'LORATADINA', '']

function buildProductos() {
  const rows: Record<string, any>[] = []
  for (let i = 1; i <= 50; i++) {
    const precio = 500 + (i * 137) % 18000
    const mesAct = (i * 7) % 300
    rows.push({
      CODIGO: `SIF${1000 + i}`,
      BARRAS: `779${String(1000000 + i * 37).padStart(10, '0')}`,
      DESCRIP: DESCRIPS[i % DESCRIPS.length],
      PRECIO: precio,
      STOCK: (i * 13) % 200,
      RUBRO: RUBROS[i % RUBROS.length],
      ESTADO: 'A',
      TIPO: i % 3 === 0 ? 'GENERICO' : 'MARCA',
      MES_ACT: mesAct,
      ANT_1: (i * 5) % 280, ANT_2: (i * 6) % 260, ANT_3: (i * 4) % 250,
      ANT_4: (i * 3) % 240, ANT_5: (i * 8) % 230, ANT_6: (i * 2) % 220,
      NOM_LAB: LABS[i % LABS.length], NUM_LAB: 100 + (i % LABS.length),
      DROGA: DROGAS[i % DROGAS.length],
      NOM_PROMO: i % 9 === 0 ? '2X1' : '',
      DEF_PROMO: i % 9 === 0 ? 'Lleva 2 paga 1' : '',
      DESCU: i % 5 === 0 ? 10 : 0,
      RECAR: 0,
    })
  }
  return rows
}

function buildVentas() {
  const rows: Record<string, any>[] = []
  const hoy = new Date().toISOString().slice(0, 10)
  for (let i = 1; i <= 50; i++) {
    if (i % 3 === 0) continue // no todos venden
    const cant = 1 + (i % 8)
    rows.push({ CODIGO: `SIF${1000 + i}`, DESCRIP: DESCRIPS[i % DESCRIPS.length], CANT: cant, IMPORTE: cant * (500 + (i * 137) % 18000), FECHA: hoy })
  }
  return rows
}

function buildClientes() {
  const nombres = ['MARIA GONZALEZ', 'JUAN RODRIGUEZ', 'ANA FERNANDEZ', 'CARLOS LOPEZ', 'LUCIA MARTINEZ', 'PEDRO PEREZ', 'SOFIA GARCIA', 'DIEGO SANCHEZ', 'VALENTINA ROMERO', 'JORGE TORRES']
  const rows: Record<string, any>[] = []
  for (let i = 1; i <= 40; i++) {
    rows.push({ NOMBRE: nombres[i % nombres.length], DOC: String(20000000 + i * 211), TEL: `11${String(40000000 + i * 311).padStart(8, '0')}`, EMAIL: `cliente${i}@mail.com` })
  }
  return rows
}

export async function GET(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return new Response('no autenticado', { status: 401 })

  const tipo = req.nextUrl.searchParams.get('tipo') ?? 'productos'
  let rows: Record<string, any>[]; let nombre: string; let csv = false
  if (tipo === 'ventas') { rows = buildVentas(); nombre = 'ventas_diarias_demo.csv'; csv = true }
  else if (tipo === 'clientes') { rows = buildClientes(); nombre = 'clientes_demo.xls' }
  else { rows = buildProductos(); nombre = 'productos_sifaco_demo.xls' }

  const ws = XLSX.utils.json_to_sheet(rows)
  let buf: Buffer; let mime: string
  if (csv) {
    buf = Buffer.from('﻿' + XLSX.utils.sheet_to_csv(ws, { FS: ';' }), 'utf-8')
    mime = 'text/csv; charset=utf-8'
  } else {
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')
    buf = XLSX.write(wb, { type: 'buffer', bookType: 'biff8' })
    mime = 'application/vnd.ms-excel'
  }
  return new Response(buf, {
    headers: { 'content-type': mime, 'content-disposition': `attachment; filename="${nombre}"` },
  })
}
