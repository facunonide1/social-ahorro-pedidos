/**
 * Login por N° de empleado + PIN (server-side · v0.35).
 *
 * Método de acceso ADICIONAL para empleados operativos. NO reemplaza el login
 * por email del dueño/admins. Flujo:
 *
 *   1. Buscamos la fila de `users_admin` por `numero_empleado` (service role).
 *   2. Verificamos activo, no-bloqueado y el PIN (scrypt).
 *   3. Si el PIN falla → sumamos intento y, pasado el umbral, bloqueamos.
 *   4. Si el PIN es correcto → generamos un magic-link OTP para el email del
 *      auth user y lo verificamos con el cliente SSR, dejando la sesión (cookies)
 *      igual que un login normal. A partir de ahí todo el sistema (requireAdminHub
 *      Access, permisos, etc.) funciona idéntico.
 *
 * El PIN habilita ACCESO; las acciones sensibles siguen gateadas por permisos.
 */

import 'server-only'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { hashPin, verificarPin, esPinValido, normalizarNumeroEmpleado } from '@/lib/auth/pin'

const MAX_INTENTOS = 5
const BLOQUEO_MINUTOS = 15

export type PinLoginResult =
  | { ok: true }
  | { ok: false; error: string; bloqueadoMinutos?: number; intentosRestantes?: number }

/**
 * Verifica N° empleado + PIN y, si es correcto, deja la sesión iniciada
 * (cookies) en el cliente SSR. Devuelve un resultado seguro (sin filtrar si el
 * N° existe o no: mensajes genéricos).
 */
export async function loginConPin(numeroEmpleadoRaw: string, pin: string): Promise<PinLoginResult> {
  const numero = normalizarNumeroEmpleado(numeroEmpleadoRaw || '')
  if (!numero || !esPinValido(pin)) {
    return { ok: false, error: 'Ingresá tu N° de empleado y un PIN de 4 dígitos.' }
  }

  const admin = createAdminClient()

  const { data: fila } = await admin
    .from('users_admin')
    .select('id, activo, pin_hash, pin_intentos, pin_bloqueado_hasta')
    .eq('numero_empleado', numero)
    .maybeSingle<{
      id: string
      activo: boolean
      pin_hash: string | null
      pin_intentos: number
      pin_bloqueado_hasta: string | null
    }>()

  // Mensaje genérico si no existe / no tiene PIN / inactivo (no filtrar existencia).
  if (!fila || !fila.pin_hash || !fila.activo) {
    return { ok: false, error: 'N° de empleado o PIN incorrecto.' }
  }

  // ¿Bloqueado?
  if (fila.pin_bloqueado_hasta && new Date(fila.pin_bloqueado_hasta) > new Date()) {
    const min = Math.max(1, Math.ceil((new Date(fila.pin_bloqueado_hasta).getTime() - Date.now()) / 60000))
    return { ok: false, error: `Acceso bloqueado por intentos fallidos. Probá en ${min} min.`, bloqueadoMinutos: min }
  }

  // Verificar PIN.
  if (!verificarPin(pin, fila.pin_hash)) {
    const intentos = (fila.pin_intentos ?? 0) + 1
    const bloquear = intentos >= MAX_INTENTOS
    await admin
      .from('users_admin')
      .update({
        pin_intentos: bloquear ? 0 : intentos,
        pin_bloqueado_hasta: bloquear
          ? new Date(Date.now() + BLOQUEO_MINUTOS * 60000).toISOString()
          : fila.pin_bloqueado_hasta,
      })
      .eq('id', fila.id)

    if (bloquear) {
      return { ok: false, error: `Demasiados intentos. Acceso bloqueado ${BLOQUEO_MINUTOS} min.`, bloqueadoMinutos: BLOQUEO_MINUTOS }
    }
    return { ok: false, error: 'N° de empleado o PIN incorrecto.', intentosRestantes: MAX_INTENTOS - intentos }
  }

  // PIN correcto → resetear contadores y abrir sesión.
  await admin
    .from('users_admin')
    .update({ pin_intentos: 0, pin_bloqueado_hasta: null })
    .eq('id', fila.id)

  // Necesitamos el email del auth user para el OTP.
  const { data: authUser } = await admin.auth.admin.getUserById(fila.id)
  const email = authUser?.user?.email
  if (!email) {
    return { ok: false, error: 'Tu cuenta no tiene email asociado. Avisá al administrador.' }
  }

  // Generamos un OTP de email (magic link, NO se envía correo) y lo verificamos
  // con el cliente SSR para dejar la sesión con cookies.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const otp = link?.properties?.email_otp
  if (linkErr || !otp) {
    return { ok: false, error: 'No pudimos iniciar la sesión. Probá de nuevo.' }
  }

  const ssr = createClient()
  const { error: vErr } = await ssr.auth.verifyOtp({ email, token: otp, type: 'email' })
  if (vErr) {
    return { ok: false, error: 'No pudimos iniciar la sesión. Probá de nuevo.' }
  }

  return { ok: true }
}

export type SetPinResult = { ok: true } | { ok: false; error: string }

/**
 * Setea/resetea el N° de empleado y PIN de un usuario del panel. Service role.
 * Valida el PIN, hashea, verifica que el N° no colisione con otro usuario.
 */
export async function setPinEmpleado(
  userId: string,
  numeroEmpleadoRaw: string,
  pin: string,
): Promise<SetPinResult> {
  const numero = normalizarNumeroEmpleado(numeroEmpleadoRaw || '')
  if (!numero) return { ok: false, error: 'Ingresá un N° de empleado.' }
  if (!esPinValido(pin)) return { ok: false, error: 'El PIN debe ser de 4 dígitos.' }

  const admin = createAdminClient()

  // ¿El N° ya lo usa OTRO usuario?
  const { data: dueño } = await admin
    .from('users_admin')
    .select('id')
    .eq('numero_empleado', numero)
    .maybeSingle<{ id: string }>()
  if (dueño && dueño.id !== userId) {
    return { ok: false, error: `El N° ${numero} ya está en uso por otro empleado.` }
  }

  const { error } = await admin
    .from('users_admin')
    .update({
      numero_empleado: numero,
      pin_hash: hashPin(pin),
      pin_intentos: 0,
      pin_bloqueado_hasta: null,
    })
    .eq('id', userId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Quita el acceso por PIN (deja intacto el login por email si lo tuviera). */
export async function quitarPinEmpleado(userId: string): Promise<SetPinResult> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('users_admin')
    .update({ numero_empleado: null, pin_hash: null, pin_intentos: 0, pin_bloqueado_hasta: null })
    .eq('id', userId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
