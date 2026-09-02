'use server'

import { revalidatePath } from 'next/cache'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'

const ROLES = ['super_admin', 'gerente', 'administrativo', 'encargado_sucursal', 'sucursal'] as const

/**
 * Lo que el transporte terminó cobrando.
 *
 * Se carga a mano cuando llega la factura. Es el único modo de saber si el peso
 * estimado servía: el transporte pesa el bulto de verdad.
 */
export async function registrarCostoDeEnvio(fd: FormData) {
  await requireAdminHubAccess({ allowedRoles: [...ROLES] })
  const sb = createClient()

  const id = String(fd.get('order_id') ?? '')
  if (!id) return { error: 'Falta el pedido.' }

  const real = String(fd.get('envio_costo_real') ?? '').trim()
  const { error } = await sb.from('orders').update({
    // Vacío borra el dato: null es «todavía no llegó la factura», no cero.
    envio_costo_real: real === '' ? null : Number(real.replace(',', '.')),
    envio_costo_motivo: String(fd.get('envio_costo_motivo') ?? '').trim() || null,
  }).eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/admin/pedidos/envios/correo')
  return { ok: true }
}
