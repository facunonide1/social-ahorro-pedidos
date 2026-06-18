import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { CajaDiaria, MovimientoCaja } from '@/lib/types/admin'

import { PageHeader } from '@/components/shared/page-header'
import { CajaClient } from './caja-client'

export const dynamic = 'force-dynamic'

export default async function CajaDetallePage({
  params,
}: {
  params: { id: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: [
      'super_admin',
      'gerente',
      'administrativo',
      'tesoreria',
      'sucursal',
      'auditor',
    ],
  })
  const sb = createClient()

  const { data: caja, error } = await sb
    .from('cajas_diarias')
    .select('*')
    .eq('id', params.id)
    .maybeSingle<CajaDiaria>()
  if (error || !caja) notFound()

  const [{ data: movimientos }, { data: sucursal }] = await Promise.all([
    sb
      .from('movimientos_caja')
      .select('*')
      .eq('caja_id', caja.id)
      .order('created_at', { ascending: false }),
    sb
      .from('sucursales')
      .select('nombre')
      .eq('id', caja.sucursal_id)
      .maybeSingle<{ nombre: string }>(),
  ])

  const canWrite = [
    'super_admin',
    'gerente',
    'administrativo',
    'tesoreria',
    'sucursal',
  ].includes(profile.rol)

  return (
    <>
      <PageHeader
        title={`Caja · ${sucursal?.nombre ?? 'Sucursal'}`}
        description={new Date(caja.fecha).toLocaleDateString('es-AR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
        breadcrumbs={[
          { label: 'Sucursales' },
          { label: 'Caja diaria', href: '/admin/sucursales/caja' },
          { label: sucursal?.nombre ?? 'Caja' },
        ]}
      />
      <div className="p-4 md:p-6">
        <CajaClient
          caja={caja}
          movimientos={(movimientos ?? []) as MovimientoCaja[]}
          canWrite={canWrite}
        />
      </div>
    </>
  )
}
