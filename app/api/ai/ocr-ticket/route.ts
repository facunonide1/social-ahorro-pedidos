import { createHash, randomUUID } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { hasAnthropicKey } from '@/lib/ai/client'
import { extraerDatosTicket, isSupportedMediaType } from '@/lib/ai/ocr-ticket'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BUCKET = 'tickets-validacion'
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_ROLES = ['super_admin', 'gerente', 'administrativo']

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export async function POST(req: NextRequest) {
  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_admin')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: string; activo: boolean }>()
  if (!profile?.activo || !ALLOWED_ROLES.includes(profile.rol))
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })

  if (!hasAnthropicKey())
    return NextResponse.json(
      { error: 'La IA no está configurada (falta ANTHROPIC_API_KEY).' },
      { status: 503 },
    )

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'form_invalido' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File))
    return NextResponse.json({ error: 'falta_archivo' }, { status: 400 })
  if (!isSupportedMediaType(file.type))
    return NextResponse.json(
      { error: 'Formato no soportado. Subí una imagen JPG, PNG, WEBP o GIF.' },
      { status: 400 },
    )
  if (file.size > MAX_BYTES)
    return NextResponse.json(
      { error: 'La imagen supera los 10 MB.' },
      { status: 400 },
    )

  const clienteDni = (form.get('cliente_dni') as string | null)?.trim() || null
  const clienteTelefono =
    (form.get('cliente_telefono') as string | null)?.trim() || null

  const bytes = Buffer.from(await file.arrayBuffer())
  const hash = createHash('sha256').update(bytes).digest('hex')

  // Dedup: si ya cargamos esta misma imagen, devolvemos el ticket existente.
  const { data: existente } = await sb
    .from('tickets_validacion')
    .select('*')
    .eq('hash_imagen', hash)
    .maybeSingle()
  if (existente)
    return NextResponse.json({ ok: true, duplicado: true, ticket: existente })

  // Subida a storage con service role.
  const admin = createAdminClient()
  const ext = EXT_BY_TYPE[file.type] ?? 'jpg'
  const path = `${new Date().getFullYear()}/${randomUUID()}.${ext}`
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false })
  if (upErr) {
    const msg = /bucket not found/i.test(upErr.message)
      ? 'Falta el bucket de storage. Aplicá la migración 0028_tickets_validacion_bucket.sql.'
      : upErr.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // OCR con visión.
  let ocr
  try {
    ocr = await extraerDatosTicket(bytes.toString('base64'), file.type)
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'No se pudo procesar la imagen con la IA.' },
      { status: 500 },
    )
  }

  const estado = ocr.legible ? 'pendiente' : 'dudoso'

  const { data: ticket, error: insErr } = await sb
    .from('tickets_validacion')
    .insert({
      cliente_dni: clienteDni,
      cliente_telefono: clienteTelefono,
      foto_url: path,
      hash_imagen: hash,
      fecha_ticket_extraida: ocr.fecha_ticket,
      total_extraido: ocr.total,
      sucursal_extraida: ocr.sucursal,
      numero_ticket_extraido: ocr.numero_ticket,
      raw_ocr: ocr,
      estado,
    })
    .select('*')
    .maybeSingle()
  if (insErr) {
    const msg = insErr.message.includes('does not exist')
      ? 'Falta la tabla tickets_validacion. Aplicá la migración 0027_ia_aprobaciones_tickets.sql.'
      : insErr.message
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Suma puntos al cliente del CRM por cargar el ticket (best-effort, no rompe el flujo).
  if (ticket && clienteDni) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/server')
      const { sumarPuntos } = await import('@/lib/crm/puntos')
      const adm = createAdminClient()
      const { data: cli } = await adm.from('clientes').select('id').eq('dni', clienteDni).eq('activo', true).maybeSingle()
      if (cli) await sumarPuntos(adm, cli.id, 'cargar_ticket', { referenciaTipo: 'ticket', referenciaId: ticket.id })
    } catch { /* no bloquear la carga del ticket */ }
  }

  return NextResponse.json({ ok: true, duplicado: false, ticket, ocr })
}
