import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * D.2 · CAMBIAR CÓMO FUNCIONA EL SISTEMA, DESDE LA BARRA.
 *
 * «Pedime para 1 mes» cambia `cobertura_objetivo_meses`. No es una búsqueda ni
 * una navegación: es una escritura sobre la configuración, y por eso tiene tres
 * cosas que una búsqueda no tiene.
 *
 *   1. Sólo claves declaradas. La lista está en `lib/os/interpretar.ts` y no se
 *      acepta nada fuera de ella, aunque el cuerpo lo pida.
 *   2. Queda registrado quién lo cambió, de qué a qué.
 *   3. Es reversible: se devuelve el valor anterior para poder deshacer.
 *
 * Un parámetro que cambia sin registro es un sistema que de un día para otro
 * se comporta distinto y nadie sabe por qué.
 */
const PERMITIDAS = new Set([
  'cobertura_objetivo_meses', 'cobertura_sobrestock_meses', 'tasa_mensual_pct',
  'dias_maestro_viejo', 'dias_impago', 'caja_diferencia_minima',
])

export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data: me } = await sb.from('users_admin')
    .select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: string; activo: boolean }>()
  // Cambiar cómo funciona el sistema no es operar: lo hace quien configura.
  if (!me?.activo || !['super_admin', 'gerente'].includes(me.rol)) {
    return NextResponse.json({
      error: 'Cambiar cómo funciona el sistema lo hace un dueño. Podés verlo en Configuración.',
    }, { status: 403 })
  }

  const b = await req.json().catch(() => null)
  const clave = typeof b?.clave === 'string' ? b.clave : null
  const valor = b?.valor != null ? String(b.valor) : null
  if (!clave || !valor) return NextResponse.json({ error: 'falta la clave o el valor' }, { status: 400 })
  if (!PERMITIDAS.has(clave)) {
    return NextResponse.json({
      error: `«${clave}» no es un parámetro que se pueda cambiar desde la barra.`,
    }, { status: 400 })
  }

  const adm = createAdminClient()
  const { data: antes } = await adm.from('compras_parametros')
    .select('valor, que_decide').eq('clave', clave).maybeSingle()
  if (!antes) return NextResponse.json({ error: 'ese parámetro no existe' }, { status: 404 })

  const { error } = await adm.from('compras_parametros')
    .update({ valor }).eq('clave', clave)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // El registro: en la bitácora, igual que una decisión. Cambiar una regla ES
  // una decisión, y tiene que poder verse al lado de las otras.
  await adm.from('agente_bitacora').insert({
    agente: 'sistema',
    accion: 'cambiar_regla',
    propuso: `Cambiar ${clave.replace(/_/g, ' ')} de ${antes.valor} a ${valor}`,
    por_que: antes.que_decide ?? null,
    estado: 'ejecutada',
    decidio: user.id,
    decidio_at: new Date().toISOString(),
    decidio_que: `${antes.valor} → ${valor}`,
    esperado: { clave, antes: antes.valor, despues: valor },
  })

  return NextResponse.json({ ok: true, antes: antes.valor, ahora: valor })
}
