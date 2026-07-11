/**
 * Herramientas piloto de Finanzas para NORA Acciones (N-01..N-06).
 * Reusan la MISMA lógica que la UI (crearPago de OS-4b) y validan server-side.
 */
import { crearPago, UMBRAL_PAGO_APROBACION } from '@/app/api/finanzas/pagos/route'
import type { Herramienta, Opcion, Valores, NoraCtx } from './tipos'

const money = (n: number) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`
const ESTADOS_PENDIENTES = ['pendiente_aprobacion', 'aprobada', 'programada_pago', 'pagada_parcial', 'vencida']
const CATS_CAJA_CHICA: [string, string][] = [['libreria', 'Librería'], ['limpieza', 'Limpieza'], ['mantenimiento', 'Mantenimiento'], ['viaticos', 'Viáticos'], ['otros', 'Otros']]

async function proveedoresConPendientes(adm: any): Promise<Opcion[]> {
  const { data } = await adm.from('facturas_proveedor')
    .select('proveedor_id, total, tipo_documento, estado, proveedores(razon_social)')
    .in('estado', ESTADOS_PENDIENTES).neq('tipo_documento', 'nota_credito').limit(2000)
  const m = new Map<string, { nombre: string; total: number; n: number }>()
  for (const f of (data ?? []) as any[]) {
    if (!f.proveedor_id) continue
    const g = m.get(f.proveedor_id) ?? { nombre: f.proveedores?.razon_social ?? 'Proveedor', total: 0, n: 0 }
    g.total += Number(f.total ?? 0); g.n++; m.set(f.proveedor_id, g)
  }
  return [...m.entries()].sort((a, b) => b[1].total - a[1].total)
    .map(([valor, g]) => ({ valor, label: g.nombre, sub: `${g.n} factura(s) · ${money(g.total)}` }))
}

async function facturasPendientes(adm: any, proveedorId: string): Promise<Opcion[]> {
  const { data } = await adm.from('facturas_proveedor')
    .select('id, numero_factura, total, fecha_vencimiento, tipo_documento')
    .eq('proveedor_id', proveedorId).in('estado', ESTADOS_PENDIENTES).neq('tipo_documento', 'nota_credito')
    .order('fecha_vencimiento', { ascending: true }).limit(50)
  return ((data ?? []) as any[]).map((f) => ({ valor: f.id, label: `${f.numero_factura ?? 'S/N'} · ${money(f.total)}`, sub: f.fecha_vencimiento ? `vence ${f.fecha_vencimiento}` : undefined }))
}

async function origenesDePago(adm: any): Promise<Opcion[]> {
  const out: Opcion[] = []
  const { data: cuentas } = await adm.from('cuentas_bancarias_propias').select('id, nombre, banco').eq('activa', true).order('nombre')
  for (const c of (cuentas ?? []) as any[]) out.push({ valor: `banco:${c.id}`, label: `${c.nombre}`, sub: `banco ${c.banco ?? ''}` })
  const { data: cajas } = await adm.from('caja_general').select('sucursal_id, saldo_actual, sucursales(nombre)').eq('tipo', 'caja_general').gt('saldo_actual', 0)
  for (const cg of (cajas ?? []) as any[]) out.push({ valor: `caja:${cg.sucursal_id}`, label: `Caja general ${cg.sucursales?.nombre ?? ''}`.trim(), sub: `saldo ${money(cg.saldo_actual)}` })
  return out
}

async function sucursalesConCaja(adm: any): Promise<Opcion[]> {
  const { data } = await adm.from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
  return ((data ?? []) as any[]).map((s) => ({ valor: s.id, label: s.nombre }))
}

/** Datos de una factura para la confirmación / ejecución. */
async function factura(adm: any, id: string) {
  const { data } = await adm.from('facturas_proveedor').select('id, numero_factura, total, proveedor_id, proveedores(razon_social)').eq('id', id).maybeSingle()
  return data
}

export const HERRAMIENTAS_FINANZAS: Herramienta[] = [
  {
    id: 'pagar_factura',
    nombre: 'Registrar un pago a proveedor',
    descripcion: 'Paga una factura pendiente de un proveedor eligiendo el origen del dinero (cuenta bancaria o caja general). Requiere comprobante.',
    permiso: { modulo: 'finanzas', accion: 'aprobar' },
    slots: [
      { nombre: 'proveedor', tipo: 'opcion', descripcion: 'El proveedor a pagar (por nombre)', queryOpciones: (adm) => proveedoresConPendientes(adm) },
      { nombre: 'factura', tipo: 'opcion', descripcion: 'La factura pendiente a pagar', queryOpciones: (adm, v) => facturasPendientes(adm, v.proveedor) },
      { nombre: 'origen', tipo: 'opcion', descripcion: 'De dónde sale la plata (cuenta bancaria o caja general)', queryOpciones: (adm) => origenesDePago(adm) },
      { nombre: 'comprobante', tipo: 'evidencia', descripcion: 'Foto del comprobante del pago' },
    ],
    armarConfirmacion: async (adm, v) => {
      const f = await factura(adm, v.factura)
      const [tipo] = String(v.origen).split(':')
      const origenLabel = tipo === 'banco' ? 'Cuenta bancaria' : 'Caja general'
      const monto = Number(f?.total ?? 0)
      const advertencias: string[] = []
      if (monto > UMBRAL_PAGO_APROBACION) advertencias.push(`Supera el umbral (${money(UMBRAL_PAGO_APROBACION)}): queda PENDIENTE de aprobación de un super_admin, no se ejecuta solo.`)
      if (tipo === 'caja') advertencias.push('Descuenta del efectivo de la caja general de la sucursal (valida saldo).')
      return {
        titulo: 'Confirmá el pago',
        campos: [
          { label: 'Proveedor', valor: f?.proveedores?.razon_social ?? '—' },
          { label: 'Factura', valor: `${f?.numero_factura ?? 'S/N'} · ${money(monto)}` },
          { label: 'Origen', valor: origenLabel },
          { label: 'Comprobante', valor: v.comprobante ? 'adjunto ✓' : 'sin adjuntar' },
        ],
        advertencias,
      }
    },
    ejecutar: async (adm, v, ctx) => {
      const f = await factura(adm, v.factura)
      if (!f) return { ok: false, texto: '', error: 'No encontré la factura.' }
      const [tipo, ref] = String(v.origen).split(':')
      const payload: any = {
        proveedor_id: f.proveedor_id,
        aplicaciones: [{ factura_id: f.id, monto: Number(f.total) }],
        comprobante_url: v.comprobante ?? null,
        origen_registro: 'nora_chat',
        observaciones: 'Registrado por NORA (chat)',
      }
      if (tipo === 'banco') { payload.origen_tipo = 'cuenta_bancaria'; payload.origen_cuenta_id = ref }
      else { payload.origen_tipo = 'efectivo_sucursal'; payload.origen_sucursal_id = ref }
      const r = await crearPago(adm, payload, ctx.userId)
      if (r.error) return { ok: false, texto: '', error: r.error }
      const texto = r.pendiente
        ? `Registré el pedido de pago ${r.numero_orden_pago} de ${money(f.total)} a ${f.proveedores?.razon_social ?? 'proveedor'}. Como supera el umbral, **queda pendiente de aprobación de un super_admin**. Te aviso cuando lo aprueben.`
        : `✓ Pago ${r.numero_orden_pago} de ${money(f.total)} a ${f.proveedores?.razon_social ?? 'proveedor'} registrado y ejecutado.`
      return { ok: true, texto, entidad_id: r.id }
    },
  },
  {
    id: 'registrar_gasto_caja_chica',
    nombre: 'Registrar un gasto de caja chica',
    descripcion: 'Anota un gasto chico pagado de la caja general (librería, limpieza, mantenimiento, viáticos). Requiere foto del comprobante.',
    permiso: { modulo: 'caja', accion: 'crear' },
    slots: [
      { nombre: 'sucursal', tipo: 'opcion', descripcion: 'La sucursal', queryOpciones: (adm) => sucursalesConCaja(adm) },
      { nombre: 'categoria', tipo: 'opcion', descripcion: 'Categoría del gasto', queryOpciones: async () => CATS_CAJA_CHICA.map(([valor, label]) => ({ valor, label })) },
      { nombre: 'monto', tipo: 'numero', descripcion: 'El monto del gasto' },
      { nombre: 'descripcion', tipo: 'texto', descripcion: 'Descripción corta (qué se compró)' },
      { nombre: 'foto', tipo: 'evidencia', descripcion: 'Foto del comprobante' },
    ],
    armarConfirmacion: async (adm, v) => {
      const suc = ((await sucursalesConCaja(adm)).find((s) => s.valor === v.sucursal))?.label ?? '—'
      const cat = CATS_CAJA_CHICA.find(([x]) => x === v.categoria)?.[1] ?? v.categoria
      return {
        titulo: 'Confirmá el gasto de caja chica',
        campos: [
          { label: 'Sucursal', valor: suc }, { label: 'Categoría', valor: String(cat) },
          { label: 'Monto', valor: money(Number(v.monto)) }, { label: 'Detalle', valor: String(v.descripcion ?? '—') },
          { label: 'Comprobante', valor: v.foto ? 'adjunto ✓' : 'sin adjuntar' },
        ],
        advertencias: ['Descuenta del efectivo de la caja general de la sucursal (valida saldo).'],
      }
    },
    ejecutar: async (adm, v, ctx) => {
      const monto = Number(v.monto)
      if (!(monto > 0)) return { ok: false, texto: '', error: 'El monto tiene que ser mayor a 0.' }
      const { data: cg } = await adm.from('caja_general').select('id, saldo_actual').eq('sucursal_id', v.sucursal).eq('tipo', 'caja_general').maybeSingle()
      let cajaId = cg?.id
      if (!cajaId) { const { data: nueva } = await adm.from('caja_general').insert({ sucursal_id: v.sucursal, tipo: 'caja_general', saldo_actual: 0 }).select('id, saldo_actual').single(); cajaId = nueva?.id }
      if (Number(cg?.saldo_actual ?? 0) < monto) return { ok: false, texto: '', error: 'Saldo insuficiente en la caja general.' }
      const cat = CATS_CAJA_CHICA.some(([x]) => x === v.categoria) ? v.categoria : 'otros'
      const { data: mov, error } = await adm.from('caja_general_movimientos').insert({
        caja_general_id: cajaId, tipo: 'gasto_caja_chica', monto: -monto, categoria: cat,
        comprobante_url: v.foto ?? null, estado: 'aprobado', solicitado_por: ctx.userId, aprobado_por: ctx.userId,
        origen_registro: 'nora_chat', notas: String(v.descripcion ?? '').slice(0, 200) || cat,
      }).select('id').single()
      if (error) return { ok: false, texto: '', error: error.message }
      return { ok: true, texto: `✓ Gasto de caja chica registrado: ${money(monto)} en ${cat}.`, entidad_id: mov?.id }
    },
  },
  {
    id: 'consultar_deuda_proveedor',
    nombre: 'Consultar la deuda con un proveedor',
    descripcion: 'Responde cuánto se le debe a un proveedor y lista sus facturas pendientes. Solo lectura.',
    permiso: { modulo: 'finanzas', accion: 'ver' },
    soloLectura: true,
    slots: [
      { nombre: 'proveedor', tipo: 'opcion', descripcion: 'El proveedor a consultar', queryOpciones: (adm) => proveedoresConPendientes(adm) },
    ],
    responder: async (adm, v) => {
      const { data } = await adm.from('facturas_proveedor')
        .select('numero_factura, total, fecha_vencimiento, proveedores(razon_social)')
        .eq('proveedor_id', v.proveedor).in('estado', ESTADOS_PENDIENTES).neq('tipo_documento', 'nota_credito')
        .order('fecha_vencimiento', { ascending: true }).limit(30)
      const rows = (data ?? []) as any[]
      const total = rows.reduce((a, r) => a + Number(r.total ?? 0), 0)
      const nombre = rows[0]?.proveedores?.razon_social ?? 'ese proveedor'
      if (!rows.length) return { texto: `No tenés deuda pendiente con ${nombre}.` }
      const lista = rows.slice(0, 8).map((r) => `• ${r.numero_factura ?? 'S/N'} — ${money(r.total)}${r.fecha_vencimiento ? ` (vence ${r.fecha_vencimiento})` : ''}`).join('\n')
      return { texto: `A ${nombre} le debés **${money(total)}** en ${rows.length} factura(s):\n${lista}` }
    },
  },
]
