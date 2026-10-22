import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * E · IMPORTAR DÉBITOS.
 *
 * ── DOS PASOS, SIEMPRE ──────────────────────────────────────────────────────
 *
 * 1 · `previa` — se manda lo leído y el servidor devuelve qué entendió: qué
 *     motivo le asignó a cada fila, cuántas no reconoció, cuánto suma y a qué
 *     sucursal va cada una. **No escribe nada.**
 * 2 · `confirmar` — recién acá se guarda.
 *
 * El paso 1 existe porque el formato no se conoce. Un importador de un solo
 * paso que acierta el 80% de las columnas guarda el 80% y nadie se entera del
 * otro 20%, que es plata que nunca apareció.
 *
 * ── E.2 · LO QUE NO SE ENTIENDE ─────────────────────────────────────────────
 *
 * Va a `otro` con el texto original. No se le inventa un motivo para que
 * encaje: un débito mal clasificado como `fuera_de_vademecum` queda marcado
 * como no reclamable para siempre y nadie lo vuelve a mirar.
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
    return { error: 'sin permiso para importar liquidaciones', status: 403 as const }
  }
  return { ok: true as const, userId: user.id, rol: me.rol, sucursalId: me.sucursal_id }
}

type FilaCruda = {
  numero_comprobante: string | null
  fecha: string | null
  importe: number | null
  motivo_texto: string | null
  sucursal_texto: string | null
  se_descarta: string | null
}

/**
 * A qué sucursal va cada fila.
 *
 * Tres caminos, en orden: lo que diga el archivo (si se puede reconocer), la
 * sucursal elegida en la pantalla, o la del usuario. Si no se resuelve
 * ninguna, la fila NO se guarda — la sucursal es obligatoria (regla de oro 8)
 * y un débito sin sucursal no se puede atribuir ni comparar.
 */
