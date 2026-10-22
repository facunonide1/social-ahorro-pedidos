/**
 * F · LAS DESCRIPCIONES DE PRODUCTO.
 *
 * 7.737 publicaciones llevan el nombre que salió del código abreviado de
 * SIFACO y la descripción vacía.
 *
 * ── LA REGLA DURA, Y DÓNDE VIVE ─────────────────────────────────────────────
 *
 * Ninguna promesa. La descripción dice QUÉ ES, no PARA QUÉ SIRVE.
 *
 * Al modelo se le pide. La regla, en cambio, vive en la base:
 * `descripcion_promete()` la revisa y un trigger impide aprobar una
 * descripción que prometa. Eso no es desconfianza del modelo: es que «casi
 * siempre» sobre 7.737 descripciones son decenas de promesas publicadas.
 *
 * Acá se revisa ANTES de guardar, para no llenar la cola de propuestas que la
 * pared va a frenar después — pero la pared es la que decide.
 *
 * ── Y POR QUÉ SE REINTENTA UNA VEZ ──────────────────────────────────────────
 *
 * Cuando la primera salida promete algo, se le dice exactamente qué frase fue
 * y se pide de nuevo. Una vez, no tres: si con el motivo adelante vuelve a
 * prometer, el producto es de los que no se pueden describir sin prometer
 * —una crema antiage no tiene otra forma de describirse— y eso es un hallazgo,
 * no un error.
 */
import { getAnthropic, hasAnthropicKey } from '@/lib/ai/client'

export const DESCRIPCIONES_MODEL = 'claude-opus-5'

export type EnCola = {
  producto_id: string; sku: string | null
  nombre_canal: string | null; nombre_sifaco: string | null
  laboratorio: string | null; presentacion: string | null
  rubro: string | null; categoria: string | null
  unidades_3m: number; stock: number
}

export type Propuesta = {
  producto_id: string
  texto: string | null
  por_que_no: string | null
  fuente: string
  intentos: number
}

/**
 * ── POR QUÉ EL PROMPT DICE «NO SÉ» ──────────────────────────────────────────
 *
 * F.4: lo que no se puede describir queda sin describir y lo dice. Si el
 * prompt no deja esa salida, el modelo inventa — es lo que hace cuando la
 * única opción es escribir algo. «ZZP DISNEY CAPYBARA LATA (5087», cortado a
 * los 30 caracteres de SIFACO, no dice qué es la cosa.
 */
const SISTEMA = `Escribís descripciones de producto para el catálogo de una farmacia argentina.

QUÉ ESCRIBIR
Una o dos oraciones que digan QUÉ ES el producto: su forma (comprimidos, crema, jarabe, jabón), su principio activo o composición si está en el nombre, su concentración y el contenido del envase.

LA REGLA QUE NO SE NEGOCIA: NINGUNA PROMESA
Nunca digas para qué sirve, qué alivia, qué mejora, qué previene, a quién le conviene ni qué resultado da. Nada de "ideal para", "ayuda a", "indicado para", "hidrata", "alivia", "mejora", "fortalece", "el mejor", "garantizado", "resultados visibles".
Esto vale igual para perfumería y cosmética: "hidrata la piel" está prohibido lo mismo que "alivia el dolor". La regla es una sola.

SI NO SABÉS QUÉ ES
Contestá exactamente: NO_SE_PUEDE: <qué falta para saberlo>
No inventes. Un nombre cortado a 30 caracteres muchas veces no alcanza, y decirlo es la respuesta correcta.

FORMA
Castellano rioplatense, sin voseo (es un catálogo, no un mensaje). Sin emojis. Sin títulos. Máximo 220 caracteres. Devolvé sólo la descripción, sin comillas ni prefijos.`

function ficha(p: EnCola): string {
  const l = [
    `Nombre en el canal: ${p.nombre_canal ?? '(sin nombre)'}`,
    `Nombre en SIFACO: ${p.nombre_sifaco ?? '(sin nombre)'}`,
  ]
  if (p.laboratorio) l.push(`Laboratorio o rubro interno: ${p.laboratorio}`)
  if (p.presentacion) l.push(`Presentación: ${p.presentacion}`)
  if (p.categoria) l.push(`Categoría: ${p.categoria}`)
  return l.join('\n')
}

