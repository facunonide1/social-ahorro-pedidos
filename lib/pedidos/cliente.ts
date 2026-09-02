/**
 * UN CLIENTE QUE COMPRA POR TRES CANALES ES UN CLIENTE.
 *
 * ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
 *
 * El mismo señor pide por WhatsApp el lunes, compra en la web el jueves y pasa
 * por el mostrador el sábado. Si cada canal crea su ficha, el CRM tiene tres
 * personas con un tercio de la historia cada una, y ninguna sirve para nada.
 *
 * ── DÓNDE VIVE EL CLIENTE ───────────────────────────────────────────────────
 *
 * En `clientes`, que es el maestro del sector Clientes. NO en `customers`, que
 * es la tabla del CRM de pedidos viejo — esa se sigue escribiendo para no romper
 * lo que ya anda, pero el cliente de verdad es el del CRM.
 *
 * El criterio de dedup es el mismo que usa `lib/crm/unificar.ts` y se importa de
 * ahí a propósito: dos normalizaciones distintas de un teléfono terminan en dos
 * fichas, que es exactamente lo que esto viene a evitar.
 */

import { normDni, normTel, normEmail } from '@/lib/crm/unificar'

type Adm = { from: (t: string) => any }

export interface DatosDeCliente {
  nombre?: string | null
  dni?: string | null
  telefono?: string | null
  email?: string | null
}

export interface ClienteResuelto {
  id: string
  /** Por qué se lo consideró el mismo. `null` = se creó recién. */
  criterio: 'dni' | 'telefono' | 'email' | null
  creado: boolean
}

/**
 * Busca el cliente por DNI, después por teléfono, después por mail. Si no está,
 * lo crea. Devuelve también POR QUÉ matcheó: sin eso, un dedup equivocado es
 * invisible hasta que alguien nota que un pedido quedó en la ficha de otro.
 *
 * Devuelve `null` si no vino ningún dato con el que identificar a alguien. Un
 * pedido sin nombre ni teléfono no crea una ficha vacía: crea ruido.
 */
export async function buscarOCrearCliente(
  adm: Adm,
  d: DatosDeCliente,
): Promise<ClienteResuelto | null> {
  const dni = normDni(d.dni)
  const tel = normTel(d.telefono)
  const mail = normEmail(d.email)
  const nombre = (d.nombre ?? '').trim()

  if (!dni && !tel && !mail && !nombre) return null

  // Se busca de a uno y en orden: el DNI identifica, el teléfono casi, el mail
  // puede ser compartido. Buscar los tres juntos con un OR daría el primero que
  // aparezca, que no es lo mismo.
  for (const [criterio, columna, valor] of [
    ['dni', 'dni', dni],
    ['telefono', 'telefono', tel],
    ['email', 'email', mail],
  ] as const) {
    if (!valor) continue
    const { data } = await adm.from('clientes')
      .select('id, fuentes').eq(columna, valor).eq('activo', true).limit(1).maybeSingle()
    if (data?.id) {
      const fuentes: string[] = Array.isArray(data.fuentes) ? data.fuentes : []
      if (!fuentes.includes('pedidos')) {
        await adm.from('clientes')
          .update({ fuentes: [...fuentes, 'pedidos'] }).eq('id', data.id)
      }
      return { id: data.id, criterio, creado: false }
    }
  }

  const { data: creado, error } = await adm.from('clientes').insert({
    nombre: nombre || (tel ? `Cliente ${tel}` : 'Cliente sin nombre'),
    dni, telefono: tel, email: mail,
    fuentes: ['pedidos'],
  }).select('id').maybeSingle()
  if (error || !creado?.id) return null

  return { id: creado.id, criterio: null, creado: true }
}
