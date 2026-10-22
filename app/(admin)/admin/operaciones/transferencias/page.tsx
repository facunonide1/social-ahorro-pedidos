import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { PageHeader } from '@/components/shared/page-header'
import { tituloDePantalla } from '@/lib/os/definicion'
import { TransferenciasClient, type TransferRow } from './transferencias-client'

import { sinDemo } from '@/lib/demo/estado'
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Transferencias' }

export default async function TransferenciasPage() {
  // Puede venir de la declaración de la fábrica. Si el lector está apagado
  // o algo falla, devuelve este mismo texto: la pantalla no cambia.
  const tituloDeclarado = await tituloDePantalla('stock', '/admin/operaciones/transferencias', 'Transferencias entre sucursales')

  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo', 'auditor'] })
  const adm = createAdminClient()
  const { sucursalId, esTodas } = getSucursalActiva()

  // El lente de demostración (v0.81) llegaba sólo al panel de inicio y a la
  // campana. El sector Operaciones mostraba datos inventados sin decirlo, y el
  // panel llegó a afirmar «56 quiebres» sobre 480 filas de demostración (v0.85).
  let q = adm.from('transferencias_sucursal')
    .select('id, estado, sucursal_origen_id, sucursal_destino_id, fecha_solicitud, fecha_envio, fecha_recepcion, diferencia_detectada, origen_pedido, foto_salida, foto_recepcion')
    .order('created_at', { ascending: false }).limit(120)
  if (!esTodas && sucursalId) q = q.or(`sucursal_origen_id.eq.${sucursalId},sucursal_destino_id.eq.${sucursalId}`)
  if (sinDemo()) q = q.eq('es_demo', false)

  // D.5 · Lo que figura como salida y no llegó. Va aparte de la lista porque
  // es lo primero que hay que ver: una transferencia con diferencia queda
  // abierta hasta que alguien escriba el motivo.
  let qd = adm.from('transferencias_diferencias').select('*').eq('abierta', true)
  if (!esTodas && sucursalId) qd = qd.limit(100)

  const [{ data }, { data: sucs }, { data: items }, { data: difs }] = await Promise.all([
    q,
    adm.from('sucursales').select('id, nombre').order('nombre'),
    adm.from('transferencia_items').select('transferencia_id'),
    qd,
  ])
  const nombreSuc = new Map<string, string>(((sucs ?? []) as any[]).map((s) => [s.id, s.nombre]))
  const conteo = new Map<string, number>()
  for (const it of (items ?? []) as any[]) conteo.set(it.transferencia_id, (conteo.get(it.transferencia_id) ?? 0) + 1)

  const rows: TransferRow[] = ((data ?? []) as any[]).map((t) => {
    const horas = t.estado === 'en_transito' && t.fecha_envio ? (Date.now() - new Date(t.fecha_envio).getTime()) / 3.6e6 : null
    return {
      id: t.id, estado: t.estado, origen: nombreSuc.get(t.sucursal_origen_id) ?? '—', destino: nombreSuc.get(t.sucursal_destino_id) ?? '—',
      nItems: conteo.get(t.id) ?? 0, fecha_solicitud: t.fecha_solicitud, fecha_envio: t.fecha_envio,
      fecha_recepcion: t.fecha_recepcion, diferencia_detectada: !!t.diferencia_detectada, horas_transito: horas,
      origen_pedido: t.origen_pedido ?? null,
      // D.4 · Las dos fotos de PANTALLA DE SIFACO: la de lo que sale y la de lo
      // que entra. Son las que permiten comparar los dos lados.
      tiene_fotos: !!t.foto_salida && !!t.foto_recepcion,
    }
  })
  const sinRecibir = rows.filter((r) => r.estado === 'en_transito' && (r.horas_transito ?? 0) > 48).length

  return (
    <>
      <PageHeader title={tituloDeclarado}
        description="NORA acompaña: el stock se mueve en SIFACO. Acá quedan el pedido, las dos fotos de pantalla y las diferencias."
        breadcrumbs={[{ label: 'Operación', href: '/admin/operaciones' }, { label: 'Transferencias' }]} />
      <div className="p-4 md:p-6">
        <TransferenciasClient rows={rows} sucursales={(sucs ?? []) as any} sucursalActiva={sucursalId}
          sinRecibir={sinRecibir} diferencias={(difs ?? []) as any[]} />
      </div>
    </>
  )
}
