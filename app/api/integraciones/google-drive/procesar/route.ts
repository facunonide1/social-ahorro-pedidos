import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { exigirDueno } from '@/lib/drive/acceso'
import { correrIngesta } from '@/lib/drive/correr'
import { guardarMapeo, revertirLista } from '@/lib/drive/aplicar'
import { ingestaHabilitada } from '@/lib/drive/flag'
import type { Clasificacion } from '@/lib/drive/clasificar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const CLASES: Clasificacion[] = ['precios', 'factura', 'maestro', 'ignorar', 'planilla']

export async function POST(req: NextRequest) {
  const g = await exigirDueno()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  if (!ingestaHabilitada()) return NextResponse.json({ ok: true, omitido: 'deshabilitado' })
  const body = await req.json().catch(() => ({}))
  const adm = createAdminClient()

  if (body?.accion === 'clasificar') {
    if (!CLASES.includes(body.clasificacion)) return NextResponse.json({ error: 'clasificación inválida' }, { status: 400 })
    const { error } = await adm.from('drive_archivos_ingestados').update({
      clasificacion_forzada: body.clasificacion,
      clasificacion: body.clasificacion,
      estado: body.clasificacion === 'ignorar' ? 'ok' : 'pendiente',
      intentos: 0,
      proximo_intento_at: null,
      error: null,
    }).eq('file_id', body.fileId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body?.accion === 'mapear') {
    await guardarMapeo(adm, {
      proveedorId: body.proveedorId ?? null,
      nombre: String(body.nombre ?? ''),
      productoId: String(body.productoId ?? ''),
    })
    return NextResponse.json({ ok: true })
  }

  if (body?.accion === 'revertir') {
    if (!body.listaId) return NextResponse.json({ error: 'falta la lista' }, { status: 400 })
    await revertirLista(adm, body.listaId, body.anteriorId ?? null)
    await adm.from('drive_archivos_ingestados').update({
      estado: 'previa', lista_id: null, error: 'Lista revertida. La anterior volvió a vigente.',
    }).eq('lista_id', body.listaId)
    return NextResponse.json({ ok: true })
  }

  const r = await correrIngesta({ manual: true })
  return NextResponse.json(r)
}
