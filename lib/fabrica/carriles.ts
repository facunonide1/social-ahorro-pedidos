import { createAdminClient } from '@/lib/supabase/server'
import { CAMPOS_DE_INSTALACION, puedeBajarA } from './clasificacion'
import type { Manifiesto, Participacion } from './tipos'

/**
 * LOS TRES CARRILES.
 *
 * Sin carriles, todo cambio pesa lo mismo — y lo que pesa todo igual termina
 * aprobándose todo igual. El carril es lo que hace que la auto-modificación sea
 * segura en vez de peligrosa.
 *
 *   🟢 verde     se aplica solo, avisa, y se revierte de un toque
 *   🟡 amarillo  espera decisión humana
 *   🔴 rojo      el Taller no lo propone. Si alguien lo pide, se registra
 *
 * EL CARRIL SE DERIVA, NO SE ELIGE. Lo determina qué campo se toca y qué dice
 * el manifiesto sobre ese campo. Nadie elige el carril de su propio cambio: es
 * la diferencia entre un control y un formulario.
 */

export type Carril = 'verde' | 'amarillo' | 'rojo'

/**
 * El tipo de campo, que es la unidad con la que se habilita el verde.
 *
 * Más grueso que el campo: habilitar "etiqueta" habilita todos los títulos, no
 * uno. Habilitar de a un campo sería un interruptor que nadie termina de
 * configurar.
 */
export type TipoCampo =
  | 'etiqueta'
  | 'visibilidad'
  | 'umbral'
  | 'dimension'
  | 'participacion'
  /** Prender o apagar una automatización. */
  | 'automatizacion'
  | 'estructura'
  | 'constitucional'

export const ETIQUETA_CARRIL: Record<Carril, string> = {
  verde: 'se aplica solo',
  amarillo: 'con firma',
  rojo: 'prohibido',
}

export const ETIQUETA_TIPO: Record<TipoCampo, string> = {
  etiqueta: 'Etiquetas y títulos',
  visibilidad: 'Visibilidad y orden de pantallas',
  umbral: 'Umbrales configurables',
  dimension: 'Valores de una dimensión',
  participacion: 'Nivel de participación de un agente',
  automatizacion: 'Encendido de una automatización',
  estructura: 'Estructura de la pieza',
  constitucional: 'Elementos constitucionales',
}

/** Los tipos que PUEDEN llegar a verde alguna vez. Los otros nunca. */
export const HABILITABLES: TipoCampo[] = ['etiqueta', 'visibilidad', 'umbral']

/**
 * `umbral` está en la lista pero sólo llega a verde si el parámetro concreto
 * pesa `inocuo`. Un `sensible` NUNCA es candidato a verde, aunque el
 * interruptor del tipo esté habilitado: el peso manda sobre el interruptor.
 */

/** De qué tipo es un campo del manifiesto. */
export function tipoDe(campo: string): TipoCampo {
  if (campo.startsWith('titulos.') || campo === 'nombre' || campo === 'descripcion') return 'etiqueta'
  if (campo.startsWith('ocultas.') || campo.startsWith('navegable')) return 'visibilidad'
  if (campo.startsWith('configurable.')) return 'umbral'
  if (campo.startsWith('dimensiones.')) return 'dimension'
  if (campo.startsWith('automatizaciones.')) return 'automatizacion'
  if (campo.includes('.participacion') || campo.startsWith('participacion')) return 'participacion'
  if (campo.startsWith('constitucional')) return 'constitucional'
  return 'estructura'
}

export interface Veredicto {
  carril: Carril
  motivo: string
  tipo: TipoCampo
}

/**
 * El carril de UN campo.
 *
 * `verdeHabilitado` es el interruptor por tipo: con él apagado —que es el
 * default y lo será los primeros meses— todo lo que podría ser verde pide firma
 * igual. El verde se gana mirando cambios, no se supone.
 */
