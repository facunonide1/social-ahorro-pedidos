import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * F.5 · EXPORTAR POR CANAL.
 *
 * CSV, que es lo que se puede subir a cualquier canal sin pedirle nada a
 * nadie. Sólo lo aprobado.
 *
 * ── POR QUÉ NO ESCRIBE EN EL CANAL ──────────────────────────────────────────
 *
 * Porque publicar es una acción hacia afuera y acá sale un archivo. Que el
 * sistema escriba 7.600 descripciones en una tienda sin que nadie las haya
 * visto publicadas es el tipo de cosa que se descubre cuando ya está hecha.
 */
export async function GET(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })

  const { data: perfil } = await sb.from('users_admin')
    .select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: string; activo: boolean }>()
  if (!perfil?.activo) return NextResponse.json({ error: 'sin permiso' }, { status: 403 })

  const canal = req.nextUrl.searchParams.get('canal')
  const { data, error } = await createAdminClient()
    .rpc('descripciones_exportar', { p_canal: canal || null })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filas = (data ?? []) as {
    canal: string; externo_id: string | null; sku: string | null
    nombre: string; descripcion: string; aprobada_at: string
  }[]

  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [
    ['canal', 'id_externo', 'sku', 'nombre', 'descripcion', 'aprobada_at'].join(','),
    ...filas.map((f) => [f.canal, f.externo_id, f.sku, f.nombre, f.descripcion, f.aprobada_at].map(esc).join(',')),
  ].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="descripciones-${canal || 'todos-los-canales'}.csv"`,
    },
  })
}
