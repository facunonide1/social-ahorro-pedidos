import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAnthropic, hasAnthropicKey } from '@/lib/ai/client'
import { CHAT_MODEL } from '@/lib/ai/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Predicciones a futuro de NORA (F6.5.5).
 *
 * GET /api/nora/predictions
 * A diferencia del briefing (que cuenta lo de hoy), esto mira hacia adelante:
 * detecta riesgos que todavía no explotaron pero van a hacerlo (merma de lotes,
 * tareas que van a vencer, quiebres de stock, presión de caja) y Claude los
 * convierte en predicciones accionables con severidad y acción sugerida.
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

  // Agregados con admin client para no chocar con RLS por sucursal. Las cifras
  // son operativas, no exponen datos sensibles de clientes.
  const adm = createAdminClient()
  const hoy = new Date().toISOString().slice(0, 10)
  const ahora = new Date().toISOString()
  const en48h = new Date(Date.now() + 2 * 86_400_000).toISOString()
  const en7d = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  const en15d = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10)

  const [lotesRes, tareasRes, stockRes, facturasRes] = await Promise.all([
    // Lotes que vencen en 15 días con stock → riesgo de merma económica
    adm
      .from('lotes_productos')
      .select(
        'cantidad_actual, fecha_vencimiento, numero_lote, productos(nombre, precio_costo)',
      )
      .gte('fecha_vencimiento', hoy)
      .lte('fecha_vencimiento', en15d)
      .gt('cantidad_actual', 0)
      .order('fecha_vencimiento', { ascending: true })
      .limit(50),
    // Tareas que vencen en las próximas 48h y no están cerradas
    adm
      .from('tareas')
      .select('titulo, prioridad, fecha_vencimiento, estado')
      .gte('fecha_vencimiento', ahora)
      .lte('fecha_vencimiento', en48h)
      .in('estado', ['pendiente', 'asignada', 'en_progreso', 'en_verificacion'])
      .order('fecha_vencimiento', { ascending: true })
      .limit(40),
    // Stock en o bajo el mínimo → riesgo de quiebre
    adm
      .from('stock_sucursal')
      .select('cantidad_actual, stock_minimo, productos(nombre)')
      .gt('stock_minimo', 0)
      .limit(500),
    // Facturas que vencen en 7d → presión de caja
    adm
      .from('facturas_proveedor')
      .select('total, fecha_vencimiento')
      .gte('fecha_vencimiento', hoy)
      .lte('fecha_vencimiento', en7d)
      .not('estado', 'in', '("pagada","anulada","rechazada")')
      .order('fecha_vencimiento', { ascending: true })
      .limit(100),
  ])

  // --- Lotes: valor en riesgo + top items ---
  const lotes = ((lotesRes.data ?? []) as any[]).map((l) => {
    const prod = Array.isArray(l.productos) ? l.productos[0] : l.productos
    const valor = Number(l.cantidad_actual) * Number(prod?.precio_costo ?? 0)
    return {
      nombre: prod?.nombre ?? 'producto sin nombre',
      cantidad: Number(l.cantidad_actual),
      vence: l.fecha_vencimiento as string,
      valor,
    }
  })
  const lotesValorRiesgo = lotes.reduce((a, l) => a + l.valor, 0)
  const lotesTop = lotes.slice(0, 5)

  // --- Tareas en riesgo ---
  const tareas = ((tareasRes.data ?? []) as any[]).map((t) => ({
    titulo: t.titulo as string,
    prioridad: t.prioridad as string,
    vence: t.fecha_vencimiento as string,
  }))
  const tareasCriticas = tareas.filter(
    (t) => t.prioridad === 'critica' || t.prioridad === 'alta',
  ).length

  // --- Stock bajo mínimo ---
  const stockBajo = ((stockRes.data ?? []) as any[])
    .filter((s) => Number(s.cantidad_actual) <= Number(s.stock_minimo))
    .map((s) => {
      const prod = Array.isArray(s.productos) ? s.productos[0] : s.productos
      return {
        nombre: prod?.nombre ?? 'producto sin nombre',
        actual: Number(s.cantidad_actual),
        minimo: Number(s.stock_minimo),
      }
    })
  const stockTop = stockBajo.slice(0, 5)

  // --- Facturas: presión de caja ---
  const facturas = (facturasRes.data ?? []) as any[]
  const facturasMonto = facturas.reduce((a, f) => a + Number(f.total ?? 0), 0)

  const fechaHumano = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const datos = {
    lotes_por_vencer: lotes.length,
    lotes_valor_riesgo: Math.round(lotesValorRiesgo),
    tareas_en_riesgo: tareas.length,
    tareas_criticas: tareasCriticas,
    stock_bajo_minimo: stockBajo.length,
    facturas_7d: facturas.length,
    facturas_monto: facturasMonto,
    fecha: fechaHumano,
  }

  const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`

  const SYSTEM = `Sos NORA, copiloto de NORA HQ (cadena de farmacias Social Ahorro).
