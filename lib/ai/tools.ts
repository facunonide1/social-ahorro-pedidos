import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tools de la IA interna (F4.4). Cada tool tiene una definición que se
 * manda al modelo y una función `execute` que corre server-side contra
 * Supabase con la sesión del usuario (RLS aplica — la IA solo ve lo
 * que el usuario puede ver).
 */

type Sb = SupabaseClient<any, any, any>

/** Contexto del usuario que invoca la tool — para tools que escriben. */
export type ToolCtx = {
  userId: string
  rol: string
}

export type ToolDef = {
  definition: Anthropic.Tool
  execute: (sb: Sb, input: Record<string, any>, ctx?: ToolCtx) => Promise<unknown>
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
      .from('stock_items')
      .select(
        'cantidad, stock_minimo, productos_catalogo(nombre, categoria), sucursales(nombre)',
      )
      .gt('stock_minimo', 0)
      .order('cantidad', { ascending: true })
      .limit(300)
    if (error) return { error: error.message }
    const criticos = (data ?? [])
      .filter(
        (r: any) => Number(r.cantidad) <= Number(r.stock_minimo),
      )
      .slice(0, limit)
      .map((r: any) => ({
        producto: pickOne<any>(r.productos_catalogo)?.nombre ?? '—',
        categoria: pickOne<any>(r.productos_catalogo)?.categoria ?? null,
        sucursal: pickOne<any>(r.sucursales)?.nombre ?? '—',
        cantidad_actual: Number(r.cantidad),
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
        .from('stock_items')
        .select('cantidad, stock_minimo, productos_catalogo(nombre), sucursales(nombre)')
        .gt('stock_minimo', 0)
        .order('cantidad', { ascending: true })
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
      .filter((r: any) => Number(r.cantidad) <= Number(r.stock_minimo))
      .slice(0, 20)
      .map((r: any) => ({
        producto: pickOne<any>(r.productos_catalogo)?.nombre ?? '—',
        sucursal: pickOne<any>(r.sucursales)?.nombre ?? '—',
        cantidad_actual: Number(r.cantidad),
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

/* ============================================================================
 * F6.19 — Tools de tareas y empleados (NORA)
 * ========================================================================== */

const ESTADOS_TAREA_ABIERTOS = ['pendiente', 'asignada', 'en_progreso', 'en_verificacion', 'bloqueada']

const crearTarea: ToolDef = {
  definition: {
    name: 'crear_tarea',
    description:
      'Crea una nueva tarea en el sistema. Necesita confirmación explícita del usuario antes de ejecutar — verificá la intención antes de llamar esta tool.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Título corto de la tarea.' },
        descripcion: { type: 'string' },
        tipo_codigo: {
          type: 'string',
          description:
            'Código del tipo de tarea (ej "aprobar_pago", "limpieza_local"). Si no se da, usa tipo genérico "otro".',
        },
        prioridad: { type: 'string', enum: ['baja', 'media', 'alta', 'critica'] },
        responsable_id: {
          type: 'string',
          description: 'UUID del responsable. Si se omite, la tarea queda en pool sin asignar.',
        },
        fecha_vencimiento: {
          type: 'string',
          description: 'ISO timestamp del vencimiento. Si se omite, sin vencimiento.',
        },
        sucursal_id: { type: 'string' },
      },
      required: ['titulo'],
    },
  },
  async execute(sb, input, ctx) {
    if (!ctx) return { error: 'Falta contexto del usuario para crear tareas.' }
    let tipoId: string | null = null
    let slaHoras: number | null = null
    if (input.tipo_codigo) {
      const { data: tipo } = await sb
        .from('tipos_tareas')
        .select('id, sla_horas')
        .eq('codigo', input.tipo_codigo)
        .maybeSingle<{ id: string; sla_horas: number | null }>()
      if (tipo) {
        tipoId = tipo.id
        slaHoras = tipo.sla_horas
      }
    }
    const { data, error } = await sb
      .from('tareas')
      .insert({
        tipo_tarea_id: tipoId,
        tipo_origen: 'auto_sistema',
        titulo: String(input.titulo).slice(0, 200),
        descripcion: input.descripcion ?? null,
        prioridad: input.prioridad ?? 'media',
        estado: input.responsable_id ? 'asignada' : 'pendiente',
        responsable_id: input.responsable_id ?? null,
        fecha_asignacion: input.responsable_id ? new Date().toISOString() : null,
        fecha_vencimiento: input.fecha_vencimiento ?? null,
        sucursal_id: input.sucursal_id ?? null,
        sla_horas: slaHoras,
        creado_por: ctx.userId,
      })
      .select('id, codigo, titulo, estado')
      .maybeSingle()
    if (error) return { error: error.message }
    await sb.from('tareas_historial').insert({
      tarea_id: (data as any)?.id,
      user_id: ctx.userId,
      accion: 'creada',
      estado_nuevo: { estado: (data as any)?.estado },
    })
    return { ok: true, tarea: data, url: `/admin/tareas/${(data as any)?.id}` }
  },
}

const listarTareas: ToolDef = {
  definition: {
    name: 'listar_tareas',
    description:
      'Lista tareas con filtros. Útil para preguntas tipo "qué tareas tengo hoy", "cuáles vencen esta semana", "tareas de la sucursal X".',
    input_schema: {
      type: 'object',
      properties: {
        asignado_a: {
          type: 'string',
          description: '"yo" para el usuario actual, o un UUID. Si se omite, todas las visibles.',
        },
        estado: { type: 'string', description: 'Filtra por estado específico.' },
        prioridad: { type: 'string', enum: ['baja', 'media', 'alta', 'critica'] },
        sucursal_id: { type: 'string' },
        dias_hasta_vencimiento: {
          type: 'number',
          description: 'Filtra a tareas que vencen en los próximos N días.',
        },
        solo_abiertas: { type: 'boolean', description: 'Default true.' },
        limit: { type: 'number' },
      },
    },
  },
  async execute(sb, input, ctx) {
    const limit = Math.min(Number(input.limit) || 25, 50)
    let q = sb
      .from('tareas')
      .select('codigo, titulo, estado, prioridad, fecha_vencimiento, responsable_id, sucursal_id')
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
      .limit(limit)
    if (input.asignado_a === 'yo' && ctx) q = q.eq('responsable_id', ctx.userId)
    else if (input.asignado_a) q = q.eq('responsable_id', input.asignado_a)
    if (input.estado) q = q.eq('estado', input.estado)
    if (input.prioridad) q = q.eq('prioridad', input.prioridad)
    if (input.sucursal_id) q = q.eq('sucursal_id', input.sucursal_id)
    if (input.dias_hasta_vencimiento != null) {
      const hasta = new Date()
      hasta.setDate(hasta.getDate() + Number(input.dias_hasta_vencimiento))
      q = q.lte('fecha_vencimiento', hasta.toISOString())
    }
    if (input.solo_abiertas !== false) q = q.in('estado', ESTADOS_TAREA_ABIERTOS)
    const { data, error } = await q
    if (error) return { error: error.message }
    return { cantidad: data?.length ?? 0, tareas: data ?? [] }
  },
}

const actualizarEstadoTarea: ToolDef = {
  definition: {
    name: 'actualizar_estado_tarea',
    description:
      'Avanza el estado de una tarea via workflow engine. Acciones válidas: iniciar, completar_directo, marcar_verificacion, verificar, rechazar_verificacion, aprobar_final, rechazar_final, descartar, reabrir, bloquear, desbloquear. PEDÍ confirmación humana antes de ejecutar.',
    input_schema: {
      type: 'object',
      properties: {
        tarea_id: { type: 'string' },
        accion: { type: 'string' },
        comentario: { type: 'string' },
        motivo: { type: 'string' },
      },
      required: ['tarea_id', 'accion'],
    },
  },
  async execute(sb, input, ctx) {
    if (!ctx) return { error: 'Falta contexto del usuario.' }
    // Import dinámico para evitar dep circular en build.
    const { ejecutarAccion } = await import('@/lib/tareas/workflow')
    const { data: tarea } = await sb
      .from('tareas')
      .select('*')
      .eq('id', input.tarea_id)
      .maybeSingle()
    if (!tarea) return { error: 'No encontré esa tarea.' }
    let tipo = null
    if ((tarea as any).tipo_tarea_id) {
      const { data: t } = await sb
        .from('tipos_tareas')
        .select('*')
        .eq('id', (tarea as any).tipo_tarea_id)
        .maybeSingle()
      tipo = t
    }
    const res = await ejecutarAccion(sb, {
      tarea: tarea as any,
      tipo: tipo as any,
      userId: ctx.userId,
      rolGlobal: ctx.rol,
      accion: input.accion as any,
      payload: {
        comentario: input.comentario,
        motivo: input.motivo,
      },
    })
    if (!res.ok) return { error: res.error }
    return {
      ok: true,
      tarea: {
        codigo: (res.tarea as any)?.codigo,
        estado: (res.tarea as any)?.estado,
      },
    }
  },
}

const asignarTarea: ToolDef = {
  definition: {
    name: 'asignar_tarea',
    description:
      'Cambia el responsable de una tarea. PEDÍ confirmación humana antes de ejecutar.',
    input_schema: {
      type: 'object',
      properties: {
        tarea_id: { type: 'string' },
        responsable_id: { type: 'string' },
      },
      required: ['tarea_id', 'responsable_id'],
    },
  },
  async execute(sb, input, ctx) {
    if (!ctx) return { error: 'Falta contexto del usuario.' }
    const { error } = await sb
      .from('tareas')
      .update({
        responsable_id: input.responsable_id,
        estado: 'asignada',
        fecha_asignacion: new Date().toISOString(),
      })
      .eq('id', input.tarea_id)
    if (error) return { error: error.message }
    await sb.from('tareas_historial').insert({
      tarea_id: input.tarea_id,
      user_id: ctx.userId,
      accion: 'asignada',
      estado_nuevo: { responsable_id: input.responsable_id },
    })
    return { ok: true }
  },
}

const priorizarMisTareas: ToolDef = {
  definition: {
    name: 'priorizar_mis_tareas',
    description:
      'Sugiere un orden de ataque para las tareas abiertas del usuario actual, combinando prioridad y proximidad al vencimiento. Devuelve recomendación textual.',
    input_schema: { type: 'object', properties: {} },
  },
  async execute(sb, _input, ctx) {
    if (!ctx) return { error: 'Falta contexto del usuario.' }
    const { data } = await sb
      .from('tareas')
      .select('codigo, titulo, estado, prioridad, fecha_vencimiento')
      .eq('responsable_id', ctx.userId)
      .in('estado', ESTADOS_TAREA_ABIERTOS)
      .limit(50)
    const tareas = (data ?? []) as any[]
    if (tareas.length === 0) return { mensaje: 'No tenés tareas abiertas.' }
    const pesoPrioridad: Record<string, number> = { critica: 4, alta: 3, media: 2, baja: 1 }
    const ahora = Date.now()
    const score = (t: any) => {
      const p = pesoPrioridad[t.prioridad] ?? 2
      let urgencia = 0
      if (t.fecha_vencimiento) {
        const horas = (new Date(t.fecha_vencimiento).getTime() - ahora) / 36e5
        if (horas < 0) urgencia = 100
        else if (horas < 24) urgencia = 50
        else if (horas < 72) urgencia = 25
        else urgencia = 10
      }
      return p * 10 + urgencia
    }
    const ordenadas = [...tareas].sort((a, b) => score(b) - score(a))
    return {
      total: ordenadas.length,
      orden_sugerido: ordenadas.slice(0, 10).map((t, i) => ({
        ranking: i + 1,
        codigo: t.codigo,
        titulo: t.titulo,
        prioridad: t.prioridad,
        vence: t.fecha_vencimiento,
      })),
    }
  },
}

const getPerformanceEmpleado: ToolDef = {
  definition: {
    name: 'get_performance_empleado',
    description:
      'Resumen de performance de un empleado: tareas completadas, %SLA, score actual y badges.',
    input_schema: {
      type: 'object',
      properties: {
        empleado_id: { type: 'string', description: 'UUID del empleado o "yo".' },
        dias: { type: 'number', description: 'Ventana de análisis (default 30).' },
      },
      required: ['empleado_id'],
    },
  },
  async execute(sb, input, ctx) {
    const dias = Number(input.dias) || 30
    let empleadoId = input.empleado_id
    if (empleadoId === 'yo') {
      if (!ctx) return { error: 'No tengo contexto del usuario.' }
      const { data: emp } = await sb
        .from('empleados')
        .select('id')
        .eq('user_id', ctx.userId)
        .maybeSingle<{ id: string }>()
      if (!emp) return { error: 'Tu usuario no está vinculado a un empleado.' }
      empleadoId = emp.id
    }
    const { data: empleado } = await sb
      .from('empleados')
      .select('id, user_id, nombre_completo, puesto, score_total, badges_obtenidos')
      .eq('id', empleadoId)
      .maybeSingle<any>()
    if (!empleado) return { error: 'No encontré el empleado.' }
    const desde = new Date()
    desde.setDate(desde.getDate() - dias)
    let tareasFiltro = sb.from('tareas').select('estado, fecha_vencimiento, fecha_completada')
    if (empleado.user_id) tareasFiltro = tareasFiltro.eq('responsable_id', empleado.user_id)
    else return {
      nombre: empleado.nombre_completo,
      score_total: empleado.score_total,
      badges: empleado.badges_obtenidos?.length ?? 0,
      nota: 'El empleado no tiene user vinculado, no hay tareas asociadas.',
    }
    tareasFiltro = tareasFiltro.gte('fecha_completada', desde.toISOString())
    const { data: tareas } = await tareasFiltro
    const filas = (tareas ?? []) as any[]
    const completadas = filas.filter((f) => f.estado === 'completada')
    const conVenc = completadas.filter((f) => f.fecha_vencimiento && f.fecha_completada)
    const enSla = conVenc.filter(
      (f) => new Date(f.fecha_completada).getTime() <= new Date(f.fecha_vencimiento).getTime(),
    )
    return {
      nombre: empleado.nombre_completo,
      puesto: empleado.puesto,
      score_total: empleado.score_total,
      badges_count: empleado.badges_obtenidos?.length ?? 0,
      ventana_dias: dias,
      completadas_periodo: completadas.length,
      sla_pct:
        conVenc.length > 0
          ? Math.round((enSla.length / conVenc.length) * 100)
          : null,
    }
  },
}

const getRankingSucursal: ToolDef = {
  definition: {
    name: 'get_ranking_sucursal',
    description: 'Top empleados de una sucursal por score acumulado.',
    input_schema: {
      type: 'object',
      properties: {
        sucursal_id: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  async execute(sb, input) {
    const limit = Math.min(Number(input.limit) || 10, 30)
    let q = sb
      .from('empleados')
      .select('id, nombre_completo, puesto, score_total, badges_obtenidos, sucursal_id')
      .eq('activo', true)
      .order('score_total', { ascending: false })
      .limit(limit)
    if (input.sucursal_id) q = q.eq('sucursal_id', input.sucursal_id)
    const { data } = await q
    return {
      ranking: (data ?? []).map((e: any, i: number) => ({
        ranking: i + 1,
        nombre: e.nombre_completo,
        puesto: e.puesto,
        score: e.score_total,
        badges: e.badges_obtenidos?.length ?? 0,
      })),
    }
  },
}

const getObjetivosEmpleado: ToolDef = {
  definition: {
    name: 'get_objetivos_empleado',
    description: 'Objetivos del período actual de un empleado con avance por KPI.',
    input_schema: {
      type: 'object',
      properties: {
        empleado_id: { type: 'string', description: 'UUID o "yo".' },
      },
      required: ['empleado_id'],
    },
  },
  async execute(sb, input, ctx) {
    let empleadoId = input.empleado_id
    if (empleadoId === 'yo') {
      if (!ctx) return { error: 'No tengo contexto del usuario.' }
      const { data: emp } = await sb
        .from('empleados')
        .select('id')
        .eq('user_id', ctx.userId)
        .maybeSingle<{ id: string }>()
      if (!emp) return { error: 'Tu usuario no está vinculado a un empleado.' }
      empleadoId = emp.id
    }
    const { data } = await sb
      .from('empleados_objetivos')
      .select('*')
      .eq('empleado_id', empleadoId)
      .eq('estado', 'en_curso')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return { mensaje: 'Este empleado no tiene objetivos en curso.' }
    return data
  },
}

/* ---------- registro ---------- */

const getFaltantes: ToolDef = {
  definition: {
    name: 'get_faltantes',
    description: 'Lista los avisos de faltantes reportados por las sucursales (sector Compras), agrupados por producto. Útil para decidir qué órdenes armar.',
    input_schema: { type: 'object', properties: { rubro: { type: 'string', description: 'farmacia|perfumeria|supermercado (opcional)' } } },
  },
  async execute(sb, input) {
    let q = sb.from('avisos_faltante').select('producto_id, texto_libre, cantidad_sugerida, sucursales(nombre), productos_catalogo(nombre)').eq('estado', 'nuevo').limit(500)
    if (input.rubro) q = q.eq('rubro', input.rubro)
    const { data, error } = await q
    if (error) return { error: error.message }
    const map = new Map<string, { producto: string; avisos: number; total: number; sucursales: string[] }>()
    for (const a of (data ?? []) as any[]) {
      const nombre = pickOne<any>(a.productos_catalogo)?.nombre ?? a.texto_libre ?? '—'
      const k = nombre.toLowerCase()
      const g = map.get(k) ?? { producto: nombre, avisos: 0, total: 0, sucursales: [] }
      g.avisos++; g.total += Number(a.cantidad_sugerida || 0)
      const suc = pickOne<any>(a.sucursales)?.nombre; if (suc && !g.sucursales.includes(suc)) g.sucursales.push(suc)
      map.set(k, g)
    }
    const items = [...map.values()].sort((a, b) => b.avisos - a.avisos)
    return { total_productos: items.length, items: items.slice(0, 30) }
  },
}

const getScoreProveedor: ToolDef = {
  definition: {
    name: 'score_proveedor',
    description: 'Devuelve el score (0-10) y la última actividad de un proveedor por nombre, calculado de sus recepciones (puntualidad, faltantes, daños).',
    input_schema: { type: 'object', properties: { nombre: { type: 'string', description: 'nombre o parte del nombre del proveedor' } }, required: ['nombre'] },
  },
  async execute(sb, input) {
    const { data } = await sb.from('proveedores').select('id, razon_social, score_actual, rubros, es_drogueria').ilike('razon_social', `%${input.nombre}%`).limit(5)
    if (!data?.length) return { error: 'No encontré ese proveedor.' }
    const out = []
    for (const p of data as any[]) {
      const { data: ev } = await sb.from('proveedor_score_eventos').select('tipo').eq('proveedor_id', p.id)
      const counts: Record<string, number> = {}
      for (const e of (ev ?? []) as any[]) counts[e.tipo] = (counts[e.tipo] ?? 0) + 1
      out.push({ proveedor: p.razon_social, score: p.score_actual, rubros: p.rubros, eventos: counts })
    }
    return { proveedores: out }
  },
}

const getOfertasActivas: ToolDef = {
  definition: {
    name: 'ofertas_activas',
    description: 'Lista las ofertas activas (para ofrecer en mostrador). Devuelve nombre, tipo y productos.',
    input_schema: { type: 'object', properties: {} },
  },
  async execute(sb) {
    const { data, error } = await sb.from('ofertas').select('nombre, tipo, valor, productos_ids, fecha_fin').eq('estado', 'activa').limit(50)
    if (error) return { error: error.message }
    return { cantidad: (data ?? []).length, ofertas: (data ?? []).map((o: any) => ({ nombre: o.nombre, tipo: o.tipo, valor: o.valor, vence: o.fecha_fin })) }
  },
}

const getOfertaParaCliente: ToolDef = {
  definition: {
    name: 'oferta_para_cliente',
    description: 'Dado un producto que el cliente lleva, sugiere qué ofertas activas ofrecerle (semilla del asistente de mostrador).',
    input_schema: { type: 'object', properties: { producto: { type: 'string', description: 'nombre o SKU del producto' } }, required: ['producto'] },
  },
  async execute(sb, input) {
    const { data: prods } = await sb.from('productos_catalogo').select('id, nombre').or(`nombre.ilike.%${input.producto}%,sku.ilike.%${input.producto}%`).limit(3)
    if (!prods?.length) return { sugerencias: [], nota: 'No encontré ese producto.' }
    const ids = (prods as any[]).map((p) => p.id)
    const { data: ofertas } = await sb.from('ofertas').select('nombre, tipo, valor, productos_ids').eq('estado', 'activa').overlaps('productos_ids', ids).limit(20)
    return { producto: (prods as any[])[0]?.nombre, sugerencias: (ofertas ?? []).map((o: any) => ({ nombre: o.nombre, tipo: o.tipo, valor: o.valor })) }
  },
}

const getEstadoLectura: ToolDef = {
  definition: {
    name: 'estado_lectura_oferta',
    description: 'Cuántos empleados confirmaron que vieron una oferta (por nombre).',
    input_schema: { type: 'object', properties: { nombre: { type: 'string' } }, required: ['nombre'] },
  },
  async execute(sb, input) {
    const { data: of } = await sb.from('ofertas').select('id, nombre, version').ilike('nombre', `%${input.nombre}%`).eq('estado', 'activa').limit(1).maybeSingle()
    if (!of) return { error: 'No encontré esa oferta activa.' }
    const { data: confs } = await sb.from('ofertas_confirmaciones').select('version_confirmada').eq('oferta_id', (of as any).id)
    const total = (confs ?? []).length
    const ok = (confs ?? []).filter((c: any) => c.version_confirmada >= ((of as any).version ?? 1)).length
    return { oferta: (of as any).nombre, confirmaron: ok, total, pct: total > 0 ? Math.round((ok / total) * 100) : 0 }
  },
}

export const AI_TOOLS: Record<string, ToolDef> = {
  ofertas_activas: getOfertasActivas,
  oferta_para_cliente: getOfertaParaCliente,
  estado_lectura_oferta: getEstadoLectura,
  get_faltantes: getFaltantes,
  score_proveedor: getScoreProveedor,
  get_pedidos: getPedidos,
  get_resumen_ventas: getResumenVentas,
  get_facturas_vencer: getFacturasVencer,
  get_cash_flow_resumen: getCashFlowResumen,
  get_stock_critico: getStockCritico,
  get_vencimientos_proximos: getVencimientosProximos,
  get_proveedor_resumen: getProveedorResumen,
  get_anomalias: getAnomalias,
  // F6.19
  crear_tarea: crearTarea,
  listar_tareas: listarTareas,
  actualizar_estado_tarea: actualizarEstadoTarea,
  asignar_tarea: asignarTarea,
  priorizar_mis_tareas: priorizarMisTareas,
  get_performance_empleado: getPerformanceEmpleado,
  get_ranking_sucursal: getRankingSucursal,
  get_objetivos_empleado: getObjetivosEmpleado,
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
  // F6.19
  crear_tarea: 'Creando tarea',
  listar_tareas: 'Buscando tareas',
  actualizar_estado_tarea: 'Actualizando tarea',
  asignar_tarea: 'Asignando tarea',
  priorizar_mis_tareas: 'Ordenando tus tareas',
  get_performance_empleado: 'Analizando performance',
  get_ranking_sucursal: 'Calculando ranking',
  get_objetivos_empleado: 'Mirando objetivos',
  get_faltantes: 'Revisando faltantes',
  score_proveedor: 'Evaluando proveedor',
  ofertas_activas: 'Mirando ofertas',
  oferta_para_cliente: 'Buscando ofertas',
  estado_lectura_oferta: 'Revisando lecturas',
}

export async function runTool(
  sb: Sb,
  name: string,
  input: Record<string, any>,
  ctx?: ToolCtx,
): Promise<unknown> {
  const tool = AI_TOOLS[name]
  if (!tool) return { error: `Tool desconocida: ${name}` }
  try {
    return await tool.execute(sb, input || {}, ctx)
  } catch (e: any) {
    return { error: e?.message || 'Error ejecutando la tool.' }
  }
}
