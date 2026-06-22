import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Cake, Coins, ShoppingBag, AlertTriangle, Building2, FileText, Repeat, Tag, MessageCircle } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { formatARS } from '@/lib/utils/format'
import { PageHeader } from '@/components/shared/page-header'
import { KpiCard } from '@/components/cards/kpi-card'
import { NoraCard } from '@/components/nora/nora-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FUENTE_LABEL, NIVEL_LABEL, RIESGO_LABEL, type Cliente } from '@/lib/types/crm'
import { RIESGO_VARIANT, NIVEL_VARIANT } from '@/lib/crm/segmentos'

export const dynamic = 'force-dynamic'

export default async function ClienteFichaPage({ params }: { params: { id: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'marketing', 'administrativo', 'auditor'] })
  const sb = createClient()

  const { data } = await sb.from('clientes').select('*, sucursales(nombre)').eq('id', params.id).maybeSingle()
  if (!data) notFound()
  const c = data as Cliente & { sucursales?: { nombre: string } }

  const [{ data: compras }, { data: puntosMov }, { data: ccte }, { data: recurrentes }] = await Promise.all([
    sb.from('cliente_compras').select('fecha, monto, canal, sucursal_id').eq('cliente_id', c.id).order('fecha', { ascending: false }).limit(50),
    sb.from('puntos_movimientos').select('evento, puntos, created_at').eq('cliente_id', c.id).order('created_at', { ascending: false }).limit(20),
    c.tipo === 'b2b' ? sb.from('b2b_cuenta_corriente').select('*').eq('cliente_id', c.id).maybeSingle() : Promise.resolve({ data: null }),
    c.tipo === 'b2b' ? sb.from('b2b_pedidos_recurrentes').select('*').eq('cliente_id', c.id) : Promise.resolve({ data: null }),
  ])
  const comprasRows = (compras ?? []) as any[]

  const esB2B = c.tipo === 'b2b'

  return (
    <>
      <PageHeader title={c.nombre} description={esB2B ? `B2B · ${c.cuit ? 'CUIT ' + c.cuit : ''}` : `Cliente B2C${c.dni ? ' · DNI ' + c.dni : ''}`}
        breadcrumbs={[{ label: 'Comercial' }, { label: 'Clientes', href: '/admin/clientes' }, { label: c.nombre }]}
        actions={
          esB2B ? (
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm"><Link href="/admin/clientes/b2b"><FileText className="size-4" /> Cuenta corriente</Link></Button>
              <Button asChild size="sm"><Link href="/admin/compras/ordenes/nueva"><ShoppingBag className="size-4" /> Nuevo pedido B2B</Link></Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm"><Link href={`/admin/clientes/comunicacion?cliente=${c.id}`}><MessageCircle className="size-4" /> Contactar</Link></Button>
              <Button asChild size="sm"><Link href={`/admin/clientes/comunicacion?cliente=${c.id}&cupon=1`}><Tag className="size-4" /> Enviar cupón</Link></Button>
            </div>
          )
        } />

      <div className="space-y-5 p-4 md:p-6">
        {/* identidad + fuentes */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">{c.nombre.slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">{c.nombre}</span>
              {c.nivel && <Badge variant={NIVEL_VARIANT[c.nivel]}>{NIVEL_LABEL[c.nivel]}</Badge>}
              <Badge variant={RIESGO_VARIANT[c.riesgo_churn]}>churn {RIESGO_LABEL[c.riesgo_churn]}</Badge>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {c.telefono && <span>{c.telefono}</span>}{c.email && <span>{c.email}</span>}
              {c.sucursales?.nombre && <span>{c.sucursales.nombre}</span>}
              {c.fecha_nacimiento && <span className="inline-flex items-center gap-0.5"><Cake className="size-3" /> {c.fecha_nacimiento}</span>}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(c.fuentes ?? []).map((f) => <span key={f} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{FUENTE_LABEL[f] ?? f}</span>)}
            </div>
          </div>
        </div>

        {/* KPIs */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Gastado 12m" value={Number(c.total_gastado_12m)} format="currency" icon={ShoppingBag} />
          <KpiCard label="Compras 12m" value={c.n_compras_12m} icon={ShoppingBag} />
          <KpiCard label="Puntos" value={c.puntos} icon={Coins} variant="success" />
          <KpiCard label="Riesgo churn" value={RIESGO_LABEL[c.riesgo_churn]} icon={AlertTriangle} variant={c.riesgo_churn !== 'bajo' ? 'warning' : 'default'} />
        </section>

        {/* NORA alerta */}
        {c.riesgo_churn !== 'bajo' && Number(c.total_gastado_12m) > 0 && (
          <NoraCard contexto="clientes">
            <p>Cliente {Number(c.total_gastado_12m) > 50000 ? 'valioso ' : ''}en riesgo de irse{c.ultima_compra ? ` (última compra ${c.ultima_compra})` : ''}. Mandale un cupón personalizado para reactivarlo. <Link href={`/admin/clientes/comunicacion?cliente=${c.id}&cupon=1`} className="text-primary hover:underline">Enviar cupón →</Link></p>
          </NoraCard>
        )}

        {/* B2B: cuenta corriente + recurrentes */}
        {esB2B && (
          <section className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-1.5 text-sm font-medium"><Building2 className="size-4" /> Cuenta corriente</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div><div className="text-xs text-muted-foreground">Saldo</div><div className="font-mono font-semibold">{formatARS(Number((ccte as any)?.saldo ?? 0))}</div></div>
                <div><div className="text-xs text-muted-foreground">Límite crédito</div><div className="font-mono">{formatARS(Number((ccte as any)?.limite_credito ?? 0))}</div></div>
              </div>
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-1.5 text-sm font-medium"><Repeat className="size-4" /> Pedidos recurrentes</div>
              {((recurrentes ?? []) as any[]).length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Sin pedidos recurrentes.</p> : (
                <ul className="mt-2 space-y-1 text-sm">
                  {((recurrentes ?? []) as any[]).map((r) => <li key={r.id} className="flex justify-between"><span>{r.nombre ?? 'Pedido'}</span><span className="text-xs text-muted-foreground">{r.frecuencia} · próximo {r.proximo ?? '—'}</span></li>)}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* Historial de compras + puntos */}
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="mb-2 text-sm font-semibold">Historial de compras</h2>
            {comprasRows.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Sin compras registradas. Se cargan desde el import de ventas / tickets.</p> : (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Canal</th><th className="px-3 py-2 text-right">Monto</th></tr></thead>
                  <tbody>
                    {comprasRows.map((m, i) => (
                      <tr key={i} className="border-t border-border"><td className="px-3 py-1.5 text-xs">{m.fecha}</td><td className="px-3 py-1.5 text-xs text-muted-foreground">{m.canal ?? '—'}</td><td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatARS(Number(m.monto))}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Movimientos de puntos</h2>
            {((puntosMov ?? []) as any[]).length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Sin movimientos.</p> : (
              <ul className="space-y-1 rounded-lg border border-border p-3 text-sm">
                {((puntosMov ?? []) as any[]).map((p, i) => (
                  <li key={i} className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{p.evento}</span><span className={`font-mono ${p.puntos >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{p.puntos >= 0 ? '+' : ''}{p.puntos}</span></li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
