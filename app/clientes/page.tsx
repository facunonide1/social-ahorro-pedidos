import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Star } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import type { Customer, UserPedidos } from '@/lib/types'

import { CrmShell } from '@/components/crm/crm-shell'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import ClientesFilters from './filters'

export const dynamic = 'force-dynamic'

type CustomerRow = Customer & { orders_count: number; monto_total: number }
type RawCustomer = Customer & { orders?: Array<{ total: number; status: string }> }

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await sb
    .from('users_pedidos')
    .select('id, email, name, role, active')
    .eq('id', user.id)
    .maybeSingle<UserPedidos>()
  if (!profile?.active) redirect('/logout?reason=sin_permiso')
  if (profile.role === 'repartidor') redirect('/repartidor')

  const q = (searchParams.q || '').trim()

  let query = sb
    .from('customers')
    .select('*, orders(total, status)')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (q) {
    const like = `%${q}%`
    query = query.or(
      `name.ilike.${like},phone.ilike.${like},email.ilike.${like},dni.ilike.${like}`,
    )
  }

  const { data: raw, error } = await query
  const customers: CustomerRow[] = ((raw ?? []) as RawCustomer[]).map((r) => {
    const orderList = r.orders ?? []
    const relevantes = orderList.filter((o) => o.status !== 'cancelado')
    return {
      ...r,
      orders_count: orderList.length,
      monto_total: relevantes.reduce((acc, o) => acc + Number(o.total || 0), 0),
    }
  })

  return (
    <CrmShell>
      <PageHeader
        title="Clientes"
        description={
          <span>
            {customers.length} resultado{customers.length === 1 ? '' : 's'}
            {q && <span> para &ldquo;{q}&rdquo;</span>}
          </span>
        }
        actions={<ClientesFilters initialQ={q} />}
      />

      <div className="mx-auto w-full max-w-5xl space-y-3 p-4 md:p-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>Error cargando clientes: {error.message}</AlertDescription>
          </Alert>
        )}

        {customers.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {q ? 'Sin coincidencias para esa búsqueda.' : 'Todavía no hay clientes cargados.'}
            </CardContent>
          </Card>
        )}

        {customers.map((c) => {
          const blacklisted = c.tags.includes('blacklist')
          const tipo: 'VIP' | 'RECURRENTE' | 'NUEVO' | null =
            c.orders_count >= 10
              ? 'VIP'
              : c.orders_count >= 2
                ? 'RECURRENTE'
                : c.orders_count === 1
                  ? 'NUEVO'
                  : null
          return (
            <Link
              key={c.id}
              href={`/clientes/${c.id}`}
              className={cn(
                'block rounded-lg border bg-card p-3.5 transition-colors hover:bg-muted/40',
                blacklisted ? 'border-destructive/40 bg-destructive/5' : 'border-border',
              )}
            >
              <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold">{c.name || '(sin nombre)'}</span>
                    {blacklisted && (
                      <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">
                        <AlertTriangle className="mr-1 size-3" />
                        Blacklist
                      </Badge>
                    )}
                    {tipo === 'VIP' && (
                      <Badge variant="warning" className="text-[10px] uppercase tracking-wide">
                        <Star className="mr-1 size-3" />
                        VIP
                      </Badge>
                    )}
                    {tipo === 'RECURRENTE' && (
                      <Badge variant="info" className="text-[10px] uppercase tracking-wide">
                        Recurrente
                      </Badge>
                    )}
                    {tipo === 'NUEVO' && (
                      <Badge variant="success" className="text-[10px] uppercase tracking-wide">
                        Nuevo
                      </Badge>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {[c.dni ? `DNI ${c.dni}` : null, c.phone ?? null, c.email ?? null]
                      .filter(Boolean)
                      .join(' · ') || 'sin datos de contacto'}
                  </div>
                  {c.tags.filter((t) => t !== 'blacklist').length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.tags
                        .filter((t) => t !== 'blacklist')
                        .map((t) => (
                          <Badge
                            key={t}
                            variant="outline"
                            className="text-[10px] uppercase tracking-wide"
                          >
                            {t}
                          </Badge>
                        ))}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-lg font-extrabold tabular-nums">{c.orders_count}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    pedido{c.orders_count === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-success tabular-nums">
                    ${c.monto_total.toLocaleString('es-AR')}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    facturado
                  </div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </CrmShell>
  )
}
