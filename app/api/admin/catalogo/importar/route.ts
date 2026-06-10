import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { PRODUCTO_CATEGORIAS, type ProductoCatalogoCategoria } from '@/lib/types/catalogo'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type ImportMode = 'skip' | 'actualizar' | 'abortar'

const CATSET = new Set<string>(PRODUCTO_CATEGORIAS)

function normCategoria(v: unknown): ProductoCatalogoCategoria {
  const s = String(v ?? '').trim().toLowerCase().replace(/\s+/g, '_')
  return (CATSET.has(s) ? s : 'otros') as ProductoCatalogoCategoria
}

function normBool(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase()
  return ['1', 'true', 'si', 'sí', 'x', 'y', 'yes'].includes(s)
}

function normNum(v: unknown): number | null {
  const s = String(v ?? '').trim().replace(/\$/g, '').replace(/\./g, '').replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Importación masiva del catálogo desde CSV ya parseado (F6.5.T6). */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb
    .from('users_admin')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me || !me.activo || me.rol !== 'super_admin') {
    return NextResponse.json({ error: 'requiere super_admin' }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'body inválido' }, { status: 400 })
  }

  const mode = (body?.mode ?? 'skip') as ImportMode
  const rows: Record<string, unknown>[] = Array.isArray(body?.rows) ? body.rows : []
  if (rows.length === 0) {
    return NextResponse.json({ error: 'sin filas para importar' }, { status: 400 })
  }
  if (rows.length > 5000) {
    return NextResponse.json({ error: 'máximo 5000 filas por importación' }, { status: 400 })
  }

  // Normalizar + validar (sku y nombre obligatorios)
  const limpios: any[] = []
  const invalidas: number[] = []
  rows.forEach((r, i) => {
    const sku = String(r.sku ?? '').trim()
    const nombre = String(r.nombre ?? '').trim()
    if (!sku || !nombre) {
      invalidas.push(i + 1)
      return
    }
    limpios.push({
      sku,
      nombre,
      codigo_barras: String(r.codigo_barras ?? '').trim() || null,
      descripcion: String(r.descripcion ?? '').trim() || null,
      categoria: normCategoria(r.categoria),
      subcategoria: String(r.subcategoria ?? '').trim() || null,
      laboratorio: String(r.laboratorio ?? '').trim() || null,
      presentacion: String(r.presentacion ?? '').trim() || null,
      droga_principal: String(r.droga_principal ?? '').trim() || null,
      requiere_receta: normBool(r.requiere_receta),
      es_psicotropico: normBool(r.es_psicotropico),
      es_refrigerado: normBool(r.es_refrigerado),
      precio_sugerido: normNum(r.precio_sugerido),
      precio_costo_promedio: normNum(r.precio_costo_promedio),
      comision_empleado_pct: normNum(r.comision_empleado_pct) ?? 0,
      stock_minimo_global: normNum(r.stock_minimo_global),
      created_by: user.id,
    })
  })

  if (limpios.length === 0) {
    return NextResponse.json(
      { error: 'ninguna fila válida (faltan sku/nombre)', invalidas },
      { status: 400 },
    )
  }

  // Dedup por sku dentro del archivo (última gana)
  const porSku = new Map<string, any>()
  for (const r of limpios) porSku.set(r.sku, r)
  const finales = Array.from(porSku.values())
  const skus = finales.map((r) => r.sku)

  const adm = createAdminClient()

  // SKUs existentes
  const { data: existentesData } = await adm
    .from('productos_catalogo')
    .select('sku')
    .in('sku', skus)
  const existentes = new Set((existentesData ?? []).map((r: any) => r.sku as string))

  if (mode === 'abortar' && existentes.size > 0) {
    return NextResponse.json(
      {
        error: `Abortado: ${existentes.size} SKU ya existen.`,
        conflictos: Array.from(existentes).slice(0, 20),
      },
      { status: 409 },
    )
  }

  let insertados = 0
  let actualizados = 0
  let omitidos = 0

  if (mode === 'skip') {
    const nuevos = finales.filter((r) => !existentes.has(r.sku))
    omitidos = finales.length - nuevos.length
    if (nuevos.length > 0) {
      const { error } = await adm.from('productos_catalogo').insert(nuevos)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      insertados = nuevos.length
    }
  } else {
    // actualizar | abortar(sin conflictos) → upsert por sku
    const { error } = await adm
      .from('productos_catalogo')
      .upsert(finales, { onConflict: 'sku' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    actualizados = finales.filter((r) => existentes.has(r.sku)).length
    insertados = finales.length - actualizados
  }

  return NextResponse.json({
    ok: true,
    insertados,
    actualizados,
    omitidos,
    invalidas: invalidas.length,
    total_archivo: rows.length,
  })
}
