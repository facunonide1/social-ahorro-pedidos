import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tools de la IA interna (F4.4). Cada tool tiene una definición que se
 * manda al modelo y una función `execute` que corre server-side contra
 * Supabase con la sesión del usuario (RLS aplica — la IA solo ve lo
 * que el usuario puede ver).
 */

type Sb = SupabaseClient<any, any, any>

export type ToolDef = {
  definition: Anthropic.Tool
  execute: (sb: Sb, input: Record<string, any>) => Promise<unknown>
}

/* ---------- helpers ---------- */

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function isoDaysAgo(d: number): string {
  const x = new Date()
  x.setDate(x.getDate() - d)
  return x.toISOString()
}
function isoDateDaysFromNow(d: number): string {
  const x = new Date()
  x.setDate(x.getDate() + d)
  return x.toISOString().slice(0, 10)
}
/** PostgREST devuelve embeds many-to-one como objeto, pero a veces el
 * tipo es array. Normaliza a un solo registro. */
function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

/* ---------- 1. get_pedidos ---------- */

const getPedidos: ToolDef = {
  definition: {
    name: 'get_pedidos',
    description:
      'Lista pedidos del CRM con filtros opcionales. Útil para ver pedidos por estado, tipo de envío o de los últimos N días.',
    input_schema: {
      type: 'object',
      properties: {
        estado: {
          type: 'string',
          enum: [
            'nuevo',
            'confirmado',
            'en_preparacion',
            'listo',
            'en_camino',
            'entregado',
            'cancelado',
          ],
          description: 'Filtrar por estado del pedido.',
        },
        tipo_envio: {
          type: 'string',
          enum: ['express', 'programado', 'retiro'],
          description: 'Filtrar por tipo de envío.',
        },
        dias: {
          type: 'number',
          description: 'Solo pedidos creados en los últimos N días.',
        },
        limit: {
          type: 'number',
          description: 'Máximo de pedidos a devolver (default 20, máx 50).',
        },
      },
    },
  },
  async execute(sb, input) {
    const limit = Math.min(Number(input.limit) || 20, 50)
    let q = sb
      .from('orders')
      .select('codigo, customer_name, status, tipo_envio, total, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (input.estado) q = q.eq('status', input.estado)
    if (input.tipo_envio) q = q.eq('tipo_envio', input.tipo_envio)
    if (input.dias) q = q.gte('created_at', isoDaysAgo(Number(input.dias)))
    const { data, error } = await q
    if (error) return { error: error.message }
    return {
      total_devueltos: data?.length ?? 0,
      pedidos: data ?? [],
    }
  },
}

/* ---------- 2. get_resumen_ventas ---------- */

const getResumenVentas: ToolDef = {
  definition: {
    name: 'get_resumen_ventas',
    description:
      'Resumen agregado de ventas de los últimos N días: facturación total, cantidad de pedidos, ticket promedio y desglose por estado y tipo de envío.',
    input_schema: {
      type: 'object',
      properties: {
        dias: {
          type: 'number',
          description: 'Ventana en días hacia atrás (default 7).',
        },
      },
    },
  },
  async execute(sb, input) {
    const dias = Number(input.dias) || 7
    const { data, error } = await sb
      .from('orders')
      .select('status, tipo_envio, total')
      .gte('created_at', isoDaysAgo(dias))
    if (error) return { error: error.message }
    const rows = data ?? []
    const validas = rows.filter((r: any) => r.status !== 'cancelado')
    const facturacion = validas.reduce(
      (a: number, r: any) => a + Number(r.total || 0),
      0,
    )
    const porEstado: Record<string, number> = {}
    const porTipoEnvio: Record<string, number> = {}
    for (const r of rows as any[]) {
      porEstado[r.status] = (porEstado[r.status] || 0) + 1
      porTipoEnvio[r.tipo_envio] = (porTipoEnvio[r.tipo_envio] || 0) + 1
    }
    return {
      ventana_dias: dias,
      pedidos_totales: rows.length,
      pedidos_no_cancelados: validas.length,
      facturacion_total: Math.round(facturacion * 100) / 100,
      ticket_promedio:
        validas.length > 0
          ? Math.round((facturacion / validas.length) * 100) / 100
          : 0,
      por_estado: porEstado,
      por_tipo_envio: porTipoEnvio,
    }
  },
}

/* ---------- 3. get_facturas_vencer ---------- */

const getFacturasVencer: ToolDef = {
  definition: {
    name: 'get_facturas_vencer',
    description:
      'Facturas de proveedor pendientes de pago que vencen en los próximos N días (incluye las ya vencidas). Devuelve monto total adeudado.',
    input_schema: {
      type: 'object',
      properties: {
        dias: {
          type: 'number',
          description: 'Ventana de vencimiento en días (default 7).',
        },
      },
    },
  },
  async execute(sb, input) {
    const dias = Number(input.dias) || 7
    const hoy = todayISO()
    const { data, error } = await sb
      .from('facturas_proveedor')
      .select(
        'numero_factura, fecha_emision, fecha_vencimiento, total, estado, proveedores(razon_social)',
      )
      .lte('fecha_vencimiento', isoDateDaysFromNow(dias))
      .not('estado', 'in', '("pagada","anulada","rechazada")')
      .order('fecha_vencimiento', { ascending: true })
      .limit(50)
    if (error) return { error: error.message }
    const facturas = (data ?? []).map((f: any) => ({
      numero_factura: f.numero_factura,
      proveedor: pickOne<any>(f.proveedores)?.razon_social ?? '—',
      fecha_vencimiento: f.fecha_vencimiento,
      total: Number(f.total || 0),
      estado: f.estado,
      vencida: f.fecha_vencimiento < hoy,
    }))
    return {
      ventana_dias: dias,
      cantidad: facturas.length,
      vencidas: facturas.filter((f) => f.vencida).length,
      monto_total_adeudado:
        Math.round(facturas.reduce((a, f) => a + f.total, 0) * 100) / 100,
      facturas,
    }
  },
}

/* ---------- 4. get_cash_flow_resumen ---------- */

const getCashFlowResumen: ToolDef = {
  definition: {
    name: 'get_cash_flow_resumen',
    description:
      'Posición de caja consolidada: saldo total por moneda en cuentas bancarias activas y egresos comprometidos (facturas a vencer en 30 días).',
    input_schema: { type: 'object', properties: {} },
  },
  async execute(sb) {
    const [cuentasRes, facturasRes] = await Promise.all([
      sb
        .from('cuentas_bancarias_con_saldo')
        .select('nombre, banco, moneda, activa, saldo_actual'),
      sb
        .from('facturas_proveedor')
        .select('total, fecha_vencimiento')
        .lte('fecha_vencimiento', isoDateDaysFromNow(30))
        .not('estado', 'in', '("pagada","anulada","rechazada")'),
    ])
    if (cuentasRes.error) return { error: cuentasRes.error.message }
    const cuentas = (cuentasRes.data ?? []).filter((c: any) => c.activa)
    const saldoARS = cuentas
      .filter((c: any) => c.moneda === 'ARS')
      .reduce((a: number, c: any) => a + Number(c.saldo_actual || 0), 0)
    const saldoUSD = cuentas
      .filter((c: any) => c.moneda === 'USD')
      .reduce((a: number, c: any) => a + Number(c.saldo_actual || 0), 0)
    const egresos30d = (facturasRes.data ?? []).reduce(
      (a: number, f: any) => a + Number(f.total || 0),
      0,
    )
    return {
      saldo_total_ars: Math.round(saldoARS * 100) / 100,
      saldo_total_usd: Math.round(saldoUSD * 100) / 100,
      cuentas_activas: cuentas.length,
      egresos_comprometidos_30d: Math.round(egresos30d * 100) / 100,
      saldo_proyectado_ars_30d: Math.round((saldoARS - egresos30d) * 100) / 100,
      detalle_cuentas: cuentas.map((c: any) => ({
        nombre: c.nombre,
        banco: c.banco,
        moneda: c.moneda,
        saldo: Number(c.saldo_actual || 0),
      })),
    }
  },
}

/* ---------- 5. get_stock_critico ---------- */

const getStockCritico: ToolDef = {
  definition: {
    name: 'get_stock_critico',
    description:
      'Productos con stock igual o por debajo del mínimo configurado, por sucursal. Útil para detectar qué hay que reponer.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Máximo de items a devolver (default 25).',
        },
      },
    },
  },
  async execute(sb, input) {
    const limit = Math.min(Number(input.limit) || 25, 60)
    const { data, error } = await sb
      .from('stock_sucursal')
      .select(
        'cantidad_actual, stock_minimo, productos(nombre, categoria), sucursales(nombre)',
      )
      .gt('stock_minimo', 0)
      .order('cantidad_actual', { ascending: true })
      .limit(300)
    if (error) return { error: error.message }
    const criticos = (data ?? [])
      .filter(
        (r: any) => Number(r.cantidad_actual) <= Number(r.stock_minimo),
      )
      .slice(0, limit)
      .map((r: any) => ({
        producto: pickOne<any>(r.productos)?.nombre ?? '—',
        categoria: pickOne<any>(r.productos)?.categoria ?? null,
        sucursal: pickOne<any>(r.sucursales)?.nombre ?? '—',
        cantidad_actual: Number(r.cantidad_actual),
        stock_minimo: Number(r.stock_minimo),
      }))
    return { cantidad: criticos.length, items: criticos }
  },
}

