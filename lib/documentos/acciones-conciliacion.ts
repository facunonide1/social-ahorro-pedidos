import { emitirAviso } from '@/lib/ai/nora'
import { DOC_CONC_MONTO_MINIMO } from '@/lib/documentos/config'
import { conciliar } from '@/lib/documentos/conciliar'
import { resumirConciliacion } from '@/lib/documentos/conciliacion-texto'

type Adm = any

/** Mismo intervalo que ya usa el seguimiento de reclamos hasta la NC. */
const DIAS_RECORDATORIO = 7

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

/**
 * Acciones sobre las diferencias de una conciliación.
 *
 * Los reclamos viven en `devoluciones_proveedor`, el módulo que YA existe en
 * Compras con sus estados, sus recordatorios y su flujo de nota de crédito. No
 * se construye uno paralelo: un segundo lugar donde mirar reclamos es un lugar
 * donde no se mira ninguno.
 */

async function contexto(adm: Adm, conciliacionId: string) {
  const { data: c } = await adm
    .from('doc_conciliaciones')
    .select('id, proveedor_id, sucursal_id, estado, monto_diferencia, proveedores:proveedor_id(razon_social)')
    .eq('id', conciliacionId)
    .maybeSingle()
  return c
}

/**
 * D.1 · Cantidad faltante → reclamo.
 *
 * El reclamo nace con producto, cantidad, monto y el documento de origen, así
 * quien lo manda tiene todo a mano sin volver a buscar los papeles.
 */
