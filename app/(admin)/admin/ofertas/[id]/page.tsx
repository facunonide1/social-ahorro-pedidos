import { notFound } from 'next/navigation'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'
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

  const [{ data: tareas }, { data: confs }, { data: prods }, { data: users }] = await Promise.all([
    adm.from('tareas').select('id, titulo, estado, sucursal_id, datos_custom').contains('datos_custom', { oferta_id: params.id }).limit(200),
    adm.from('ofertas_confirmaciones').select('empleado_user_id, version_confirmada').eq('oferta_id', params.id),
    of.productos_ids?.length ? adm.from('productos_catalogo').select('id, nombre, sku').in('id', of.productos_ids) : Promise.resolve({ data: [] as any[] }),
    adm.from('users_admin').select('id, nombre, email, sucursal_id').eq('activo', true),
  ])

  const userMap = new Map(((users ?? []) as any[]).map((u) => [u.id, u]))
  const confList = (confs ?? []) as any[]
  const confirmadas = confList.filter((c) => c.version_confirmada >= (of.version ?? 1)).length
  const faltan = confList.filter((c) => c.version_confirmada < (of.version ?? 1)).map((c) => {
    const u = userMap.get(c.empleado_user_id)
    return u?.nombre || u?.email || c.empleado_user_id.slice(0, 6)
  })

  const tareaRows: TareaLite[] = ((tareas ?? []) as any[]).map((t) => ({ id: t.id, titulo: t.titulo, estado: t.estado, tipo: t.datos_custom?.tipo ?? '' }))
  const cartelTotal = tareaRows.filter((t) => t.tipo === 'cartel').length
  const cartelOk = tareaRows.filter((t) => t.tipo === 'cartel' && ['verificada', 'completada', 'aprobada'].includes(t.estado)).length

  return (
    <>
      <PageHeader title={of.nombre}
        description={<span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs">{of.codigo}</span><Badge variant="outline">{TIPO_LABEL[of.tipo] ?? of.tipo}</Badge><Badge variant="outline">{of.estado.replace(/_/g, ' ')}</Badge>{of.version > 1 && <span className="text-xs text-muted-foreground">v{of.version}</span>}</span>}
        breadcrumbs={[{ label: 'Ofertas', href: '/admin/ofertas' }, { label: of.nombre }]} />
      <div className="mx-auto w-full max-w-4xl space-y-5 p-4 md:p-6">
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
