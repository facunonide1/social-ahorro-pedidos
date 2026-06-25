import Link from 'next/link'
import { ShieldAlert, ArrowRight } from 'lucide-react'

import { createAdminClient } from '@/lib/supabase/server'
import { getResumenIrregularidades } from '@/lib/operaciones/irregularidades'

/**
 * Card de Mission Control: foto de pérdidas por descuadre de stock (control de
 * robo). Solo para roles que ven el dato sensible. Respeta el scope de sucursal.
 */
export async function IrregularidadesMCCard({ sucursalId, esTodas }: { sucursalId: string | null; esTodas: boolean }) {
  const adm = createAdminClient()
  const r = await getResumenIrregularidades(adm, { sucursalId, esTodas })
  if (r.pendientes === 0) return null
  const top = r.por_sucursal[0]
  return (
    <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-rose-700"><ShieldAlert className="size-4" /> Irregularidades de stock</div>
        <Link href="/admin/operaciones/irregularidades" className="inline-flex items-center gap-0.5 text-xs text-rose-700 hover:underline">Ver control <ArrowRight className="size-3" /></Link>
      </div>
      <div className="text-sm">
        <b>{r.pendientes}</b> descuadre(s) sin revisar por <b>${(r.valor_faltante + r.valor_sobrante).toLocaleString('es-AR')}</b>
        {r.faltantes > 0 && <> · {r.faltantes} faltante(s)</>}
        {top && (esTodas ? <> · mayor foco en <b>{top.sucursal}</b> (${Math.round(top.valor).toLocaleString('es-AR')})</> : null)}.
      </div>
    </div>
  )
}
