import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * D.2 y D.3 · EL MISMO PANEL, DESDE CUALQUIER LADO.
 *
 * Un producto se ve igual mirado desde compras, desde stock o desde una
 * decisión. Si cada pantalla armara su propio panel, el mismo producto diría
 * cosas distintas según de dónde lo abriste.
 *
 * ── LO QUE DEVUELVE, Y POR QUÉ ESTÁ ASÍ ─────────────────────────────────────
 *
 * Además de qué es, devuelve **la cadena de decisiones que lo dejó como
 * está**: qué propuso un agente sobre esto, quién decidió, qué eligió. Se
 * puede armar porque la bitácora existe desde la v0.98 — antes la pregunta
 * «¿por qué este producto está así?» no tenía respuesta en ningún lado.
 *
 * Todo con la sesión del usuario: la RLS decide qué ve. Un panel que usara el
 * cliente de servicio mostraría datos que la pantalla de atrás oculta.
 */
export async function GET(req: NextRequest) {
  const tipo = req.nextUrl.searchParams.get('tipo')
  const id = req.nextUrl.searchParams.get('id')
  if (!tipo || !id) return NextResponse.json({ error: 'falta el tipo o el id' }, { status: 400 })

  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  let titulo = ''
  let subtitulo: string | null = null
  const datos: { etiqueta: string; valor: string }[] = []
  const acciones: { nombre: string; href: string }[] = []

  if (tipo === 'producto') {
    const { data: p } = await sb.from('productos_catalogo')
      .select('id, sku, nombre, laboratorio, codigo_barras, precio_sugerido, precio_costo_promedio, condicion_venta, canal_abierto')
      .eq('id', id).maybeSingle()
    if (!p) return NextResponse.json({ error: 'no existe o no lo podés ver' }, { status: 404 })

    titulo = p.nombre
    subtitulo = `${p.sku}${p.laboratorio ? ` · ${p.laboratorio}` : ''}`

    const [{ data: stock }, { data: quiebres }, { data: transf }, { data: lotes }] = await Promise.all([
      sb.from('stock_por_sucursal').select('codigo, nombre'),
      sb.from('quiebres_por_sucursal').select('sucursal_nombre, por_mes').eq('producto_id', id),
      sb.from('transferir_antes_de_comprar')
        .select('origen_nombre, destino_nombre, transferir').eq('producto_id', id).limit(5),
      sb.from('lotes_productos').select('fecha_vencimiento, cantidad_actual')
        .eq('producto_id', id).not('fecha_vencimiento', 'is', null)
        .order('fecha_vencimiento').limit(3),
    ])
    const { data: porSuc } = await sb.from('producto_stock_sifaco')
      .select('sucursal_id, stock').eq('producto_id', id).not('sucursal_id', 'is', null)

    const nombreSuc = new Map(((stock ?? []) as any[]).map((s) => [s.codigo, s.nombre]))
    const total = ((porSuc ?? []) as any[]).reduce((a, s) => a + Number(s.stock ?? 0), 0)

    datos.push({ etiqueta: 'Stock en las cuatro', valor: `${total} unidades` })
    if (p.precio_costo_promedio != null) {
      datos.push({ etiqueta: 'Costo', valor: `$${Number(p.precio_costo_promedio).toLocaleString('es-AR')}` })
    } else {
      // Null, no cero: sin costo el producto queda afuera de todo cálculo de
      // plata, y eso hay que poder verlo acá.
      datos.push({ etiqueta: 'Costo', valor: 'sin cargar — queda afuera de todo cálculo de plata' })
    }
    if (p.precio_sugerido != null) {
      datos.push({ etiqueta: 'Precio', valor: `$${Number(p.precio_sugerido).toLocaleString('es-AR')}` })
    }
    datos.push({
      etiqueta: 'Se puede vender por canal abierto',
      valor: p.canal_abierto ? `sí · ${p.condicion_venta}` : `no · ${p.condicion_venta ?? 'sin declarar'}`,
    })
    for (const q of (quiebres ?? []) as any[]) {
      datos.push({ etiqueta: `En quiebre en ${q.sucursal_nombre}`, valor: `vende ${Number(q.por_mes).toFixed(1)} por mes y tiene cero` })
    }
    for (const t of (transf ?? []) as any[]) {
      datos.push({ etiqueta: 'Se puede mover', valor: `${t.transferir} de ${t.origen_nombre} a ${t.destino_nombre}` })
    }
    for (const l of (lotes ?? []) as any[]) {
      datos.push({ etiqueta: 'Vence', valor: `${l.cantidad_actual} el ${l.fecha_vencimiento}` })
    }
    if (!(lotes ?? []).length) {
      datos.push({ etiqueta: 'Vencimiento', valor: 'sin fecha cargada — no es que no venza, es que no se sabe' })
    }

    acciones.push({ nombre: 'Ver la ficha completa', href: `/admin/operaciones/stock/${id}` })
    acciones.push({ nombre: 'Cargarle el vencimiento', href: '/admin/operaciones/vencimientos/cargar' })
  } else if (tipo === 'proveedor') {
    const { data: p } = await sb.from('proveedores')
      .select('id, razon_social, cuit, dia_visita, plazo_pago_dias').eq('id', id).maybeSingle()
    if (!p) return NextResponse.json({ error: 'no existe o no lo podés ver' }, { status: 404 })
    titulo = p.razon_social
    subtitulo = p.cuit ?? null
    const { data: deuda } = await sb.from('deuda_proveedores')
      .select('saldo, situacion').eq('proveedor_id', id)
    const f = (deuda ?? []) as any[]
    datos.push({ etiqueta: 'Comprobantes abiertos', valor: String(f.length) })
    datos.push({
      etiqueta: 'Saldo',
      valor: f.length ? `$${Math.round(f.reduce((a, x) => a + Number(x.saldo ?? 0), 0)).toLocaleString('es-AR')}` : 'sin deuda abierta',
    })
    if (p.dia_visita) datos.push({ etiqueta: 'Pasa', valor: String(p.dia_visita) })
    acciones.push({ nombre: 'Ver el proveedor', href: `/admin/proveedores/${id}` })
  } else {
    return NextResponse.json({ error: 'ese tipo de cosa todavía no se puede abrir acá' }, { status: 400 })
  }

  // D.3 · la cadena de decisiones. La RLS la filtra por sucursal.
  const { data: historia } = await sb.from('agente_bitacora')
    .select('agente, propuso, estado, decidio_que, decidio_at, acerto, propuesta_at')
    .order('propuesta_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    ok: true, tipo, id, titulo, subtitulo, datos, acciones,
    historia: historia ?? [],
  })
}
