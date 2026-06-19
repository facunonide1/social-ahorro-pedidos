import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAnthropic, hasAnthropicKey } from '@/lib/ai/client'
import { CHAT_MODEL } from '@/lib/ai/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Briefing ejecutivo del día (F6.5.5).
 *
 * GET /api/nora/daily-briefing
 * Devuelve { mensaje, datos } para la NoraCard de Mission Control.
 * Tono ejecutivo, 3 frases, bullets de prioridades.
 */
export async function GET(_req: NextRequest) {
  if (!hasAnthropicKey()) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY no configurada' },
      { status: 500 },
    )
  }

  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'no autenticado' }, { status: 401 })
  }

  // Las consultas de agregados las hacemos con admin client (cuentas) para
  // evitar choques con RLS por sucursal. Las cifras no exponen datos sensibles.
  const adm = createAdminClient()
  const hoy = new Date().toISOString().slice(0, 10)
  const ahora = new Date().toISOString()
  const en7d = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const en30d = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

  const [facturasRes, tareasVencRes, stockRes, lotesRes] = await Promise.all([
    adm
      .from('facturas_proveedor')
      .select('total', { count: 'exact' })
      .gte('fecha_vencimiento', hoy)
      .lte('fecha_vencimiento', en7d)
      .not('estado', 'in', '("pagada","anulada","rechazada")'),
    adm
      .from('tareas')
      .select('id', { count: 'exact', head: true })
      .lt('fecha_vencimiento', ahora)
      .in('estado', ['pendiente', 'asignada', 'en_progreso', 'en_verificacion']),
    adm
      .from('stock_items')
      .select('cantidad, stock_minimo')
      .gt('stock_minimo', 0)
      .limit(5000),
    adm
      .from('lotes_productos')
      .select('id', { count: 'exact', head: true })
      .gte('fecha_vencimiento', hoy)
      .lte('fecha_vencimiento', en30d)
      .gt('cantidad_actual', 0),
  ])

  const facturas7d = facturasRes.count ?? 0
  const facturasMonto = ((facturasRes.data ?? []) as any[]).reduce(
    (a, f) => a + Number(f.total ?? 0),
    0,
  )
  const tareasVencidas = tareasVencRes.count ?? 0
  const stockCritico = ((stockRes.data ?? []) as any[]).filter(
    (s) => Number(s.cantidad) <= Number(s.stock_minimo),
  ).length
  const lotesPorVencer = lotesRes.count ?? 0

  // Saludo personalizado: nombre del profile
  const { data: prof } = await sb
    .from('users_admin')
    .select('nombre, email')
    .eq('id', user.id)
    .maybeSingle<{ nombre: string | null; email: string }>()
  const nombre =
    prof?.nombre?.split(' ')[0] ?? prof?.email?.split('@')[0] ?? 'equipo'

  const fechaHumano = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const SYSTEM = `Sos NORA. Generás el briefing ejecutivo del día para el dueño de
NORA HQ (cadena de farmacias Social Ahorro).

Formato:
- Saludo en 1 frase ("Buen día Facu" - usá el nombre).
- 1-2 frases con lo más importante (si hay algo urgente, primero).
- Si todo está tranquilo, decilo (sin inventar problemas).

Tono: ejecutivo, directo, primera persona plural ("tenemos", "vemos"). Sin emojis.
Montos en formato argentino ($1.234.567). Devolvé SOLO el texto del briefing
(sin envoltorios, sin markdown).`

  const userMsg = `Datos de hoy (${fechaHumano}):
- Facturas que vencen en los próximos 7 días: ${facturas7d} ($${facturasMonto.toLocaleString('es-AR')})
- Tareas vencidas sin completar: ${tareasVencidas}
- Productos con stock crítico (bajo el mínimo): ${stockCritico}
- Lotes que vencen en 30 días: ${lotesPorVencer}

Usuario: ${nombre}
Generá su briefing del día.`

  const anthropic = getAnthropic()
  try {
    const msg = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    })
    const mensaje = msg.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text as string)
      .join('')
      .trim()

    return NextResponse.json({
      ok: true,
      mensaje,
      datos: {
        facturas_7d: facturas7d,
        facturas_monto: facturasMonto,
        tareas_vencidas: tareasVencidas,
        stock_critico: stockCritico,
        lotes_por_vencer: lotesPorVencer,
        fecha: fechaHumano,
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: `claude fallo: ${e?.message ?? 'desconocido'}` },
      { status: 500 },
    )
  }
}
