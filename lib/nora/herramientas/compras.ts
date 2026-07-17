/**
 * Herramientas piloto de COMPRAS para NORA (tanda 1). Reusan el flujo
 * comparador→orden de OS-4a (suma a la orden BORRADOR del proveedor), el
 * comparador de precios, y el alta de reclamo (devoluciones_proveedor
 * 'registrada' + tarea de revisión).
 */
import type { Herramienta, Opcion, NoraCtx } from './tipos'
import { buscarProductos, buscarProveedores, money, sucursalDefault, sucursalesOpciones } from './_comun'

const MOTIVOS_RECLAMO: Opcion[] = [
  { valor: 'vencimiento', label: 'Vencimiento' },
  { valor: 'dano', label: 'Producto dañado' },
  { valor: 'error_pedido', label: 'Error de pedido' },
  { valor: 'otro', label: 'Otro' },
]

async function nombreProveedor(adm: any, id: string): Promise<string> {
  const { data } = await adm.from('proveedores').select('razon_social').eq('id', id).maybeSingle()
  return data?.razon_social ?? 'proveedor'
}
async function nombreProducto(adm: any, id: string): Promise<string> {
  const { data } = await adm.from('productos_catalogo').select('nombre').eq('id', id).maybeSingle()
  return data?.nombre ?? 'producto'
}
async function sucursalSlot(adm: any, ctx: NoraCtx): Promise<Opcion[]> {
  const def = sucursalDefault(ctx)
  if (def) {
    const { data } = await adm.from('sucursales').select('id, nombre').eq('id', def).maybeSingle()
    if (data) return [{ valor: data.id, label: data.nombre }]
  }
  return sucursalesOpciones(adm)
}

/** Comparador: mejor precio final por proveedor para un producto (top 3). */
async function comparador(adm: any, productoId: string): Promise<{ proveedor_id: string; razon_social: string; precioFinal: number }[]> {
  const { data: listas } = await adm.from('listas_precios').select('id, proveedor_id').eq('vigente', true)
  const lst = (listas ?? []) as any[]
  if (!lst.length) return []
  const provByLista = new Map(lst.map((l) => [l.id, l.proveedor_id]))
  const { data: items } = await adm.from('listas_precios_items').select('lista_id, precio').eq('producto_id', productoId).in('lista_id', lst.map((l) => l.id))
  const its = (items ?? []) as any[]
  if (!its.length) return []
  const provIds = [...new Set(its.map((i) => provByLista.get(i.lista_id)).filter(Boolean))]
  const { data: provs } = await adm.from('proveedores').select('id, razon_social, descuento_pronto_pago_pct').in('id', provIds)
  const provMap = new Map(((provs ?? []) as any[]).map((p) => [p.id, p]))
  const best = new Map<string, number>()
  for (const i of its) {
    const provId = provByLista.get(i.lista_id); if (!provId) continue
    const desc = Number(provMap.get(provId)?.descuento_pronto_pago_pct ?? 0)
    const pf = Math.round(Number(i.precio) * (1 - desc / 100) * 100) / 100
    if (!best.has(provId) || pf < (best.get(provId) as number)) best.set(provId, pf)
  }
  return [...best.entries()].map(([proveedor_id, precioFinal]) => ({ proveedor_id, razon_social: provMap.get(proveedor_id)?.razon_social ?? 'proveedor', precioFinal })).sort((a, b) => a.precioFinal - b.precioFinal).slice(0, 3)
}

/** Chips de proveedor: primero los del comparador (mejor precio), luego el resto. */
async function proveedorParaOrden(adm: any, v: any): Promise<Opcion[]> {
  const sugeridos: Opcion[] = v.producto ? (await comparador(adm, v.producto)).map((c, i) => ({ valor: c.proveedor_id, label: c.razon_social, sub: `${money(c.precioFinal)}${i === 0 ? ' · mejor precio' : ''}` })) : []
  if (v.proveedor && String(v.proveedor).length >= 2) return buscarProveedores(adm, v.proveedor)
  const resto = await buscarProveedores(adm)
  const ids = new Set(sugeridos.map((s) => s.valor))
  return [...sugeridos, ...resto.filter((r) => !ids.has(r.valor))]
}

