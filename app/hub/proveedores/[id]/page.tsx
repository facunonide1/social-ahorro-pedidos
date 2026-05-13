import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { CONDICION_IVA_LABELS } from '@/lib/types/admin'
import type {
  Proveedor,
  ProveedorContacto,
  ProveedorCuentaBancaria,
  ProveedorDocumento,
} from '@/lib/types/admin'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'

import ProveedorEditor from './editor'
import ContactosSection from './contactos'
import CuentasSection from './cuentas'
import DocumentosSection from './documentos'

export const dynamic = 'force-dynamic'

export default async function ProveedorDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const profile = await requireAdminHubAccess({
    allowedRoles: [
      'super_admin',
      'gerente',
      'comprador',
      'administrativo',
      'tesoreria',
      'auditor',
    ],
  })

  const sb = createClient()

  const [provRes, contactosRes, cuentasRes, docsRes] = await Promise.all([
    sb.from('proveedores').select('*').eq('id', params.id).maybeSingle<Proveedor>(),
    sb
      .from('proveedor_contactos')
      .select('*')
      .eq('proveedor_id', params.id)
      .order('es_principal', { ascending: false })
      .order('created_at', { ascending: true })
      .returns<ProveedorContacto[]>(),
    sb
      .from('proveedor_cuentas_bancarias')
      .select('*')
      .eq('proveedor_id', params.id)
      .order('es_principal', { ascending: false })
      .order('created_at', { ascending: true })
      .returns<ProveedorCuentaBancaria[]>(),
    sb
      .from('proveedor_documentos')
      .select('*')
      .eq('proveedor_id', params.id)
      .order('created_at', { ascending: false })
      .returns<ProveedorDocumento[]>(),
  ])

  const p = provRes.data
  if (!p) notFound()

  const canEdit = ['super_admin', 'gerente', 'comprador', 'administrativo'].includes(
    profile.rol,
  )
  const canEditCuentas = ['super_admin', 'gerente', 'tesoreria'].includes(profile.rol)

  return (
    <HubShell profile={profile}>
      <PageHeader
        title={p.razon_social}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs">CUIT {p.cuit}</span>
            {p.condicion_iva && <span>· {CONDICION_IVA_LABELS[p.condicion_iva]}</span>}
            {p.categoria && <span>· {p.categoria}</span>}
            {!p.activo && (
              <Badge variant="outline" className="ml-1">
                Inactivo
              </Badge>
            )}
          </span>
        }
        breadcrumbs={[
          { label: 'Proveedores', href: '/hub/proveedores' },
          { label: p.razon_social },
        ]}
      />

      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 md:p-6">
        <ProveedorEditor initial={p} readOnly={!canEdit} />

        <ContactosSection
          proveedorId={p.id}
          initial={contactosRes.data ?? []}
          readOnly={!canEdit}
        />

        <CuentasSection
          proveedorId={p.id}
          initial={cuentasRes.data ?? []}
          readOnly={!canEditCuentas}
        />

        <DocumentosSection
          proveedorId={p.id}
          initial={docsRes.data ?? []}
          readOnly={!canEdit}
        />
      </div>
    </HubShell>
  )
}
