import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Los que no se pueden calcular' }

/** A.5 · Sin costo o sin historia NO entran con cero: entran acá, con el motivo. */
export default async function SinCalcularPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'],
  })
  const sb = createClient()
  const { filas } = await paginar<any>(
    sb.from('compras_sin_calcular').select('*').order('stock', { ascending: false }),
    { maximo: 30_000 },
  )

  const porMotivo = new Map<string, number>()
  for (const f of filas) porMotivo.set(f.por_que_no_se_sabe, (porMotivo.get(f.por_que_no_se_sabe) ?? 0) + 1)

  return (
    <>
      <PageHeader
        title="Los que no se pueden calcular"
        description="Productos que quedan fuera del plan de compra porque falta un dato, con el motivo."
        breadcrumbs={[{ label: 'Compras', href: '/admin/compras' }, { label: 'Plan', href: '/admin/compras/plan' }, { label: 'Sin calcular' }]}
      />
      <div className="space-y-5 p-4 md:p-6">
        <Alert>
          <AlertDescription className="text-xs leading-snug">
            Son <b>{filas.length.toLocaleString('es-AR')}</b>. No entran con cero: un cero diría que
            no hay que comprarlos, y lo que pasa es que no se puede saber. La mitad del catálogo no
            tiene costo cargado.
          </AlertDescription>
        </Alert>

        <div className="grid gap-2 sm:grid-cols-3">
          {[...porMotivo.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => (
            <div key={m} className="rounded-lg border border-border p-3">
              <div className="text-xl font-semibold tabular-nums">{n.toLocaleString('es-AR')}</div>
              <div className="text-xs leading-snug text-muted-foreground">{m}</div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">SKU</th><th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Stock</th>
                <th className="px-3 py-2 text-right">Meses con venta</th>
                <th className="px-3 py-2">Qué falta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.slice(0, 300).map((f) => (
                <tr key={f.producto_id}>
                  <td className="px-3 py-2 font-mono text-xs">{f.sku}</td>
                  <td className="px-3 py-2">{f.nombre}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(f.stock).toLocaleString('es-AR')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.meses_con_dato}</td>
                  <td className="px-3 py-2 text-xs leading-snug">{f.por_que_no_se_sabe}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filas.length > 300 && (
          <p className="text-xs text-muted-foreground">Se muestran los primeros 300 de {filas.length.toLocaleString('es-AR')}.</p>
        )}
      </div>
    </>
  )
}
