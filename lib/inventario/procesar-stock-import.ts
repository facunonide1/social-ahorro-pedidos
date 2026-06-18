/**
 * Procesamiento del import de stock diario (OPS · T3) — reusable (futuro agente
 * SIFACO F20). Separado del upload/UI. Recibe el admin client de Supabase.
 *
 * Modelo: "ventas por diferencia". Para cada producto:
 *   delta = stock_nuevo − stock_actual (de stock_items en esa sucursal)
 *   delta < 0  → VENTA (se vendió |delta|); si hay cantidad_vendida declarada y
 *                difiere de |delta| → DISCREPANCIA (posible faltante/robo).
 *   delta > 0  → INGRESO (carga/ajuste no registrado).
 *   delta = 0  → SIN CAMBIO.
 * Se inserta un movimiento FIRMADO (cantidad=delta); el trigger deriva stock_items.
 */

export type FilaImport = {
  fila: number
  sku?: string | null
  ean?: string | null
  nombre?: string | null
  stock_nuevo: number
  cantidad_vendida?: number | null
}

export type Interpretacion =
  | 'venta' | 'ingreso' | 'sin_cambio' | 'discrepancia' | 'no_encontrado'

export type ItemAnalizado = {
  fila: number
  sku: string | null
  ean: string | null
  nombre_origen: string | null
  producto_id: string | null
  nombre_match: string | null
  match_via: 'sku' | 'ean' | 'aprendido' | 'nombre' | null
  stock_anterior: number | null
  stock_nuevo: number
  diferencia: number
  cantidad_vendida_declarada: number | null
  interpretado_como: Interpretacion
}

function norm(s?: string | null): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

type Catalogo = {
  id: string
  sku: string | null
  codigo_barras: string | null
  nombre: string
}

/** Analiza filas contra el catálogo + stock actual. NO escribe nada. */
export async function analizarImportStock(
  adm: any,
  sucursalId: string,
  filas: FilaImport[],
): Promise<ItemAnalizado[]> {
  const { data: cat } = await adm
    .from('productos_catalogo')
    .select('id, sku, codigo_barras, nombre')
    .eq('activo', true)
    .limit(20000)
  const catalogo = (cat ?? []) as Catalogo[]

  const porSku = new Map<string, Catalogo>()
  const porEan = new Map<string, Catalogo>()
  const porNombre = new Map<string, Catalogo>()
  for (const c of catalogo) {
    if (c.sku) porSku.set(c.sku.trim().toLowerCase(), c)
    if (c.codigo_barras) porEan.set(c.codigo_barras.trim(), c)
    porNombre.set(norm(c.nombre), c)
  }

  const { data: apr } = await adm.from('matcheos_aprendidos').select('texto_origen, producto_id')
  const aprendidos = new Map<string, string>(
    ((apr ?? []) as any[]).map((a) => [norm(a.texto_origen), a.producto_id]),
  )

  const { data: stk } = await adm
    .from('stock_items')
    .select('producto_id, cantidad')
    .eq('sucursal_id', sucursalId)
  const stockActual = new Map<string, number>(
    ((stk ?? []) as any[]).map((s) => [s.producto_id, Number(s.cantidad)]),
  )

  return filas.map((f) => {
    let match: Catalogo | null = null
    let via: ItemAnalizado['match_via'] = null
    const sku = f.sku?.trim() || null
    const ean = f.ean?.trim() || null
    const nombre = f.nombre?.trim() || null

    if (sku && porSku.has(sku.toLowerCase())) { match = porSku.get(sku.toLowerCase())!; via = 'sku' }
    else if (ean && porEan.has(ean)) { match = porEan.get(ean)!; via = 'ean' }
    else if (nombre && aprendidos.has(norm(nombre))) {
      const id = aprendidos.get(norm(nombre))!
      match = catalogo.find((c) => c.id === id) ?? null; via = match ? 'aprendido' : null
    } else if (nombre && porNombre.has(norm(nombre))) { match = porNombre.get(norm(nombre))!; via = 'nombre' }

    if (!match) {
      return {
        fila: f.fila, sku, ean, nombre_origen: nombre, producto_id: null, nombre_match: null,
        match_via: null, stock_anterior: null, stock_nuevo: f.stock_nuevo, diferencia: 0,
        cantidad_vendida_declarada: f.cantidad_vendida ?? null, interpretado_como: 'no_encontrado',
      }
    }

    const tieneStock = stockActual.has(match.id)
    const anterior = stockActual.get(match.id) ?? 0
    const diferencia = f.stock_nuevo - anterior
    const declarada = f.cantidad_vendida ?? null

    let interp: Interpretacion
    if (diferencia === 0) interp = 'sin_cambio'
    else if (diferencia > 0) interp = 'ingreso'
    else {
      // bajó → venta; ¿discrepancia?
      const bajaReal = -diferencia
      interp = declarada != null && Math.abs(declarada - bajaReal) > 0.001 ? 'discrepancia' : 'venta'
    }

    return {
      fila: f.fila, sku, ean, nombre_origen: nombre, producto_id: match.id, nombre_match: match.nombre,
      match_via: via, stock_anterior: tieneStock ? anterior : null, stock_nuevo: f.stock_nuevo,
      diferencia, cantidad_vendida_declarada: declarada, interpretado_como: interp,
    }
  })
}