type Adm = { rpc: (n: string, a?: any) => any }

/** Lo que la base considera una promesa. La misma función que la pared. */
async function promesas(adm: Adm, texto: string): Promise<string[]> {
  const { data, error } = await adm.rpc('descripcion_promete', { p_texto: texto })
  if (error) throw new Error(`no se pudo revisar la descripción: ${error.message}`)
  return ((data ?? []) as { frase: string; por_que: string }[])
    .map((r) => `«${r.frase}»: ${r.por_que}`)
}

export async function proponerUna(adm: Adm, p: EnCola): Promise<Propuesta> {
  if (!hasAnthropicKey()) {
    return {
      producto_id: p.producto_id, texto: null, intentos: 0,
      por_que_no: 'no hay clave del modelo configurada, así que no se generó nada. Esto no es «no se puede describir»: es que no se intentó.',
      fuente: 'sin_clave',
    }
  }

  const a = getAnthropic()
  const mensajes: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: ficha(p) },
  ]

  for (let intento = 1; intento <= 2; intento++) {
    let salida: string
    try {
      const msg = await a.messages.create({
        model: DESCRIPCIONES_MODEL,
        max_tokens: 400,
        system: SISTEMA,
        messages: mensajes,
      })
      salida = msg.content
        .filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim()
    } catch (e: any) {
      // ── POR QUÉ ESTO NO SE GUARDA COMO «NO SE PUEDE DESCRIBIR» ──────────
      //
      // Porque son dos cosas distintas y confundirlas deja el producto fuera
      // de la cola para siempre. «No se puede describir» es una conclusión
      // sobre el producto; esto es que el pedido al modelo falló.
      //
      // Se devuelve con `fuente: 'falla'` y la ruta no lo guarda: el producto
      // vuelve a la cola mañana.
      const msg = String(e?.error?.error?.message ?? e?.message ?? 'falló el pedido al modelo')
      throw new Error(
        /credit balance/i.test(msg)
          ? 'la cuenta del modelo no tiene crédito. No se generó ninguna descripción, y los productos siguen en la cola: esto no es «no se puede describir».'
          : `el pedido al modelo falló: ${msg}`,
      )
    }

    if (/^NO_SE_PUEDE:/i.test(salida)) {
      return {
        producto_id: p.producto_id, texto: null, intentos: intento,
        por_que_no: salida.replace(/^NO_SE_PUEDE:\s*/i, '').trim()
          || 'el nombre no alcanza para saber qué es el producto',
        fuente: 'modelo',
      }
    }

    const malas = await promesas(adm, salida)
    if (!malas.length) {
      return {
        producto_id: p.producto_id, texto: salida.slice(0, 400),
        por_que_no: null, fuente: 'modelo', intentos: intento,
      }
    }

    if (intento === 2) {
      // Dos veces con el motivo adelante. Este producto no se puede describir
      // sin prometer, y eso es un hallazgo: queda anotado con la frase que lo
      // delató, no tapado con una descripción recortada a mano.
      return {
        producto_id: p.producto_id, texto: null, intentos: intento,
        por_que_no: `no se puede describir sin prometer algo. Dos intentos y los dos prometieron: ${malas.join('; ')}`,
        fuente: 'modelo',
      }
    }

    mensajes.push({ role: 'assistant', content: salida })
    mensajes.push({
      role: 'user',
      content: `Eso promete algo y no se puede publicar: ${malas.join('; ')}\n\n` +
        'Escribila de nuevo diciendo solamente qué es el producto. Si sin prometer no queda nada que decir, contestá NO_SE_PUEDE: y el motivo.',
    })
  }

  // Inalcanzable: el loop sale por return en los dos intentos.
  return {
    producto_id: p.producto_id, texto: null, intentos: 2,
    por_que_no: 'no se pudo generar', fuente: 'modelo',
  }
}
