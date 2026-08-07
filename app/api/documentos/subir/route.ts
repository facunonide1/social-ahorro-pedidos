import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { subirDocumento } from '@/lib/documentos/subida'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Única puerta de subida del motor de documentos.
 *
 * La llaman: el alta de Finanzas, el clip del asistente y (más adelante) la
 * recepción de remitos en Compras. Recibe multipart/form-data con `archivo`.
 *
 * Responde `duplicado` sin reprocesar cuando el mismo archivo ya se cargó.
 */
export async function POST(req: NextRequest) {
  const g = await gateDocumentos('crear')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'No pude leer el archivo.' }, { status: 400 })
  }

  const archivo = form.get('archivo')
  if (!archivo || typeof archivo === 'string') {
    return NextResponse.json({ error: 'Falta el archivo.' }, { status: 400 })
  }

  const buffer = Buffer.from(await archivo.arrayBuffer())
  const adm = createAdminClient()

  const lote = form.get('lote_id')
  const r = await subirDocumento(
    adm,
    { buffer, nombre: archivo.name || 'documento', mime: archivo.type || '' },
    g.userId,
    typeof lote === 'string' && lote ? lote : null,
  )

  if (r.estado === 'error') return NextResponse.json({ error: r.mensaje }, { status: 400 })
  return NextResponse.json(r)
}