/* ---------- 6. get_vencimientos_proximos ---------- */

const getVencimientosProximos: ToolDef = {
  definition: {
    name: 'get_vencimientos_proximos',
    description:
      'Lotes de productos que vencen en los próximos N días y todavía tienen stock. Útil para priorizar venta o devolución.',
    input_schema: {
      type: 'object',
      properties: {
        dias: {
          type: 'number',
          description: 'Ventana de vencimiento en días (default 30).',
        },
      },
    },
  },
  async execute(sb, input) {
    const dias = Number(input.dias) || 30
    const hoy = todayISO()
    const { data, error } = await sb
      .from('lotes_productos')
      .select(
        'numero_lote, fecha_vencimiento, cantidad_actual, productos(nombre), sucursales(nombre)',
      )
      .gt('cantidad_actual', 0)
      .lte('fecha_vencimiento', isoDateDaysFromNow(dias))
      .order('fecha_vencimiento', { ascending: true })
      .limit(50)
    if (error) return { error: error.message }
    const lotes = (data ?? []).map((l: any) => ({
      producto: pickOne<any>(l.productos)?.nombre ?? '—',
      sucursal: pickOne<any>(l.sucursales)?.nombre ?? '—',
      numero_lote: l.numero_lote,
      fecha_vencimiento: l.fecha_vencimiento,
      cantidad_actual: Number(l.cantidad_actual),
      ya_vencido: l.fecha_vencimiento < hoy,
    }))
    return {
      ventana_dias: dias,
      cantidad: lotes.length,
      ya_vencidos: lotes.filter((l) => l.ya_vencido).length,
      lotes,
    }
  },
}

