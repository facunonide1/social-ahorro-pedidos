import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { buscarOCrearCliente } from '@/lib/pedidos/cliente'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ROLES_QUE_ARMAN = ['super_admin', 'gerente', 'administrativo', 'sucursal', 'encargado_sucursal', 'cajero']

type RenglonEntrante = {
  producto_id: string
  sku: string | null
  nombre: string
  cantidad: number
  precio_lista: number
  precio: number
  descuento_pct: number | null
}

/**
 * CREAR UN PEDIDO ARMADO A MANO.
 *
 * ── LO QUE SE VUELVE A VERIFICAR ACÁ ────────────────────────────────────────
 *
 * La regla 9 y el precio. El navegador ya los mostró, pero lo que el navegador
 * manda es un JSON que cualquiera puede editar. Un producto con receta no entra
 * a un pedido porque el cliente lo pidió: entra porque el servidor lo dejó. Y el
 * precio sale del catálogo, no del body — SIFACO es la autoridad del precio
 * (regla de oro 1) y un precio que llega del navegador no es de SIFACO.
 *
 * La oferta sí se acepta del body porque se recalcula igual contra el catálogo:
 * si el precio de lista no coincide, se rechaza el renglón entero.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: perfil } = await sb
    .from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle()
  if (!perfil?.activo || !ROLES_QUE_ARMAN.includes(perfil.rol)) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })

  const renglones: RenglonEntrante[] = Array.isArray(body.renglones) ? body.renglones : []
  if (renglones.length === 0) return NextResponse.json({ error: 'El pedido no tiene productos.' }, { status: 400 })
  // Tope explícito: las dos consultas de abajo usan `.in(...)`, que se corta en
  // 1000 filas sin avisar. Doscientos renglones distintos no es un pedido.
  if (renglones.length > 200) return NextResponse.json({ error: 'Demasiados renglones para un pedido.' }, { status: 400 })
  if (!body.sucursal_id) return NextResponse.json({ error: 'Falta la sucursal: todo envío sale de una.' }, { status: 400 })
  if (!body.forma_entrega) return NextResponse.json({ error: 'Falta la forma de entrega.' }, { status: 400 })

  const adm = createAdminClient()

  // ── LA REGLA 9, DEL LADO DEL SERVIDOR ─────────────────────────────────────
  const ids = [...new Set(renglones.map((r) => r.producto_id))]
  const [{ data: condiciones }, { data: productos }] = await Promise.all([
    adm.from('producto_condicion_efectiva')
      .select('producto_id, nombre, canal_abierto_efectivo, por_que').in('producto_id', ids).limit(200),
    adm.from('productos_catalogo')
      .select('id, sku, nombre, precio_sugerido').in('id', ids).limit(200),
  ])

  const porId = new Map((productos ?? []).map((p: any) => [p.id, p]))
  const condPorId = new Map((condiciones ?? []).map((c: any) => [c.producto_id, c]))

  const rechazados: string[] = []
  const items = renglones.map((r) => {
    const p = porId.get(r.producto_id)
    const c = condPorId.get(r.producto_id)
    if (!p) { rechazados.push(`${r.nombre}: no está en el catálogo.`); return null }
    if (!c?.canal_abierto_efectivo) {
      rechazados.push(`${p.nombre}: ${c?.por_que ?? 'sin condición de venta declarada'}. No se vende por canal abierto.`)
      return null
    }
    const lista = p.precio_sugerido === null ? null : Number(p.precio_sugerido)
    if (lista === null) { rechazados.push(`${p.nombre}: SIFACO no declara precio.`); return null }
    if (Math.abs(lista - Number(r.precio_lista)) > 0.01) {
      rechazados.push(`${p.nombre}: el precio cambió mientras se armaba el pedido. Volvé a agregarlo.`)
      return null
    }
    const cantidad = Math.max(1, Math.floor(Number(r.cantidad) || 1))
    // El precio final nunca puede ser mayor al de lista: una "oferta" que sube
    // el precio es un error de armado, no una oferta.
    const precio = Math.min(Number(r.precio) || lista, lista)
    return {
      producto_id: p.id, sku: p.sku, name: p.nombre, qty: cantidad,
      price: precio, price_lista: lista, descuento_pct: r.descuento_pct ?? null,
    }
  })

  if (rechazados.length > 0) {
    return NextResponse.json({ error: rechazados.join(' · ') }, { status: 400 })
  }
  const renglonesOk = items.filter(Boolean) as NonNullable<(typeof items)[number]>[]

  // ── EL CLIENTE, DEDUPLICADO ───────────────────────────────────────────────
  let clienteId: string | null = body.cliente_id ?? null
  if (!clienteId && body.cliente_nuevo) {
    const c = await buscarOCrearCliente(adm, {
      nombre: body.cliente_nuevo.nombre,
      dni: body.cliente_nuevo.dni,
      telefono: body.cliente_nuevo.telefono,
      email: body.cliente_nuevo.email,
    })
    clienteId = c?.id ?? null
  }
  const { data: cliente } = clienteId
    ? await adm.from('clientes').select('nombre, telefono, email, dni').eq('id', clienteId).maybeSingle()
    : { data: null as any }

  const envio = Math.max(0, Number(body.envio) || 0)
  const total = renglonesOk.reduce((a, r) => a + r.price * r.qty, 0) + envio

  const { data: creado, error } = await adm.from('orders').insert({
    origin: body.canal ?? 'whatsapp',
    status: 'nuevo',
    sucursal_id: body.sucursal_id,
    forma_entrega: body.forma_entrega,
    tipo_envio: body.forma_entrega === 'retiro_local' ? 'retiro' : 'programado',
    cliente_id: clienteId,
    customer_name:  cliente?.nombre ?? body.cliente_nuevo?.nombre ?? null,
    customer_phone: cliente?.telefono ?? body.cliente_nuevo?.telefono ?? null,
    customer_email: cliente?.email ?? body.cliente_nuevo?.email ?? null,
    customer_dni:   cliente?.dni ?? body.cliente_nuevo?.dni ?? null,
    items: renglonesOk,
    total,
    notes: body.notas || null,
  }).select('id, codigo').maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: creado?.id, codigo: creado?.codigo })
}
