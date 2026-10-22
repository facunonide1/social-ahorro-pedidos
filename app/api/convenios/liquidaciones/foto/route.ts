import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'
import { subirDocumento } from '@/lib/documentos/subida'
import { extraerDeArchivo } from '@/lib/documentos/extraer'
import { DOC_BUCKET } from '@/lib/documentos/config'
import {
  PROMPT_LIQUIDACION, PROMPT_LIQUIDACION_VERSION,
  limpiarDeDatosDePersonas, type LiquidacionLeida,
} from '@/lib/convenios/prompt-liquidacion'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * E.3 · LA LIQUIDACIÓN POR FOTO.
 *
 * ── QUÉ SE REUSA DEL MOTOR DE DOCUMENTOS ────────────────────────────────────
 *
 * Todo menos el prompt:
 *
 *   · `subirDocumento` — el bucket privado, el hash SHA-256, el deduplicado
 *     por contenido y la fila en `doc_extracciones`.
 *   · `extraerDeArchivo` — el modelo, el esfuerzo de razonamiento, el bloque
 *     de PDF vs imagen, la limpieza del JSON y los mensajes de error.
 *
 * Lo propio es `PROMPT_LIQUIDACION`, porque una liquidación no tiene renglones
 * de producto. No se copió la función: se le pasa el prompt (ver el parámetro
 * `otroPrompt` de `extraerDeArchivo`), para que en seis meses no haya dos
 * motores de documentos desincronizados.
 *
 * ── Y LA CONFIRMACIÓN HUMANA ────────────────────────────────────────────────
 *
 * Esta ruta **no guarda ningún débito**. Devuelve los renglones leídos en el
 * mismo formato que el lector de archivos, y la confirmación pasa por la misma
 * pantalla de previa: qué entendió, qué motivo le puso a cada uno, qué deja
 * afuera. Una foto mal leída que se guarda sola es peor que no tener la foto.
 */

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) return { error: 'usuario inactivo', status: 403 as const }
  if (!puede(me.rol, me.permisos_custom ?? null, 'convenios', 'crear')) {
    return { error: 'sin permiso para cargar liquidaciones', status: 403 as const }
  }
  return { ok: true as const, userId: user.id, sucursalId: me.sucursal_id }
}

export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let form: FormData
  try { form = await req.formData() } catch {
    return NextResponse.json({ error: 'el cuerpo tiene que ser un formulario con el archivo' }, { status: 400 })
  }
  const archivo = form.get('archivo')
  if (!archivo || typeof archivo === 'string') {
    return NextResponse.json({ error: 'Falta la foto.' }, { status: 400 })
  }

  const adm = createAdminClient()
  const buffer = Buffer.from(await archivo.arrayBuffer())

  // 1 · La subida, con el deduplicado del motor: si esta misma foto ya se
  // procesó, se ofrece abrir la que había en vez de pagar el modelo de nuevo.
  const sub = await subirDocumento(
    adm, { buffer, nombre: archivo.name || 'liquidacion', mime: archivo.type || '' },
    g.userId, null,
  )
  if (sub.estado === 'error') return NextResponse.json({ error: sub.mensaje }, { status: 400 })
  if (sub.estado === 'duplicado') {
    return NextResponse.json({
      error: 'Esta misma foto ya se cargó antes. Si la liquidación es otra, saca la foto de nuevo; ' +
        'si es la misma, los débitos ya deberían estar cargados.',
      extraccion_id: sub.extraccionId,
    }, { status: 409 })
  }

  // 2 · La lectura, con el prompt de liquidaciones.
  const r = await extraerDeArchivo(
    { base64: buffer.toString('base64'), mime: sub.mimeType },
    {
      system: PROMPT_LIQUIDACION,
      instruccion: 'Leé esta liquidación de obra social y devolvé solo el JSON. No devuelvas ningún dato de pacientes ni de médicos.',
      valido: (d) => !!d && typeof d === 'object' && Array.isArray(d.renglones),
    },
  )

  if (r.estado === 'error') {
    await adm.from('doc_extracciones')
      .update({ estado: 'error', error: r.mensaje, procesado_at: new Date().toISOString() })
      .eq('id', sub.extraccionId)
    return NextResponse.json({ error: r.mensaje }, { status: 422 })
  }

  // 3 · La red de seguridad de la regla de oro 9. El prompt le dice al modelo
  // que no devuelva datos de personas; esto lo verifica. Un prompt es una
  // instrucción, no una garantía.
  const { datos, saco } = limpiarDeDatosDePersonas(r.datos)
  const leida = datos as unknown as LiquidacionLeida

  await adm.from('doc_extracciones').update({
    respuesta_cruda: datos as any,
    confianza_global: r.confianzaGlobal,
    prompt_version: PROMPT_LIQUIDACION_VERSION,
    estado: 'leido',
    procesado_at: new Date().toISOString(),
  }).eq('id', sub.extraccionId)

  // 4 · Los renglones, en el MISMO formato que el lector de archivos, para que
  // la previa y la confirmación sean una sola pantalla y un solo camino.
  const filas = (leida.renglones ?? []).map((x) => {
    const importe = x.importe == null ? null : Math.abs(Number(x.importe))
    return {
      cruda: {} as Record<string, string>,
      numero_comprobante: x.numero_comprobante ?? null,
      fecha: x.fecha ?? null,
      importe: Number.isFinite(importe as number) ? importe : null,
      motivo_texto: x.motivo_texto ?? null,
      sucursal_texto: x.sucursal_texto ?? null,
      se_descarta: importe == null || importe === 0
        ? 'el importe de este renglón no se pudo leer de la foto'
        : null,
    }
  })

  return NextResponse.json({
    ok: true,
    extraccion_id: sub.extraccionId,
    archivo_nombre: archivo.name || 'liquidacion',
    archivo_hash: sub.archivoHash,
    bucket: DOC_BUCKET,
    archivo_path: sub.archivoPath,
    leido: {
      obra_social: leida.obra_social ?? null,
      periodo: leida.periodo ?? null,
      fecha_liquidacion: leida.fecha_liquidacion ?? null,
      total_debitado: leida.total_debitado ?? null,
      confianza: r.confianzaGlobal,
      ilegible: leida.ilegible ?? null,
    },
    filas,
    // Si el modelo devolvió datos de personas igual, se dice: que los haya
    // devuelto es información útil sobre el papel, aunque los datos se tiren.
    campos_descartados: saco.length ? saco : null,
    aviso: saco.length
      ? `El papel traía ${saco.length} campo(s) con datos de personas (${saco.join(', ')}). Se descartaron antes de guardar nada.`
      : null,
  })
}
