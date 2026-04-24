import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { ProveedorDocumentoTipo } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

const VALID_TIPOS: ProveedorDocumentoTipo[] = [
  'constancia_cuit', 'certificado_iibb', 'convenio', 'lista_precios', 'otro'
]

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_admin').select('rol, activo').eq('id', user.id).maybeSingle()
  if (!profile?.activo || !['super_admin','gerente','comprador','administrativo'].includes(profile.rol)) {
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const tipoRaw = form?.get('tipo') as string | null
  const nombre = (form?.get('nombre') as string | null)?.trim() || null
  const vencimientoRaw = (form?.get('fecha_vencimiento') as string | null) || null

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file_requerido' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'archivo_muy_grande' }, { status: 400 })
  }
  const tipo = (tipoRaw && VALID_TIPOS.includes(tipoRaw as any)) ? (tipoRaw as ProveedorDocumentoTipo) : 'otro'
  const fechaVencimiento = vencimientoRaw && /^\d{4}-\d{2}-\d{2}$/.test(vencimientoRaw) ? vencimientoRaw : null

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
  const path = `${params.id}/${Date.now()}-${tipo}.${ext}`
  const buf = Buffer.from(await file.arrayBuffer())

  const upload = await admin.storage
    .from('proveedor-documentos')
    .upload(path, buf, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 500 })

  // Guardamos la PATH (no una URL pública). Las signed URLs se generan on demand.
  const { data: row, error: insErr } = await admin
    .from('proveedor_documentos')
    .insert({
      proveedor_id: params.id,
      tipo,
      nombre: nombre || file.name,
      archivo_url: path,
      fecha_vencimiento: fechaVencimiento,
      uploaded_by: user.id,
    })
    .select('*')
    .maybeSingle()

  if (insErr) {
    // rollback del archivo
    await admin.storage.from('proveedor-documentos').remove([path]).catch(() => {})
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, doc: row })
}