export const HERRAMIENTAS_COMPRAS: Herramienta[] = [
  {
    id: 'agregar_a_orden',
    nombre: 'Agregar un producto a una orden de compra',
    descripcion: 'Suma un producto a la orden de compra BORRADOR de un proveedor (la crea si no hay). Ej: "pedile 10 ibuprofeno 600 a Denver". Extraé producto, cantidad y proveedor si los mencionan.',
    subapp: 'compras',
    permiso: { modulo: 'compras', accion: 'crear' },
    slots: [
      { nombre: 'producto', tipo: 'opcion', descripcion: 'El producto a pedir', queryOpciones: (adm, v) => buscarProductos(adm, v.producto) },
      { nombre: 'cantidad', tipo: 'numero', descripcion: 'Cuántas unidades' },
      { nombre: 'proveedor', tipo: 'opcion', descripcion: 'A qué proveedor (si no lo decís, te muestro el de mejor precio)', queryOpciones: (adm, v) => proveedorParaOrden(adm, v) },
    ],
    armarConfirmacion: async (adm, v) => ({
      titulo: 'Confirmá el ítem de compra',
      campos: [
        { label: 'Producto', valor: await nombreProducto(adm, v.producto) },
        { label: 'Cantidad', valor: String(Number(v.cantidad) || 0) },
        { label: 'Proveedor', valor: await nombreProveedor(adm, v.proveedor) },
      ],
      advertencias: ['Queda en la orden BORRADOR — la confirmás y enviás desde Compras → Órdenes.'],
    }),
    ejecutar: async (adm, v, ctx) => {
      const cantidad = Number(v.cantidad)
      if (!(cantidad > 0)) return { ok: false, texto: '', error: 'La cantidad tiene que ser mayor a 0.' }
      const rubro = 'farmacia'
      // Orden borrador del proveedor+rubro (la reutiliza si existe).
      const { data: existente } = await adm.from('ordenes_compra').select('id, codigo').eq('proveedor_id', v.proveedor).eq('rubro', rubro).eq('estado', 'borrador').order('created_at', { ascending: false }).limit(1).maybeSingle()
      let ordenId = existente?.id ?? null
      let codigo = existente?.codigo ?? null
      if (!ordenId) {
        const { data: nueva, error } = await adm.from('ordenes_compra').insert({ proveedor_id: v.proveedor, rubro, estado: 'borrador', origen: 'manual', created_by: ctx.userId }).select('id, codigo').single()
        if (error || !nueva) return { ok: false, texto: '', error: error?.message ?? 'No se pudo crear la orden.' }
        ordenId = nueva.id; codigo = nueva.codigo
      }
      const nombre = await nombreProducto(adm, v.producto)
      const precio = (await comparador(adm, v.producto)).find((c) => c.proveedor_id === v.proveedor)?.precioFinal ?? null
      const { data: item } = await adm.from('orden_compra_items').select('id, cantidad_total').eq('orden_id', ordenId).eq('producto_id', v.producto).maybeSingle()
      if (item) await adm.from('orden_compra_items').update({ cantidad_total: Number(item.cantidad_total ?? 0) + cantidad }).eq('id', item.id)
      else await adm.from('orden_compra_items').insert({ orden_id: ordenId, producto_id: v.producto, descripcion: nombre, cantidad_total: cantidad, costo_unitario: precio ?? 0 })
      return { ok: true, texto: `✓ Agregué ${cantidad}× ${nombre} a la orden borrador ${codigo ?? ''} de ${await nombreProveedor(adm, v.proveedor)}. Podés seguir sumando ítems o confirmarla desde Órdenes.`, entidad_id: ordenId }
    },
  },
  {
    id: 'registrar_reclamo',
    nombre: 'Registrar un reclamo a un proveedor',
    descripcion: 'Registra un reclamo/devolución a un proveedor para revisión y envío. Extraé proveedor y motivo si los mencionan.',
    subapp: 'compras',
    permiso: { modulo: 'compras', accion: 'crear' },
    slots: [
      { nombre: 'proveedor', tipo: 'opcion', descripcion: 'El proveedor del reclamo', queryOpciones: (adm, v) => buscarProveedores(adm, v.proveedor) },
      { nombre: 'sucursal', tipo: 'opcion', descripcion: 'La sucursal', queryOpciones: (adm, _v, ctx) => sucursalSlot(adm, ctx) },
      { nombre: 'motivo', tipo: 'opcion', descripcion: 'Motivo del reclamo', queryOpciones: async () => MOTIVOS_RECLAMO },
      { nombre: 'descripcion', tipo: 'texto', descripcion: 'Detalle de qué pasó' },
      { nombre: 'foto', tipo: 'evidencia', descripcion: 'Foto del problema (opcional)', requeridoSi: () => false },
    ],
    armarConfirmacion: async (adm, v) => ({
      titulo: 'Confirmá el reclamo',
      campos: [
        { label: 'Proveedor', valor: await nombreProveedor(adm, v.proveedor) },
        { label: 'Motivo', valor: MOTIVOS_RECLAMO.find((m) => m.valor === v.motivo)?.label ?? String(v.motivo ?? '—') },
        { label: 'Detalle', valor: String(v.descripcion ?? '—') },
        { label: 'Foto', valor: v.foto ? 'adjunta ✓' : 'sin adjuntar' },
      ],
      advertencias: ['Queda REGISTRADO para revisión y envío. Se crea una tarea para revisarlo y mandarlo.'],
    }),
    ejecutar: async (adm, v, ctx) => {
      const motivo = MOTIVOS_RECLAMO.some((m) => m.valor === v.motivo) ? v.motivo : 'otro'
      const obs = `${String(v.descripcion ?? '').slice(0, 400)}${v.foto ? ` [foto: ${v.foto}]` : ''}`.trim() || 'Registrado por NORA (chat)'
      const { data: recl, error } = await adm.from('devoluciones_proveedor').insert({
        proveedor_id: v.proveedor, sucursal_id: v.sucursal, fecha: new Date().toISOString().slice(0, 10),
        motivo, estado: 'registrada', observaciones: obs, created_by: ctx.userId,
      }).select('id').single()
      if (error || !recl) return { ok: false, texto: '', error: error?.message ?? 'No se pudo registrar el reclamo.' }
      const prov = await nombreProveedor(adm, v.proveedor)
      await adm.from('tareas').insert({
        tipo_origen: 'nora', titulo: `Revisar y enviar reclamo a ${prov}`, descripcion: obs, prioridad: 'alta', estado: 'pendiente',
        sucursal_id: v.sucursal, entidad_relacionada: 'reclamo_proveedor', entidad_id: recl.id, entidad_url: `/admin/compras/devoluciones/${recl.id}`, creado_por: ctx.userId,
      })
      return { ok: true, texto: `✓ Reclamo a ${prov} registrado (queda para revisión y envío). Creé la tarea para revisarlo.`, entidad_id: recl.id }
    },
  },
  {
    id: 'consultar_reclamos',
    nombre: 'Consultar reclamos abiertos',
    descripcion: 'Responde qué reclamos/devoluciones están abiertos (opcionalmente de un proveedor) y hace cuántos días. Solo lectura.',
    subapp: 'compras',
    soloLectura: true,
    permiso: { modulo: 'compras', accion: 'ver' },
    slots: [
      { nombre: 'proveedor', tipo: 'opcion', descripcion: 'Proveedor a filtrar (opcional)', requeridoSi: () => false, queryOpciones: (adm, v) => buscarProveedores(adm, v.proveedor) },
    ],
    responder: async (adm, v) => {
      let q = adm.from('devoluciones_proveedor').select('estado, created_at, proveedores(razon_social)').in('estado', ['registrada', 'enviada']).order('created_at', { ascending: true }).limit(30)
      if (v.proveedor) q = q.eq('proveedor_id', v.proveedor)
      const { data } = await q
      const rows = (data ?? []) as any[]
      if (!rows.length) return { texto: v.proveedor ? 'No hay reclamos abiertos con ese proveedor. 👌' : 'No hay reclamos abiertos. 👌' }
      const lista = rows.slice(0, 12).map((r) => {
        const dias = Math.floor((Date.now() - Date.parse(r.created_at)) / 86_400_000)
        return `• ${r.proveedores?.razon_social ?? 'Proveedor'} — ${r.estado} (hace ${dias}d)`
      }).join('\n')
      return { texto: `${rows.length} reclamo(s) abierto(s):\n${lista}\n\nVer todo → /admin/compras/devoluciones` }
    },
  },
  {
    id: 'consultar_precio',
    nombre: 'Consultar el mejor precio de un producto',
    descripcion: 'Responde qué proveedor tiene más barato un producto (top 3, precio final). Solo lectura.',
    subapp: 'compras',
    soloLectura: true,
    lecturaGlobal: true,
    permiso: { modulo: 'compras', accion: 'ver' },
    slots: [
      { nombre: 'producto', tipo: 'opcion', descripcion: 'El producto a comparar', queryOpciones: (adm, v) => buscarProductos(adm, v.producto) },
    ],
    responder: async (adm, v) => {
      const nombre = await nombreProducto(adm, v.producto)
      const top = await comparador(adm, v.producto)
      if (!top.length) return { texto: `No tengo precios de proveedor cargados para ${nombre}.` }
      const lista = top.map((c, i) => `${i + 1}. ${c.razon_social} — ${money(c.precioFinal)}${i === 0 ? ' ✅' : ''}`).join('\n')
      return { texto: `Mejores precios de ${nombre}:\n${lista}` }
    },
  },
]
