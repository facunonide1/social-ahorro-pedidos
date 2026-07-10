'use server'

import { loginConPin, type PinLoginResult } from '@/lib/auth/pin-login'

/**
 * Server action del login por N° de empleado + PIN. Deja la sesión iniciada
 * (cookies) en caso de éxito; el redirect lo hace el cliente para poder
 * mostrar errores/lockout en la misma pantalla del teclado.
 */
export async function ingresarConPinAction(
  numeroEmpleado: string,
  pin: string,
): Promise<PinLoginResult> {
  return loginConPin(numeroEmpleado, pin)
}
