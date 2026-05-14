import type { SupabaseClient } from '@supabase/supabase-js'

import { getAnthropic } from '@/lib/ai/client'
import { resumenDiarioSystemPrompt } from '@/lib/ai/prompts'
import { runTool } from '@/lib/ai/tools'
import { SUMMARY_MODEL, SUMMARY_MAX_TOKENS } from '@/lib/ai/config'

type Sb = SupabaseClient<any, any, any>

/**
 * Junta las métricas del día reutilizando las tools de la IA y le
 * pide a Claude el resumen ejecutivo en markdown (F4.6).
 */
export async function generarResumenDiario(
  sb: Sb,
): Promise<{ markdown: string; metricas: Record<string, unknown> }> {
  const [ventasHoy, ventas7d, cashFlow, facturas, anomalias] =
    await Promise.all([
      runTool(sb, 'get_resumen_ventas', { dias: 1 }),
      runTool(sb, 'get_resumen_ventas', { dias: 7 }),
      runTool(sb, 'get_cash_flow_resumen', {}),
      runTool(sb, 'get_facturas_vencer', { dias: 7 }),
      runTool(sb, 'get_anomalias', {}),
    ])

  const metricas: Record<string, unknown> = {
    ventas_hoy: ventasHoy,
    ventas_ultimos_7d: ventas7d,
    cash_flow: cashFlow,
    facturas_por_vencer_7d: facturas,
    anomalias,
  }

  const anthropic = getAnthropic()
  const msg = await anthropic.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: SUMMARY_MAX_TOKENS,
    system: resumenDiarioSystemPrompt(),
    messages: [
      {
        role: 'user',
        content:
          'Estas son las métricas reales del ERP de hoy en formato JSON. Escribí el resumen ejecutivo diario.\n\n' +
          JSON.stringify(metricas, null, 2),
      },
    ],
  })

  const markdown = msg.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  return { markdown, metricas }
}