export function carrilDeCampo(args: {
  campo: string
  nivel: 'pool' | 'instalacion'
  delPool: Manifiesto
  /** Valor propuesto, para las reglas que dependen de él. */
  valor?: unknown
  verdeHabilitado: (t: TipoCampo) => boolean
}): Veredicto {
  const tipo = tipoDe(args.campo)

  /* ── 🔴 Constitución ─────────────────────────────────────────────── */
  const protegido = (args.delPool.constitucional ?? []).find((c) =>
    args.campo.includes(c.elemento),
  )
  if (protegido && tipo !== 'participacion') {
    return {
      carril: 'rojo',
      tipo: 'constitucional',
      motivo: `"${protegido.elemento}" está protegido por el límite ${protegido.limite}. ${protegido.motivo}`,
    }
  }
  if (tipo === 'constitucional') {
    return {
      carril: 'rojo',
      tipo,
      motivo: 'Los elementos constitucionales no se modifican por configuración. Es el motivo entero por el que existen.',
    }
  }

  /* ── Participación: sólo hacia abajo ─────────────────────────────── */
  // La constitución NO bloquea hacer algo más estricto. Bajar el nivel de una
  // acción protegida es apretar el control, no aflojarlo: prohibir eso sería
  // impedir que un negocio sea más prudente que la pieza, que es lo contrario
  // de lo que la constitución protege.
  if (tipo === 'participacion' && typeof args.valor === 'string') {
    const clave = args.campo.split('.')
    const agente = args.delPool.agentes?.find((a) => clave.includes(a.clave))
    const accion = agente?.acciones.find((x) => clave.includes(x.clave))
    if (accion) {
      const r = puedeBajarA(accion.participacion, args.valor as Participacion)
      if (!r.ok) return { carril: 'rojo', tipo, motivo: r.motivo! }
      return {
        carril: 'amarillo',
        tipo,
        motivo: protegido
          ? `Baja el nivel de una acción protegida por ${protegido.limite}: apretar el control se permite, aflojarlo no. Igual espera firma.`
          : 'Cambiar cuánto hace solo un agente espera decisión humana, aunque sea para bajarlo.',
      }
    }
  }

  // Va ANTES del chequeo de "campo de la pieza": el tipo ya está decidido y
  // la regla es la misma para los dos niveles.
  // Una automatización se apaga con firma, siempre. NUNCA es candidata a verde:
  // apagar algo que corre solo cambia comportamiento y no se deshace —lo que
  // dejó de hacer mientras estuvo apagada no se recupera prendiéndola—.
  if (tipo === 'automatizacion') {
    return {
      carril: 'amarillo',
      tipo,
      motivo:
        args.valor === false
          ? 'Apagar una automatización: siempre pide firma. Apagar no deshace lo que ya hizo, y lo que deje de hacer mientras esté apagada no se recupera al prenderla.'
          : 'Prender una automatización: siempre pide firma.',
    }
  }

  /* ── 🔴 Cambiar la pieza desde el contexto de un proyecto ────────── */
  if (args.nivel === 'instalacion' && !esDeInstalacion(args.campo)) {
    return {
      carril: 'rojo',
      tipo,
      motivo:
        'Es un campo de la pieza compartida. Cambiarlo desde un proyecto lo cambiaría para todos los que la instalaron.',
    }
  }

  /* ── El peso de un configurable ──────────────────────────────────── */
  // Un umbral que mueve plata y uno que cambia cuántos días antes se avisa no
  // son el mismo riesgo, aunque sean el mismo tipo de campo.
  if (tipo === 'umbral') {
    const clave = args.campo.slice('configurable.'.length)
    const param = args.delPool.configurable?.find((c) => c.clave === clave)
    if (param?.peso === 'sensible') {
      return {
        carril: 'amarillo',
        tipo,
        motivo: `⚠ ${param.etiqueta}: si se cambia mal se pierde plata, se afloja un control o se incumple algo. ${param.peso_motivo ?? ''}`.trim(),
      }
    }
    if (param?.peso === 'operativo') {
      return {
        carril: 'amarillo',
        tipo,
        motivo: `${param.etiqueta}: si se cambia mal, alguien trabaja de más o de menos. Siempre pide firma.`,
      }
    }
    // `inocuo` sigue hasta la regla del interruptor, como una etiqueta.
    if (param?.peso !== 'inocuo') {
      return { carril: 'amarillo', tipo, motivo: 'El parámetro no declara su peso: se trata como sensible.' }
    }
  }

  /* ── 🟡 / 🟢 ─────────────────────────────────────────────────────── */
  if (!HABILITABLES.includes(tipo) && tipo !== 'umbral') {
    return {
      carril: 'amarillo',
      tipo,
      motivo: `${ETIQUETA_TIPO[tipo]}: cambia cómo funciona algo, no cómo se llama. Espera decisión humana.`,
    }
  }
  if (!args.verdeHabilitado(tipo)) {
    return {
      carril: 'amarillo',
      tipo,
      motivo: `${ETIQUETA_TIPO[tipo]} podría aplicarse solo, pero el carril verde todavía no está habilitado para este tipo. Arranca todo con firma a propósito.`,
    }
  }
  return {
    carril: 'verde',
    tipo,
    motivo: `${ETIQUETA_TIPO[tipo]}: reversible, sin efecto sobre plata, permisos ni cumplimiento.`,
  }
}

