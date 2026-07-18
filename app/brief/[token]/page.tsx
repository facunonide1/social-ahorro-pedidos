import { notFound } from 'next/navigation'

import { createAdminClient } from '@/lib/supabase/server'
import { BriefPublico } from './brief-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Brief de oferta · Social Ahorro' }

/** Vista pública del brief para el community manager (sin login, por token). */
export default async function BriefPage({ params }: { params: { token: string } }) {
  const adm = createAdminClient()
  const { data: br } = await adm.from('ofertas_briefs').select('*, ofertas(*)').eq('token', params.token).maybeSingle<any>()
  if (!br) notFound()

  // Marca "abierto" al primer acceso.
  if (br.estado === 'generado') { try { await adm.from('ofertas_briefs').update({ estado: 'abierto', abierto_at: new Date().toISOString() }).eq('id', br.id) } catch { /* noop */ } }

  const of = br.ofertas as any
  const pids = (of?.productos_ids ?? []) as string[]
  const { data: prods } = pids.length ? await adm.from('productos_catalogo').select('id, nombre, precio_sugerido').in('id', pids) : { data: [] as any[] }
  const { data: items } = await adm.from('oferta_items').select('producto_id, precio_oferta').eq('oferta_id', of.id)
  const precioOf = new Map(((items ?? []) as any[]).map((i) => [i.producto_id, i.precio_oferta]))
  const sucIds = (of?.sucursales_ids ?? []) as string[]
  const { data: sucs } = sucIds.length ? await adm.from('sucursales').select('nombre').in('id', sucIds) : await adm.from('sucursales').select('nombre').eq('activa', true)

  const productos = ((prods ?? []) as any[]).map((p) => ({
    nombre: p.nombre,
    precioBase: p.precio_sugerido != null ? Number(p.precio_sugerido) : null,
    precioOferta: precioOf.get(p.id) != null ? Number(precioOf.get(p.id)) : null,
  }))

  return (
    <BriefPublico
      token={params.token}
      estado={br.estado}
      copy={br.copy ?? ''}
      oferta={{ id: of.id, nombre: of.nombre, tipo: of.tipo, valor: of.valor, nx: of.nx, ny: of.ny, fecha_inicio: of.fecha_inicio, fecha_fin: of.fecha_fin }}
      productos={productos}
      sucursales={((sucs ?? []) as any[]).map((s) => s.nombre)}
    />
  )
}
