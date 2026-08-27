import { createAdminClient } from '@/lib/supabase/server'

/**
 * PEDIR QUE CORRIJAN EL STOCK EN EL SISTEMA AUTORIDAD.
 *
 * NORA no ajusta stock: la autoridad es SIFACO, la corrección la hace una
 * persona allá, y esto es el pedido.
 *
 * Vive acá y no en cada pantalla porque el pedido tiene que ser el mismo salga
 * de donde salga: del cierre de un conteo o de la ficha de un producto. Si
 * hubiera dos textos, uno de los dos se quedaría viejo — y el que se quede
 * viejo va a ser el que menos se usa, que es justamente el que alguien lee sin
 * contexto.
 *
 * Reusa el mismo tipo de tarea que el conteo (`cnt_ajuste_sistema_autoridad`),
 * con su verificación humana y su rol verificador ya declarados.
 */
export interface PedidoDeCorreccion {
  productoId: string
  sku: string | null
  descripcion: string
  puntoId: string
  /** Lo que el sistema dice hoy. Null si no se pudo leer. */
  cantidadSistema: number | null
  /** Lo que quien pide dice que hay de verdad. */
  cantidadReal: number
  /** Por qué. Escrito por la persona, obligatorio. */
  motivo: string
  /** De dónde salió: la pantalla o el hecho que lo originó. */
  origen: string
  autorId: string
}

export async function pedirCorreccionDeStock(
  p: PedidoDeCorreccion,
): Promise<{ ok: true; tareaId: string } | { ok: false; error: string }> {
  const adm = createAdminClient()

  const { data: tipo } = await adm
    .from('tipos_tareas')
    .select('id')
    .eq('codigo', 'cnt_ajuste_sistema_autoridad')
    .maybeSingle<{ id: string }>()
  if (!tipo) {
    return { ok: false, error: 'No está declarado el tipo de tarea para corregir en el sistema autoridad.' }
  }

  const dif = p.cantidadSistema === null ? null : p.cantidadReal - p.cantidadSistema
  const linea =
    p.cantidadSistema === null
      ? `· ${p.sku ?? 's/SKU'} ${p.descripcion}: dejarlo en ${p.cantidadReal}. (No se pudo leer lo que el sistema tiene hoy.)`
      : `· ${p.sku ?? 's/SKU'} ${p.descripcion}: el sistema dice ${p.cantidadSistema}, hay ${p.cantidadReal} · diferencia ${dif! > 0 ? '+' : ''}${dif}`

  const { data, error } = await adm
    .from('tareas')
    .insert({
      tipo_tarea_id: tipo.id,
      tipo_origen: 'auto_sistema',
      titulo: `Corregir en el sistema autoridad — ${p.descripcion}`,
      descripcion:
        `NORA no ajusta stock: la corrección se hace en el sistema que manda, y esta tarea es el pedido.\n\n` +
        `${linea}\n\n` +
        `Motivo: ${p.motivo}\n` +
        `Pedido desde: ${p.origen}\n\n` +
        `Cuando esté corregido, cerrá esta tarea. NORA no puede verificar que se haya hecho.`,
      prioridad: 'alta',
      estado: 'pendiente',
      sucursal_id: p.puntoId,
      entidad_relacionada: 'producto',
      entidad_id: p.productoId,
      entidad_url: `/admin/operaciones/stock?producto=${p.productoId}`,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: 'No se pudo crear la tarea de corrección.' }
  return { ok: true, tareaId: (data as { id: string }).id }
}
