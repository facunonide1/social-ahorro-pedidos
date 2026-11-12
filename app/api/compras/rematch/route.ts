import { NextResponse, type NextRequest } from 'next/server'

import { exigirCompras } from '@/lib/drive/acceso'
import { rematchearCompras } from '@/lib/drive/rematch'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Rematch de compras_lineas sin producto. Lo llama alguien de compras,
 * con la sesión. El cron usa /api/cron/compras-rematch y el CRON_SECRET:
 * el middleware manda a /login cualquier /api que no sea /api/cron y no
 * tenga sesión, así que el secreto solo sirve en esa ruta.
 */
export async function POST(req: NextRequest) {
  const g = await exigirCompras()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  return ejecutar(req)
}

function cursorDe(req: NextRequest): string | null | Response {
  const cursor = req.nextUrl.searchParams.get('cursor')
  if (cursor && !/^[0-9a-f-]{36}$/i.test(cursor)) {
    return NextResponse.json({ error: 'cursor inválido' }, { status: 400 })
  }
  return cursor
}

async function ejecutar(req: NextRequest) {
  const cursor = cursorDe(req)
  if (cursor instanceof Response) return cursor
  try {
    const r = await rematchearCompras(createAdminClient(), { cursor })
    return NextResponse.json({ ok: true, ...r })
  } catch (e: unknown) {
    const mensaje = e instanceof Error ? e.message : 'falló el rematch'
    return NextResponse.json({ error: mensaje }, { status: 500 })
  }
}
