import { notFound } from 'next/navigation'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import { paginar } from '@/lib/supabase/paginar'
import { PageHeader } from '@/components/shared/page-header'

import { PresentacionClient } from './presentacion-client'

export const dynamic = 'force-dynamic'

/**
 * B.2 / B.3 / B.4 · UNA PRESENTACIÓN, ADENTRO.
 *
 * Tres listas y no una:
 *
 *   · **Lo que entra**: los comprobantes de la presentación.
 *   · **Lo que está suelto**: comprobantes del convenio y la sucursal que
 *     todavía no entraron a ninguna presentación.
 *   · **Lo que quedó afuera**: con su motivo. No desaparece — si desapareciera,
 *     nadie podría preguntar por qué no se presentó.
 *
 * Más los troqueles, que es lo que define si un débito va a ser reclamable.
 */
export default async function PresentacionPage({ params }: { params: { id: string } }) {
  const perfil = await requireAdminHubAccess()
  const sb = createClient()

  const { data: me } = await sb.from('users_admin')
    .select('permisos_custom').eq('id', perfil.id)
    .maybeSingle<{ permisos_custom: PermisosCustom | null }>()
  const custom = me?.permisos_custom ?? null

  const { data: p } = await sb.from('convenio_presentaciones')
    .select('*, convenios(nombre, troquel, plazo_presentacion_dias), sucursales(nombre)')
    .eq('id', params.id).maybeSingle()
  if (!p) notFound()
  const pres = p as any

  // Se pagina todo lo que puede crecer: una presentación mensual de una
  // farmacia grande pasa los 1.000 comprobantes sin esfuerzo, y PostgREST
  // corta en 1.000 sin avisar.
  const [adentro, sueltos, afuera, { data: troqueles }] = await Promise.all([
    paginar<any>(sb.from('convenio_comprobantes').select('*')
      .eq('presentacion_id', params.id).neq('estado', 'excluido').order('fecha').order('id'),
      { maximo: 50_000 }),
    paginar<any>(sb.from('convenio_comprobantes').select('*')
      .eq('convenio_id', pres.convenio_id).eq('sucursal_id', pres.sucursal_id)
      .is('presentacion_id', null).eq('estado', 'sin_presentar').order('fecha').order('id'),
      { maximo: 50_000 }),
    paginar<any>(sb.from('convenio_comprobantes').select('*')
      .eq('convenio_id', pres.convenio_id).eq('sucursal_id', pres.sucursal_id)
      .eq('estado', 'excluido').order('fecha', { ascending: false }).order('id'),
      { maximo: 50_000 }),
    sb.from('convenio_troqueles').select('*')
      .eq('presentacion_id', params.id).order('created_at', { ascending: false }),
  ])

  return (
    <>
      <PageHeader
        title={`${pres.convenios?.nombre ?? 'Presentación'} — ${pres.sucursales?.nombre ?? ''}`}
        description={`Período ${pres.periodo_desde} a ${pres.periodo_hasta}.`}
        breadcrumbs={[
          { label: 'Obras sociales', href: '/admin/convenios' },
          { label: 'Presentaciones', href: '/admin/convenios/presentaciones' },
          { label: pres.convenios?.nombre ?? 'Presentación' },
        ]}
      />
      <div className="p-4 md:p-6">
        <PresentacionClient
          pres={pres}
          adentro={adentro.filas}
          sueltos={sueltos.filas}
          afuera={afuera.filas}
          truncado={adentro.truncado || sueltos.truncado || afuera.truncado}
          troqueles={(troqueles ?? []) as any}
          puedeEditar={puede(perfil.rol, custom, 'convenios', 'editar')}
        />
      </div>
    </>
  )
}