/* ---------- 7. get_proveedor_resumen ---------- */

const getProveedorResumen: ToolDef = {
  definition: {
    name: 'get_proveedor_resumen',
    description:
      'Resumen de un proveedor a partir de su nombre, razón social o CUIT: datos de contacto, facturas pendientes y monto adeudado.',
    input_schema: {
      type: 'object',
      properties: {
        busqueda: {
          type: 'string',
          description: 'Nombre, razón social o CUIT del proveedor a buscar.',
        },
      },
      required: ['busqueda'],
    },
  },
  async execute(sb, input) {
    const q = String(input.busqueda || '').trim()
    if (q.length < 2) return { error: 'La búsqueda necesita al menos 2 caracteres.' }
    const like = `%${q}%`
    const { data: provs, error: provErr } = await sb
      .from('proveedores')
      .select('id, razon_social, nombre_comercial, cuit, categoria, activo')
      .or(
        `razon_social.ilike.${like},nombre_comercial.ilike.${like},cuit.ilike.${like}`,
      )
      .limit(5)
    if (provErr) return { error: provErr.message }
    if (!provs || provs.length === 0)
      return { encontrado: false, mensaje: `No hay proveedores que coincidan con "${q}".` }
    if (provs.length > 1)
      return {
        encontrado: false,
        ambiguo: true,
        coincidencias: provs.map((p: any) => ({
          razon_social: p.razon_social,
          cuit: p.cuit,
        })),
        mensaje:
          'Hay varios proveedores que coinciden. Pedile al usuario que sea más específico.',
      }
    const prov = provs[0] as any
    const hoy = todayISO()
    const { data: facturas } = await sb
      .from('facturas_proveedor')
      .select('numero_factura, fecha_vencimiento, total, estado')
      .eq('proveedor_id', prov.id)
      .order('fecha_vencimiento', { ascending: false })
      .limit(100)
    const fs = (facturas ?? []) as any[]
    const pendientes = fs.filter(
      (f) => !['pagada', 'anulada', 'rechazada'].includes(f.estado),
    )
    return {
      encontrado: true,
      proveedor: {
        razon_social: prov.razon_social,
        nombre_comercial: prov.nombre_comercial,
        cuit: prov.cuit,
        categoria: prov.categoria,
        activo: prov.activo,
      },
      facturas_totales: fs.length,
      facturas_pendientes: pendientes.length,
      monto_adeudado:
        Math.round(pendientes.reduce((a, f) => a + Number(f.total || 0), 0) * 100) /
        100,
      facturas_vencidas: pendientes.filter((f) => f.fecha_vencimiento < hoy).length,
      ultima_factura: fs[0]
        ? {
            numero: fs[0].numero_factura,
            vencimiento: fs[0].fecha_vencimiento,
            total: Number(fs[0].total || 0),
            estado: fs[0].estado,
          }
        : null,
    }
  },
}

