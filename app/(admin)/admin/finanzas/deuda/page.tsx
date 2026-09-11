import { Wallet, CalendarClock, AlertTriangle, Building2 } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { DeudaClient } from './deuda-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Qué se debe' }

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/**
 * QUÉ SE DEBE HOY.
 *
 * Es la pantalla que justifica el módulo: hoy esa pregunta no se puede
 * contestar. La mercadería llega, la factura va a un grupo de WhatsApp y hasta
 * que alguien carga el Excel semanal pasa hasta una semana en la que nadie sabe
 * cuánto se debe.
 */
export default async function DeudaPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'],
  })
  const sb = createClient()

  const [{ filas: porProveedor }, { filas: facturas }] = await Promise.all([
    paginar<any>(sb.from('deuda_por_proveedor').select('*').order('saldo', { ascending: false, nullsFirst: false }), { maximo: 500 }),
    paginar<any>(sb.from('deuda_proveedores').select('*').gt('saldo', 0).order('vence'), { maximo: 5000 }),
  ])

  const total = porProveedor.reduce((a, p) => a + Number(p.saldo ?? 0), 0)
  const vencido = porProveedor.reduce((a, p) => a + Number(p.vencido ?? 0), 0)
  const hoyDia = new Date().getDay()
  const cobranHoy = porProveedor.filter((p) => p.dia_cobro === hoyDia || p.dia_visita === hoyDia)

  return (
    <>
      <PageHeader
        title="Qué se debe"
        description="Por proveedor, por vencimiento y por sucursal. Con el día en que pasa a cobrar cada uno."
        breadcrumbs={[{ label: 'Finanzas', href: '/admin/finanzas' }, { label: 'Qué se debe' }]}
      />
      <div className="space-y-5 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Se debe en total" value={total} format="currency" icon={Wallet}
            variant={total > 0 ? 'warning' : 'default'} />
          <KpiCard label="Vencido" value={vencido} format="currency" icon={AlertTriangle}
            variant={vencido > 0 ? 'danger' : 'default'} />
          <KpiCard label="Facturas abiertas" value={facturas.length} icon={Building2} />
          <KpiCard label={`Cobran hoy (${DIAS[hoyDia]})`} value={cobranHoy.length} icon={CalendarClock}
            variant={cobranHoy.length > 0 ? 'warning' : 'default'}
            footer={cobranHoy.length > 0 ? cobranHoy.map((p) => p.proveedor).join(', ') : undefined} />
        </div>

        {facturas.length === 0 && (
          <Alert>
            <AlertDescription className="text-xs leading-snug">
              <b>No hay ninguna factura abierta.</b> Eso no quiere decir que no se deba nada: quiere
              decir que todavía no entró ninguna factura al sistema. Entran de dos formas — sacándole
              la foto en la recepción, o con la importación de los comprobantes de 2026.
            </AlertDescription>
          </Alert>
        )}

        <DeudaClient porProveedor={porProveedor} facturas={facturas} hoyDia={hoyDia} />
      </div>
    </>
  )
}
