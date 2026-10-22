import { notFound } from 'next/navigation'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import { PageHeader } from '@/components/shared/page-header'

import { FichaClient } from './ficha-client'

export const dynamic = 'force-dynamic'

/**
 * A.2 / A.3 / A.4 · LA FICHA DE UN CONVENIO.
 *
 * Tres cosas que no son adornos:
 *
 *   · **Qué exige** son las reglas que después explican los débitos. Un débito
 *     sin la regla al lado es una sorpresa; con la regla es el incumplimiento
 *     de algo escrito.
 *   · **Dónde se presenta** es un link y un teléfono. Sin integración.
 *   · **El histórico** existe porque un débito de hace cuatro meses se evalúa
 *     con la cobertura vigente entonces. Sin esto, cambiar un porcentaje
 *     reescribe el pasado.
 */
export default async function FichaConvenioPage({ params }: { params: { id: string } }) {
  const perfil = await requireAdminHubAccess()
  const sb = createClient()

  const { data: me } = await sb.from('users_admin')
    .select('permisos_custom').eq('id', perfil.id)
    .maybeSingle<{ permisos_custom: PermisosCustom | null }>()
  const custom = me?.permisos_custom ?? null

  const [{ data: convenio }, { data: cobertura }, { data: requisitos }, { data: contactos }, { data: historico }] =
    await Promise.all([
      sb.from('convenios').select('*').eq('id', params.id).maybeSingle(),
      sb.from('convenio_cobertura').select('*').eq('convenio_id', params.id).order('created_at'),
      sb.from('convenio_requisitos').select('*').eq('convenio_id', params.id).order('created_at'),
      sb.from('convenio_contactos').select('*').eq('convenio_id', params.id).order('principal', { ascending: false }),
      sb.from('convenio_historico').select('*').eq('convenio_id', params.id)
        .order('registrado_at', { ascending: false }).limit(50),
    ])

  if (!convenio) notFound()

  return (
    <>
      <PageHeader
        title={(convenio as any).nombre}
        description="Qué cubre, qué exige, dónde se presenta y qué cambió."
        breadcrumbs={[
          { label: 'Obras sociales', href: '/admin/convenios' },
          { label: 'Padrón', href: '/admin/convenios/padron' },
          { label: (convenio as any).nombre },
        ]}
      />
      <div className="p-4 md:p-6">
        <FichaClient
          convenio={convenio as any}
          cobertura={(cobertura ?? []) as any}
          requisitos={(requisitos ?? []) as any}
          contactos={(contactos ?? []) as any}
          historico={(historico ?? []) as any}
          puedeEditar={puede(perfil.rol, custom, 'convenios', 'editar')}
          puedeBorrar={puede(perfil.rol, custom, 'convenios', 'eliminar')}
        />
      </div>
    </>
  )
}