/* ---------- 8. get_anomalias ---------- */

const getAnomalias: ToolDef = {
  definition: {
    name: 'get_anomalias',
    description:
      'Escanea el ERP buscando cosas que requieren atención: facturas vencidas impagas, stock crítico, lotes por vencer en 15 días, cheques rechazados e impuestos vencidos. Devuelve un tablero consolidado de alertas.',
    input_schema: { type: 'object', properties: {} },
  },
  async execute(sb) {
    const hoy = todayISO()
    const [fact, stock, lotes, cheques, imp] = await Promise.all([
      sb
        .from('facturas_proveedor')
        .select('numero_factura, fecha_vencimiento, total, proveedores(razon_social)')
        .lt('fecha_vencimiento', hoy)
        .not('estado', 'in', '("pagada","anulada","rechazada")')
        .order('fecha_vencimiento', { ascending: true })
        .limit(20),
      sb
        .from('stock_sucursal')
        .select('cantidad_actual, stock_minimo, productos(nombre), sucursales(nombre)')
        .gt('stock_minimo', 0)
        .order('cantidad_actual', { ascending: true })
        .limit(200),
      sb
        .from('lotes_productos')
        .select('fecha_vencimiento, cantidad_actual, productos(nombre)')
        .gt('cantidad_actual', 0)
        .lte('fecha_vencimiento', isoDateDaysFromNow(15))
        .order('fecha_vencimiento', { ascending: true })
        .limit(20),
      sb
        .from('cheques')
        .select('numero, banco, monto, tipo')
        .eq('estado', 'rechazado')
        .limit(20),
      sb
        .from('impuestos_obligaciones')
        .select('tipo, periodo, fecha_vencimiento, monto_estimado')
        .lt('fecha_vencimiento', hoy)
        .not('estado', 'in', '("pagado","presentado")')
        .limit(20),
    ])

    const facturasVencidas = (fact.data ?? []).map((f: any) => ({
      numero_factura: f.numero_factura,
      proveedor: pickOne<any>(f.proveedores)?.razon_social ?? '—',
      fecha_vencimiento: f.fecha_vencimiento,
      total: Number(f.total || 0),
    }))
    const stockCritico = (stock.data ?? [])
      .filter((r: any) => Number(r.cantidad_actual) <= Number(r.stock_minimo))
      .slice(0, 20)
      .map((r: any) => ({
        producto: pickOne<any>(r.productos)?.nombre ?? '—',
        sucursal: pickOne<any>(r.sucursales)?.nombre ?? '—',
        cantidad_actual: Number(r.cantidad_actual),
        stock_minimo: Number(r.stock_minimo),
      }))
    const vencimientos = (lotes.data ?? []).map((l: any) => ({
      producto: pickOne<any>(l.productos)?.nombre ?? '—',
      fecha_vencimiento: l.fecha_vencimiento,
      cantidad_actual: Number(l.cantidad_actual),
    }))
    const chequesRechazados = (cheques.data ?? []).map((c: any) => ({
      numero: c.numero,
      banco: c.banco,
      monto: Number(c.monto || 0),
      tipo: c.tipo,
    }))
    const impuestosVencidos = (imp.data ?? []).map((i: any) => ({
      tipo: i.tipo,
      periodo: i.periodo,
      fecha_vencimiento: i.fecha_vencimiento,
      monto_estimado: Number(i.monto_estimado || 0),
    }))

    const totalAlertas =
      facturasVencidas.length +
      stockCritico.length +
      vencimientos.length +
      chequesRechazados.length +
      impuestosVencidos.length

    return {
      total_alertas: totalAlertas,
      facturas_vencidas: facturasVencidas,
      stock_critico: stockCritico,
      vencimientos_15d: vencimientos,
      cheques_rechazados: chequesRechazados,
      impuestos_vencidos: impuestosVencidos,
      nota_errores: [fact, stock, lotes, cheques, imp]
        .map((r, idx) =>
          r.error
            ? `${['facturas', 'stock', 'lotes', 'cheques', 'impuestos'][idx]}: ${r.error.message}`
            : null,
        )
        .filter(Boolean),
    }
  },
}

