import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * C · LOS DÉBITOS · ESCRITURA.
 *
 * ── LO QUE NO SE PUEDE HACER ACÁ ────────────────────────────────────────────
 *
 * Borrar un débito. No hay acción de baja y no hay política de delete en la
 * base: un débito es lo que la obra social te sacó, y taparlo es exactamente
 * lo que este sector viene a impedir. Se cierra como `perdido`, con el motivo.
 */

async function gate(accion: 'crear' | 'editar') {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) return { error: 'usuario inactivo', status: 403 as const }
  if (!puede(me.rol, me.permisos_custom ?? null, 'convenios', accion)) {
    return { error: `sin permiso para ${accion} débitos`, status: 403 as const }
  }
  return { ok: true as const, userId: user.id, sucursalId: me.sucursal_id }
}

/** La sucursal del débito, verificada contra la base y no contra el cuerpo. */
async function suDebito(adm: any, id: string, miSucursal: string | null) {
  const { data } = await adm.from('convenio_debitos')
    .select('id, sucursal_id, estado, importe').eq('id', id).maybeSingle()
  if (!data) return { error: 'ese débito no existe', status: 404 as const }
  if (miSucursal && data.sucursal_id !== miSucursal) {
    return { error: 'ese débito es de otra sucursal', status: 403 as const }
  }
  return { ok: true as const, debito: data }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null)
  const accion = String(b?.accion ?? '')
  const g = await gate(accion === 'cargar' || accion === 'reclamar' ? 'crear' : 'editar')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const adm = createAdminClient()

  // ── CARGAR UN DÉBITO A MANO ─────────────────────────────────────────────
  if (accion === 'cargar') {
    const suc = b?.sucursal_id ?? g.sucursalId
    if (!suc) return NextResponse.json({ error: 'falta la sucursal' }, { status: 400 })
    if (g.sucursalId && suc !== g.sucursalId) {
      return NextResponse.json({ error: 'sólo podés cargar débitos de tu sucursal' }, { status: 403 })
    }
    if (!b?.motivo || !b?.importe || !b?.fecha_liquidacion || !b?.convenio_id) {
      return NextResponse.json({ error: 'falta el convenio, el motivo, el importe o la fecha' }, { status: 400 })
    }

    // Si viene de una presentación, se copia quién la armó: así la atribución
    // sobrevive a que la presentación se borre.
    let armo: string | null = null
    if (b?.presentacion_id) {
      const { data: p } = await adm.from('convenio_presentaciones')
        .select('armada_por').eq('id', b.presentacion_id).maybeSingle()
      armo = (p as any)?.armada_por ?? null
    }

    const { data, error } = await adm.from('convenio_debitos').insert({
      convenio_id: b.convenio_id, sucursal_id: suc,
      presentacion_id: b?.presentacion_id ?? null,
      comprobante_id: b?.comprobante_id ?? null,
      motivo: b.motivo, motivo_texto_original: b?.motivo_texto_original ?? null,
      importe: Number(b.importe), fecha_liquidacion: b.fecha_liquidacion,
      armo_presentacion: armo, notas: b?.notas ?? null, created_by: g.userId,
    }).select('id').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // C.6 · si es reclamable, la tarea con el plazo. Si no, se dice por qué:
    // un débito sin tarea y sin explicación es un débito que nadie reclama.
    const { data: tarea } = await adm.rpc('convenio_debito_tarea', { p_debito: data!.id })
    return NextResponse.json({ ok: true, id: data?.id, tarea })
  }

  // ── PEDIRLE LA TAREA A UN DÉBITO YA CARGADO ─────────────────────────────
  if (accion === 'tarea') {
    const s = await suDebito(adm, b?.id, g.sucursalId)
    if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
    const { data, error } = await adm.rpc('convenio_debito_tarea', { p_debito: b.id })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const r = data as any
    if (!r?.ok) return NextResponse.json({ error: r?.motivo ?? 'no corresponde' }, { status: 409 })
    return NextResponse.json(r)
  }

  // ── C.5 · RECLAMAR ──────────────────────────────────────────────────────
  if (accion === 'reclamar') {
    const s = await suDebito(adm, b?.debito_id, g.sucursalId)
    if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })

    // No se reclama lo que el sistema dice que no se puede. Si dice que «no se
    // puede saber», sí se deja reclamar: la decisión es de la persona, y el
    // sistema no la frena por no tener un dato.
    const { data: r } = await adm.rpc('convenio_debito_reclamable', { p_debito: b.debito_id })
    if ((r as any)?.reclamable === false) {
      return NextResponse.json({
        error: `Este débito no es reclamable: ${(r as any).por_que}`,
      }, { status: 409 })
    }

    const { error } = await adm.from('convenio_reclamos').insert({
      debito_id: b.debito_id, reclamado_por: g.userId,
      como: b?.como ?? null, respaldo: b?.respaldo ?? null, que_se_dijo: b?.que_se_dijo ?? null,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await adm.from('convenio_debitos').update({ estado: 'reclamado' }).eq('id', b.debito_id)
    return NextResponse.json({
      ok: true,
      aviso: (r as any)?.reclamable === null
        ? `Queda reclamado. El sistema no podía decidir solo: ${(r as any).por_que}`
        : null,
    })
  }

  // ── C.5 · CERRAR EL RECLAMO ─────────────────────────────────────────────
  //
  // Un reclamo queda abierto hasta que alguien lo cierre. Cerrarlo pide
  // resultado: «sin respuesta» también es un resultado, pero lo elige una
  // persona. Null es que nadie lo miró.
  if (accion === 'cerrar_reclamo') {
    if (!b?.resultado) {
      return NextResponse.json({
        error: 'Para cerrar un reclamo hay que decir qué pasó. Si no contestaron, el resultado es «sin respuesta» — que no es lo mismo que dejarlo abierto.',
      }, { status: 400 })
    }
    const { data: rc } = await adm.from('convenio_reclamos')
      .select('id, debito_id').eq('id', b?.id).maybeSingle()
    if (!rc) return NextResponse.json({ error: 'ese reclamo no existe' }, { status: 404 })
    const s = await suDebito(adm, (rc as any).debito_id, g.sucursalId)
    if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })

    const recuperado = b?.importe_recuperado == null || b.importe_recuperado === ''
      ? null : Number(b.importe_recuperado)

    const { error } = await adm.from('convenio_reclamos').update({
      resultado: b.resultado, respuesta: b?.respuesta ?? null,
      respuesta_at: b?.respuesta_at ?? new Date().toISOString().slice(0, 10),
      importe_recuperado: recuperado,
      cerrado_por: g.userId, cerrado_at: new Date().toISOString(),
    }).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const estado = b.resultado === 'recuperado' ? 'recuperado'
      : b.resultado === 'recuperado_parcial' ? 'recuperado'
      : 'perdido'
    await adm.from('convenio_debitos').update({ estado }).eq('id', (rc as any).debito_id)
    return NextResponse.json({ ok: true, estado })
  }

  // ── E.2 · RECLASIFICAR UN «OTRO» ────────────────────────────────────────
  //
  // El texto original NO se borra: es lo único que permite revisar si la
  // reclasificación fue correcta.
  if (accion === 'reclasificar') {
    const s = await suDebito(adm, b?.id, g.sucursalId)
    if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
    if (!b?.motivo) return NextResponse.json({ error: 'falta el motivo nuevo' }, { status: 400 })
    const { error } = await adm.from('convenio_debitos')
      .update({ motivo: b.motivo }).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    const { data: tarea } = await adm.rpc('convenio_debito_tarea', { p_debito: b.id })
    return NextResponse.json({ ok: true, tarea })
  }

  return NextResponse.json({ error: `acción desconocida: ${accion}` }, { status: 400 })
}
