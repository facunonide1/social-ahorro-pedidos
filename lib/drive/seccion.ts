/**
 * La sección del maestro SIFACO (Z45, MIC, CEO) a veces es la droguería.
 * El mapeo vive en `sifaco_seccion_proveedor`. Si la migración no está
 * aplicada, la consulta falla con un "no existe" y se sigue sin ella: el
 * nombre de la fila queda el código, que es lo que ya se guardaba.
 */

import { detectarProveedor, type PistaProveedor, type ProveedorRef } from './proveedor'

export type MapeoSeccion = { seccion: string; proveedorId: string | null }

export function esCodigoSeccion(texto: string): boolean {
  const n = texto.trim().toUpperCase()
  return /^Z\d{2,3}$/.test(n) || /^[A-Z]{3}$/.test(n)
}

export function proveedorDeSeccion(seccion: string, mapeos: MapeoSeccion[]): string | null {
  const n = seccion.trim().toUpperCase()
  const hit = mapeos.find((m) => m.seccion.trim().toUpperCase() === n)
  return hit?.proveedorId ?? null
}

export function tablaNoExiste(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  const msg = error.message ?? ''
  return error.code === '42P01'
    || error.code === 'PGRST205'
    || /does not exist|schema cache|could not find the table/i.test(msg)
}

export function proveedorPorAliasOSeccion(
  pista: PistaProveedor,
  proveedores: ProveedorRef[],
  secciones: MapeoSeccion[] | null,
): { id: string; razonSocial: string; via: 'archivo' | 'ruta' | 'cabecera' | 'pista' } | null {
  const directo = detectarProveedor(pista, proveedores)
  if (directo) return directo
  if (!secciones) return null
  const textos = [pista.pista, pista.nombreArchivo, pista.encabezado, pista.ruta]
  for (const texto of textos) {
    if (!texto || !esCodigoSeccion(texto)) continue
    const id = proveedorDeSeccion(texto, secciones)
    if (!id) continue
    const p = proveedores.find((x) => x.id === id)
    return { id, razonSocial: p?.razonSocial ?? texto.trim().toUpperCase(), via: 'pista' }
  }
  return null
}

/** null si la tabla todavía no existe. Otro error se propaga. */
export async function mapeoSeccionSiExiste(adm: any): Promise<MapeoSeccion[] | null> {
  const { data, error } = await adm.from('sifaco_seccion_proveedor')
    .select('seccion, proveedor_id')
    .order('seccion')
    .limit(200)
  if (error) {
    if (tablaNoExiste(error)) return null
    throw new Error(error.message ?? 'no pude leer sifaco_seccion_proveedor')
  }
  return ((data ?? []) as { seccion: string; proveedor_id: string | null }[]).map((f) => ({
    seccion: f.seccion,
    proveedorId: f.proveedor_id,
  }))
}
