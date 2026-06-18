import { Truck, FileText, PackageCheck, Undo2, Building2 } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { SectorDashboard, type SectorKpi, type SectorAcceso } from '@/components/dashboard/sector-dashboard'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Compras' }

const DOC_PENDIENTES = ['pendiente_aprobacion', 'aprobada', 'programada_pago', 'pagada_parcial', 'vencida']

export default async function ComprasDashboard() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'] })
  const sb = createClient()

  const [{ count: provs }, { count: docs }, { count: recep }, { count: devol }] = await Promise.all([
    sb.from('proveedores').select('id', { count: 'exact', head: true }).eq('activo', true),
    sb.from('facturas_proveedor').select('id', { count: 'exact', head: true }).in('estado', DOC_PENDIENTES),
    sb.from('recepciones_mercaderia').select('id', { count: 'exact', head: true }).in('estado', ['parcial', 'con_diferencias']),
    sb.from('devoluciones_proveedor').select('id', { count: 'exact', head: true }).neq('estado', 'cerrada'),
  ])

  const kpis: SectorKpi[] = [
    { label: 'Proveedores activos', value: provs ?? 0, icon: Truck, href: '/admin/proveedores' },
    { label: 'Documentos a pagar', value: docs ?? 0, icon: FileText, variant: (docs ?? 0) > 0 ? 'warning' : 'default', href: '/admin/finanzas/documentos' },
    { label: 'Recepciones con diferencias', value: recep ?? 0, icon: PackageCheck, variant: (recep ?? 0) > 0 ? 'warning' : 'default', href: '/admin/recepciones' },
    { label: 'Devoluciones abiertas', value: devol ?? 0, icon: Undo2, variant: (devol ?? 0) > 0 ? 'warning' : 'default', href: '/admin/compras/devoluciones' },
  ]

  const accesos: SectorAcceso[] = [
    { label: 'Proveedores', href: '/admin/proveedores', icon: Building2, descripcion: 'Ficha, cuentas, cta. corriente' },
    { label: 'Recepciones', href: '/admin/recepciones', icon: PackageCheck },
    { label: 'Devoluciones', href: '/admin/compras/devoluciones', icon: Undo2 },
    { label: 'Documentos a pagar', href: '/admin/finanzas/documentos', icon: FileText },
  ]

  const nora = (recep ?? 0) > 0 || (devol ?? 0) > 0
    ? <p>Tenés {(recep ?? 0) > 0 && <><b>{recep}</b> recepciones con diferencias</>}{(recep ?? 0) > 0 && (devol ?? 0) > 0 && ' y '}{(devol ?? 0) > 0 && <><b>{devol}</b> devoluciones abiertas</>} para cerrar.</p>
    : <p>Compras al día. <b>{provs ?? 0}</b> proveedores activos y sin recepciones ni devoluciones pendientes.</p>

  return (
    <SectorDashboard
      title="Compras"
      descripcion="Proveedores, recepciones y devoluciones."
      breadcrumbs={[{ label: 'Compras' }]}
      kpis={kpis}
      nora={nora}
      accesos={accesos}
    />
  )
}
