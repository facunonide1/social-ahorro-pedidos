import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * E · ARMAR Y FIRMAR UN LOTE DE PUBLICAR O DESPUBLICAR.
 *
 * ── POR QUÉ SON DOS LLAMADAS Y NO UNA ───────────────────────────────────────
 *
 * Porque armar es reversible y firmar no. `canal_lote_armar` deja el lote en
 * borrador con cada producto y su plata: se puede mirar, sacar renglones y
 * tirarlo. `canal_lote_firmar` lo cierra con nombre y fecha, y recién ahí se
 * exporta para que una persona lo cargue en la plataforma.
 *
 * **Ninguna de las dos publica.** NORA no tiene credenciales de PedidosYa ni
 * de WooCommerce para escribir: el lote firmado es un .xlsx y lo carga alguien.
 * Eso no es una limitación técnica pendiente de resolver, es la regla.
 *
 * Las dos van con la sesión: las funciones guardan `auth.uid()` y miran el rol
 * adentro contra `users_admin`. Un lote firmado sin firmante no está firmado.
 */
export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'sin sesión' }, { status: 401 })

  let b: {
    accion?: 'armar' | 'firmar'
    canal?: string; que?: 'publicar' | 'despublicar'
    productos?: string[]; motivo?: string
    lote?: string; sacar?: string[]
  }
  try { b = await req.json() } catch {
    return NextResponse.json({ error: 'cuerpo inválido' }, { status: 400 })
  }

  if (b.accion === 'armar') {
    if (!b.canal || !b.que || !Array.isArray(b.productos) || !b.productos.length) {
      return NextResponse.json({ error: 'faltan el canal, la acción o los productos' }, { status: 400 })
    }
    if (!b.motivo?.trim()) {
      // Un lote sin motivo es un lote que en tres meses nadie puede explicar.
      return NextResponse.json({ error: 'falta el motivo del lote' }, { status: 400 })
    }
    const { data, error } = await sb.rpc('canal_lote_armar', {
      p_canal: b.canal, p_accion: b.que,
      p_productos: b.productos, p_motivo: b.motivo,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const r = data as { ok: boolean; por_que?: string }
    if (!r?.ok) return NextResponse.json({ error: r?.por_que ?? 'no se pudo armar' }, { status: 400 })
    return NextResponse.json(r)
  }

  if (b.accion === 'firmar') {
    if (!b.lote) return NextResponse.json({ error: 'falta el lote' }, { status: 400 })
    const { data, error } = await sb.rpc('canal_lote_firmar', {
      p_lote: b.lote,
      p_sacar: Array.isArray(b.sacar) && b.sacar.length ? b.sacar : null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const r = data as { ok: boolean; por_que?: string }
    if (!r?.ok) return NextResponse.json({ error: r?.por_que ?? 'no se pudo firmar' }, { status: 400 })
    return NextResponse.json(r)
  }

  return NextResponse.json({ error: 'acción desconocida' }, { status: 400 })
}
