import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateDocumentos } from '@/lib/documentos/permisos'
import { aprenderAliasTercero, normalizarCuit } from '@/lib/documentos/identificar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Crea un proveedor desde la revisión de un documento, precargado con lo que se
 * leyó del papel.
 *
 * Existe porque sin esto la revisión quedaba trabada: si el CUIT no matcheaba
 * con ninguno existente, no se podía confirmar y no había salida.
 *
 * Nunca es automático: lo dispara una persona que ya miró la factura. Y antes
 * de crear se verifica de nuevo el CUIT contra la base — si el proveedor ya
 * existe con otro nombre, se vincula y se guarda la variante en
 * doc_terceros_alias en vez de duplicarlo. Un proveedor duplicado parte la
 * cuenta corriente en dos y nadie lo nota hasta que hay que pagar.
 *
 * Se crea con lo mínimo. El resto (contactos, bancos, plazos, rubros) se
 * completa en Compras: replicar el alta entera acá sería pedirle a alguien que
 * está cargando una factura que además dé de alta un proveedor completo.
 */
export async function POST(req: NextRequest) {
  const g = await gateDocumentos('crear')
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'No pude leer los datos.' }, { status: 400 }) }

  const razon = String(b?.razon_social ?? '').trim()
  const cuitRaw = String(b?.cuit ?? '').trim()
  const cuit = normalizarCuit(cuitRaw)

  if (!razon) return NextResponse.json({ error: 'Falta la razón social.' }, { status: 400 })
  if (!cuit) {
    return NextResponse.json(
      { error: 'El CUIT tiene que tener 11 dígitos. Revisalo contra la factura.' },
      { status: 400 },
    )
  }

  const adm = createAdminClient()

  // Verificación anti-duplicado: el CUIT es la identidad, más allá de cómo esté
  // escrito el nombre o de si tiene guiones.
  const { data: existentes } = await adm.from('proveedores').select('id, razon_social, cuit').limit(5000)
  const ya = ((existentes ?? []) as any[]).find((p) => normalizarCuit(p.cuit) === cuit)

  if (ya) {
    // Ya existe con otro nombre: se vincula y se aprende la variante.
    await aprenderAliasTercero(adm, cuit, razon, ya.id, g.userId)
    return NextResponse.json({
      estado: 'vinculado',
      proveedor: { id: ya.id, razon_social: ya.razon_social, cuit: ya.cuit },
      mensaje: `Ese CUIT ya estaba cargado como “${ya.razon_social}”. Lo vinculé y me guardé que también aparece como “${razon}”.`,
    })
  }

  const { data: nuevo, error } = await adm
    .from('proveedores')
    .insert({
      razon_social: razon,
      cuit: cuitRaw || cuit,
      condicion_iva: b?.condicion_iva || null,
      domicilio_fiscal: b?.domicilio_fiscal || null,
      activo: true,
      created_by: g.userId,
      notas: `Creado desde la carga de un documento el ${new Date().toLocaleDateString('es-AR')}. Completar datos en Compras.`,
    })
    .select('id, razon_social, cuit')
    .single()

  if (error) {
    console.error('[documentos] no se pudo crear el proveedor', error)
    return NextResponse.json({ error: 'No pude crear el proveedor. Probá de nuevo.' }, { status: 500 })
  }

  // Queda registrado quién lo creó y desde qué documento.
  const { error: eAudit } = await adm.from('auditoria_logs').insert({
    user_id: g.userId,
    accion: 'crear',
    entidad: 'proveedores',
    entidad_id: nuevo.id,
    datos_nuevos: {
      origen: 'revision_documento',
      extraccion_id: b?.extraccion_id ?? null,
      razon_social: razon,
      cuit: cuitRaw,
      leido_de_la_factura: true,
    },
  })
  // El proveedor ya existe: que falle la auditoría no debe voltear la respuesta.
  if (eAudit) console.error('[documentos] proveedor creado pero no se pudo auditar', eAudit)

  return NextResponse.json({
    estado: 'creado',
    proveedor: nuevo,
    mensaje: `Creé el proveedor “${nuevo.razon_social}”. Completá el resto de sus datos en Compras cuando puedas.`,
  })
}
