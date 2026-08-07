import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import {
  cerrarManual,
  esperarNotaCredito,
  reclamarFaltante,
  resolverPrecio,
} from '@/lib/documentos/acciones-conciliacion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Acciones sobre una conciliación. Todas las dispara una persona: el sistema
 * calcula la diferencia, pero qué hacer con ella lo decide alguien.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateDocumentos('crear')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'No pude leer los datos.' }, { status: 400 }) }

  const adm = createAdminClient()

  try {
    switch (b?.accion) {
      case 'reclamar_faltante': {
        const r = await reclamarFaltante(adm, { conciliacionId: params.id, userId: g.userId, motivo: b?.motivo })
        return NextResponse.json({ ok: true, ...r, mensaje: 'Reclamo creado. Lo vas a ver en Devoluciones y reclamos.' })
      }
      case 'esperar_nc': {
        const r = await esperarNotaCredito(adm, { conciliacionId: params.id, userId: g.userId })
        return NextResponse.json({
          ok: true,
          ...r,
          mensaje: 'Seguimiento creado. Te lo voy a recordar cada 7 días hasta que entre la nota de crédito.',
        })
      }
      case 'precio': {
        if (b?.decision !== 'reclamar' && b?.decision !== 'aceptar') {
          return NextResponse.json({ error: 'Elegí si reclamás la diferencia o aceptás el precio nuevo.' }, { status: 400 })
        }
        const r = await resolverPrecio(adm, {
          conciliacionId: params.id,
          decision: b.decision,
          motivo: b?.motivo ?? '',
          userId: g.userId,
        })
        return NextResponse.json({
          ok: true,
          ...r,
          mensaje: b.decision === 'aceptar'
            ? 'Precio nuevo registrado con tu motivo.'
            : 'Reclamo por diferencia de precio creado.',
        })
      }
      case 'cerrar': {
        await cerrarManual(adm, { conciliacionId: params.id, motivo: b?.motivo ?? '', userId: g.userId })
        return NextResponse.json({ ok: true, mensaje: 'Conciliación cerrada con tu motivo.' })
      }
      default:
        return NextResponse.json({ error: 'Acción desconocida.' }, { status: 400 })
    }
  } catch (e: any) {
    // El mensaje de estas funciones ya está escrito para que lo lea una persona.
    console.error('[conciliacion] acción falló', b?.accion, e)
    return NextResponse.json({ error: e?.message ?? 'No pude completar la acción.' }, { status: 400 })
  }
}
