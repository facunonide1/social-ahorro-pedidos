import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export type OsSearchHit = {
  tipo: 'producto' | 'cliente' | 'proveedor' | 'tarea'
  id: string
  titulo: string
  subtitulo?: string
  ruta: string
}

/**
 * NORA OS · búsqueda de entidades para ⌘K (v1 barato). ILIKE acotado (5 por tipo)
 * sobre las tablas maestras EXISTENTES, respetando permisos por tipo. No toca
 * lógica de negocio ni escribe nada.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ hits: [] })

  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ hits: [] })

  const { data: me } = await sb
    .from('users_admin')
    .select('rol, activo, permisos_custom')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null }>()
  if (!me?.activo) return NextResponse.json({ hits: [] })

  const custom = me.permisos_custom ?? null
  const ver = (m: Parameters<typeof puede>[2]) => me.rol === 'super_admin' || puede(me.rol, custom, m, 'ver')
  const like = `%${q.replace(/[%_]/g, '')}%`

  const vacio = { data: [] as any[] }
  const tareas = ver('tareas')
    ? sb.from('tareas').select('id, titulo, estado').ilike('titulo', like).limit(5)
    : vacio
  const productos = ver('operaciones')
    ? sb.from('productos_catalogo').select('id, sku, nombre, codigo_barras')
        .or(`nombre.ilike.${like},sku.ilike.${like},codigo_barras.ilike.${like}`).limit(5)
    : vacio
  const clientes = ver('clientes')
    ? sb.from('clientes').select('id, nombre, dni, cuit')
        .or(`nombre.ilike.${like},dni.ilike.${like},cuit.ilike.${like}`).limit(5)
    : vacio
  const proveedores = ver('compras')
    ? sb.from('proveedores').select('id, razon_social, cuit')
        .or(`razon_social.ilike.${like},cuit.ilike.${like}`).limit(5)
    : vacio

  const [t, p, c, pr] = await Promise.all([tareas, productos, clientes, proveedores])

  const hits: OsSearchHit[] = []
  for (const r of (t.data ?? []) as any[]) hits.push({ tipo: 'tarea', id: r.id, titulo: r.titulo ?? 'Tarea', subtitulo: r.estado, ruta: `/admin/tareas/${r.id}` })
  for (const r of (p.data ?? []) as any[]) hits.push({ tipo: 'producto', id: r.id, titulo: r.nombre ?? r.sku, subtitulo: [r.sku, r.codigo_barras].filter(Boolean).join(' · '), ruta: `/admin/operaciones/stock?q=${encodeURIComponent(r.sku ?? '')}` })
  for (const r of (c.data ?? []) as any[]) hits.push({ tipo: 'cliente', id: r.id, titulo: r.nombre ?? 'Cliente', subtitulo: [r.dni, r.cuit].filter(Boolean).join(' · '), ruta: `/admin/clientes/${r.id}` })
  for (const r of (pr.data ?? []) as any[]) hits.push({ tipo: 'proveedor', id: r.id, titulo: r.razon_social ?? 'Proveedor', subtitulo: r.cuit ?? undefined, ruta: `/admin/proveedores/${r.id}` })

  return NextResponse.json({ hits })
}