/* ---------- registro ---------- */

export const AI_TOOLS: Record<string, ToolDef> = {
  get_pedidos: getPedidos,
  get_resumen_ventas: getResumenVentas,
  get_facturas_vencer: getFacturasVencer,
  get_cash_flow_resumen: getCashFlowResumen,
  get_stock_critico: getStockCritico,
  get_vencimientos_proximos: getVencimientosProximos,
  get_proveedor_resumen: getProveedorResumen,
  get_anomalias: getAnomalias,
}

export const AI_TOOL_DEFINITIONS: Anthropic.Tool[] = Object.values(AI_TOOLS).map(
  (t) => t.definition,
)

/** Etiquetas legibles para mostrar en la UI ("Consultando…"). */
export const TOOL_LABELS: Record<string, string> = {
  get_pedidos: 'Consultando pedidos',
  get_resumen_ventas: 'Calculando ventas',
  get_facturas_vencer: 'Revisando facturas por vencer',
  get_cash_flow_resumen: 'Mirando la posición de caja',
  get_stock_critico: 'Buscando stock crítico',
  get_vencimientos_proximos: 'Revisando vencimientos',
  get_proveedor_resumen: 'Buscando el proveedor',
  get_anomalias: 'Escaneando anomalías',
}

export async function runTool(
  sb: Sb,
  name: string,
  input: Record<string, any>,
): Promise<unknown> {
  const tool = AI_TOOLS[name]
  if (!tool) return { error: `Tool desconocida: ${name}` }
  try {
    return await tool.execute(sb, input || {})
  } catch (e: any) {
    return { error: e?.message || 'Error ejecutando la tool.' }
  }
}
