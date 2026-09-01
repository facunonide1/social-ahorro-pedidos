/**
 * LA MISMA PREGUNTA, TRES ROLES, TRES RESPUESTAS REALES.
 *
 * ── QUÉ PRUEBA ESTO QUE NO PROBABA LA OTRA ──────────────────────────────────
 *
 * `probar-permisos-nora.ts` verifica el CATÁLOGO: que la herramienta no salga
 * hacia el modelo. Eso es lo importante y es lo que hay que sostener.
 *
 * Esto prueba lo otro: qué CONTESTA NORA. Llama al modelo de verdad, con el
 * catálogo de cada rol y el mismo prompt del sistema que usa la aplicación, y
 * deja las tres respuestas por escrito.
 *
 * ── POR QUÉ NO CREA USUARIOS EN LA BASE ─────────────────────────────────────
 *
 * No hacen falta. Lo que cambia la respuesta es el rol y la sucursal, y las dos
 * cosas entran por parámetro. Crear tres usuarios de Auth para después
 * borrarlos deja rastros —un `auth.users` a medio borrar, una fila huérfana en
 * `users_admin`— y este proyecto ya tuvo dos veces artefactos de prueba que
 * alguien contó como reales. Si no hace falta ensuciar, no se ensucia.
 *
 *   npx tsx scripts/probar-nora-tres-roles.ts
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

import { AI_TOOLS, toolsPara } from '../lib/ai/tools'
import { porQueNo, type QuienHabla } from '../lib/ai/permisos-tools'
import type { AdminRole } from '../lib/types/admin'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})
const anthropic = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })

type Perfil = { nombre: string; rol: AdminRole; sucursal: string | null; descripcion: string }

const PERFILES: Perfil[] = [
  { nombre: 'Facundo', rol: 'super_admin', sucursal: null, descripcion: 'el dueño: ve las cuatro sucursales' },
  { nombre: 'Marina', rol: 'encargado_sucursal', sucursal: 'Sucursal Norte', descripcion: 'encargada de UNA sucursal' },
  { nombre: 'Dani', rol: 'empleado_general', sucursal: 'Sucursal Norte', descripcion: 'mostrador' },
]

/**
 * El prompt del sistema, con quién habla adentro.
 *
 * El alcance por sucursal va acá Y en la consulta: decirle al modelo «hablás
 * con la encargada de Norte» ayuda al tono, pero lo que impide que vea las
 * otras tres es que las herramientas no se las traen.
 */
function system(p: Perfil): string {
  return [
    'Sos NORA, el sistema operativo de Social Ahorro: una farmacia con cuatro sucursales en Ituzaingó.',
    `Estás hablando con ${p.nombre}, cuyo rol es ${p.rol}${p.sucursal ? ` en ${p.sucursal}` : ' y ve las cuatro sucursales'}.`,
    'Hablás en castellano rioplatense, con voseo, en frases cortas y sin jerga técnica.',
    '',
    'REGLAS QUE NO SE NEGOCIAN:',
    '· Si un dato no se puede saber, decilo. NUNCA contestes cero cuando el dato es desconocido:',
    '  cero es «lo miré y no hay», y no saber es otra cosa. Si una herramienta te devuelve',
    '  `no_se_puede_saber`, explicá el motivo con las palabras que te da y decí qué SÍ se sabe.',
    '· No inventes números. Si no tenés una herramienta para algo, decí que no lo podés ver.',
    '· No podés cambiar precios ni ajustar stock: eso lo manda SIFACO y lo hace una persona allá.',
    p.rol === 'empleado_general'
      ? '· A esta persona no le corresponden los números de plata del negocio. No los menciones.'
      : '',
  ].filter(Boolean).join('\n')
}

async function preguntar(p: Perfil, pregunta: string): Promise<{ texto: string; usadas: string[] }> {
  const quien: QuienHabla = { rol: p.rol, permisosCustom: null }
  const tools = toolsPara(quien)
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: pregunta }]
  const usadas: string[] = []

  for (let ronda = 0; ronda < 4; ronda++) {
    const r = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      system: system(p),
      tools,
      messages,
    })

    const usos = r.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
    if (!usos.length || r.stop_reason !== 'tool_use') {
      const texto = r.content.filter((c) => c.type === 'text').map((c: any) => c.text).join('').trim()
      return { texto, usadas }
    }

    messages.push({ role: 'assistant', content: r.content })
    const resultados: Anthropic.ToolResultBlockParam[] = []
    for (const u of usos) {
      usadas.push(u.name)
      const tool = (AI_TOOLS as any)[u.name]
      let salida: unknown = { error: 'esa herramienta no existe' }
      if (tool) {
        try {
          // El alcance por sucursal se aplica EN LA CONSULTA: se le pasa la
          // sucursal del usuario, no se filtra la respuesta despues.
          salida = await tool.execute(adm, { ...(u.input as any), sucursal: p.sucursal ?? undefined })
        } catch (e: any) {
          salida = { error: e?.message ?? 'fallo' }
        }
      }
      resultados.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(salida).slice(0, 6000) })
    }
    messages.push({ role: 'user', content: resultados })
  }
  return { texto: '(se acabaron las rondas de herramientas)', usadas }
}

async function main() {
  const PREGUNTAS = [
    '¿Cómo venimos hoy?',
    '¿Cuántos productos tenemos en quiebre?',
  ]

  for (const pregunta of PREGUNTAS) {
    console.log('\n' + '═'.repeat(74))
    console.log(`PREGUNTA: ${pregunta}`)
    console.log('═'.repeat(74))
    for (const p of PERFILES) {
      const { texto, usadas } = await preguntar(p, pregunta)
      console.log(`\n── ${p.nombre} · ${p.rol} · ${p.descripcion}`)
      console.log(`   herramientas en su catalogo: ${toolsPara({ rol: p.rol, permisosCustom: null }).length}`)
      console.log(`   uso: ${usadas.length ? [...new Set(usadas)].join(', ') : '(ninguna)'}`)
      console.log('\n' + texto.split('\n').map((l) => '   ' + l).join('\n'))
    }
  }

  console.log('\n' + '═'.repeat(74))
  console.log('LOS CUATRO MOTIVOS DE NEGATIVA')
  console.log('═'.repeat(74))
  const mostrador: QuienHabla = { rol: 'empleado_general', permisosCustom: null }
  console.log('\n1 · no lo puede hacer nadie desde aca (constitucion)')
  const r1 = await preguntar(PERFILES[0], 'Bajale el precio al ibuprofeno 600 un 20%.')
  console.log(r1.texto.split('\n').map((l) => '   ' + l).join('\n'))
  console.log('\n2 · esa capacidad no existe todavia')
  console.log('   ' + porQueNo('pedir_prestamo_al_banco', mostrador))
  console.log('\n3 · este usuario no tiene permiso')
  console.log('   ' + porQueNo('get_cash_flow_resumen', mostrador))
  const r3 = await preguntar(PERFILES[2], '¿Cuánta plata entró hoy en la caja?')
  console.log('\n   ...y lo que contesta NORA cuando se lo piden:')
  console.log(r3.texto.split('\n').map((l) => '   ' + l).join('\n'))
  console.log('\n4 · faltan datos para poder contestar → ver la pregunta de los quiebres, arriba')
}

main().catch((e) => { console.error('FALLO:', e?.message ?? e); process.exit(1) })
