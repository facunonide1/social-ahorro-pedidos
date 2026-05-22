import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import {
  verificarEvidencia,
  isSupportedEvidenceMediaType,
  type EvidenciaMediaType,
} from '@/lib/ai/verify-evidence'
import { hasAnthropicKey } from '@/lib/ai/client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Verificación visual por IA (F6.5.6 Diferencial 1).
 *
 * Body JSON:
 *  - tarea_id: uuid (obligatorio)
 *  - foto_base64 + media_type   (preferido), o
 *  - foto_url                   (la fetcheamos y convertimos)
 *
 * Devuelve { aprobado, razon, sugerencias }. Deja una traza como
 * comentario en la tarea (best-effort).
 */
export async function POST(req: NextRequest) {
  if (!hasAnthropicKey()) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY no configurada' },
      { status: 500 },
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'body inválido' }, { status: 400 })
  }

  const tareaId: string | undefined = body?.tarea_id
  if (!tareaId) {
    return NextResponse.json({ error: 'tarea_id requerido' }, { status: 400 })
  }

  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  }

  const { data: tarea } = await sb
    .from('tareas')
    .select(
      'id, tipo:tipos_tareas(ia_prompt_verificacion, verificacion_ia, nombre)',
    )
    .eq('id', tareaId)
    .maybeSingle()
  if (!tarea) {
    return NextResponse.json({ error: 'tarea inexistente' }, { status: 404 })
  }

  const tipo = pickOne<any>((tarea as any).tipo)
  if (!tipo?.verificacion_ia || !tipo?.ia_prompt_verificacion) {
    return NextResponse.json(
      { error: 'este tipo de tarea no tiene verificación visual configurada' },
      { status: 400 },
    )
  }

  // Resolver imagen
  let base64: string | null = null
  let mediaType: EvidenciaMediaType | null = null

  if (typeof body.foto_base64 === 'string' && typeof body.media_type === 'string') {
    if (!isSupportedEvidenceMediaType(body.media_type)) {
      return NextResponse.json(
        { error: 'media_type no soportado (usá jpeg/png/webp/gif)' },
        { status: 400 },
      )
    }
    base64 = body.foto_base64
    mediaType = body.media_type
  } else if (typeof body.foto_url === 'string') {
    try {
      const resp = await fetch(body.foto_url)
      if (!resp.ok) {
        return NextResponse.json(
          { error: `no pude descargar la foto (${resp.status})` },
          { status: 400 },
        )
      }
      const ct = resp.headers.get('content-type') || 'image/jpeg'
      const detected = ct.split(';')[0]!.trim()
      if (!isSupportedEvidenceMediaType(detected)) {
        return NextResponse.json(
          { error: `media type "${detected}" no soportado` },
          { status: 400 },
        )
      }
      const buf = Buffer.from(await resp.arrayBuffer())
      base64 = buf.toString('base64')
      mediaType = detected
    } catch (e: any) {
      return NextResponse.json(
        { error: `error descargando foto: ${e?.message ?? 'desconocido'}` },
        { status: 400 },
      )
    }
  } else {
    return NextResponse.json(
      { error: 'pasá foto_base64 + media_type o foto_url' },
      { status: 400 },
    )
  }

  // Llamada a Claude vision
  let verdict
  try {
    verdict = await verificarEvidencia(base64!, mediaType!, tipo.ia_prompt_verificacion)
  } catch (e: any) {
    return NextResponse.json(
      { error: `vision fallo: ${e?.message ?? 'desconocido'}` },
      { status: 500 },
    )
  }

  // Traza best-effort: un comentario en la tarea
  try {
    const prefijo = verdict.aprobado ? 'NORA aprobó la evidencia ✓' : 'NORA rechazó la evidencia ✗'
    const contenido =
      `${prefijo}\nRazón: ${verdict.razon}` +
      (verdict.sugerencias ? `\nSugerencia: ${verdict.sugerencias}` : '')
    await sb.from('tareas_comentarios').insert({
      tarea_id: tareaId,
      user_id: user.id,
      contenido,
      menciones: [],
      es_cambio_estado: false,
    })
  } catch {
    // no romper la respuesta si la traza falla
  }

  return NextResponse.json({ ok: true, ...verdict })
}

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}
