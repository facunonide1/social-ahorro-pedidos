import { NextResponse, type NextRequest } from 'next/server'

import { aplicar, previsualizar, type FilaImportada } from '@/lib/conteo/importar'
import { createClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PUEDEN: AdminRole[] = ['super_admin', 'gerente', 'administrativo', 'comprador']

/**
 * Importa —o reimporta— una lista de conteo.
 *
 * `confirmar: false` (el default) NO ESCRIBE: devuelve la vista previa. Es una
 * sola ruta con dos modos y no dos rutas, para que la previa y lo que se guarda
 * salgan del mismo código. Dos caminos separados se despegan.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  const { data: me } = await sb
    .from('users_admin')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || !PUEDEN.includes(me.rol)) {
    return NextResponse.json({ error: 'No tenés permiso para armar listas de conteo.' }, { status: 403 })
  }

  let body: {
    zona?: string
    puntoId?: string | null
    descripcion?: string | null
    filas?: FilaImportada[]
    listaId?: string | null
    confirmar?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'body inválido' }, { status: 400 })
  }

  const filas = (Array.isArray(body.filas) ? body.filas : [])
    .map((f) => ({
      sku: f.sku ?? null,
      descripcion: String(f.descripcion ?? '').trim(),
      unidad: f.unidad ?? null,
      orden: typeof f.orden === 'number' ? f.orden : null,
    }))
    // Una fila sin descripción no es un item: es una fila vacía de la planilla.
    .filter((f) => f.descripcion !== '')

  if (filas.length === 0) {
    return NextResponse.json({ error: 'La planilla no trajo ninguna fila con descripción.' }, { status: 400 })
  }
  if (filas.length > 5000) {
    return NextResponse.json({ error: 'Son más de 5000 filas: partí la zona en dos listas.' }, { status: 400 })
  }

  if (!body.confirmar) {
    return NextResponse.json({ ok: true, previa: await previsualizar(filas, body.listaId ?? null) })
  }

  if (!body.listaId && !String(body.zona ?? '').trim()) {
    return NextResponse.json({ error: 'Falta el nombre de la zona.' }, { status: 400 })
  }

  const r = await aplicar({
    zona: String(body.zona ?? '').trim(),
    puntoId: body.puntoId ?? null,
    descripcion: body.descripcion ?? null,
    filas,
    listaId: body.listaId ?? null,
    autorId: user.id,
  })
  return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.error }, { status: 400 })
}
