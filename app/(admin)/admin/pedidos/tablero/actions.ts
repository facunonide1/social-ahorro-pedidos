'use server'

import { revalidatePath } from 'next/cache'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import {
  AVISO_REQUIERE_FIRMA, textoDeAviso, type TipoAviso,
} from '@/lib/pedidos/avisos'

const ROLES = ['super_admin', 'gerente', 'administrativo', 'sucursal', 'encargado_sucursal', 'cajero'] as const

/**
 * Prepara un aviso para el cliente.
 *
 * NO lo manda: WhatsApp es la app común y no hay API. Deja el mensaje escrito y
 * marcado, y una persona lo copia. Si el aviso compromete algo —una hora de
 * llegada, una disculpa por demora— queda pidiendo firma hasta que alguien lo
 * confirme.
 */
export async function prepararAviso(fd: FormData) {
  const perfil = await requireAdminHubAccess({ allowedRoles: [...ROLES] })
  const sb = createClient()

  const orderId = String(fd.get('order_id') ?? '')
  const tipo = String(fd.get('tipo') ?? '') as TipoAviso
  if (!orderId || !tipo) return { error: 'Faltan datos.' }

  const { data: o } = await sb.from('orders')
    .select('codigo, customer_name, customer_phone, total, status').eq('id', orderId).maybeSingle()
  if (!o) return { error: 'No se encontró el pedido.' }

  const texto = textoDeAviso(tipo, {
    nombre: o.customer_name, codigo: o.codigo, total: Number(o.total),
    minutos: Number(fd.get('minutos')) || undefined,
  })

  const { error } = await sb.from('whatsapp_messages').insert({
    order_id: orderId,
    status_trigger: o.status,
    tipo,
    phone: o.customer_phone,
    message: texto,
    status: 'pending',
    requiere_firma: AVISO_REQUIERE_FIRMA[tipo],
  })
  if (error) return { error: error.message }

  revalidatePath('/admin/pedidos/tablero')
  return { ok: true, firma: AVISO_REQUIERE_FIRMA[tipo], por: perfil.nombre }
}

/** La firma: quién se hace cargo de lo que el mensaje promete. */
export async function firmarAviso(fd: FormData) {
  const perfil = await requireAdminHubAccess({ allowedRoles: [...ROLES] })
  const sb = createClient()
  const id = String(fd.get('id') ?? '')
  if (!id) return { error: 'Falta el aviso.' }

  const { error } = await sb.from('whatsapp_messages').update({
    firmado_por: perfil.id,
    firmado_nombre: perfil.nombre ?? perfil.email,
    firmado_at: new Date().toISOString(),
  }).eq('id', id).eq('requiere_firma', true)

  if (error) return { error: error.message }
  revalidatePath('/admin/pedidos/tablero')
  return { ok: true }
}

/**
 * Marca el aviso como mandado.
 *
 * Lo marca UNA PERSONA, después de copiarlo y pegarlo en WhatsApp. NORA no
 * puede saber si salió: no está conectada a la app.
 */
export async function marcarAvisoMandado(fd: FormData) {
  const perfil = await requireAdminHubAccess({ allowedRoles: [...ROLES] })
  const sb = createClient()
  const id = String(fd.get('id') ?? '')
  if (!id) return { error: 'Falta el aviso.' }

  const { error } = await sb.from('whatsapp_messages').update({
    status: 'sent', sent_at: new Date().toISOString(), sent_by: perfil.id,
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/pedidos/tablero')
  return { ok: true }
}

/** Asignarle una sucursal a un pedido que entró sin ella. */
export async function asignarSucursal(fd: FormData) {
  await requireAdminHubAccess({ allowedRoles: [...ROLES] })
  const sb = createClient()
  const id = String(fd.get('order_id') ?? '')
  const sucursalId = String(fd.get('sucursal_id') ?? '')
  if (!id || !sucursalId) return { error: 'Faltan datos.' }

  const { error } = await sb.from('orders').update({ sucursal_id: sucursalId }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/pedidos/tablero')
  return { ok: true }
}