function resolverSucursal(
  texto: string | null,
  sucursales: { id: string; nombre: string; codigo: string }[],
  elegida: string | null,
): string | null {
  if (texto) {
    const t = texto.toLowerCase().trim()
    const m = sucursales.find((s) =>
      s.nombre.toLowerCase() === t || s.codigo.toLowerCase() === t ||
      t.includes(s.nombre.toLowerCase()) || t.includes(s.codigo.toLowerCase()))
    if (m) return m.id
  }
  return elegida
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null)
  const accion = String(b?.accion ?? '')
  const g = await gate(accion === 'confirmar' ? 'crear' : 'editar')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const adm = createAdminClient()
  const filas: FilaCruda[] = Array.isArray(b?.filas) ? b.filas : []

  if (accion !== 'previa' && accion !== 'confirmar') {
    return NextResponse.json({ error: `acción desconocida: ${accion}` }, { status: 400 })
  }
  if (!b?.convenio_id) return NextResponse.json({ error: 'falta la obra social' }, { status: 400 })
  if (!filas.length) return NextResponse.json({ error: 'el archivo no tiene filas' }, { status: 400 })

  const { data: sucs } = await adm.from('sucursales')
    .select('id, nombre, codigo').eq('activa', true).order('codigo')
  const sucursales = (sucs ?? []) as any[]

  // Un encargado sólo puede importar lo de su sucursal.
  const elegida = g.sucursalId ?? (b?.sucursal_id ?? null)
  if (g.sucursalId && b?.sucursal_id && b.sucursal_id !== g.sucursalId) {
    return NextResponse.json({ error: 'sólo podés importar débitos de tu sucursal' }, { status: 403 })
  }

  // ── EL MATCHEO DE MOTIVOS ───────────────────────────────────────────────
  //
  // Una consulta por texto distinto, no una por fila: una liquidación de
  // 3.000 filas suele tener diez motivos diferentes.
  const textos = Array.from(new Set(filas.map((f) => f.motivo_texto ?? '').filter(Boolean)))
  const porTexto = new Map<string, { motivo: string; termino: string }>()
  for (const t of textos) {
    const { data } = await adm.rpc('convenio_motivo_de_texto', {
      p_texto: t, p_convenio: b.convenio_id,
    })
    const m = ((data ?? []) as any[])[0]
    if (m) porTexto.set(t, { motivo: m.motivo, termino: m.termino })
  }

  const resueltas = filas.map((f) => {
    const match = f.motivo_texto ? porTexto.get(f.motivo_texto) : undefined
    const suc = resolverSucursal(f.sucursal_texto, sucursales, elegida)
    let descarta = f.se_descarta
    if (!descarta && !suc) {
      descarta = 'no se pudo determinar la sucursal: el archivo no la trae y no se eligió ninguna'
    }
    if (!descarta && !f.fecha && !b?.fecha_liquidacion) {
      descarta = 'no hay fecha en la fila ni fecha de liquidación elegida: sin fecha no se puede calcular el plazo de reclamo'
    }
    return {
      ...f,
      sucursal_id: suc,
      // E.2 · lo que no se reconoce va a `otro` con el texto original.
      motivo: match?.motivo ?? 'otro',
      reconocido: !!match,
      por_que_termino: match?.termino ?? null,
      se_descarta: descarta,
    }
  })

  const guardables = resueltas.filter((f) => !f.se_descarta)
  const sinReconocer = guardables.filter((f) => !f.reconocido)
  const porMotivo = new Map<string, { n: number; plata: number }>()
  for (const f of guardables) {
    const a = porMotivo.get(f.motivo) ?? { n: 0, plata: 0 }
    porMotivo.set(f.motivo, { n: a.n + 1, plata: a.plata + (f.importe ?? 0) })
  }

  const resumen = {
    filas_leidas: filas.length,
    guardables: guardables.length,
    descartadas: resueltas.length - guardables.length,
    sin_motivo_reconocido: sinReconocer.length,
    total: guardables.reduce((a, f) => a + (f.importe ?? 0), 0),
    por_motivo: [...porMotivo.entries()]
      .map(([motivo, v]) => ({ motivo, ...v }))
      .sort((a, c) => c.plata - a.plata),
    // Las que no se van a guardar, con el motivo. Se devuelven todas: si se
    // devolvieran las primeras diez, el que confirma no sabría qué deja afuera.
    descartes: resueltas.filter((f) => f.se_descarta)
      .map((f) => ({ numero: f.numero_comprobante, importe: f.importe, por_que: f.se_descarta })),
    // Los textos que no se reconocieron, para poder enseñarle el término.
    textos_sin_reconocer: Array.from(new Set(sinReconocer.map((f) => f.motivo_texto).filter(Boolean))),
  }

  // ── PASO 1 · LA PREVIA, SIN ESCRIBIR NADA ───────────────────────────────
  if (accion === 'previa') {
    return NextResponse.json({ ok: true, ...resumen })
  }

  // ── PASO 2 · CONFIRMAR ──────────────────────────────────────────────────
  if (!guardables.length) {
    return NextResponse.json({
      error: 'No hay ninguna fila que se pueda guardar. Mirá los motivos de descarte: lo más común es que no se haya encontrado la columna de importe.',
    }, { status: 400 })
  }

  const { data: liq, error: eLiq } = await adm.from('convenio_liquidaciones').insert({
    convenio_id: b.convenio_id,
    sucursal_id: elegida,
    periodo: b?.periodo ?? null,
    fecha_liquidacion: b?.fecha_liquidacion ?? new Date().toISOString().slice(0, 10),
    origen: b?.origen ?? 'archivo',
    archivo_nombre: b?.archivo_nombre ?? null,
    archivo_hash: b?.archivo_hash ?? null,
    extraccion_id: b?.extraccion_id ?? null,
    columnas_leidas: b?.mapeo ?? null,
    filas_leidas: filas.length,
    estado: 'confirmada',
    confirmada_por: g.userId, confirmada_at: new Date().toISOString(),
    created_by: g.userId,
  }).select('id').maybeSingle()

  if (eLiq) {
    return NextResponse.json({
      error: /duplicate|unique/i.test(eLiq.message)
        ? 'Este archivo ya se importó antes (mismo contenido). Importarlo de nuevo duplicaría cada débito.'
        : eLiq.message,
    }, { status: 400 })
  }

  // Los comprobantes que ya están cargados, para atar el débito al suyo: eso
  // es lo que permite después verificar un «duplicada» o un «mal cargada».
  const numeros = guardables.map((f) => f.numero_comprobante).filter(Boolean) as string[]
  const porNumero = new Map<string, { id: string; presentacion_id: string | null }>()
  if (numeros.length) {
    for (let i = 0; i < numeros.length; i += 500) {
      const { data } = await adm.from('convenio_comprobantes')
        .select('id, numero, presentacion_id')
        .eq('convenio_id', b.convenio_id).in('numero', numeros.slice(i, i + 500))
      for (const c of (data ?? []) as any[]) porNumero.set(c.numero, c)
    }
  }

  // Quién armó cada presentación, para la atribución de C.3.
  const presIds = Array.from(new Set([...porNumero.values()].map((c) => c.presentacion_id).filter(Boolean))) as string[]
  const armoPor = new Map<string, string | null>()
  if (presIds.length) {
    const { data } = await adm.from('convenio_presentaciones')
      .select('id, armada_por').in('id', presIds)
    for (const p of (data ?? []) as any[]) armoPor.set(p.id, p.armada_por)
  }

  const aInsertar = guardables.map((f) => {
    const comp = f.numero_comprobante ? porNumero.get(f.numero_comprobante) : undefined
    return {
      convenio_id: b.convenio_id,
      sucursal_id: f.sucursal_id!,
      presentacion_id: comp?.presentacion_id ?? null,
      comprobante_id: comp?.id ?? null,
      motivo: f.motivo,
      // Siempre se guarda el texto original, incluso cuando el motivo se
      // reconoció: es lo que permite revisar si el matcheo fue correcto.
      motivo_texto_original: f.motivo_texto,
      importe: f.importe!,
      fecha_liquidacion: b?.fecha_liquidacion ?? f.fecha ?? new Date().toISOString().slice(0, 10),
      liquidacion_id: liq!.id,
      armo_presentacion: comp?.presentacion_id ? (armoPor.get(comp.presentacion_id) ?? null) : null,
      created_by: g.userId,
    }
  })

  // De a 500: un insert de 3.000 filas en una sola request se cae por tamaño.
  let guardados = 0
  const errores: string[] = []
  for (let i = 0; i < aInsertar.length; i += 500) {
    const { data, error } = await adm.from('convenio_debitos')
      .insert(aInsertar.slice(i, i + 500)).select('id')
    if (error) errores.push(error.message)
    else guardados += (data ?? []).length
  }

  await adm.from('convenio_liquidaciones').update({
    filas_guardadas: guardados,
    sin_motivo_reconocido: sinReconocer.length,
    total_debitado: resumen.total,
  }).eq('id', liq!.id)

  const { data: reporte } = await adm.rpc('convenio_liquidacion_reporte', { p_liquidacion: liq!.id })

  return NextResponse.json({
    ok: true, liquidacion_id: liq!.id, guardados,
    // Si algún lote falló, se dice: un import que guardó 2.500 de 3.000 y no
    // lo dice es peor que uno que falla entero.
    errores: errores.length ? errores : null,
    reporte,
  })
}
