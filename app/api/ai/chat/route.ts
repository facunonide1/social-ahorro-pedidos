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
  if (!user) return NextResponse.json({ error: 'no_autorizado' }, { status: 401 })

  const { data: profile } = await sb
    .from('users_admin')
    .select('rol, nombre, activo')
    .eq('id', user.id)
    .maybeSingle<{ rol: string; nombre: string | null; activo: boolean }>()
  if (!profile?.activo)
    return NextResponse.json({ error: 'sin_permiso' }, { status: 403 })

  if (!hasAnthropicKey())
    return NextResponse.json(
      { error: 'La IA no está configurada (falta ANTHROPIC_API_KEY).' },
      { status: 503 },
    )

  let body: { messages?: UiMessage[]; ruta?: string; conversationId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'body_invalido' }, { status: 400 })
  }

  const uiMessages = (body.messages ?? [])
    .filter((m) => m && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
  if (uiMessages.length === 0)
    return NextResponse.json({ error: 'sin_mensajes' }, { status: 400 })
  if (uiMessages[uiMessages.length - 1].role !== 'user')
    return NextResponse.json({ error: 'ultimo_mensaje_debe_ser_user' }, { status: 400 })

  const messages: Anthropic.MessageParam[] = uiMessages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const system = chatSystemPrompt({
    rol: profile.rol,
    nombre: profile.nombre,
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
