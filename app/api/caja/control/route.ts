import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Subir un archivo de tickets o de ventas, y correr el control.
 *
 * ── POR QUÉ EL ARCHIVO SE LEE EN EL NAVEGADOR ───────────────────────────────
 *
 * Mismo motivo que el maestro: el archivo lo tiene quien lo sube y acá sólo
 * llegan los totales ya calculados. Un archivo de tickets de un día puede tener
 * miles de renglones y no hay ninguna razón para que viajen.
 *
 * Lo que llega es: de qué día es, de qué sucursal, cuántas filas tenía, y los
 * totales por medio de pago. El hash evita subir dos veces el mismo.
 *
 * ── Y POR QUÉ EL CONTROL CORRE ACÁ Y NO EN EL CLIENTE ───────────────────────
 *
 * Porque cruza contra los cierres y contra la caja fuerte, y la caja fuerte es
 * de los dueños: el navegador de un encargado no puede leerla. La función corre
 * con el cliente de servicio y devuelve sólo el resultado del cruce de SU
 * sucursal.
 */
const ROLES: AdminRole[] = [
  'super_admin', 'gerente', 'tesoreria', 'administrativo', 'encargado_sucursal', 'sucursal',
]

export async function POST(req: NextRequest) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'no autenticado' }, { status: 401 })

  const { data: me } = await sb
    .from('users_admin').select('rol, activo, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; sucursal_id: string | null }>()
  if (!me?.activo || !ROLES.includes(me.rol)) {
    return NextResponse.json({ error: 'sin permiso para controlar la caja' }, { status: 403 })
  }

  const b = await req.json().catch(() => null)
  const tipo = b?.tipo as string | undefined
  const fecha = typeof b?.fecha === 'string' ? b.fecha : null
  let sucursalId = typeof b?.sucursal_id === 'string' ? b.sucursal_id : null

  // Un encargado controla SU sucursal y nada más. No se toma la que mande el
  // cuerpo: se usa la que tiene asignada. Si mandó otra, se le dice.
  if (me.sucursal_id) {
    if (sucursalId && sucursalId !== me.sucursal_id) {
      return NextResponse.json({ error: 'sólo podés controlar la caja de tu sucursal' }, { status: 403 })
    }
    sucursalId = me.sucursal_id
  }
  if (!sucursalId) return NextResponse.json({ error: 'falta la sucursal' }, { status: 400 })
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'falta el día que se está controlando' }, { status: 400 })
  }

  const adm = createAdminClient()

  // ── SI VIENE UN ARCHIVO, SE GUARDA ANTES DE CRUZAR ────────────────────────
  if (tipo === 'tickets' || tipo === 'ventas') {
    const hash = typeof b?.hash === 'string' ? b.hash : null
    if (!hash) return NextResponse.json({ error: 'falta el hash del archivo' }, { status: 400 })

    const { error } = await adm.from('caja_importaciones').upsert({
      tipo,
      sucursal_id: sucursalId,
      fecha,
      archivo_nombre: String(b?.nombre ?? 'sin nombre'),
      archivo_hash: hash,
      filas: Number(b?.filas ?? 0),
      // Null y no cero cuando el archivo no trae ese medio: cero diría que ese
      // día no se cobró con tarjeta.
      total: b?.total == null ? null : Number(b.total),
      total_efectivo: b?.total_efectivo == null ? null : Number(b.total_efectivo),
      total_tarjetas: b?.total_tarjetas == null ? null : Number(b.total_tarjetas),
      total_otros: b?.total_otros == null ? null : Number(b.total_otros),
      columnas_leidas: b?.columnas ?? null,
      subido_por: user.id,
    }, { onConflict: 'archivo_hash' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: cruces, error: eC } = await adm
    .rpc('caja_controlar', { p_sucursal: sucursalId, p_fecha: fecha })
  if (eC) return NextResponse.json({ error: eC.message }, { status: 500 })

  const { data: diferencias } = await adm
    .from('caja_diferencias')
    .select('*')
    .eq('sucursal_id', sucursalId).eq('fecha', fecha)
    .order('detectada_at', { ascending: false })

  return NextResponse.json({ ok: true, cruces, diferencias })
}
