/**
 * Herramientas piloto de STOCK / OPERACIONES para NORA (tanda 1). Reusan las
 * mismas tablas/lógica que la UI: carga manual de vencimientos (alimenta la
 * cascada OS-3), transferencias que arrancan en pendiente_salida (las 3 fotos
 * siguen yendo por el flujo normal), y la vista unificada de vencimientos.
 */
import { getVencimientos } from '@/lib/operaciones/vencimientos'
import type { Herramienta, Opcion, NoraCtx } from './tipos'
import { buscarProductos, buscarProveedores, sucursalesOpciones, sucursalDefault, parseFecha } from './_comun'

const UBICACIONES: Opcion[] = [{ valor: 'gondola', label: 'Góndola' }, { valor: 'deposito', label: 'Depósito' }]

async function sucursalSlot(adm: any, ctx: NoraCtx): Promise<Opcion[]> {
  const def = sucursalDefault(ctx)
  if (def) {
    const { data } = await adm.from('sucursales').select('id, nombre').eq('id', def).maybeSingle()
    if (data) return [{ valor: data.id, label: data.nombre }]
  }
  return sucursalesOpciones(adm)
}
async function nombreSucursal(adm: any, id: string): Promise<string> {
  const { data } = await adm.from('sucursales').select('nombre').eq('id', id).maybeSingle()
  return data?.nombre ?? '—'
}
async function productoInfo(adm: any, id: string): Promise<{ nombre: string; sku: string | null }> {
  const { data } = await adm.from('productos_catalogo').select('nombre, sku').eq('id', id).maybeSingle()
  return { nombre: data?.nombre ?? 'producto', sku: data?.sku ?? null }
}

/** Chips de proveedor con escape "no sé" arriba (ventana desconocida). */
async function proveedorConEscape(adm: any, term?: string): Promise<Opcion[]> {
  const provs = await buscarProveedores(adm, term)
  return [{ valor: 'desconocida', label: 'No sé la droguería', sub: 'ventana desconocida' }, ...provs]
}

