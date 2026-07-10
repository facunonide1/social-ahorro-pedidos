/**
 * Hash y verificación de PIN de empleado (login numérico · v0.35).
 *
 * El PIN es de 4 dígitos y solo habilita ACCESO OPERATIVO — nunca reemplaza
 * los gates de permisos para acciones sensibles de plata. Aun así lo tratamos
 * con cuidado: se guarda hasheado con scrypt (sal aleatoria por PIN) y la
 * verificación es de tiempo constante. Sin dependencias externas (crypto nativo).
 *
 * Formato almacenado:  scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const N = 16384 // costo CPU/memoria (2^14)
const R = 8
const P = 1
const KEYLEN = 32
const SALT_BYTES = 16

/** ¿Es un PIN válido de 4 dígitos? */
export function esPinValido(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

/** Normaliza el N° de empleado (trim, sin espacios internos). */
export function normalizarNumeroEmpleado(n: string): string {
  return n.trim().replace(/\s+/g, '')
}

/** Hashea un PIN de 4 dígitos. Lanza si el PIN no es válido. */
export function hashPin(pin: string): string {
  if (!esPinValido(pin)) throw new Error('pin_invalido')
  const salt = randomBytes(SALT_BYTES)
  const hash = scryptSync(pin, salt, KEYLEN, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`
}

/** Verifica un PIN contra un hash almacenado. Nunca lanza; devuelve boolean. */
export function verificarPin(pin: string, almacenado: string | null | undefined): boolean {
  if (!almacenado || !esPinValido(pin)) return false
  try {
    const partes = almacenado.split('$')
    if (partes.length !== 6 || partes[0] !== 'scrypt') return false
    const [, nStr, rStr, pStr, saltB64, hashB64] = partes
    const salt = Buffer.from(saltB64, 'base64')
    const esperado = Buffer.from(hashB64, 'base64')
    const calculado = scryptSync(pin, salt, esperado.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
    })
    return calculado.length === esperado.length && timingSafeEqual(calculado, esperado)
  } catch {
    return false
  }
}