export async function reclamarFaltante(
  adm: Adm,
  args: { conciliacionId: string; userId: string | null; motivo?: string },
): Promise<{ reclamoId: string }> {
  const c = await contexto(adm, args.conciliacionId)
  if (!c?.proveedor_id || !c?.sucursal_id) {
    throw new Error('La conciliación no tiene proveedor o sucursal para armar el reclamo.')
  }

  const r = await conciliar(adm, args.conciliacionId, args.userId)
  const filas = r.filas.filter((f) => f.diferencias.some((d) => d.tipo === 'cantidad_faltante'))
  if (!filas.length) throw new Error('No hay faltantes para reclamar en esta conciliación.')

  const monto = filas.reduce(
    (a, f) => a + (f.diferencias.find((d) => d.tipo === 'cantidad_faltante')?.monto ?? 0),
    0,
  )

  const { data: rec, error } = await adm
    .from('devoluciones_proveedor')
    .insert({
      proveedor_id: c.proveedor_id,
      sucursal_id: c.sucursal_id,
      fecha: new Date().toISOString().slice(0, 10),
      motivo: 'error_pedido',
      estado: 'registrada',
      conciliacion_id: args.conciliacionId,
      monto_esperado: +monto.toFixed(2),
      observaciones:
        args.motivo ??
        `Faltantes detectados al conciliar: ${filas
          .map((f) => `${f.nombre} ${f.diferencias.find((d) => d.tipo === 'cantidad_faltante')?.cantidad}u`)
          .join(' · ')}. Total ${fmt(monto)}.`,
      created_by: args.userId,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  await adm.from('devolucion_items').insert(
    filas.map((f) => ({
      devolucion_id: rec.id,
      producto_id: f.itemId,
      cantidad: f.diferencias.find((d) => d.tipo === 'cantidad_faltante')?.cantidad ?? 0,
      motivo_especifico: 'No entregado según remito',
    })),
  )

  return { reclamoId: rec.id }
}

/**
 * D.2 · Facturado de más → nota de crédito esperada.
 *
 * Se registra como reclamo `enviada` con `proximo_recordatorio_at`, que es lo
 * que hace que el motor de recordatorios existente lo persiga hasta que la NC
 * acredite. `monto_esperado` es lo que permite cerrarlo solo cuando entra.
 */
export async function esperarNotaCredito(
  adm: Adm,
  args: { conciliacionId: string; userId: string | null },
): Promise<{ reclamoId: string; montoEsperado: number }> {
  const c = await contexto(adm, args.conciliacionId)
  if (!c?.proveedor_id || !c?.sucursal_id) {
    throw new Error('La conciliación no tiene proveedor o sucursal para armar el seguimiento.')
  }

  const r = await conciliar(adm, args.conciliacionId, args.userId)
  const filas = r.filas.filter((f) => f.diferencias.some((d) => d.tipo === 'facturado_de_mas'))
  if (!filas.length) throw new Error('No hay nada facturado de más en esta conciliación.')

  const monto = filas.reduce(
    (a, f) => a + (f.diferencias.find((d) => d.tipo === 'facturado_de_mas')?.monto ?? 0),
    0,
  )

  const { data: rec, error } = await adm
    .from('devoluciones_proveedor')
    .insert({
      proveedor_id: c.proveedor_id,
      sucursal_id: c.sucursal_id,
      fecha: new Date().toISOString().slice(0, 10),
      motivo: 'error_pedido',
      estado: 'enviada',
      conciliacion_id: args.conciliacionId,
      monto_esperado: +monto.toFixed(2),
      proximo_recordatorio_at: new Date(Date.now() + DIAS_RECORDATORIO * 86_400_000).toISOString(),
      observaciones:
        `Facturado de más: ${filas
          .map((f) => `${f.nombre} ${f.diferencias.find((d) => d.tipo === 'facturado_de_mas')?.cantidad}u`)
          .join(' · ')}. Se espera nota de crédito por ${fmt(monto)}.`,
      created_by: args.userId,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  await emitirAviso(adm, {
    tipo: 'conciliacion_nc_pendiente',
    severidad: monto >= DOC_CONC_MONTO_MINIMO ? 'alerta' : 'sugerencia',
    titulo: `Falta nota de crédito de ${(c as any).proveedores?.razon_social ?? 'el proveedor'} por ${fmt(monto)}`,
    detalle: `Facturaron más de lo que entregaron. Se reclamó y se espera la NC. Se recuerda cada ${DIAS_RECORDATORIO} días hasta que acredite.`,
    modulo: 'compras',
    accionLabel: 'Ver el reclamo',
    accionHref: `/admin/compras/devoluciones/${rec.id}`,
    entidadRef: { conciliacion_id: args.conciliacionId, reclamo_id: rec.id },
    claveDedup: `conc_nc:${args.conciliacionId}`,
  })

  return { reclamoId: rec.id, montoEsperado: +monto.toFixed(2) }
}

/**
 * D.3 · Precio distinto → decisión humana.
 *
 * Dos caminos y ninguno se elige solo. Aceptar un aumento sin registrar por qué
 * es cómo se pierde el rastro de cuándo y con qué explicación subió el costo:
 * seis meses después nadie se acuerda si fue negociado o si simplemente se dejó
 * pasar.
 */
export async function resolverPrecio(
  adm: Adm,
  args: {
    conciliacionId: string
    decision: 'reclamar' | 'aceptar'
    motivo: string
    userId: string | null
  },
): Promise<{ reclamoId?: string }> {
  const c = await contexto(adm, args.conciliacionId)
  if (!c?.proveedor_id) throw new Error('La conciliación no tiene proveedor.')
  if (!args.motivo?.trim()) throw new Error('Escribí el motivo de la decisión.')

  const r = await conciliar(adm, args.conciliacionId, args.userId)
  const filas = r.filas.filter((f) => f.diferencias.some((d) => d.tipo === 'precio_distinto'))
  if (!filas.length) throw new Error('No hay diferencias de precio en esta conciliación.')

  const monto = filas.reduce(
    (a, f) => a + (f.diferencias.find((d) => d.tipo === 'precio_distinto')?.monto ?? 0),
    0,
  )

  if (args.decision === 'aceptar') {
    // Queda escrito en la conciliación: es el rastro de por qué cambió el costo.
    await adm
      .from('doc_conciliaciones')
      .update({
        nota: `Precio nuevo aceptado (${fmt(monto)}): ${args.motivo.trim()}`,
        resuelto_por: args.userId,
        resuelto_at: new Date().toISOString(),
      })
      .eq('id', args.conciliacionId)
    return {}
  }

  if (!c.sucursal_id) throw new Error('La conciliación no tiene sucursal para armar el reclamo.')

  const { data: rec, error } = await adm
    .from('devoluciones_proveedor')
    .insert({
      proveedor_id: c.proveedor_id,
      sucursal_id: c.sucursal_id,
      fecha: new Date().toISOString().slice(0, 10),
      motivo: 'error_pedido',
      estado: 'registrada',
      conciliacion_id: args.conciliacionId,
      monto_esperado: +monto.toFixed(2),
      observaciones:
        `Diferencia de precio contra lo pactado en la orden: ${filas
          .map((f) => `${f.nombre} ${fmt(f.diferencias.find((d) => d.tipo === 'precio_distinto')?.cantidad ?? 0)}/u`)
          .join(' · ')}. Total ${fmt(monto)}. ${args.motivo.trim()}`,
      created_by: args.userId,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { reclamoId: rec.id }
}

/**
 * D.4 · Cierre manual con motivo obligatorio.
 *
 * Siempre disponible. Hay casos que el sistema no puede resolver, y trabar la
 * bandeja con ellos es peor que dejarla cerrar con una explicación escrita.
 */
export async function cerrarManual(
  adm: Adm,
  args: { conciliacionId: string; motivo: string; userId: string | null },
): Promise<void> {
  if (!args.motivo?.trim()) throw new Error('El motivo es obligatorio para cerrar a mano.')
  const { error } = await adm
    .from('doc_conciliaciones')
    .update({
      estado: 'cerrada_manual',
      motivo_cierre: args.motivo.trim(),
      resuelto_por: args.userId,
      resuelto_at: new Date().toISOString(),
    })
    .eq('id', args.conciliacionId)
  if (error) throw new Error(error.message)
}

/**
 * Aviso de diferencia, al vincular. Solo si la plata lo justifica: el feed que
 * avisa todo es un feed que nadie lee.
 */
export async function avisarDiferencia(adm: Adm, conciliacionId: string, userId: string | null): Promise<void> {
  try {
    const c = await contexto(adm, conciliacionId)
    if (!c) return
    const r = await conciliar(adm, conciliacionId, userId)
    if (r.estado !== 'con_diferencias') return
    if (Math.abs(r.totales.total) < DOC_CONC_MONTO_MINIMO) return

    await emitirAviso(adm, {
      tipo: 'conciliacion_diferencia',
      severidad: 'alerta',
      titulo: `Diferencias por ${fmt(Math.abs(r.totales.total))} con ${(c as any).proveedores?.razon_social ?? 'un proveedor'}`,
      detalle: resumirConciliacion(r),
      modulo: 'compras',
      accionLabel: 'Ver la conciliación',
      accionHref: `/admin/compras/conciliaciones/${conciliacionId}`,
      entidadRef: { conciliacion_id: conciliacionId },
      claveDedup: `conc_dif:${conciliacionId}`,
    })
  } catch (e) {
    console.error('[conciliacion] no se pudo emitir el aviso', e)
  }
}