export const HERRAMIENTAS_STOCK: Herramienta[] = [
  {
    id: 'cargar_vencimiento',
    nombre: 'Cargar un vencimiento',
    descripcion: 'Registra manualmente un producto próximo a vencer (alimenta la cascada de acciones). Extraé producto, fecha de vencimiento y cantidad si los mencionan.',
    subapp: 'stock',
    permiso: { modulo: 'operaciones', accion: 'crear' },
    slots: [
      { nombre: 'producto', tipo: 'opcion', descripcion: 'El producto (nombre, SKU o código)', queryOpciones: (adm, v) => buscarProductos(adm, v.producto) },
      { nombre: 'sucursal', tipo: 'opcion', descripcion: 'La sucursal', queryOpciones: (adm, _v, ctx) => sucursalSlot(adm, ctx) },
      { nombre: 'fecha', tipo: 'texto', descripcion: 'Fecha de vencimiento (dd/mm/aaaa o ISO)' },
      { nombre: 'cantidad', tipo: 'numero', descripcion: 'Cuántas unidades' },
      { nombre: 'ubicacion', tipo: 'opcion', descripcion: '¿Dónde está?', queryOpciones: async () => UBICACIONES },
      { nombre: 'proveedor', tipo: 'opcion', descripcion: '¿De qué droguería vino? Con eso calculo la ventana de devolución (si no sabés, elegí "No sé")', queryOpciones: (adm, v) => proveedorConEscape(adm, v.proveedor) },
    ],
    armarConfirmacion: async (adm, v) => {
      const p = await productoInfo(adm, v.producto)
      const fecha = parseFecha(v.fecha)
      const desconocida = !v.proveedor || v.proveedor === 'desconocida'
      const prov = desconocida ? 'Desconocida' : (await buscarProveedores(adm)).find((x) => x.valor === v.proveedor)?.label ?? '—'
      return {
        titulo: 'Confirmá el vencimiento',
        campos: [
          { label: 'Producto', valor: p.nombre },
          { label: 'Sucursal', valor: await nombreSucursal(adm, v.sucursal) },
          { label: 'Vence', valor: fecha ?? '—' },
          { label: 'Cantidad', valor: String(Number(v.cantidad) || 0) },
          { label: 'Ubicación', valor: v.ubicacion === 'gondola' ? 'Góndola' : 'Depósito' },
          { label: 'Proveedor', valor: prov },
        ],
        advertencias: desconocida ? ['Sin droguería no puedo calcular la ventana de devolución (queda "desconocida").'] : [],
      }
    },
    ejecutar: async (adm, v, ctx) => {
      const fecha = parseFecha(v.fecha)
      const cantidad = Number(v.cantidad)
      if (!fecha) return { ok: false, texto: '', error: 'No entendí la fecha de vencimiento.' }
      if (!(cantidad > 0)) return { ok: false, texto: '', error: 'La cantidad tiene que ser mayor a 0.' }
      const p = await productoInfo(adm, v.producto)
      const proveedorId = v.proveedor && v.proveedor !== 'desconocida' ? v.proveedor : null
      const { data, error } = await adm.from('vencimientos').insert({
        producto_id: v.producto, sku: p.sku, sucursal_id: v.sucursal, proveedor_id: proveedorId,
        fecha_vencimiento: fecha, cantidad, ubicacion: v.ubicacion === 'gondola' ? 'gondola' : 'deposito', created_by: ctx.userId,
      }).select('id').single()
      if (error) return { ok: false, texto: '', error: error.message }
      return { ok: true, texto: `✓ Vencimiento cargado: ${cantidad}× ${p.nombre}, vence ${fecha}${proveedorId ? '' : ' (droguería desconocida — ventana sin calcular)'}. Lo vas a ver en la lista de vencimientos.`, entidad_id: data?.id }
    },
  },
  {
    id: 'nueva_transferencia',
    nombre: 'Iniciar una transferencia entre sucursales',
    descripcion: 'Crea una transferencia de stock entre sucursales. Queda pendiente de salida; las fotos se cargan después por el flujo normal.',
    subapp: 'stock',
    permiso: { modulo: 'operaciones', accion: 'crear' },
    slots: [
      { nombre: 'producto', tipo: 'opcion', descripcion: 'El producto a transferir', queryOpciones: (adm, v) => buscarProductos(adm, v.producto) },
      { nombre: 'cantidad', tipo: 'numero', descripcion: 'Cuántas unidades' },
      { nombre: 'origen', tipo: 'opcion', descripcion: 'Sucursal de origen', queryOpciones: (adm, _v, ctx) => sucursalSlot(adm, ctx) },
      { nombre: 'destino', tipo: 'opcion', descripcion: 'Sucursal de destino', queryOpciones: (adm) => sucursalesOpciones(adm) },
    ],
    armarConfirmacion: async (adm, v) => {
      const p = await productoInfo(adm, v.producto)
      return {
        titulo: 'Confirmá la transferencia',
        campos: [
          { label: 'Producto', valor: p.nombre },
          { label: 'Cantidad', valor: String(Number(v.cantidad) || 0) },
          { label: 'Origen', valor: await nombreSucursal(adm, v.origen) },
          { label: 'Destino', valor: await nombreSucursal(adm, v.destino) },
        ],
        advertencias: ['Se crea en PENDIENTE DE SALIDA. Las 3 fotos (salida y recepción) se cargan en el flujo normal — el chat solo la inicia.'],
      }
    },
    ejecutar: async (adm, v, ctx) => {
      const cantidad = Number(v.cantidad)
      if (!(cantidad > 0)) return { ok: false, texto: '', error: 'La cantidad tiene que ser mayor a 0.' }
      if (v.origen === v.destino) return { ok: false, texto: '', error: 'El origen y el destino tienen que ser distintos.' }
      const { data: tr, error } = await adm.from('transferencias_sucursal').insert({
        sucursal_origen_id: v.origen, sucursal_destino_id: v.destino, estado: 'pendiente_salida',
        fecha_solicitud: new Date().toISOString(), solicitado_por: ctx.userId,
      }).select('id').single()
      if (error || !tr) return { ok: false, texto: '', error: error?.message ?? 'No se pudo crear la transferencia.' }
      const { error: e2 } = await adm.from('transferencia_items').insert({ transferencia_id: tr.id, producto_id: v.producto, cantidad_solicitada: cantidad, cantidad_enviada: cantidad, ubicacion: 'deposito' })
      if (e2) return { ok: false, texto: '', error: e2.message }
      const p = await productoInfo(adm, v.producto)
      return { ok: true, texto: `✓ Transferencia iniciada: ${cantidad}× ${p.nombre}. Queda **pendiente de salida** — cargá las fotos desde Operaciones → Transferencias.`, entidad_id: tr.id }
    },
  },
  {
    id: 'consultar_stock',
    nombre: 'Consultar stock de un producto',
    descripcion: 'Responde cuánto stock hay de un producto por sucursal (góndola y depósito). Solo lectura.',
    subapp: 'stock',
    soloLectura: true,
    lecturaGlobal: true,
    permiso: { modulo: 'operaciones', accion: 'ver' },
    slots: [
      { nombre: 'producto', tipo: 'opcion', descripcion: 'El producto a consultar', queryOpciones: (adm, v) => buscarProductos(adm, v.producto) },
    ],
    responder: async (adm, v) => {
      const p = await productoInfo(adm, v.producto)
      const { data } = await adm.from('stock_items').select('cantidad_gondola, cantidad_deposito, sucursales(nombre)').eq('producto_id', v.producto)
      const rows = (data ?? []) as any[]
      if (!rows.length) return { texto: `No tengo stock cargado de ${p.nombre}.` }
      const total = rows.reduce((a, r) => a + Number(r.cantidad_gondola ?? 0) + Number(r.cantidad_deposito ?? 0), 0)
      const lista = rows.map((r) => `• ${r.sucursales?.nombre ?? 'Sucursal'}: ${Number(r.cantidad_gondola ?? 0) + Number(r.cantidad_deposito ?? 0)} (góndola ${Number(r.cantidad_gondola ?? 0)} / depósito ${Number(r.cantidad_deposito ?? 0)})`).join('\n')
      return { texto: `${p.nombre} — total **${total}**:\n${lista}` }
    },
  },
  {
    id: 'consultar_vencimientos',
    nombre: 'Consultar vencimientos',
    descripcion: 'Responde qué está por vencer y qué ventanas de devolución están por cerrar. Solo lectura.',
    subapp: 'stock',
    soloLectura: true,
    lecturaGlobal: true,
    permiso: { modulo: 'operaciones', accion: 'ver' },
    slots: [],
    responder: async (adm, _v, ctx) => {
      const rows = await getVencimientos(adm, { sucursalId: ctx.sucursalId, esTodas: ctx.esTodas })
      if (!rows.length) return { texto: 'No hay vencimientos cargados por ahora. 👌' }
      const porCerrar = rows.filter((r) => r.ventana_estado === 'por_cerrar').length
      const top = rows.slice(0, 8).map((r) => `• ${r.producto} (${r.sucursal}) — vence en ${r.dias_restantes}d · ${r.accion_label}`).join('\n')
      const cab = `${rows.length} vencimiento(s)${porCerrar ? ` · ${porCerrar} con ventana por cerrar ⚠️` : ''}:`
      return { texto: `${cab}\n${top}\n\nVer la cascada → /admin/operaciones/vencimientos` }
    },
  },
]
