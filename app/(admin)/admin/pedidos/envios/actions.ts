'use server'

import { revalidatePath } from 'next/cache'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'

const ROLES = ['super_admin', 'gerente', 'administrativo', 'encargado_sucursal'] as const

function n(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const x = Number(s.replace(',', '.'))
  return Number.isFinite(x) ? x : null
}

/**
 * Las reglas de envío de una sucursal.
 *
 * Los campos vacíos se guardan como NULL a propósito: null es «nadie lo
 * definió» y cero es «no se cobra». Un envío gratis desde $0 y un envío gratis
 * sin definir no son lo mismo.
 */
export async function guardarConfigEnvios(fd: FormData) {
  await requireAdminHubAccess({ allowedRoles: [...ROLES] })
  const sb = createClient()
  const sucursalId = String(fd.get('sucursal_id') ?? '')
  if (!sucursalId) return { error: 'Falta la sucursal.' }

  const horaCorte = String(fd.get('hora_corte') ?? '').trim() || null

  const { error } = await sb.from('envios_config').upsert({
    sucursal_id: sucursalId,
    envio_gratis_desde: n(fd.get('envio_gratis_desde')),
    monto_minimo: n(fd.get('monto_minimo')),
    hora_corte: horaCorte,
    costo_por_km: n(fd.get('costo_por_km')),
    costo_por_hora: n(fd.get('costo_por_hora')),
    actualizado_at: new Date().toISOString(),
  }, { onConflict: 'sucursal_id' })

  if (error) return { error: error.message }
  revalidatePath('/admin/pedidos/envios')
  return { ok: true }
}

/** La zona: a qué sucursal pertenece, qué se cobra y qué se estima que cuesta. */
export async function guardarZona(fd: FormData) {
  await requireAdminHubAccess({ allowedRoles: [...ROLES] })
  const sb = createClient()
  const id = String(fd.get('id') ?? '')
  if (!id) return { error: 'Falta la zona.' }

  const { error } = await sb.from('zonas_reparto').update({
    sucursal_id: String(fd.get('sucursal_id') ?? '') || null,
    tarifa: n(fd.get('tarifa')),
    km_estimados: n(fd.get('km_estimados')),
    minutos_estimados: n(fd.get('minutos_estimados')),
  }).eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/admin/pedidos/envios')
  return { ok: true }
}
