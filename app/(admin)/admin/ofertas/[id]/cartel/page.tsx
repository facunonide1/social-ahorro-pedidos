import { notFound } from 'next/navigation'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { TIPO_LABEL } from '../../ofertas-client'
import { CartelPrint } from './cartel-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cartel de oferta' }

function condicion(tipo: string, valor: number | null, nx: number | null, ny: number | null): string {
  if (tipo === 'porcentaje_descuento') return `${valor ?? 0}% OFF`
  if (tipo === 'precio_fijo') return `$ ${(valor ?? 0).toLocaleString('es-AR')}`
  if (tipo === '2x1') return '2x1'
  if (tipo === 'nxm') return `${nx ?? 0}x${ny ?? 0}`
  if (tipo === 'segunda_unidad_pct') return `2ª unidad ${valor ?? 0}%`
  if (tipo === 'combo') return 'COMBO'
  return TIPO_LABEL[tipo] ?? tipo
}

export default async function CartelPage({ params }: { params: { id: string } }) {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'] })
  const sb = createClient()
  const { data: of } = await sb.from('ofertas').select('*').eq('id', params.id).maybeSingle<any>()
  if (!of) notFound()
  const { data: prods } = of.productos_ids?.length
    ? await sb.from('productos_catalogo').select('nombre').in('id', of.productos_ids)
    : { data: [] as any[] }

  const cond = condicion(of.tipo, of.valor != null ? Number(of.valor) : null, of.nx, of.ny)
  const productos = ((prods ?? []) as any[]).map((p) => p.nombre)
  const vigencia = of.vigencia_tipo === 'con_fecha' ? `Válido ${of.fecha_inicio ?? ''} al ${of.fecha_fin ?? ''}` : of.vigencia_tipo === 'hasta_agotar' ? 'Hasta agotar stock' : 'Promoción permanente'

  return (
    <div className="p-4 md:p-6">
      <CartelPrint>
        <div className="mx-auto flex aspect-[3/4] w-full max-w-md flex-col items-center justify-between rounded-3xl bg-[hsl(263_55%_12%)] p-8 text-center text-white shadow-2xl print:shadow-none">
          <div className="text-sm font-bold uppercase tracking-[0.3em] text-[hsl(158_64%_70%)]">Social Ahorro</div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className="rounded-full bg-[hsl(158_64%_50%)] px-6 py-3 text-4xl font-black text-[hsl(263_55%_12%)]">{cond}</div>
            <h1 className="font-display text-2xl font-bold leading-tight">{of.nombre}</h1>
            {productos.length > 0 && <p className="text-sm text-violet-100/90">{productos.join(' · ')}</p>}
            {of.limite_por_cliente && <p className="text-xs text-violet-200/80">Hasta {of.limite_por_cliente} por cliente</p>}
          </div>
          <div className="text-xs text-violet-200/80">{vigencia}</div>
        </div>
      </CartelPrint>
      <p className="mx-auto mt-3 max-w-md text-center text-xs text-muted-foreground">Cartel autogenerado uniforme para las 4 sucursales. Imprimí o enviá al diseñador.</p>
    </div>
  )
}
