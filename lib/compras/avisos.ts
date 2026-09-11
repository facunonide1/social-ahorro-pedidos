/**
 * LOS AVISOS DE COMPRAS.
 *
 * ── LO REVERSIBLE SALE SOLO ─────────────────────────────────────────────────
 *
 * Un aviso de quiebre o un «esto cambió de estado» es reversible: si está de
 * más, se ignora. Nada de acá compra, emite una orden ni paga: eso lo decide y
 * lo aprueba una persona.
 *
 * ── LO QUE MÁS SIRVE NO ES LA FOTO DE HOY ───────────────────────────────────
 *
 * Es lo que CAMBIÓ. Un producto que pasó de sano a dormido, o de dormido a
 * acelerando, dice algo que la lista de hoy no dice. Para eso hay que guardar
 * la foto anterior, y eso es `compras_estado_producto`.
 */

import { parametro } from '@/lib/os/definicion'

type Adm = { from: (t: string) => any; rpc: (n: string, a?: any) => any }

export interface Hallazgo {
  tipo: string; severidad: string; clave: string
  titulo: string; detalle: string; href: string
}

export async function detectarCompras(adm: Adm): Promise<Hallazgo[]> {
  const limite = await parametro('compras', 'avisos_por_corrida', 40)
  const { data, error } = await adm.rpc('compras_detectar', { p_limite: limite })
  if (error) throw error
  return (data ?? []) as Hallazgo[]
}

/**
 * Guarda la foto de hoy para poder decir mañana qué cambió.
 *
 * Va DESPUÉS de detectar, no antes: si se guardara primero, el cambio se
 * compararía contra sí mismo y no habría cambio nunca.
 */
export async function guardarFoto(adm: Adm): Promise<number> {
  const { data, error } = await adm.rpc('compras_guardar_foto')
  if (error) throw error
  return Number(data ?? 0)
}

export async function publicarAvisosCompras(adm: Adm): Promise<{ nuevos: number; total: number; foto: number }> {
  const hallazgos = await detectarCompras(adm)
  let nuevos = 0

  if (hallazgos.length) {
    const claves = hallazgos.map((h) => h.clave)
    const { data: previos } = await adm.from('nora_avisos')
      .select('clave_dedup').in('clave_dedup', claves).eq('estado', 'pendiente')
    const yaEstan = new Set(((previos ?? []) as any[]).map((p) => p.clave_dedup))
    const faltan = hallazgos.filter((h) => !yaEstan.has(h.clave))
    if (faltan.length) {
      await adm.from('nora_avisos').insert(faltan.map((h) => ({
        tipo: h.tipo, severidad: h.severidad, titulo: h.titulo, detalle: h.detalle,
        modulo: 'compras', accion_label: 'Ver', accion_href: h.href,
        estado: 'pendiente', clave_dedup: h.clave,
      })))
      nuevos = faltan.length
    }
  }

  const foto = await guardarFoto(adm)
  return { nuevos, total: hallazgos.length, foto }
}
