import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { CONDICION_IVA_LABELS } from '@/lib/types/admin'
import type { Proveedor, ProveedorContacto, ProveedorCuentaBancaria, ProveedorDocumento } from '@/lib/types/admin'
import HubSidebar from '../../_components/sidebar'
import ProveedorEditor from './editor'
import ContactosSection from './contactos'
import CuentasSection from './cuentas'
import DocumentosSection from './documentos'

export const dynamic = 'force-dynamic'

export default async function ProveedorDetailPage({ params }: { params: { id: string } }) {
  const profile = await requireAdminHubAccess({
    allowedRoles: ['super_admin','gerente','comprador','administrativo','tesoreria','auditor'],
  })

  const sb = createClient()

  const [provRes, contactosRes, cuentasRes, docsRes] = await Promise.all([
    sb.from('proveedores').select('*').eq('id', params.id).maybeSingle<Proveedor>(),
    sb.from('proveedor_contactos').select('*').eq('proveedor_id', params.id).order('es_principal', { ascending: false }).order('created_at', { ascending: true }).returns<ProveedorContacto[]>(),
    sb.from('proveedor_cuentas_bancarias').select('*').eq('proveedor_id', params.id).order('es_principal', { ascending: false }).order('created_at', { ascending: true }).returns<ProveedorCuentaBancaria[]>(),
    sb.from('proveedor_documentos').select('*').eq('proveedor_id', params.id).order('created_at', { ascending: false }).returns<ProveedorDocumento[]>(),
  ])

  const p = provRes.data
  if (!p) notFound()

  const canEdit = ['super_admin','gerente','comprador','administrativo'].includes(profile.rol)
  const canEditCuentas = ['super_admin','gerente','tesoreria'].includes(profile.rol)

  return (
    <div style={{ minHeight: '100vh', background: '#faf8f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#2a2a2a', display: 'flex' }}>
      <HubSidebar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <header style={{ background: '#fff', borderBottom: '0.5px solid #ede9e4', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Link href="/hub/proveedores" style={{ textDecoration: 'none', color: '#726DFF', fontSize: 14, fontWeight: 600 }}>
            ← Proveedores
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.3px' }}>{p.razon_social}</div>
            <div style={{ fontSize: 12, color: '#888' }}>
              CUIT {p.cuit}
              {p.condicion_iva ? ` · ${CONDICION_IVA_LABELS[p.condicion_iva]}` : ''}
              {p.categoria ? ` · ${p.categoria}` : ''}
              {!p.activo ? ' · INACTIVO' : ''}
            </div>
          </div>
        </header>

        <main style={{ padding: 20, maxWidth: 980, display: 'flex', flexDirection: 'column', gap: 16 }}>
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
        </main>
      </div>
    </div>
  )
}
