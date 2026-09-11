/**
 * LOS AVISOS DEL CIRCUITO DE PROVEEDORES.
 *
 * ── LO REVERSIBLE SALE SOLO, LO QUE COMPROMETE ESPERA ───────────────────────
 *
 * Un recordatorio —«Del Sud pasa a cobrar mañana y se le deben $X»— es
 * reversible: si está de más, se ignora y no pasó nada. Sale solo.
 *
 * Nada que mueva plata se ejecuta desde acá. NORA avisa; pagar lo decide y lo
 * aprueba una persona (regla de oro 7).
 */

import { parametro } from '@/lib/os/definicion'

type Adm = { from: (t: string) => any; rpc: (n: string, a?: any) => any }

export interface Hallazgo {
  tipo: string
  severidad: string
  clave: string
  titulo: string
  detalle: string
  href: string
  proveedor_id: string | null
  sucursal_id: string | null
}

/** Con cuánta anticipación avisar un vencimiento. */
export async function diasDeAviso(): Promise<number> {
  return parametro('compras', 'dias_aviso_pago', 3)
}

/** Cuántos días puede quedar abierto un faltante antes de que sea un problema. */
export async function diasDeFaltante(): Promise<number> {
  return parametro('compras', 'dias_faltante_sin_nc', 15)
}

export async function detectar(adm: Adm): Promise<Hallazgo[]> {
  const [dias, faltante] = await Promise.all([diasDeAviso(), diasDeFaltante()])
  const { data, error } = await adm.rpc('proveedores_detectar', {
    p_dias_aviso: dias, p_dias_faltante: faltante,
  })
  if (error) throw error
  return (data ?? []) as Hallazgo[]
}

/**
 * Convierte los hallazgos en avisos del feed que ya existe.
 *
 * `clave_dedup` es lo que evita que el mismo vencimiento avise todos los días
 * como si fuera nuevo. Un aviso repetido se deja de leer, y el día que importe
 * de verdad va a estar abajo de otros nueve iguales.
 */
export async function publicarAvisos(adm: Adm): Promise<{ nuevos: number; total: number }> {
  const hallazgos = await detectar(adm)
  if (!hallazgos.length) return { nuevos: 0, total: 0 }

  const claves = hallazgos.map((h) => h.clave)
  const { data: previos } = await adm.from('nora_avisos')
    .select('clave_dedup').in('clave_dedup', claves.slice(0, 500)).eq('estado', 'pendiente')
  const yaEstan = new Set(((previos ?? []) as any[]).map((p) => p.clave_dedup))

  const nuevos = hallazgos.filter((h) => !yaEstan.has(h.clave))
  if (nuevos.length) {
    await adm.from('nora_avisos').insert(nuevos.map((h) => ({
      tipo: h.tipo,
      severidad: h.severidad,
      titulo: h.titulo,
      detalle: h.detalle,
      modulo: 'compras',
      sucursal_id: h.sucursal_id,
      accion_label: 'Ver',
      accion_href: h.href,
      entidad_ref: { proveedor_id: h.proveedor_id },
      estado: 'pendiente',
      clave_dedup: h.clave,
    })))
  }
  return { nuevos: nuevos.length, total: hallazgos.length }
}
