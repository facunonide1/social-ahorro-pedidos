/**
 * Seguimiento de reclamos a proveedores hasta la NC (OS-4a · B).
 *
 * Motor mínimo con patrón LAZY-CHECK (Vercel Hobby = solo crons diarios): el
 * procesamiento corre al primer acceso a la lista de devoluciones del día. Un
 * reclamo 'enviada' con `proximo_recordatorio_at` vencido dispara alerta al
 * responsable y reprograma el próximo recordatorio (N días) hasta que llega la
 * NC o se cierra.
 */
type Adm = any
const DIAS_RECORDATORIO = 7

/** Procesa recordatorios vencidos (lazy). Best-effort: notifica + reprograma. */
export async function procesarRecordatoriosReclamos(adm: Adm): Promise<number> {
  try {
    const ahora = new Date()
    const { data: vencidos } = await adm
      .from('devoluciones_proveedor')
      .select('id, proveedor_id, sucursal_id, created_at, proveedores(razon_social)')
      .eq('estado', 'enviada')
      .not('proximo_recordatorio_at', 'is', null)
      .lte('proximo_recordatorio_at', ahora.toISOString())
      .limit(100)
    const filas = (vencidos ?? []) as any[]
    if (!filas.length) return 0

    const { data: sup } = await adm.from('users_admin').select('id').eq('activo', true).in('rol', ['super_admin', 'gerente', 'comprador'])
    const targets = (sup ?? []).map((s: any) => s.id)
    const proximo = new Date(ahora.getTime() + DIAS_RECORDATORIO * 86_400_000).toISOString()

    for (const r of filas) {
      const nombre = r.proveedores?.razon_social ?? 'proveedor'
      if (targets.length) {
        await adm.from('notificaciones_admin').insert(targets.map((uid: string) => ({
          user_id: uid, tipo: 'alerta', prioridad: 'alta',
          titulo: 'Reclamo sin nota de crédito',
          mensaje: `El reclamo a ${nombre} sigue sin NC. Reclamá de nuevo.`,
          url_accion: `/admin/compras/devoluciones/${r.id}`,
        })))
      }
      await adm.from('devoluciones_proveedor').update({ proximo_recordatorio_at: proximo }).eq('id', r.id)
    }
    return filas.length
  } catch {
    return 0
  }
}

/** Cantidad de reclamos 'enviada' con recordatorio ya vencido (para "Lo urgente"). */
export async function contarReclamosVencidos(adm: Adm): Promise<number> {
  const { count } = await adm
    .from('devoluciones_proveedor')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'enviada')
    .not('proximo_recordatorio_at', 'is', null)
    .lte('proximo_recordatorio_at', new Date().toISOString())
  return count ?? 0
}

/** Reclamos abiertos (registrada/enviada) de un proveedor con más de `dias` días. */
export async function contarReclamosAbiertosProveedor(adm: Adm, proveedorId: string, dias = DIAS_RECORDATORIO): Promise<number> {
  const limite = new Date(Date.now() - dias * 86_400_000).toISOString()
  const { count } = await adm
    .from('devoluciones_proveedor')
    .select('id', { count: 'exact', head: true })
    .eq('proveedor_id', proveedorId)
    .in('estado', ['registrada', 'enviada'])
    .lte('created_at', limite)
  return count ?? 0
}
