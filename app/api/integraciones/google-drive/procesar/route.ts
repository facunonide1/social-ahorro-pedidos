import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { exigirDueno } from '@/lib/drive/acceso'
import { asegurarCarpetasDeCompras, correrIngesta, liberarTrabados, resumenIngesta } from '@/lib/drive/correr'
import { guardarMapeo, revertirLista } from '@/lib/drive/aplicar'
import { carpetasDeCompras, ingestaHabilitada } from '@/lib/drive/flag'
import { claveDesdeEnv, descifrarToken } from '@/lib/drive/crypto'
import { refrescarAccessToken } from '@/lib/drive/google'
import type { Clasificacion } from '@/lib/drive/clasificar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const CLASES: Clasificacion[] = ['precios', 'factura', 'maestro', 'ignorar', 'planilla']

/**
 * Estado de la ingesta, para el dueño: cuentas por estado, lo trabado, las
 * últimas corridas (si el cron llega o no) y si el cron puede autenticarse.
 */
export async function GET() {
  const g = await exigirDueno()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const adm = createAdminClient()
  const resumen = await resumenIngesta(adm)
  const { data: con } = await adm.from('integraciones_google_drive').select('listado_cursor').order('connected_at', { ascending: false }).limit(1).maybeSingle()
  const cursor = (con?.listado_cursor ?? {}) as Record<string, any>
  const { data: trabados } = await adm.from('drive_archivos_ingestados')
    .select('nombre, intentos, proximo_intento_at, updated_at').eq('estado', 'procesando').limit(20)
  return NextResponse.json({
    habilitada: ingestaHabilitada(),
    cron_configurado: !!process.env.CRON_SECRET,
    carpetas_de_compras: carpetasDeCompras(),
    corridas: Array.isArray(cursor.corridas) ? cursor.corridas : [],
    partes: cursor.partes ?? {},
    trabados: trabados ?? [],
    ...resumen,
  })
}

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

  if (body?.accion === 'destrabar') {
    // Todo lo que esté «procesando» vuelve a la cola, sin esperar el vencimiento del lock.
    const r = await liberarTrabados(adm, new Date(), true)
    return NextResponse.json({ ok: true, ...r })
  }

  if (body?.accion === 'carpetas-compras') {
    const { data: row } = await adm.from('integraciones_google_drive')
      .select('id, refresh_token_cifrado, iv, tag, estado').order('connected_at', { ascending: false }).limit(1).maybeSingle()
    if (!row) return NextResponse.json({ error: 'No hay una cuenta conectada.' }, { status: 400 })
    if (row.estado === 'vencida') return NextResponse.json({ error: 'La conexión venció. Reconectá.' }, { status: 409 })
    const refresh = descifrarToken({ cifrado: row.refresh_token_cifrado, iv: row.iv, tag: row.tag }, claveDesdeEnv())
    const acceso = await refrescarAccessToken(refresh)
    if (!acceso.ok) return NextResponse.json({ error: acceso.error }, { status: acceso.invalidGrant ? 409 : 502 })
    const carpetas = await asegurarCarpetasDeCompras(adm, acceso.accessToken, row.id, carpetasDeCompras())
    return NextResponse.json({ ok: true, carpetas })
  }

  const r = await correrIngesta({ manual: true })
  return NextResponse.json(r)
}
