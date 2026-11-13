import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/server'
import { exigirDueno } from '@/lib/drive/acceso'
import { ingestaHabilitada } from '@/lib/drive/flag'
import { diagnosticar } from '@/lib/drive/diagnostico'
import type { Cursor } from '@/lib/drive/cursor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ESTADOS = ['pendiente', 'procesando', 'ok', 'previa', 'error', 'sin_clasificar'] as const

/**
 * Estado de la ingesta de Drive, para ver por qué algo no entra (super_admin).
 * Sólo lee. No devuelve tokens ni el valor de ningún secreto: de CRON_SECRET
 * dice si está configurado, nada más.
 */
export async function GET() {
  const g = await exigirDueno()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const adm = createAdminClient()

  const { data: conexion, error: eCon } = await adm.from('integraciones_google_drive')
    .select('id, email_cuenta, estado, connected_at, last_sync_at, last_error, listado_completo, listado_cursor')
    .order('connected_at', { ascending: false }).limit(1).maybeSingle()
  if (eCon) return NextResponse.json({ error: eCon.message }, { status: 500 })

  const [carpetas, procesando, pendientes, ...cuentas] = await Promise.all([
    conexion
      ? adm.from('integraciones_google_drive_carpetas').select('folder_id, folder_nombre, incluir_subcarpetas').eq('integracion_id', conexion.id).limit(30)
      : Promise.resolve({ data: [], error: null }),
    adm.from('drive_archivos_ingestados').select('nombre, updated_at').eq('estado', 'procesando').limit(20),
    adm.from('drive_archivos_ingestados').select('nombre, clasificacion, clasificacion_forzada, bytes').eq('estado', 'pendiente').order('created_at').limit(40),
    ...ESTADOS.map((e) => adm.from('drive_archivos_ingestados').select('id', { count: 'exact', head: true }).eq('estado', e)),
  ])
  const err = [carpetas, procesando, pendientes, ...cuentas].find((r: any) => r.error) as any
  if (err) return NextResponse.json({ error: err.error.message }, { status: 500 })

  const cursor = ((conexion as any)?.listado_cursor ?? null) as Cursor | null
  const avisos = diagnosticar({
    ahora: new Date(),
    habilitada: ingestaHabilitada(),
    cronSecret: !!process.env.CRON_SECRET,
    conexion: conexion ? { estado: conexion.estado, last_error: conexion.last_error, listado_cursor: cursor } : null,
    carpetas: (carpetas.data ?? []) as any[],
    procesando: (procesando.data ?? []) as any[],
    pendientes: ((pendientes.data ?? []) as any[]).map((p) => ({ ...p, bytes: p.bytes == null ? null : Number(p.bytes) })),
  })

  return NextResponse.json({
    habilitada: ingestaHabilitada(),
    cronSecretConfigurado: !!process.env.CRON_SECRET,
    conexion: conexion ? {
      cuenta: conexion.email_cuenta, estado: conexion.estado, ultimoListado: conexion.last_sync_at,
      listadoCompleto: conexion.listado_completo, ultimoError: conexion.last_error,
      listando: (cursor?.tareas?.length ?? 0) > 0, lock: cursor?.lock ?? null,
    } : null,
    carpetas: ((carpetas.data ?? []) as any[]).map((c) => ({
      nombre: c.folder_nombre, subcarpetas: c.incluir_subcarpetas, listadaCompletaDesde: cursor?.porCarpeta?.[c.folder_id] ?? null,
    })),
    cuentas: Object.fromEntries(ESTADOS.map((e, i) => [e, (cuentas[i] as any).count ?? 0])),
    avisos,
  })
}
