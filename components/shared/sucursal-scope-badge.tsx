import { Building2 } from 'lucide-react'

import { createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { cn } from '@/lib/utils'

/**
 * Indicador de alcance: muestra "Viendo: <sucursal>" cuando hay una sucursal
 * activa (no consolidado). Server component — lee la cookie `sa_sucursal`.
 * Se renderiza nada cuando la vista es "Todas las sucursales".
 */
export async function SucursalScopeBadge({ className }: { className?: string }) {
  const { sucursalId, esTodas } = getSucursalActiva()
  if (esTodas || !sucursalId) return null
  const adm = createAdminClient()
  const { data } = await adm.from('sucursales').select('nombre, codigo').eq('id', sucursalId).maybeSingle()
  if (!data) return null
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-nora-bg px-2.5 py-1 text-xs font-medium text-primary', className)}>
      <Building2 className="size-3.5" /> Viendo: {data.nombre}{data.codigo ? ` (${data.codigo})` : ''}
    </span>
  )
}
