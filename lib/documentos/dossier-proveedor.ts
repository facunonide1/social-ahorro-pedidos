import { DOC_CONC_DIAS_TAREA } from '@/lib/documentos/config'

type Adm = any

export type DossierProveedor = {
  conDiferencia: number
  montoReclamado: number
  montoRecuperado: number
  /** Cuántos días tarda, en promedio, en llegar la nota de crédito. */
  diasHastaAcreditar: number | null
  reclamosAbiertos: number
  dias: number
}

/**
 * El historial de diferencias de un proveedor, en números.
 *
 * Es el dossier para sentarse a negociar: "en los últimos 90 días te
 * reclamamos X, acreditaste Y, y tardás Z días" pesa distinto que "siempre
 * facturan de más".
 */
export async function dossierProveedor(
  adm: Adm,
  proveedorId: string,
  dias = 90,
): Promise<DossierProveedor> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()

  const [{ data: concs }, { data: reclamos }] = await Promise.all([
    adm
      .from('doc_conciliaciones')
      .select('id, estado, monto_diferencia')
      .eq('proveedor_id', proveedorId)
      .gte('created_at', desde),
    adm
      .from('devoluciones_proveedor')
      .select('id, estado, monto_esperado, created_at, conciliacion_id')
      .eq('proveedor_id', proveedorId)
      .gte('created_at', desde),
  ])

  const cs = (concs ?? []) as any[]
  const rs = (reclamos ?? []) as any[]

  const conDiferencia = cs.filter((c) => c.estado === 'con_diferencias').length
  const montoReclamado = rs.reduce((a, r) => a + Number(r.monto_esperado ?? 0), 0)

  // Recuperado = lo que ya llegó como nota de crédito o quedó cerrado.
  const acreditados = rs.filter((r) => r.estado === 'nota_credito_recibida' || r.estado === 'cerrada')
  const montoRecuperado = acreditados.reduce((a, r) => a + Number(r.monto_esperado ?? 0), 0)

  const reclamosAbiertos = rs.filter((r) => r.estado === 'registrada' || r.estado === 'enviada').length

  return {
    conDiferencia,
    montoReclamado: +montoReclamado.toFixed(2),
    montoRecuperado: +montoRecuperado.toFixed(2),
    // Sin fecha de acreditación en la tabla, no se inventa un promedio.
    diasHastaAcreditar: null,
    reclamosAbiertos,
    dias,
  }
}

/**
 * Tarea de control por diferencias que se quedaron sin resolver.
 *
 * Regla de oro 5: lo que queda abierto tiene que llegarle a alguien. Sin esto,
 * la bandeja se convierte en un cementerio de casos que nadie mira.
 *
 * Patrón lazy, igual que el motor de reclamos: Vercel Hobby no tiene crons
 * finos, así que se procesa al abrir la bandeja.
 */
export async function generarTareasDeControl(adm: Adm): Promise<number> {
  try {
    const limite = new Date(Date.now() - DOC_CONC_DIAS_TAREA * 86_400_000).toISOString()

    const { data: viejas } = await adm
      .from('doc_conciliaciones')
      .select('id, monto_diferencia, proveedores:proveedor_id(razon_social), sucursal_id')
      .eq('estado', 'con_diferencias')
      .lte('created_at', limite)
      .limit(50)

    const filas = (viejas ?? []) as any[]
    if (!filas.length) return 0

    // No repetir la tarea si ya se generó para esa conciliación.
    const { data: yaHechas } = await adm
      .from('tareas')
      .select('entidad_id')
      .eq('entidad_relacionada', 'conciliacion')
      .in('entidad_id', filas.map((f) => f.id))

    const hechas = new Set(((yaHechas ?? []) as any[]).map((t) => t.entidad_id))
    const pendientes = filas.filter((f) => !hechas.has(f.id))
    if (!pendientes.length) return 0

    const { data: tipo } = await adm
      .from('tipos_tareas')
      .select('id')
      .eq('codigo', 'CONTROL_CONCILIACION')
      .maybeSingle()

    if (!tipo) return 0

    const fmt = (n: number) =>
      Number(n).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

    await adm.from('tareas').insert(
      pendientes.map((c) => ({
        tipo_tarea_id: tipo.id,
        titulo: `Resolver diferencia con ${c.proveedores?.razon_social ?? 'proveedor'}`,
        descripcion:
          `Hay ${fmt(c.monto_diferencia ?? 0)} en diferencias sin resolver hace más de ${DOC_CONC_DIAS_TAREA} días. ` +
          `Reclamalo o cerralo con un motivo: /admin/compras/conciliaciones/${c.id}`,
        estado: 'pendiente',
        prioridad: 'alta',
        sucursal_id: c.sucursal_id,
        entidad_relacionada: 'conciliacion',
        entidad_id: c.id,
      })),
    )

    return pendientes.length
  } catch (e) {
    console.error('[conciliacion] no se pudieron generar las tareas de control', e)
    return 0
  }
}
