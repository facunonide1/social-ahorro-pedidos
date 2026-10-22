import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Aplicar es una decisión, y la toma alguien que puede comprar.
 *
 * Más corto que la lista de quien puede SUBIR un archivo: subir y mirar la
 * previa no cambia nada; aplicar reescribe el stock de las cuatro sucursales.
 */
const ROLES: AdminRole[] = ['super_admin', 'gerente', 'comprador']

/**
 * APLICAR EL MAESTRO POR SUCURSAL.
 *
 * Lo único que hace esta ruta es decidir QUIÉN puede y confirmar que la
 * decisión fue tomada. El trabajo está en `sifaco_aplicar_sucursales`, en la
 * base, y está ahí porque son 192.464 filas de stock más 30.127 de ventas: eso
 * no viaja a una función para volver.
 *
 * ── APLICAR CON AVISOS ES VÁLIDO, Y QUEDA ESCRITO ───────────────────────────
 *
 * Un aviso puede ser un hallazgo. «El valor al costo subió 71,8%» no es un
 * defecto del archivo: fue el aviso que destapó que el maestro anterior traía
 * una sola sucursal. Por eso un aviso no bloquea — pero el `confirmar_avisos`
 * del cuerpo tiene que venir en true, y queda guardado en
 * `aplicado_con_avisos`. Dentro de seis semanas, cuando un número no cierre, va
 * a importar saber que esto se aplicó sabiendo.
 *
 * Un CORTE sí bloquea, y no se puede confirmar: un archivo al que le falta el
 * stock de una sucursal no tiene una versión aceptable.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data: me } = await sb
    .from('users_admin').select('rol, activo').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean }>()
  if (!me?.activo || !ROLES.includes(me.rol)) {
    return NextResponse.json({ error: 'sin permiso para aplicar un maestro' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const confirmaAvisos = body?.confirmar_avisos === true

  const adm = createAdminClient()

  const { data: imp } = await adm
    .from('sifaco_importaciones')
    .select('id, tipo, estado, fecha_archivo, filas_cargadas, verificacion, aplicado_at')
    .eq('id', params.id)
    .maybeSingle<{
      id: string; tipo: string; estado: string; fecha_archivo: string | null
      filas_cargadas: number; verificacion: unknown; aplicado_at: string | null
    }>()

  if (!imp) return NextResponse.json({ error: 'la importación no existe' }, { status: 404 })
  if (imp.tipo !== 'sucursal') {
    return NextResponse.json({ error: 'esta importación no es del maestro por sucursal' }, { status: 400 })
  }
  if (imp.aplicado_at) {
    return NextResponse.json({ error: 'esta importación ya se aplicó' }, { status: 409 })
  }
  if (!imp.filas_cargadas) {
    return NextResponse.json({ error: 'no hay filas cargadas: subí el archivo primero' }, { status: 400 })
  }
  if (!imp.fecha_archivo) {
    return NextResponse.json({
      error: 'la importación no declara de qué día es el archivo. Sin eso los cuatro meses de ventas no se pueden ubicar.',
    }, { status: 400 })
  }

  const chequeos = Array.isArray(imp.verificacion) ? imp.verificacion as { nivel: string; titulo: string }[] : []
  const cortes = chequeos.filter((c) => c.nivel === 'corta')
  if (cortes.length) {
    return NextResponse.json({
      error: `El archivo no entra: ${cortes.map((c) => c.titulo).join('; ')}.`,
      cortes,
    }, { status: 422 })
  }

  const avisos = chequeos.filter((c) => c.nivel === 'avisa')
  if (avisos.length && !confirmaAvisos) {
    return NextResponse.json({
      error: 'hay avisos sin confirmar',
      avisos,
      mensaje: 'Mirá los avisos y confirmá. Un aviso puede ser un hallazgo y no un defecto, pero tiene que haber alguien que lo haya leído.',
    }, { status: 409 })
  }

  const { data, error } = await adm.rpc('sifaco_aplicar_sucursales', { p_importacion: params.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await adm.from('sifaco_importaciones')
    .update({ subido_por: user.id })
    .eq('id', params.id)
    .is('subido_por', null)

  // ── LOS AGENTES MIRAN EL MAESTRO NUEVO ────────────────────────────────
  //
  // El resumen que leen las pantallas de agentes es un snapshot diario
  // (migración 0204). Entrar un maestro cambia stock y precios de 48.000
  // productos: si no se recalcula acá, hasta mañana a las 5 los agentes
  // siguen hablando del maestro viejo.
  //
  // Si tarda o falla, la importación igual salió bien: son cosas separadas.
  let resumen: string | null = null
  const { error: eRes } = await adm.rpc('agentes_resumen_refrescar')
  if (eRes) resumen = `El maestro entró, pero los números de los agentes no se recalcularon (${eRes.message}). Se recalculan solos mañana a las 5.`

  return NextResponse.json({ ok: true, resultado: data, aviso_agentes: resumen })
}
