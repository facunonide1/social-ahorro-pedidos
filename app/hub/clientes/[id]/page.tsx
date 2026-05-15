import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import {
  CONDICION_IVA_LABELS,
  CONDICION_PAGO_CRM_LABELS,
  SEGMENTO_CLIENTE_LABELS,
  TIPO_CLIENTE_CRM_LABELS,
  type ClienteCrm,
} from '@/lib/types/admin'

import { HubShell } from '@/components/hub/hub-shell'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClienteForm } from '../cliente-form'
import { listVendedores } from '../vendedores'

export const dynamic = 'force-dynamic'

export default async function ClienteDetallePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { modo?: string }
}) {
  const profile = await requireAdminHubAccess()
  const sb = createClient()

  const { data, error } = await sb
    .from('clientes_crm')
    .select('*')
    .eq('id', params.id)
    .maybeSingle<ClienteCrm>()

  if (error || !data) notFound()
  const cliente = data
  const canEdit = ['super_admin', 'gerente', 'administrativo'].includes(
    profile.rol,
  )
  const editando = canEdit && searchParams.modo === 'editar'

  const [{ data: sucursales }, vendedores] = editando
    ? await Promise.all([
        sb
          .from('sucursales')
          .select('id, nombre')
          .eq('activa', true)
          .order('nombre'),
        listVendedores(),
      ])
    : [{ data: [] as { id: string; nombre: string }[] }, []]

  return (
    <HubShell profile={profile}>
      <PageHeader
        title={cliente.razon_social}
        description={
          cliente.nombre_fantasia ||
          TIPO_CLIENTE_CRM_LABELS[cliente.tipo_cliente]
        }
        breadcrumbs={[
          { label: 'Comercial' },
          { label: 'Clientes', href: '/hub/clientes' },
          { label: cliente.razon_social },
        ]}
        tabs={
          canEdit
            ? [
                {
                  label: 'Ficha',
                  href: `/hub/clientes/${cliente.id}`,
                  active: !editando,
                },
                {
                  label: 'Editar',
                  href: `/hub/clientes/${cliente.id}?modo=editar`,
                  active: editando,
                },
              ]
            : undefined
        }
      />

      <div className="space-y-4 p-4 md:p-6">
        {editando ? (
          <div className="mx-auto max-w-3xl">
            <ClienteForm
              cliente={cliente}
              sucursales={
                (sucursales ?? []) as { id: string; nombre: string }[]
              }
              vendedores={vendedores}
            />
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                label="Segmento"
                value={null}
                formattedValue={SEGMENTO_CLIENTE_LABELS[cliente.segmento]}
                format="custom"
              />
              <KpiCard label="LTV" value={cliente.ltv} format="currency" />
              <KpiCard
                label="Puntos"
                value={cliente.puntos_acumulados}
              />
              <KpiCard
                label="Límite de crédito"
                value={cliente.limite_credito}
                format="currency"
              />
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Identificación
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="Tipo">
                    {TIPO_CLIENTE_CRM_LABELS[cliente.tipo_cliente]}
                  </Row>
                  <Row label="CUIT">{cliente.cuit || '—'}</Row>
                  <Row label="DNI">{cliente.dni || '—'}</Row>
                  <Row label="Estado">
                    <Badge
                      variant={cliente.activo ? 'success' : 'secondary'}
                      className="text-[10px]"
                    >
                      {cliente.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </Row>
                  {cliente.tags.length > 0 && (
                    <Row label="Tags">
                      <div className="flex flex-wrap gap-1">
                        {cliente.tags.map((t) => (
                          <Badge
                            key={t}
                            variant="outline"
                            className="text-[10px]"
                          >
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </Row>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Contacto
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="Email">{cliente.email || '—'}</Row>
                  <Row label="Teléfono">{cliente.telefono || '—'}</Row>
                  <Row label="Dirección">
                    {cliente.direccion_completa || '—'}
                  </Row>
                  <Row label="Localidad">
                    {[cliente.localidad, cliente.provincia, cliente.codigo_postal]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </Row>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Condiciones comerciales
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="Condición IVA">
                    {cliente.condicion_iva
                      ? CONDICION_IVA_LABELS[cliente.condicion_iva]
                      : '—'}
                  </Row>
                  <Row label="Condición de pago">
                    {CONDICION_PAGO_CRM_LABELS[cliente.condicion_pago]}
                  </Row>
                  <Row label="Descuento general">
                    {cliente.descuento_general_pct}%
                  </Row>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Actividad
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="Última compra">
                    {cliente.ultima_compra_at
                      ? new Date(cliente.ultima_compra_at).toLocaleDateString(
                          'es-AR',
                        )
                      : 'Sin compras registradas'}
                  </Row>
                  <Row label="Frecuencia de compra">
                    {cliente.frecuencia_compra_dias != null
                      ? `${cliente.frecuencia_compra_dias} días`
                      : '—'}
                  </Row>
                  <Row label="Alta">
                    {new Date(cliente.created_at).toLocaleDateString('es-AR')}
                  </Row>
                </CardContent>
              </Card>
            </div>

            {cliente.notas && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Notas
                  </CardTitle>
                </CardHeader>
                <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {cliente.notas}
                </CardContent>
              </Card>
            )}

            <p className="text-xs text-muted-foreground">
              Segmento, LTV y frecuencia de compra se recalculan
              automáticamente cada noche a partir de la actividad del cliente.
            </p>
          </>
        )}
      </div>
    </HubShell>
  )
}

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}
