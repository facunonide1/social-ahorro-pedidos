import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { parametro } from '@/lib/os/definicion'
import { PageHeader } from '@/components/shared/page-header'

import { DocumentosEmpresaClient } from './documentos-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Documentos de la empresa' }

/**
 * LOS PAPELES DE LA EMPRESA.
 *
 * ── SOLO DUEÑOS ─────────────────────────────────────────────────────────────
 *
 * Textual del cuestionario. No es un sector compartido: acá están las
 * habilitaciones, las matrículas y los certificados, y quién las tiene y cuándo
 * vencen no es información operativa.
 *
 * La RLS lo garantiza aparte de esta lista de roles: `compliance_documentos`
 * sólo la lee super_admin o gerente.
 *
 * v1.3 · se fue la sección de farmacéuticos con matrícula: el farmacéutico es
 * un tilde en el usuario (§1).
 */
export default async function DocumentosEmpresaPage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente'] })
  const sb = createClient()

  const [{ data: docs }, { data: sucs }, diasAviso] = await Promise.all([
    // Sin las de demostración: una habilitación inventada que «vence en 10
    // días» hace que alguien salga a renovar un papel que no existe.
    sb.from('compliance_documentos').select('*').eq('es_demo', false)
      .order('vence_at', { ascending: true, nullsFirst: false }),
    sb.from('sucursales').select('id, nombre, codigo').eq('activa', true).order('codigo'),
    parametro('compliance', 'dias_aviso_documento_empresa', 60),
  ])

  return (
    <>
      <PageHeader
        title="Documentos de la empresa"
        description="Habilitaciones, certificados y seguros, con su vencimiento."
        breadcrumbs={[{ label: 'Configuración', href: '/admin/configuracion' }, { label: 'Documentos' }]}
      />
      <div className="p-4 md:p-6">
        <DocumentosEmpresaClient
          docs={(docs ?? []) as any[]}
          sucursales={(sucs ?? []) as any[]}
          diasAviso={diasAviso}
        />
      </div>
    </>
  )
}
