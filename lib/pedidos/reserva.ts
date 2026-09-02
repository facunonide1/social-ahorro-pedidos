/**
 * RESERVAR EL STOCK CUANDO ENTRA UN PEDIDO.
 *
 * ── QUÉ PROTEGE ─────────────────────────────────────────────────────────────
 *
 * Que el mostrador, la web y PedidosYa no vendan la misma unidad dos veces. Una
 * unidad reservada por un pedido deja de estar disponible para los otros
 * canales.
 *
 * ── QUÉ NO PROTEGE, Y HAY QUE DECIRLO ───────────────────────────────────────
 *
 * El mostrador. El stock de NORA es la foto del archivo diario de SIFACO: entre
 * archivo y archivo se vende en el local y acá no se entera. La reserva es entre
 * canales, no contra el mostrador. Y como el stock es el consolidado de las
 * cuatro sucursales —falta `tabla3e` completo—, la reserva pesa sobre el total:
 * puede estar bloqueando algo que está en otro local.
 *
 * ── QUÉ PASA SI NO ALCANZA ──────────────────────────────────────────────────
 *
 * No es un error: es un caso que va a pasar. La reserva se hace igual por lo que
 * hay, y lo que falta genera una TAREA para resolverlo con el cliente —encargar,
 * cambiar o devolver—. Un pedido que se queda en un estado colgado porque faltó
 * una unidad es un pedido que nadie vuelve a mirar.
 */

import { parametro } from '@/lib/os/definicion'

type Adm = { from: (t: string) => any; rpc?: (n: string, a?: any) => any }

export interface RenglonAReservar {
  producto_id: string
  sku: string | null
  nombre: string
  cantidad: number
}

export interface Faltante {
  producto_id: string
  nombre: string
  pedido: number
  /** Lo que había disponible. `null` = no se pudo saber. */
  disponible: number | null
  reservado: number
}

export interface ResultadoReserva {
  reservadas: number
  faltantes: Faltante[]
  /** La tarea que se creó por los faltantes, si hubo. */
  tarea_id: string | null
  vence_at: string
}

/** Horas que una reserva bloquea stock antes de vencer. */
export async function horasDeReserva(): Promise<number> {
  return parametro('pedidos', 'horas_reserva', 48)
}

function codigoTarea() {
  return `PED-${Date.now().toString(36).slice(-5).toUpperCase()}`
}

export async function reservarParaPedido(
  adm: Adm,
  opts: {
    orderId: string
    codigoPedido: string
    sucursalId: string | null
    renglones: RenglonAReservar[]
    userId: string | null
  },
): Promise<ResultadoReserva> {
  const horas = await horasDeReserva()
  const vence = new Date(Date.now() + horas * 3_600_000).toISOString()

  const ids = [...new Set(opts.renglones.map((r) => r.producto_id))]
  const { data: disponibles } = await adm
    .from('stock_disponible')
    .select('producto_id, stock, reservado, disponible')
    .in('producto_id', ids)
    .limit(200)

  const porId = new Map<string, any>((disponibles ?? []).map((d: any) => [d.producto_id, d]))

  const filas: any[] = []
  const faltantes: Faltante[] = []

  for (const r of opts.renglones) {
    const d = porId.get(r.producto_id)
    // `disponible` null = SIFACO no declara stock de este producto. No es cero:
    // se reserva igual y se anota que no se pudo verificar.
    const disp = d?.disponible === null || d?.disponible === undefined ? null : Number(d.disponible)
    if (disp !== null && disp < r.cantidad) {
      faltantes.push({
        producto_id: r.producto_id, nombre: r.nombre,
        pedido: r.cantidad, disponible: disp, reservado: Number(d?.reservado ?? 0),
      })
    }
    filas.push({
      order_id: opts.orderId,
      producto_id: r.producto_id,
      sku: r.sku,
      cantidad: r.cantidad,
      sucursal_id: opts.sucursalId,
      vence_at: vence,
      creada_por: opts.userId,
    })
  }

  if (filas.length > 0) await adm.from('reservas_stock').insert(filas)

  let tareaId: string | null = null
  if (faltantes.length > 0) {
    const detalle = faltantes
      .map((f) => `· ${f.nombre}: se pidieron ${f.pedido} y hay ${f.disponible} disponibles (${f.reservado} ya reservados por otros pedidos).`)
      .join('\n')
    const { data: tarea } = await adm.from('tareas').insert({
      codigo: codigoTarea(),
      tipo_origen: 'auto_sistema',
      titulo: `Falta stock en el pedido ${opts.codigoPedido}`,
      descripcion:
        `El pedido se tomó igual, con lo que hay. Hay que resolverlo con el cliente: encargar, cambiar o devolver.\n\n${detalle}\n\n` +
        `El stock es la foto del archivo diario de SIFACO y es el total de las cuatro sucursales, sin apertura por local. ` +
        `Puede que la unidad esté físicamente en otro local, o que se haya vendido en el mostrador después del último archivo.`,
      prioridad: 'alta',
      estado: 'pendiente',
      asignacion_tipo: opts.sucursalId ? 'pool_sucursal' : 'usuario_especifico',
      sucursal_id: opts.sucursalId,
      responsable_id: opts.sucursalId ? null : opts.userId,
      verificacion_humana: true,
      entidad_relacionada: 'pedido',
      entidad_id: opts.orderId,
      entidad_url: `/admin/pedidos/tablero`,
      datos_custom: { tipo: 'falta_stock', faltantes },
    }).select('id').maybeSingle()
    tareaId = tarea?.id ?? null
  }

  return { reservadas: filas.length, faltantes, tarea_id: tareaId, vence_at: vence }
}

/**
 * Cierra las reservas de un pedido.
 *
 *   consumida → se despachó: la unidad salió y SIFACO la va a descontar sola.
 *   liberada  → se canceló o se sacó el renglón: la unidad vuelve a estar.
 *
 * NORA nunca ajusta stock (regla de oro 1): cerrar una reserva no escribe en
 * SIFACO, sólo deja de bloquear.
 */
export async function cerrarReservas(
  adm: Adm,
  orderId: string,
  estado: 'consumida' | 'liberada',
  motivo: string,
): Promise<number> {
  const { data } = await adm.from('reservas_stock')
    .update({ estado, cerrada_at: new Date().toISOString(), motivo_cierre: motivo })
    .eq('order_id', orderId).eq('estado', 'activa')
    .select('id')
  return (data ?? []).length
}
