import Link from 'next/link'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { RecalcularCruce } from './recalcular-cruce'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Compras ingeridas' }

type Cruce = 'todas' | 'sin' | 'con'
const MOSTRAR = 200

/**
 * LO QUE ENTRÓ DE LAS PLANILLAS DE COMPRAS (B5).
 *
 * `compras_lineas` la llena la ingesta de Drive y no la mostraba ninguna
 * pantalla: no había forma de ver qué se cruzó con el catálogo y qué no.
 * Los conteos van con `count: exact` (no se cuentan filas traídas); la tabla
 * muestra las últimas 200 del filtro y lo dice. La RLS deja leer sólo a
 * super_admin, gerente y comprador (0294), lo mismo que pide la página.
 */
export default async function ComprasIngeridasPage({ searchParams }: { searchParams: { cruce?: string; q?: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador'] })
  const sb = createClient()
  const cruce: Cruce = searchParams.cruce === 'sin' || searchParams.cruce === 'con' ? searchParams.cruce : 'todas'
  const q = (searchParams.q ?? '').trim().slice(0, 80)

  const contar = (filtro: Cruce) => {
    let c = sb.from('compras_lineas').select('id', { count: 'exact', head: true })
    if (filtro === 'sin') c = c.is('producto_id', null)
    if (filtro === 'con') c = c.not('producto_id', 'is', null)
    return c
  }

  let lista = sb.from('compras_lineas')
    .select('id, fecha, proveedor_nombre, sucursal_nombre, comprobante, producto_nombre, codigo_barras, cantidad, precio_unitario, descuento_pct, importe, producto_id, match_score, match_via, productos_catalogo(nombre, sku)')
    .order('fecha', { ascending: false, nullsFirst: false }).order('id')
    .limit(MOSTRAR)
  if (cruce === 'sin') lista = lista.is('producto_id', null)
  if (cruce === 'con') lista = lista.not('producto_id', 'is', null)
  if (q) {
    const like = `%${q.replace(/[%_,()]/g, ' ')}%`
    lista = lista.or(`producto_nombre.ilike.${like},proveedor_nombre.ilike.${like},codigo_barras.ilike.${like}`)
  }

  const [total, con, sin, filas] = await Promise.all([contar('todas'), contar('con'), contar('sin'), lista])
  const error = total.error ?? con.error ?? sin.error ?? filas.error
  const lineas = (filas.data ?? []) as any[]
  const n = (x: number | null) => (x ?? 0).toLocaleString('es-AR')
  const plata = (x: number | null) => (x == null ? '—' : `$ ${Number(x).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`)
  const href = (c: Cruce) => `/admin/compras/ingeridas?cruce=${c}${q ? `&q=${encodeURIComponent(q)}` : ''}`

  return (
    <div className="container mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-6 md:py-8">
      <PageHeader
        title="Compras ingeridas"
        description="Las líneas de las planillas de compras que entraron desde Drive, y si se cruzaron con el catálogo."
        actions={<RecalcularCruce />}
      />

      {error ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          No se pudieron leer las compras ingeridas: {error.message}. Si dice que la tabla no existe, falta aplicar la migración 0294.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {([['todas', `Todas (${n(total.count)})`], ['con', `Cruzadas (${n(con.count)})`], ['sin', `Sin cruzar (${n(sin.count)})`]] as const).map(([k, l]) => (
              <Link key={k} href={href(k)} className={`rounded-full border px-3 py-1 text-xs ${cruce === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-accent'}`}>{l}</Link>
            ))}
            <form className="ml-auto" action="/admin/compras/ingeridas">
              <input type="hidden" name="cruce" value={cruce} />
              <input name="q" defaultValue={q} placeholder="Buscar producto, proveedor o código" className="h-8 w-64 rounded-md border border-border bg-background px-2 text-xs" />
            </form>
          </div>

          {lineas.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              {total.count === 0
                ? 'Todavía no entró ninguna compra. Llegan desde la planilla «Compras y precios por droguería» cuando corre la ingesta de Drive.'
                : 'Ninguna línea con este filtro.'}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">Producto (planilla)</th>
                    <th className="px-3 py-2">Catálogo</th><th className="px-3 py-2 text-right">Cant.</th><th className="px-3 py-2 text-right">Unitario</th>
                    <th className="px-3 py-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => (
                    <tr key={l.id} className="border-t border-border">
                      <td className="whitespace-nowrap px-3 py-2">{l.fecha ?? '—'}</td>
                      <td className="px-3 py-2">{l.proveedor_nombre ?? '—'}<div className="text-muted-foreground">{l.sucursal_nombre ?? ''} {l.comprobante ?? ''}</div></td>
                      <td className="px-3 py-2">{l.producto_nombre}<div className="text-muted-foreground">{l.codigo_barras ?? ''}</div></td>
                      <td className="px-3 py-2">
                        {l.producto_id
                          ? <>{l.productos_catalogo?.nombre ?? 'producto'}<div className="text-muted-foreground">{l.match_via ?? ''}{l.match_score != null ? ` · ${Math.round(Number(l.match_score) * 100)}%` : ''}</div></>
                          : <span className="text-amber-600">sin cruzar</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{l.cantidad ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{plata(l.precio_unitario)}{l.descuento_pct ? <div className="text-muted-foreground">−{l.descuento_pct}%</div> : null}</td>
                      <td className="px-3 py-2 text-right">{plata(l.importe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {lineas.length === MOSTRAR && (
                <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Se muestran las {MOSTRAR} más recientes del filtro. Usá la búsqueda para encontrar una en particular.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
