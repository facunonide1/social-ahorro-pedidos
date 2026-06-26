import { notFound } from 'next/navigation'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { TransferenciaDetalle } from './detalle-client'

export const dynamic = 'force-dynamic'

async function signed(adm: any, path: string | null): Promise<string | null> {
  if (!path) return null
  try { const { data } = await adm.storage.from('transferencias-fotos').createSignedUrl(path, 3600); return data?.signedUrl ?? null } catch { return null }
}

export default async function TransferenciaDetallePage({ params }: { params: { id: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'sucursal', 'encargado_sucursal', 'administrativo', 'auditor'] })
  const adm = createAdminClient()
  const { data: t } = await adm.from('transferencias_sucursal').select('*').eq('id', params.id).maybeSingle<any>()
  if (!t) notFound()

  const [{ data: items }, { data: sucs }, fc, fs, fr] = await Promise.all([
    adm.from('transferencia_items').select('id, producto_id, cantidad_enviada, cantidad_recibida, ubicacion, productos_catalogo(nombre, sku)').eq('transferencia_id', t.id),
    adm.from('sucursales').select('id, nombre'),
    signed(adm, t.foto_creacion), signed(adm, t.foto_salida), signed(adm, t.foto_recepcion),
  ])
  const nombreSuc = new Map<string, string>(((sucs ?? []) as any[]).map((s) => [s.id, s.nombre]))
  const lineas = ((items ?? []) as any[]).map((i) => ({
    id: i.id, producto: i.productos_catalogo?.nombre ?? '—', sku: i.productos_catalogo?.sku ?? null,
    ubicacion: i.ubicacion, enviada: Number(i.cantidad_enviada), recibida: i.cantidad_recibida == null ? null : Number(i.cantidad_recibida),
  }))

  return (
    <>
      <PageHeader title={`${nombreSuc.get(t.sucursal_origen_id) ?? '—'} → ${nombreSuc.get(t.sucursal_destino_id) ?? '—'}`}
        description="Recorrido completo con foto en cada paso."
        breadcrumbs={[{ label: 'Operación', href: '/admin/operaciones' }, { label: 'Transferencias', href: '/admin/operaciones/transferencias' }, { label: 'Detalle' }]} />
      <div className="p-4 md:p-6">
        <TransferenciaDetalle
          id={t.id} estado={t.estado} diferencia={!!t.diferencia_detectada} notas={t.notas}
          origen={nombreSuc.get(t.sucursal_origen_id) ?? '—'} destino={nombreSuc.get(t.sucursal_destino_id) ?? '—'}
          pasos={{
            creacion: { fecha: t.fecha_solicitud, foto: fc },
            salida: { fecha: t.fecha_envio, foto: fs },
            recepcion: { fecha: t.fecha_recepcion, foto: fr },
          }}
          items={lineas}
        />
      </div>
    </>
  )
}
