import { NextResponse, type NextRequest } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { gateCentroDatos } from '@/lib/centro-datos/gate'
import { generarExport } from '@/lib/centro-datos/export'
import type { QueryDefinicion, OpcionesPerfil, FormatoDatos } from '@/lib/types/centro-datos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST: genera una exportación.
 *  - { accion_id, preview? }              → usa una acción guardada (+ su perfil de formato)
 *  - { definicion, opciones, preview? }   → constructor (no guardado todavía)
 * Devuelve { filas, csv, total, formato }. Si preview!=true, registra export_job.
 */
export async function POST(req: NextRequest) {
  const g = await gateCentroDatos()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'body inválido' }, { status: 400 }) }
  const adm = createAdminClient()
  const preview = !!b?.preview

  let definicion: QueryDefinicion | null = b?.definicion ?? null
  let opciones: OpcionesPerfil = b?.opciones ?? { separador: ';', con_encabezado: true, decimales: '.' }
  let formato: FormatoDatos = 'csv'
  let accionId: string | null = null
  let nombre = b?.nombre ?? 'Exportación'

  if (b?.accion_id) {
    const { data: accion } = await adm.from('acciones_export')
      .select('id, nombre, query_definicion, perfil_formato_id').eq('id', b.accion_id).maybeSingle()
    if (!accion) return NextResponse.json({ error: 'acción no encontrada' }, { status: 404 })
    accionId = accion.id; definicion = accion.query_definicion as QueryDefinicion; nombre = accion.nombre
    if (accion.perfil_formato_id) {
      const { data: perfil } = await adm.from('perfiles_datos').select('opciones, formato').eq('id', accion.perfil_formato_id).maybeSingle()
      if (perfil) { opciones = (perfil.opciones ?? opciones) as OpcionesPerfil; formato = (perfil.formato ?? 'csv') as FormatoDatos }
    }
  }

  if (!definicion || !definicion.entidad || !Array.isArray(definicion.columnas) || !definicion.columnas.length) {
    return NextResponse.json({ error: 'definición incompleta (entidad + columnas)' }, { status: 400 })
  }

  const r = await generarExport(adm, definicion, opciones)
  const total = r.registros.length
  const fechaTag = new Date().toISOString().slice(0, 10)
  const filename = `${nombre.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${fechaTag}.${formato === 'xlsx' || formato === 'xls' ? 'xlsx' : 'csv'}`

  if (!preview) {
    await adm.from('export_jobs').insert({
      accion_id: accionId, nombre, filas: total, archivo_generado: filename, formato,
      por_usuario: g.userId, por_usuario_nombre: g.nombre,
    })
    if (accionId) await adm.from('acciones_export').update({ ultima_ejecucion: new Date().toISOString() }).eq('id', accionId)
  }

  return NextResponse.json({
    total, filas: preview ? r.filas.slice(0, 100) : r.filas, csv: r.csv,
    formato, filename, encabezados: definicion.columnas.map((c) => c.header),
  })
}