/** El carril de una propuesta es el MÁS restrictivo de sus campos. */
export function carrilDePropuesta(veredictos: Veredicto[]): Veredicto {
  if (veredictos.length === 0) {
    return { carril: 'amarillo', tipo: 'estructura', motivo: 'La propuesta no declara qué campos toca.' }
  }
  const rojo = veredictos.find((v) => v.carril === 'rojo')
  if (rojo) return rojo
  const amarillo = veredictos.find((v) => v.carril === 'amarillo')
  if (amarillo) return amarillo
  return veredictos[0]
}

/**
 * Un campo del manifiesto es "de instalación" si su raíz lo es.
 *
 * La clasificación usa nombres como `pantallas[].titulo`; acá llegan como
 * `titulos./admin/x`. La traducción vive en un solo lugar para que agregar un
 * campo overridable no obligue a acordarse de dos.
 */
function esDeInstalacion(campo: string): boolean {
  const raices: Record<string, string> = {
    'titulos.': 'pantallas[].titulo',
    'ocultas.': 'pantallas[].navegable',
    'configurable.': 'configurable → valores',
    'dimensiones.': 'dimensiones → valores',
    // Arrastre de v0.74: sin esta raíz, apagar una automatización caía en rojo
    // como "campo de la pieza compartida". La clasificación existía y este mapa
    // no la conocía — son dos listas que hay que mover juntas.
    'automatizaciones.': 'automatizaciones[].activa',
    nombre: 'nombre',
    descripcion: 'descripcion',
  }
  for (const [prefijo, nombre] of Object.entries(raices)) {
    if (campo === prefijo || campo.startsWith(prefijo)) return CAMPOS_DE_INSTALACION.has(nombre)
  }
  if (campo.includes('.participacion')) return CAMPOS_DE_INSTALACION.has('agentes[].acciones[].participacion')
  if (campo.includes('.brecha')) return CAMPOS_DE_INSTALACION.has('agentes[].acciones[].brecha')
  return false
}

/* ── El interruptor ──────────────────────────────────────────────────────── */

export async function tiposConVerdeHabilitado(proyectoId: string): Promise<Set<TipoCampo>> {
  try {
    const adm = createAdminClient()
    const { data } = await adm
      .from('fab_carriles_habilitados')
      .select('tipo_campo')
      .eq('proyecto_id', proyectoId)
    return new Set(((data ?? []) as { tipo_campo: string }[]).map((r) => r.tipo_campo as TipoCampo))
  } catch {
    // Si no se puede saber, se pide firma. El default seguro es el más estricto.
    return new Set()
  }
}
