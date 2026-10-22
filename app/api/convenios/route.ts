import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * EL PADRÓN DE CONVENIOS · ESCRITURA.
 *
 * ── LO QUE ESTA RUTA NO ACEPTA ──────────────────────────────────────────────
 *
 * Ningún campo de paciente, médico ni diagnóstico. No es que no se guarden:
 * es que no existen en el destino, así que mandarlos no hace nada. Esta nota
 * está acá para el que venga a agregar un campo «para completar el circuito».
 *
 * Regla de oro 9: terreno legal-farmacéutico intocable.
 */

type Gate =
  | { error: string; status: 401 | 403 }
  | { ok: true; userId: string; rol: AdminRole; custom: PermisosCustom | null }

async function gate(accion: 'crear' | 'editar' | 'eliminar'): Promise<Gate> {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 }

  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null }>()
  if (!me?.activo) return { error: 'usuario inactivo', status: 403 }

  if (!puede(me.rol, me.permisos_custom ?? null, 'convenios', accion)) {
    return { error: `sin permiso para ${accion} convenios`, status: 403 }
  }
  return { ok: true, userId: user.id, rol: me.rol, custom: me.permisos_custom ?? null }
}

/** Número o null. Nunca cero por defecto: cero es una afirmación. */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function texto(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim() : ''
  return t === '' ? null : t
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null)
  const accion = String(b?.accion ?? '')
  const esAlta = accion.startsWith('alta_')
  const g = await gate(esAlta ? 'crear' : accion.startsWith('baja_') ? 'eliminar' : 'editar')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const adm = createAdminClient()

  // ── EL CONVENIO ─────────────────────────────────────────────────────────
  if (accion === 'alta_convenio' || accion === 'editar_convenio') {
    const nombre = texto(b?.nombre)
    if (!nombre) return NextResponse.json({ error: 'el nombre es obligatorio' }, { status: 400 })

    const fila = {
      nombre,
      sigla: texto(b?.sigla),
      tipo: b?.tipo ?? 'obra_social',
      cuit: texto(b?.cuit),
      activo: b?.activo ?? true,
      cobertura_general_pct: num(b?.cobertura_general_pct),
      plazo_presentacion_dias: num(b?.plazo_presentacion_dias),
      plazo_pago_dias: num(b?.plazo_pago_dias),
      troquel: texto(b?.troquel),
      periodicidad: texto(b?.periodicidad),
      modo_presentacion: texto(b?.modo_presentacion),
      dia_cierre: num(b?.dia_cierre),
      aviso_dias_antes: num(b?.aviso_dias_antes) ?? 7,
      firmado_at: texto(b?.firmado_at),
      notas: texto(b?.notas),
    }

    if (accion === 'alta_convenio') {
      const { data, error } = await adm.from('convenios')
        .insert({ ...fila, created_by: g.userId }).select('id').maybeSingle()
      if (error) {
        return NextResponse.json({
          error: error.code === '23505' || /duplicate/i.test(error.message)
            ? `Ya hay un convenio con el nombre «${nombre}».`
            : error.message,
        }, { status: 400 })
      }
      return NextResponse.json({ ok: true, id: data?.id })
    }

    if (!b?.id) return NextResponse.json({ error: 'falta el id' }, { status: 400 })
    // El histórico lo escribe el trigger: acá no se duplica. Ver 0208.
    const { error } = await adm.from('convenios').update(fila).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // ── LA COBERTURA POR TIPO DE PRODUCTO ───────────────────────────────────
  if (accion === 'alta_cobertura') {
    const pct = num(b?.cobertura_pct)
    if (pct == null) return NextResponse.json({ error: 'falta el porcentaje' }, { status: 400 })
    const { error } = await adm.from('convenio_cobertura').insert({
      convenio_id: b?.convenio_id,
      categoria: texto(b?.categoria),
      condicion_venta: texto(b?.condicion_venta),
      cobertura_pct: pct,
      notas: texto(b?.notas),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // ── QUÉ EXIGE ───────────────────────────────────────────────────────────
  if (accion === 'alta_requisito') {
    if (!b?.exigencia) return NextResponse.json({ error: 'falta la exigencia' }, { status: 400 })
    const { error } = await adm.from('convenio_requisitos').insert({
      convenio_id: b?.convenio_id,
      exigencia: b.exigencia,
      detalle: texto(b?.detalle),
      obligatorio: b?.obligatorio ?? true,
      motivo_debito: texto(b?.motivo_debito),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // ── DÓNDE SE PRESENTA ───────────────────────────────────────────────────
  if (accion === 'alta_contacto') {
    const { error } = await adm.from('convenio_contactos').insert({
      convenio_id: b?.convenio_id,
      nombre: texto(b?.nombre_contacto),
      rol: texto(b?.rol),
      telefono: texto(b?.telefono),
      email: texto(b?.email),
      portal_url: texto(b?.portal_url),
      direccion: texto(b?.direccion),
      notas: texto(b?.notas),
      principal: b?.principal ?? false,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  // ── BAJAS ───────────────────────────────────────────────────────────────
  //
  // El histórico NO se borra nunca: es el registro de lo que pasó, y un débito
  // viejo se evalúa con la cobertura que estaba vigente entonces.
  if (accion === 'baja_cobertura' || accion === 'baja_requisito' || accion === 'baja_contacto') {
    const tabla = accion === 'baja_cobertura' ? 'convenio_cobertura'
      : accion === 'baja_requisito' ? 'convenio_requisitos' : 'convenio_contactos'
    const { error } = await adm.from(tabla).delete().eq('id', b?.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `acción desconocida: ${accion}` }, { status: 400 })
}
