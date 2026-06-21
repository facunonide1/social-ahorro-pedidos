import Link from 'next/link'
import { Database, AlertCircle, Clock, ArrowRight, CheckCircle2 } from 'lucide-react'

import { createAdminClient } from '@/lib/supabase/server'
import { FRECUENCIA_HORAS, type FrecuenciaDatos } from '@/lib/types/centro-datos'

/** Card de Mission Control: estado del puente SIFACO (última carga, cola, recordatorios). */
export async function CentroDatosMCCard() {
  const adm = createAdminClient()
  const [{ data: ultimo }, { count: sinMatch }, { data: perfiles }] = await Promise.all([
    adm.from('import_jobs').select('archivo_nombre, created_at, filas_ok').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    adm.from('items_sin_match').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    adm.from('perfiles_datos').select('nombre, frecuencia, ultima_carga').eq('activo', true).eq('direccion', 'import').neq('frecuencia', 'manual'),
  ])
  const atrasados = ((perfiles ?? []) as any[]).filter((p) => {
    const lim = FRECUENCIA_HORAS[p.frecuencia as FrecuenciaDatos]
    if (lim == null) return false
    if (!p.ultima_carga) return true
    return (Date.now() - new Date(p.ultima_carga).getTime()) / 3_600_000 > lim
  })

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium"><Database className="size-4 text-primary" /> Centro de Datos (SIFACO)</div>
        <Link href="/admin/centro-datos" className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline">Abrir <ArrowRight className="size-3" /></Link>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-muted/40 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">Última carga</div>
          <div className="mt-0.5 text-xs font-medium">{ultimo ? new Date((ultimo as any).created_at).toLocaleDateString('es-AR') : '—'}</div>
        </div>
        <Link href="/admin/centro-datos/sin-matchear" className="rounded-md bg-muted/40 p-2 hover:bg-muted/70">
          <div className="text-[10px] uppercase text-muted-foreground">Sin match</div>
          <div className={`mt-0.5 text-lg font-semibold ${(sinMatch ?? 0) > 0 ? 'text-amber-600' : ''}`}>{sinMatch ?? 0}</div>
        </Link>
        <div className="rounded-md bg-muted/40 p-2">
          <div className="text-[10px] uppercase text-muted-foreground">Atrasados</div>
          <div className={`mt-0.5 text-lg font-semibold ${atrasados.length > 0 ? 'text-amber-600' : ''}`}>{atrasados.length}</div>
        </div>
      </div>
      {atrasados.length > 0 ? (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-600"><Clock className="mt-0.5 size-3 shrink-0" /> {atrasados.slice(0, 2).map((p) => p.nombre).join(', ')} sin actualizar.</div>
      ) : (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="size-3 text-emerald-500" /> Datos al día.</div>
      )}
    </div>
  )
}
