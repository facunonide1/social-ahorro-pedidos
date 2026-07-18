import { notFound } from 'next/navigation'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { listAdminUsersLite } from '@/lib/supabase/admin-users'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { OfertaGestion, type TareaLite, type ConfRow } from './gestion-client'
import { TIPO_LABEL } from '../ofertas-client'

export const dynamic = 'force-dynamic'

export default async function OfertaDetallePage({ params }: { params: { id: string } }) {
  const profile = await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'comprador', 'administrativo', 'auditor'] })
  const sb = createClient()
  const adm = createAdminClient()

  const { data: of } = await sb.from('ofertas').select('*').eq('id', params.id).maybeSingle<any>()
  if (!of) notFound()

  const [{ data: tareas }, { data: confs }, { data: items }, users] = await Promise.all([
    adm.from('tareas').select('id, titulo, estado, sucursal_id, datos_custom').contains('datos_custom', { oferta_id: params.id }).limit(200),
    adm.from('ofertas_confirmaciones').select('empleado_user_id, version_confirmada').eq('oferta_id', params.id),
    adm.from('oferta_items').select('producto_id, precio_oferta').eq('oferta_id', params.id),
    listAdminUsersLite(adm, { soloActivos: true }),
  ])
  const itemRows = (items ?? []) as any[]
  const pids = itemRows.map((i) => i.producto_id).filter(Boolean)
  const { data: prods } = pids.length
    ? await adm.from('productos_catalogo').select('id, nombre, sku, precio_sugerido').in('id', pids)
    : { data: [] as any[] }
  const prodById = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]))

  // ── Candados SIFACO (read-time, O-05) — solo relevantes en ofertas vivas ──
  const viva = ['activa', 'aprobada'].includes(of.estado)
  const candado1: { sku: string; nombre: string; precioOferta: number; precioSifaco: number }[] = []
  const candado2: { nombre: string; base: number; ahora: number; deltaPct: number }[] = []
  if (viva) {
    const basesAprob = (of.precios_base_aprob ?? {}) as Record<string, number>
    for (const it of itemRows) {
      const p = prodById.get(it.producto_id); if (!p) continue
      const precioOferta = it.precio_oferta != null ? Number(it.precio_oferta) : (of.tipo === 'precio_fijo' && of.valor != null ? Number(of.valor) : null)
      const sifaco = p.precio_sugerido != null ? Number(p.precio_sugerido) : null
      // Candado 1: precio de oferta declarado que el matutino todavía no aplicó (±1%).
      if (precioOferta != null && sifaco != null && Math.abs(sifaco - precioOferta) / Math.max(precioOferta, 1) > 0.01) {
        candado1.push({ sku: p.sku ?? '—', nombre: p.nombre, precioOferta, precioSifaco: sifaco })
      }
      // Candado 2: precio BASE del matutino cambió vs. el vigente al aprobar.
      const base = basesAprob[it.producto_id]
      if (base != null && sifaco != null && Math.abs(sifaco - base) / Math.max(base, 1) > 0.01) {
        candado2.push({ nombre: p.nombre, base, ahora: sifaco, deltaPct: Math.round(((sifaco - base) / Math.max(base, 1)) * 100) })
      }
    }
    // Auto-resuelve: si no hay SKUs sin aplicar, el export de aplicación pasa a confirmado_matutino.
    if (!candado1.length) {
      try { await adm.from('ofertas_exports_sifaco').update({ estado: 'confirmado_matutino' }).eq('oferta_id', params.id).eq('tipo', 'aplicacion').eq('estado', 'generado') } catch { /* best-effort */ }
    }
  }

  const userMap = new Map((users as any[]).map((u) => [u.id, u]))
  const confList = (confs ?? []) as any[]
  const confirmadas = confList.filter((c) => c.version_confirmada >= (of.version ?? 1)).length
  const faltan = confList.filter((c) => c.version_confirmada < (of.version ?? 1)).map((c) => {
    const u = userMap.get(c.empleado_user_id)
    return u?.nombre || u?.email || c.empleado_user_id.slice(0, 6)
  })

  const tareaRows: TareaLite[] = ((tareas ?? []) as any[]).map((t) => ({ id: t.id, titulo: t.titulo, estado: t.estado, tipo: t.datos_custom?.tipo ?? '' }))
  const cartelTotal = tareaRows.filter((t) => t.tipo === 'cartel').length
  const cartelOk = tareaRows.filter((t) => t.tipo === 'cartel' && ['completada','en_aprobacion','en_verificacion'].includes(t.estado)).length

  return (
    <>
      <PageHeader title={of.nombre}
        description={<span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{of.codigo}</span><Badge variant="outline">{TIPO_LABEL[of.tipo] ?? of.tipo}</Badge><Badge variant="outline">{of.estado.replace(/_/g, ' ')}</Badge>{of.version > 1 && <span className="text-xs text-muted-foreground">v{of.version}</span>}</span>}
        breadcrumbs={[{ label: 'Ofertas', href: '/admin/ofertas' }, { label: of.nombre }]} />
      <div className="mx-auto w-full max-w-4xl space-y-5 p-4 md:p-6">
        {candado1.length > 0 && (
          <section className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-3 text-sm">
            <div className="font-semibold text-rose-700 dark:text-rose-400">⚠️ Oferta activa sin precio aplicado en SIFACO</div>
            <p className="mt-1 text-xs text-muted-foreground">El último matutino no trae el precio de oferta en {candado1.length} SKU(s). Aplicá el export de aplicación en SIFACO.</p>
            <ul className="mt-2 space-y-0.5 text-xs">
              {candado1.slice(0, 10).map((c, i) => <li key={i}><span className="font-mono">{c.sku}</span> · {c.nombre}: oferta ${c.precioOferta.toLocaleString('es-AR')} vs SIFACO ${c.precioSifaco.toLocaleString('es-AR')}</li>)}
            </ul>
          </section>
        )}
        {candado2.length > 0 && (
          <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <div className="font-semibold text-amber-700 dark:text-amber-400">🟠 Margen desactualizado</div>
            <p className="mt-1 text-xs text-muted-foreground">El precio base cambió desde que se aprobó. NORA sugiere revisar: mantener, ajustar o sacar (ajustar/sacar = nueva versión → re-aprobación).</p>
            <ul className="mt-2 space-y-0.5 text-xs">
              {candado2.slice(0, 10).map((c, i) => <li key={i}>{c.nombre}: base ${c.base.toLocaleString('es-AR')} → ${c.ahora.toLocaleString('es-AR')} ({c.deltaPct > 0 ? '+' : ''}{c.deltaPct}%)</li>)}
            </ul>
          </section>
        )}
        <section className="rounded-lg border border-border p-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <Row k="Canales" v={(of.canales ?? []).join(', ') || '—'} />
            <Row k="Vigencia" v={of.vigencia_tipo === 'con_fecha' ? `${of.fecha_inicio ?? '?'} → ${of.fecha_fin ?? '?'}` : of.vigencia_tipo} />
            <Row k="Productos" v={((prods ?? []) as any[]).map((p) => p.nombre).join(', ') || '—'} />
            <Row k="Cuponera" v={of.publicada_cuponera ? 'publicada' : 'no publicada'} />
            {of.limite_por_cliente && <Row k="Límite por cliente" v={String(of.limite_por_cliente)} />}
            {of.justificacion && <Row k="Justificación" v={of.justificacion} />}
          </div>
        </section>

        <OfertaGestion
          ofertaId={of.id} estado={of.estado} version={of.version ?? 1}
          rol={profile.rol}
          tareas={tareaRows} cartel={{ ok: cartelOk, total: cartelTotal }}
          confirmacion={{ ok: confirmadas, total: confList.length, faltan }}
        />
      </div>
    </>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex flex-col"><span className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</span><span>{v}</span></div>
}
