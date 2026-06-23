import { NextResponse, type NextRequest } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'

import { createClient } from '@/lib/supabase/server'
import { getAnthropic, hasAnthropicKey } from '@/lib/ai/client'
import { chatSystemPrompt } from '@/lib/ai/prompts'
import {
  AI_TOOL_DEFINITIONS,
  TOOL_LABELS,
  runTool,
} from '@/lib/ai/tools'
import {
  CHAT_MODEL,
  CHAT_MAX_TOKENS,
  MAX_TOOL_ROUNDS,
  MAX_HISTORY_MESSAGES,
} from '@/lib/ai/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type UiMessage = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  const sb = createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()
  if (!user)
    return NextResponse.json({ error: 'Tenés que iniciar sesión para hablar con NORA.' }, { status: 401 })

  // El nombre vive en auth.users.user_metadata, NO en users_admin (que solo tiene
  // rol/activo/permisos). Seleccionar 'nombre' acá rompía el query → profile null →
  // 403 "sin_permiso" para TODOS. Ver lib/admin-hub/auth.ts para el patrón correcto.
  const { data: profile, error: profileError } = await sb
    .from('users_admin')
    .select('rol, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: string; activo: boolean }>()
  if (profileError || !profile?.activo)
    return NextResponse.json(
      { error: 'Tu usuario no tiene acceso al panel. Pedile a un administrador que lo active.' },
      { status: 403 },
    )
  const nombre = ((user.user_metadata as Record<string, any> | null)?.nombre as string) ?? null

  if (!hasAnthropicKey())
    return NextResponse.json(
      { error: 'La IA no está configurada (falta ANTHROPIC_API_KEY).' },
      { status: 503 },
    )

  let body: { messages?: UiMessage[]; ruta?: string; conversationId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'No pude leer tu mensaje, probá de nuevo.' }, { status: 400 })
  }

  const uiMessages = (body.messages ?? [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
  if (uiMessages.length === 0 || uiMessages[uiMessages.length - 1].role !== 'user')
    return NextResponse.json({ error: 'Escribime algo y te respondo.' }, { status: 400 })

  const messages: Anthropic.MessageParam[] = uiMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const system = chatSystemPrompt({
    rol: profile.rol,
    nombre,
    ruta: body.ruta ?? null,
  })
  const anthropic = getAnthropic()
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))
      }

      let finalText = ''
      let tokensIn = 0
      let tokensOut = 0
      const toolsCalled: string[] = []

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const ms = anthropic.messages.stream({
            model: CHAT_MODEL,
            max_tokens: CHAT_MAX_TOKENS,
            system,
            tools: AI_TOOL_DEFINITIONS,
            messages,
          })

          ms.on('text', (delta) => {
            finalText += delta
            send({ type: 'text', delta })
          })

          const final = await ms.finalMessage()
          tokensIn += final.usage.input_tokens
          tokensOut += final.usage.output_tokens

          if (final.stop_reason !== 'tool_use') break

          messages.push({ role: 'assistant', content: final.content })
          const toolResults: Anthropic.ToolResultBlockParam[] = []
          for (const block of final.content) {
            if (block.type !== 'tool_use') continue
            toolsCalled.push(block.name)
            send({
              type: 'tool_start',
              name: block.name,
              label: TOOL_LABELS[block.name] ?? block.name,
            })
            const result = await runTool(
              sb,
              block.name,
              (block.input as Record<string, any>) ?? {},
              { userId: user.id, rol: profile.rol },
            )
            // Si NORA resolvió a qué pantalla ir, mandamos un evento de navegación
            // para que el cliente abra el flujo (ej. "cargar un pago" → Pagos).
            const r = result as { existe?: boolean; href?: string; label?: string } | null
            if (block.name === 'ir_a_pantalla' && r?.existe && r.href) {
              send({ type: 'navigate', href: r.href, label: r.label ?? '' })
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            })
          }
          messages.push({ role: 'user', content: toolResults })

          if (round === MAX_TOOL_ROUNDS - 1) {
            send({
              type: 'text',
              delta:
                '\n\n_(Llegué al límite de consultas encadenadas. Preguntame de nuevo si necesitás más detalle.)_',
            })
          }
        }

        // Persistencia
        const mensajesParaGuardar = [
          ...uiMessages,
          { role: 'assistant', content: finalText },
        ]
        let conversationId = body.conversationId ?? null
        if (conversationId) {
          await sb
            .from('ai_conversaciones')
            .update({
              mensajes: mensajesParaGuardar,
              tools_called: toolsCalled,
              tokens_input: tokensIn,
              tokens_output: tokensOut,
              model: CHAT_MODEL,
            })
            .eq('id', conversationId)
            .eq('user_id', user.id)
        } else {
          const { data: inserted } = await sb
            .from('ai_conversaciones')
            .insert({
              user_id: user.id,
              mensajes: mensajesParaGuardar,
              tools_called: toolsCalled,
              tokens_input: tokensIn,
              tokens_output: tokensOut,
              model: CHAT_MODEL,
            })
            .select('id')
            .maybeSingle<{ id: string }>()
          conversationId = inserted?.id ?? null
        }

        send({ type: 'done', conversationId })
      } catch (e: any) {
        send({
          type: 'error',
          message: e?.message || 'Error procesando la consulta.',
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