/** Confirma el import: crea stock_imports + items + movimientos. Idempotente por hash. */
export async function confirmarImportStock(
  adm: any,
  args: {
    sucursalId: string
    fecha: string
    archivo: string
    hash: string
    mapeo?: Record<string, unknown>
    items: ItemAnalizado[]
    userId: string | null
    esDemo?: boolean
  },
): Promise<{ importId: string; ventas: number; ingresos: number; discrepancias: number; sinMatch: number; yaProcesado?: boolean }> {
  // Idempotencia
  const { data: prev } = await adm.from('stock_imports').select('id').eq('hash_archivo', args.hash).maybeSingle()
  if (prev) {
    return { importId: prev.id, ventas: 0, ingresos: 0, discrepancias: 0, sinMatch: 0, yaProcesado: true }
  }

  const { items } = args
  const ventasU = items.filter((i) => i.interpretado_como === 'venta' || i.interpretado_como === 'discrepancia')
    .reduce((a, i) => a + Math.abs(i.diferencia), 0)
  const discrepancias = items.filter((i) => i.interpretado_como === 'discrepancia').length
  const sinMatch = items.filter((i) => i.interpretado_como === 'no_encontrado').length
  const ingresos = items.filter((i) => i.interpretado_como === 'ingreso').length

  const { data: imp, error: impErr } = await adm.from('stock_imports').insert({
    sucursal_id: args.sucursalId, fecha: args.fecha, archivo_nombre: args.archivo, hash_archivo: args.hash,
    filas_total: items.length, filas_ok: items.length - sinMatch, filas_error: sinMatch,
    ventas_detectadas: Math.round(ventasU), discrepancias, estado: sinMatch > 0 ? 'parcial' : 'ok',
    mapeo_usado: args.mapeo ?? null, created_by: args.userId, es_demo: args.esDemo ?? false,
  }).select('id').single()
  if (impErr) throw new Error(impErr.message)
  const importId = imp.id as string

  // Items del import
  await adm.from('stock_imports_items').insert(items.map((i) => ({
    import_id: importId, fila: i.fila, sku: i.sku, ean: i.ean, nombre_origen: i.nombre_origen,
    producto_id: i.producto_id, stock_anterior: i.stock_anterior, stock_nuevo: i.stock_nuevo,
    diferencia: i.diferencia, interpretado_como: i.interpretado_como,
    cantidad_vendida_declarada: i.cantidad_vendida_declarada,
  })))

  // Movimientos (trigger deriva stock_items). Solo los que cambian y tienen match.
  const movs = items
    .filter((i) => i.producto_id && i.diferencia !== 0 && i.interpretado_como !== 'no_encontrado' && i.interpretado_como !== 'sin_cambio')
    .map((i) => ({
      producto_id: i.producto_id, sucursal_id: args.sucursalId,
      tipo: i.diferencia < 0 ? 'venta' : 'import_diferencia',
      cantidad: i.diferencia,
      motivo: i.interpretado_como === 'discrepancia'
        ? `Import ${args.fecha}: declaró ${i.cantidad_vendida_declarada}, baja real ${-i.diferencia}`
        : `Import de stock ${args.fecha}`,
      referencia_tipo: 'stock_import', referencia_id: importId, fecha: new Date().toISOString(),
      created_by: args.userId, es_demo: args.esDemo ?? false,
    }))
  if (movs.length > 0) {
    const { error: movErr } = await adm.from('movimientos_stock').insert(movs)
    if (movErr) throw new Error(movErr.message)
  }

  return { importId, ventas: Math.round(ventasU), ingresos, discrepancias, sinMatch }
}