Tu tarea es ANTICIPAR problemas: mirás los datos y predecís qué va a salir mal
si nadie actúa, con tiempo para evitarlo.

Devolvé SIEMPRE y SOLO JSON válido (sin markdown) con esta forma:
{
  "resumen": "1 frase con el panorama general a futuro",
  "predicciones": [
    {
      "titulo": "título corto y concreto",
      "detalle": "1-2 frases: qué va a pasar y por qué",
      "severidad": "alta" | "media" | "baja",
      "area": "operaciones" | "finanzas" | "tareas" | "stock",
      "accion": "una acción concreta sugerida"
    }
  ]
}

Reglas:
- Máximo 4 predicciones, ordenadas por severidad (alta primero).
- Basate SOLO en los datos que te paso. No inventes cifras ni productos.
- Si un área no tiene riesgo, no la incluyas (no rellenes por rellenar).
- Si no hay nada relevante a futuro, devolvé predicciones: [] y un resumen tranquilo.
- Montos en formato argentino ($1.234.567). Voseo, directo, sin emojis.`

  const userMsg = `Fecha: ${fechaHumano}. Datos a futuro:

LOTES POR VENCER (próximos 15 días, con stock): ${lotes.length}
Valor total en riesgo de merma: ${fmt(lotesValorRiesgo)}
${lotesTop.map((l) => `- ${l.nombre}: ${l.cantidad} u. vence ${l.vence} (~${fmt(l.valor)})`).join('\n') || '- (sin lotes próximos a vencer)'}

TAREAS QUE VENCEN EN 48H (sin completar): ${tareas.length} (${tareasCriticas} alta/crítica)
${tareas.slice(0, 6).map((t) => `- [${t.prioridad}] ${t.titulo} → vence ${t.vence}`).join('\n') || '- (sin tareas próximas a vencer)'}

STOCK EN O BAJO EL MÍNIMO: ${stockBajo.length}
${stockTop.map((s) => `- ${s.nombre}: ${s.actual} (mínimo ${s.minimo})`).join('\n') || '- (sin quiebres de stock)'}

FACTURAS QUE VENCEN EN 7 DÍAS: ${facturas.length} por ${fmt(facturasMonto)}

Generá las predicciones.`

  const anthropic = getAnthropic()
  let raw: string
  try {
    const msg = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    })
    raw = msg.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text as string)
      .join('')
      .trim()
  } catch (e: any) {
    return NextResponse.json(
      { error: `claude fallo: ${e?.message ?? 'desconocido'}` },
      { status: 500 },
    )
  }

  const parsed = extractJson(raw)
  if (!parsed) {
    return NextResponse.json(
      {
        error: 'no pudimos interpretar la respuesta del modelo',
        crudo: raw.slice(0, 400),
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    resumen: typeof parsed.resumen === 'string' ? parsed.resumen : '',
    predicciones: Array.isArray(parsed.predicciones) ? parsed.predicciones : [],
    datos,
  })
}

function extractJson(text: string): any | null {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}
