import Link from 'next/link'
import { Users, ArrowRight, AlertTriangle, Megaphone, UserPlus } from 'lucide-react'

import { createAdminClient } from '@/lib/supabase/server'

/** Card de Mission Control: pulso del CRM (en riesgo, campañas activas, nuevos del mes). */
export async function ClientesMCCard() {
  const adm = createAdminClient()
  const inicioMes = new Date().toISOString().slice(0, 7) + '-01'
  const [{ count: total }, { count: riesgo }, { count: camp }, { count: nuevos }] = await Promise.all([
    adm.from('clientes').select('id', { count: 'exact', head: true }).eq('activo', true),
    adm.from('clientes').select('id', { count: 'exact', head: true }).eq('activo', true).neq('riesgo_churn', 'bajo'),
    adm.from('campanias_crm').select('id', { count: 'exact', head: true }).in('estado', ['programada', 'enviada']),
    adm.from('clientes').select('id', { count: 'exact', head: true }).eq('activo', true).gte('created_at', inicioMes),
  ])
  if (!total) return null

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium"><Users className="size-4 text-primary" /> CRM · Clientes</div>
        <Link href="/admin/clientes" className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline">Abrir <ArrowRight className="size-3" /></Link>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Link href="/admin/clientes/segmentos" className="rounded-md bg-muted/40 p-2 hover:bg-muted/70">
          <div className="flex items-center justify-center gap-1 text-[10px] uppercase text-muted-foreground"><AlertTriangle className="size-3" /> En riesgo</div>
          <div className={`mt-0.5 text-lg font-semibold ${(riesgo ?? 0) > 0 ? 'text-amber-600' : ''}`}>{riesgo ?? 0}</div>
        </Link>
        <Link href="/admin/clientes/comunicacion" className="rounded-md bg-muted/40 p-2 hover:bg-muted/70">
          <div className="flex items-center justify-center gap-1 text-[10px] uppercase text-muted-foreground"><Megaphone className="size-3" /> Campañas</div>
          <div className="mt-0.5 text-lg font-semibold">{camp ?? 0}</div>
        </Link>
        <div className="rounded-md bg-muted/40 p-2">
          <div className="flex items-center justify-center gap-1 text-[10px] uppercase text-muted-foreground"><UserPlus className="size-3" /> Nuevos mes</div>
          <div className="mt-0.5 text-lg font-semibold text-emerald-600">{nuevos ?? 0}</div>
        </div>
      </div>
    </div>
  )
}
