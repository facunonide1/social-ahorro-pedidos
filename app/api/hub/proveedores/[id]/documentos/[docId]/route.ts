import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET → signed URL del archivo (válida 60s, redirect 302 al archivo).
 * DELETE → borra la fila y el archivo en Storage.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle()
  if (!profile?.activo) return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })

  const { data: doc } = await sb
    .from('proveedor_documentos').select('archivo_url, proveedor_id').eq('id', params.docId).maybeSingle()
  if (!doc || doc.proveedor_id !== params.id) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 })
  if (!doc.archivo_url) return NextResponse.json({ error: 'sin_archivo' }, { status: 404 })

  const admin = createAdminClient()
  const { data: signed, error } = await admin.storage
    .from('proveedor-documentos')
    .createSignedUrl(doc.archivo_url, 60)
  if (error || !signed) return NextResponse.json({ error: error?.message || 'sign_error' }, { status: 500 })

  return NextResponse.redirect(signed.signedUrl, { status: 302 })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; docId: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle()
  if (!profile?.activo || !['super_admin','gerente','comprador','administrativo'].includes(profile.rol)) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: doc } = await admin
    .from('proveedor_documentos').select('archivo_url, proveedor_id').eq('id', params.docId).maybeSingle()
  if (!doc || doc.proveedor_id !== params.id) return NextResponse.json({ error: 'no_encontrado' }, { status: 404 })

  if (doc.archivo_url) {
    await admin.storage.from('proveedor-documentos').remove([doc.archivo_url]).catch(() => {})
  }
  const { error } = await admin.from('proveedor_documentos').delete().eq('id', params.docId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
