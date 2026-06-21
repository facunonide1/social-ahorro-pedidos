import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateCentroDatos } from '@/lib/centro-datos/gate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST { accion: 'cargar' | 'borrar' } — datos demo del Centro de Datos (es_demo):
 * ventas_diarias coherentes (varios días × sucursales), 5 items sin match,
 * 1 import_job con anomalías y 2 acciones de export custom. Todo borrable.
 */
export async function POST(req: NextRequest) {
  const g = await gateCentroDatos()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()

  if (b?.accion === 'borrar') {
    await adm.from('ventas_diarias').delete().eq('es_demo', true)
    await adm.from('items_sin_match').delete().eq('es_demo', true)
    await adm.from('acciones_export').delete().eq('es_demo', true)
    await adm.from('import_jobs').delete().eq('es_demo', true)
    return NextResponse.json({ ok: true, accion: 'borrar' })
  }

  // ---- cargar ----
  const [{ data: sucs }, { data: prods }] = await Promise.all([
    adm.from('sucursales').select('id, nombre').limit(4),
    adm.from('productos_catalogo').select('id, sku, nombre, precio_sugerido').eq('activo', true).limit(20),
  ])
  const sucursales = (sucs ?? []) as any[]
  const productos = (prods ?? []) as any[]
  if (!sucursales.length || !productos.length) {
    return NextResponse.json({ error: 'Necesitás sucursales y catálogo cargados primero.' }, { status: 400 })
  }

  // ventas_diarias: 5 días × sucursales × ~15 productos (determinístico-ish)
  const rows: any[] = []
  for (let d = 1; d <= 5; d++) {
    const fecha = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10)
    for (const s of sucursales) {
      productos.slice(0, 15).forEach((p, i) => {
        const base = ((i * 7 + d * 3 + s.nombre.length) % 12) + 1   // 1..12 unidades
        const cantidad = Math.max(0, base - (i % 3))
        if (cantidad === 0) return
        const precio = Number(p.precio_sugerido) || 100
        rows.push({ fecha, sucursal_id: s.id, producto_id: p.id, sku: p.sku, descripcion: p.nombre, cantidad, monto: Math.round(cantidad * precio), es_demo: true })
      })
    }
  }
  if (rows.length) await adm.from('ventas_diarias').upsert(rows, { onConflict: 'fecha,sucursal_id,sku' })

  // import_job de ejemplo con anomalías
  const { data: job } = await adm.from('import_jobs').insert({
    archivo_nombre: 'productos_sifaco_demo.xls', filas_total: 5442, filas_ok: 5388, filas_fallidas: 0, filas_sin_match: 54,
    anomalias: [
      { tipo: 'precio_sube', severidad: 'warning', mensaje: '12 productos suben de precio más de 30%', cantidad: 12 },
      { tipo: 'sin_match', severidad: 'warning', mensaje: '54 filas sin match con el catálogo', detalle: 'Van a la cola "Sin matchear".', cantidad: 54 },
      { tipo: 'ok', severidad: 'info', mensaje: 'Archivo actualizado hoy. Listo para importar.' },
    ],
    resumen: { total: 5442, con_stock: 3730, con_precio: 5442, nuevos: 54, subieron_precio: 12, bajaron_precio: 4, texto: '5.442 productos, 3.730 con stock, rubro farmacia, actualizado hoy.' },
    estado: 'aplicado', es_demo: true, por_usuario: g.userId, por_usuario_nombre: 'NORA · demo', aplicado_at: new Date().toISOString(),
  }).select('id').single()

  // 5 items sin match
  const sinMatch = Array.from({ length: 5 }, (_, i) => ({
    import_job_id: job?.id ?? null, sku: `DEMO-SM-${1000 + i}`, codigo: `DEMO-SM-${1000 + i}`,
    barras: `77900000${i}123`, descripcion_origen: ['IBUPROFENO 400 GENERICO', 'VITAMINA C MASTICABLE', 'ALCOHOL EN GEL 250ML', 'BARBIJO TRICAPA X50', 'TERMOMETRO DIGITAL'][i],
    datos: { CODIGO: `DEMO-SM-${1000 + i}`, PRECIO: 1500 + i * 100 }, estado: 'pendiente', es_demo: true,
  }))
  await adm.from('items_sin_match').insert(sinMatch)

  // 2 acciones export custom
  await adm.from('acciones_export').insert([
    {
      nombre: 'Dormidos sin venta 60d', descripcion: 'Productos sin venta en 60 días para devolver/ofertar.', icono: 'PackageX', es_demo: true,
      query_definicion: { entidad: 'productos', filtros: { solo_activos: true, sin_venta_dias: 60 }, columnas: [{ campo: 'sku', header: 'CODIGO', orden: 0 }, { campo: 'nombre', header: 'DESCRIP', orden: 1 }, { campo: 'precio', header: 'PRECIO', orden: 2 }] },
    },
    {
      nombre: 'Stock por sucursal', descripcion: 'Stock consolidado por CODIGO para SIFACO.', icono: 'Boxes', es_demo: true,
      query_definicion: { entidad: 'stock', filtros: {}, columnas: [{ campo: 'sku', header: 'CODIGO', orden: 0 }, { campo: 'stock', header: 'STOCK', orden: 1 }] },
    },
  ])

  return NextResponse.json({ ok: true, accion: 'cargar', ventas: rows.length, sin_match: sinMatch.length })
}
