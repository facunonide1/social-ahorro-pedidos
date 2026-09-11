/**
 * LA RECEPCIÓN, DEL LADO DEL SERVIDOR.
 *
 * ── EL PRINCIPIO DEL REDISEÑO ───────────────────────────────────────────────
 *
 * No agregar pasos: cambiar a dónde va lo que ya se hace. Las dos fotos —la
 * factura y la pantalla de SIFACO— ya se sacan todos los días y hoy van a un
 * grupo de WhatsApp que nadie consulta después. Acá van a la misma recepción,
 * y la de la factura además pasa por el motor de documentos.
 *
 * Eso solo elimina el paso del Excel semanal y la semana de demora entre que
 * llega la mercadería y que se puede contestar cuánto se debe.
 */

type Adm = { from: (t: string) => any }

export interface ComprobanteEntrante {
  rol: 'factura' | 'remito' | 'pantalla_sifaco' | 'otro'
  archivo_url?: string | null
  extraccion_id?: string | null
  numero_leido?: string | null
  total_leido?: number | null
  nota?: string | null
}

export interface RecepcionEntrante {
  proveedor_id: string
  sucursal_id: string
  numero_remito?: string | null
  observaciones?: string | null
  sellado?: boolean
  ingresado_a_sifaco?: boolean
  comprobantes: ComprobanteEntrante[]
}

function codigoTarea() {
  return `REC-${Date.now().toString(36).slice(-5).toUpperCase()}`
}

export interface ResultadoRecepcion {
  id: string
  comprobantes: number
  tarea_id: string | null
  /** Las facturas que quedaron esperando que alguien revise lo que leyó el motor. */
  para_revisar: string[]
}

/**
 * Crea la recepción con sus comprobantes y deja la tarea de control.
 *
 * Regla de oro 5: una recepción completada genera tarea. La foto de la factura
 * queda como extracción del motor de documentos y hay que confirmarla —ahí es
 * donde se llena el histórico de costos—, así que la tarea apunta a eso.
 */
export async function crearRecepcion(
  adm: Adm,
  datos: RecepcionEntrante,
  userId: string | null,
  sucursalNombre?: string | null,
): Promise<{ ok: true; recepcion: ResultadoRecepcion } | { ok: false; error: string }> {
  if (!datos.proveedor_id) return { ok: false, error: 'Falta el proveedor.' }
  // Regla de oro 8: toda recepción sale de una sucursal, y tiene impacto fiscal.
  if (!datos.sucursal_id) return { ok: false, error: 'Falta la sucursal. Es obligatoria: la compra tiene impacto fiscal.' }

  const { data: rec, error } = await adm.from('recepciones_mercaderia').insert({
    proveedor_id: datos.proveedor_id,
    sucursal_id: datos.sucursal_id,
    numero_remito: datos.numero_remito || null,
    observaciones: datos.observaciones || null,
    sellado: !!datos.sellado,
    ingresado_a_sifaco: !!datos.ingresado_a_sifaco,
    estado: 'completa',
    recibido_por: userId,
    fecha_recepcion: new Date().toISOString(),
  }).select('id').maybeSingle()

  if (error || !rec) return { ok: false, error: error?.message ?? 'No se pudo crear la recepción.' }

  const comps = (datos.comprobantes ?? []).filter((c) => c.archivo_url || c.extraccion_id || c.numero_leido)
  if (comps.length) {
    await adm.from('recepcion_comprobantes').insert(comps.map((c) => ({
      recepcion_id: rec.id,
      rol: c.rol,
      archivo_url: c.archivo_url ?? null,
      extraccion_id: c.extraccion_id ?? null,
      numero_leido: c.numero_leido ?? null,
      total_leido: c.total_leido ?? null,
      nota: c.nota ?? null,
      created_by: userId,
    })))
  }

  const paraRevisar = comps.filter((c) => c.rol === 'factura' && c.extraccion_id).map((c) => c.extraccion_id!)

  const { data: prov } = await adm.from('proveedores')
    .select('razon_social').eq('id', datos.proveedor_id).maybeSingle()

  // ── REGLA DE ORO 5 ────────────────────────────────────────────────────────
  const detalle = paraRevisar.length
    ? `Hay ${paraRevisar.length} factura(s) leída(s) por el motor esperando que alguien las revise y confirme. Esa confirmación es la que carga el costo de cada producto al histórico.`
    : 'No se cargó ninguna factura en esta recepción. Si vino con factura, hay que sacarle la foto para que quede el costo.'

  const { data: tarea } = await adm.from('tareas').insert({
    codigo: codigoTarea(),
    tipo_origen: 'auto_sistema',
    titulo: `Controlar la recepción de ${prov?.razon_social ?? 'proveedor'}`,
    descripcion:
      `Llegó mercadería${sucursalNombre ? ` a ${sucursalNombre}` : ''}.\n\n${detalle}\n\n` +
      `Hay que verificar que lo recibido coincida con la factura y anotar lo que falte: lo que falta queda como pendiente con el proveedor hasta que llegue la nota de crédito.`,
    prioridad: 'media',
    estado: 'pendiente',
    asignacion_tipo: 'pool_sucursal',
    sucursal_id: datos.sucursal_id,
    verificacion_humana: true,
    entidad_relacionada: 'recepcion',
    entidad_id: rec.id,
    entidad_url: `/admin/recepciones/${rec.id}`,
    datos_custom: { tipo: 'control_recepcion', proveedor_id: datos.proveedor_id },
  }).select('id').maybeSingle()

  if (tarea?.id) {
    await adm.from('recepciones_mercaderia').update({ tarea_control_id: tarea.id }).eq('id', rec.id)
  }

  return {
    ok: true,
    recepcion: { id: rec.id, comprobantes: comps.length, tarea_id: tarea?.id ?? null, para_revisar: paraRevisar },
  }
}
