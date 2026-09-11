import { AlertTriangle } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatARS } from '@/lib/utils/format'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cuarentena de la importación' }

/**
 * LO QUE ENTRÓ MARCADO COMO DUDOSO.
 *
 * Está fuera de todos los totales y no se descartó: descartarlo sería perder un
 * comprobante que existe, y arreglarlo a mano sería inventar lo que no se pudo
 * leer. Queda acá con el motivo, para que alguien lo mire.
 */
export default async function CuarentenaPage() {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'tesoreria', 'administrativo', 'auditor'],
  })
  const sb = createClient()

  const { filas } = await paginar<any>(
    sb.from('importacion_2026_cuarentena').select('*').order('origen_hoja'),
    { maximo: 5000 },
  )

  const porMotivo = new Map<string, number>()
  for (const f of filas) {
    const k = String(f.cuarentena_motivo ?? '').replace(/«.*?»/g, '…').replace(/\(.*?\)/g, '').trim()
    porMotivo.set(k, (porMotivo.get(k) ?? 0) + 1)
  }

  return (
    <>
      <PageHeader
        title="Cuarentena de la importación"
        description="Comprobantes de 2026 que entraron marcados como dudosos. No suman en ningún total."
        breadcrumbs={[{ label: 'Finanzas', href: '/admin/finanzas' }, { label: 'Qué se debe', href: '/admin/finanzas/deuda' }, { label: 'Cuarentena' }]}
      />
      <div className="space-y-5 p-4 md:p-6">
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-xs leading-snug">
            Son <b>{filas.length}</b> comprobantes. No se descartaron —descartar uno que existe es
            perderlo— ni se arreglaron a mano —eso sería inventar lo que no se pudo leer—. Están acá
            con el motivo, fuera de la deuda y de todos los totales.
          </AlertDescription>
        </Alert>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[...porMotivo.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => (
            <div key={m} className="rounded-lg border border-border p-3">
              <div className="text-xl font-semibold tabular-nums">{n}</div>
              <div className="text-xs leading-snug text-muted-foreground">{m}</div>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Hoja</th>
                <th className="px-3 py-2">Proveedor</th>
                <th className="px-3 py-2">Comprobante</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-3 py-2">Por qué está acá</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map((f) => (
                <tr key={f.id}>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{f.origen_hoja}</td>
                  <td className="px-3 py-2">{f.proveedor ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {[f.punto_venta, f.numero_factura].filter(Boolean).join('-')}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {f.fecha_emision ?? <span className="text-muted-foreground">no se pudo leer</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatARS(Number(f.total ?? 0))}</td>
                  <td className="px-3 py-2 text-xs leading-snug">{f.cuarentena_motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
