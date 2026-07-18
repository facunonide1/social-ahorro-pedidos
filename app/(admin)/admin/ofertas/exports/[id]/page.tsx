import { notFound } from 'next/navigation'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { ExportDownload, type FilaExport } from './download-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Export SIFACO' }

export default async function ExportSifacoPage({ params }: { params: { id: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'administrativo', 'auditor'] })
  const adm = createAdminClient()
  const { data: exp } = await adm.from('ofertas_exports_sifaco').select('*, ofertas(nombre, codigo)').eq('id', params.id).maybeSingle<any>()
  if (!exp) notFound()

  const filas = (exp.filas ?? []) as FilaExport[]
  const nombre = `sifaco-${exp.tipo}-${(exp.ofertas as any)?.codigo ?? String(exp.fecha ?? exp.id).slice(0, 10)}`

  return (
    <>
      <PageHeader title={`Export SIFACO · ${exp.tipo === 'reversion' ? 'reversión' : 'aplicación'}`}
        description={<span className="flex flex-wrap items-center gap-2"><Badge variant="outline">{exp.tipo}</Badge><Badge variant={exp.estado === 'confirmado_matutino' ? 'success' : 'outline'}>{exp.estado.replace(/_/g, ' ')}</Badge>{(exp.ofertas as any)?.nombre && <span className="text-xs text-muted-foreground">{(exp.ofertas as any).nombre}</span>}</span>}
        breadcrumbs={[{ label: 'Ofertas', href: '/admin/ofertas' }, { label: 'Export' }]} />
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4 md:p-6">
        <ExportDownload nombre={nombre} filas={filas} />
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-2">SKU</th><th className="px-3 py-2">EAN</th><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2">Desde</th><th className="px-3 py-2">Hasta</th></tr></thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-1.5 font-mono text-xs">{f.sku}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{f.ean}</td>
                  <td className="px-3 py-1.5">{f.producto}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{f.precio != null ? `$ ${Number(f.precio).toLocaleString('es-AR')}` : '—'}</td>
                  <td className="px-3 py-1.5 text-xs">{f.fecha_inicio ?? '—'}</td>
                  <td className="px-3 py-1.5 text-xs">{f.fecha_fin ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
