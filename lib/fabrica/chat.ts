import Anthropic from '@anthropic-ai/sdk'

import { CAMPOS_DE_INSTALACION } from './clasificacion'
import { estadoDelLector, type EstadoPool } from './flag'
import {
  advertencia,
  NO_LEIDO_PERO_PROPONIBLE,
  porQueNo,
  type Negativa,
} from './negativas'
import { listarPropuestas, proponer } from './propuestas'
import { overridesActuales, resolver, type Overrides } from './overrides'
import { versionActual } from './versiones'
import type { Manifiesto } from './tipos'

/**
 * EL CHAT DE LA FÁBRICA.
 *
 * ── DÓNDE VIVE ──────────────────────────────────────────────────────────────
 *
 * Dentro del Taller, no aparte. Es otra puerta a la MISMA cola de propuestas,
 * no un canal paralelo con sus propias reglas. Todo lo que sale de acá pasa por
 * `proponer()`, deriva su carril igual que una propuesta escrita a mano, y lo
 * firma una persona.
 *
 * ── LO ÚNICO QUE PUEDE HACER ES PROPONER ────────────────────────────────────
 *
 * No aplica. No prende lectores. No crea piezas. No instala. No revierte.
 * Si la conversación necesita algo de eso, lo dice y manda al control que lo
 * hace, que tiene su propia firma.
 *
 * ── LA REGLA QUE ORDENA TODO ────────────────────────────────────────────────
 *
 * NORA nunca promete lo que no puede hacer.
 *
 * Es el bug que apareció en el asistente de finanzas —prometió leer una foto
 * que el sistema todavía no sabía leer— y es exactamente el motivo por el que
 * el lugar del chat quedó reservado y vacío desde v0.58 hasta hoy: sin catálogo
 * declarado, un asistente sólo puede improvisar.
 *
 * De ahí sale todo el diseño: el modelo contesta SÓLO desde lo declarado. No
 * tiene conocimiento general de "lo que un sistema así podría hacer". Lo que no
 * está en el manifiesto no existe, y se dice que no existe.
 */

const MODELO = process.env.DOC_MODELO ?? 'claude-opus-5'

export interface RespuestaChat {
  /** Lo que se le muestra a la persona. */
  texto: string
  /** Si dijo que no, por qué. */
  negativa?: Negativa
  /** Si dejó una propuesta en la cola. */
  propuestaId?: string
  carril?: string
}

/* ── El catálogo que ve el modelo ────────────────────────────────────────── */

export interface PoolVisible {
  clave: string
  nombre: string
  estado: EstadoPool
  manifiesto: Manifiesto | null
}

export interface CatalogoVisible {
  pools: PoolVisible[]
  /** Los únicos campos que este usuario puede proponer. Vacío = sólo consultar. */
  camposPropuestos: string[]
  propuestasRecientes: { pool: string; que: string; estado: string; carril: string }[]
}

/**
 * Lo que el modelo puede ver, ya filtrado por lo que este usuario puede tocar.
 *
 * EL FILTRADO PASA ANTES DEL MODELO. Mostrarle todo y pedirle que se autolimite
 * es confiar en que nunca se equivoque; acá directamente no tiene con qué
 * salirse.
 */
export async function catalogoVisible(
  proyectoId: string,
  opciones: { puedeProponer: boolean; conAdmin?: boolean },
): Promise<CatalogoVisible> {
  const estados = await estadoDelLector(proyectoId, { conAdmin: opciones.conAdmin })

  const pools = await Promise.all(
    estados.map(async (estado): Promise<PoolVisible> => {
      const version = await versionActual(estado.clave)
      const propios = await overridesActuales(estado.instalacionId)
      // El manifiesto EFECTIVO: la pieza con lo de este proyecto encima. Hablar
      // desde la pieza pelada sería hablar de valores que acá no rigen.
      const manifiesto = version
        ? resolver(version.manifiesto, propios?.overrides ?? null).manifiesto
        : null
      return { clave: estado.clave, nombre: manifiesto?.nombre ?? estado.nombre, estado, manifiesto }
    }),
  )

  const recientes = (await listarPropuestas(proyectoId, { conAdmin: true }))
    .slice(0, 8)
    .map((p) => ({
      pool: p.poolClave,
      que: p.queCambia.map((d) => d.texto).join(' · ') || p.porque.slice(0, 80),
      estado: p.estado,
      carril: p.carril,
    }))

  return {
    pools,
    // Si no puede proponer, la lista va vacía Y la herramienta no se ofrece.
    camposPropuestos: opciones.puedeProponer ? [...CAMPOS_DE_INSTALACION] : [],
    propuestasRecientes: recientes,
  }
}

/* ── El prompt ───────────────────────────────────────────────────────────── */

function unPool(p: PoolVisible): string {
  const m = p.manifiesto
  if (!m) return `\nPOOL ${p.clave} — sin declaración publicada. No se puede tocar nada acá.`
  const gobernable = (x: Manifiesto['pantallas'][number]) =>
    !x.titulo_dinamico && !x.redirige_a && x.pertenencia !== 'prestada'
  const gob = m.pantallas.filter(gobernable)
  const noGob = m.pantallas.filter((x) => !gobernable(x))
  const brechas = (m.agentes ?? []).flatMap((a) =>
    a.acciones.filter((x) => x.brecha).map((x) => `${a.nombre}/${x.titulo}: ${x.brecha}`),
  )
  return `
POOL ${p.clave} — "${m.nombre}"
  lector: ${p.estado.lector}${p.estado.lector === 'prendido' ? ' — GOBIERNA: lo que se apruebe se ve' : ' — NO gobierna: un cambio acá no se ve en ninguna pantalla'}
  ${p.estado.diferencias > 0 ? `diferencias sin resolver: ${p.estado.diferencias}` : 'sin diferencias abiertas'}${p.estado.fallbacks > 0 ? ` · cayó al código ${p.estado.fallbacks} vez/veces` : ''}
  títulos gobernables:
${gob.map((x) => `    ${x.ruta} = "${x.titulo}"`).join('\n') || '    ninguno'}
  pantallas que NO se pueden retitular: ${noGob.map((x) => x.ruta).join(', ') || 'ninguna'}
  parámetros declarados (todavía NO leídos): ${m.configurable?.map((c) => `${c.clave}[${c.peso}]=${JSON.stringify(c.default)}`).join(' · ') || 'ninguno'}
  INTOCABLES: ${m.constitucional?.map((c) => `${c.elemento} (${c.limite})`).join(' · ') || 'ninguno'}
  brechas abiertas: ${brechas.join(' · ') || 'ninguna'}`
}

export function systemPrompt(cat: CatalogoVisible, puedeProponer: boolean): string {
  return `Sos NORA, dentro del Taller de la Fábrica.

TU ÚNICO PODER ES PROPONER. Nunca aplicás nada. Lo que generás entra a una cola
donde una persona firma. No prendés lectores, no creás piezas, no instalás nada.

CONTESTÁS SÓLO DESDE EL CATÁLOGO DE ABAJO. No sabés nada sobre "lo que un
sistema así podría hacer". Si algo no está declarado, no existe y lo decís.
NUNCA prometas algo que el catálogo no muestre, ni digas "más adelante sí".

${puedeProponer ? '' : 'ESTE USUARIO SÓLO PUEDE CONSULTAR, NO PROPONER. Contestá lo que pregunte; si pide un cambio, decíselo y explicale a quién pedírselo.\n'}
LO ÚNICO QUE HOY GOBIERNA EL LECTOR: títulos de pantalla y qué se ve en el menú.
Los parámetros y las acciones del asistente se DECLARAN, pero el sistema sigue
usando su código: cambiarlos queda escrito y no se ve. Eso se dice ANTES, no
después de que la persona se ilusione.

${puedeProponer ? `CAMPOS QUE PODÉS PROPONER, y ninguno más:\n${cat.camposPropuestos.map((c) => `  · ${c}`).join('\n')}` : ''}

CUATRO MOTIVOS PARA DECIR QUE NO. Decilos en castellano llano, en la primera
frase, y ofrecé siempre qué SÍ se puede hacer en su lugar:
  1. TOCA LA CONSTITUCIÓN — está en la lista de INTOCABLES del pool. No se hace
     por esta vía, nunca, ni con aprobación. Explicá qué protege ese límite.
  2. NECESITA ALGO QUE NO EXISTE — una pantalla, un parámetro o un
     comportamiento que no está declarado. Ofrecé anotarlo como pedido de
     construcción. No lo intentes, no lo simules, no prometas que después sí.
  3. ESTÁ FUERA DE LO QUE EL LECTOR GOBIERNA — permisos, acciones del asistente
     y automatizaciones no se leen de la declaración.
  4. EL PROYECTO NO ESTÁ LISTO — el pool está apagado o en sombra, o tiene
     diferencias sin resolver. Es el más importante de los cuatro: proponer
     sobre algo que no gobierna da la ilusión de que el cambio se va a ver.

ANTES DE PROPONER, PREGUNTÁ LO QUE CAMBIA EL RESULTADO. Una o dos preguntas, no
un interrogatorio, y sólo si la respuesta cambia lo que vas a proponer; si el
pedido ya es inequívoco, proponé. La pregunta más frecuente: ¿es una decisión de
ESTE negocio o de la pieza compartida? Desde acá sólo se cambia lo de este
negocio.

CUANDO HAY MÁS DE UN CAMINO, ofrecé dos o tres opciones con lo que cuesta cada
una, y SIEMPRE la opción de no cambiar nada, con el argumento honesto a favor.
Un asistente que siempre encuentra algo para cambiar es un asistente que agranda
el sistema por deporte.

CADA PROPUESTA DICE CINCO COSAS y las arma la cola sola: qué cambia, por qué, a
quién afecta, en qué carril cae y qué cuesta volver atrás. Vos ocupate de que el
"por qué" tenga la evidencia que dio la persona. Nunca inventes datos de uso: no
los tenés.

EL CATÁLOGO:
${cat.pools.map(unPool).join('\n')}

PROPUESTAS RECIENTES (no repitas lo que ya se rechazó):
${cat.propuestasRecientes.map((p) => `  ${p.pool}: ${p.que} → ${p.estado} (${p.carril})`).join('\n') || '  ninguna'}

Castellano rioplatense, directo, sin adornos. Nada de emojis, nada de "¡Excelente
pregunta!". Respuestas cortas: esto es una herramienta de trabajo.`
}

/* ── La única herramienta ────────────────────────────────────────────────── */

const HERRAMIENTA: Anthropic.Tool = {
  name: 'proponer_cambio',
  description:
    'Deja una propuesta en la cola del Taller. NO la aplica: una persona firma después. Usala sólo cuando ya sepas exactamente qué campo cambiar y a qué valor, y después de haber preguntado lo que hacía falta.',
  input_schema: {
    type: 'object',
    properties: {
      pool: { type: 'string', description: 'La clave del pool, tal cual figura en el catálogo.' },
      titulos: {
        type: 'object',
        description: 'ruta de pantalla → título nuevo. Sólo rutas gobernables del catálogo.',
        additionalProperties: { type: 'string' },
      },
      ocultas: {
        type: 'array',
        items: { type: 'string' },
        description: 'Rutas que este proyecto deja de mostrar en el menú.',
      },
      configurable: {
        type: 'object',
        description: 'clave del parámetro → valor nuevo. Acordate de que hoy no se lee.',
        additionalProperties: true,
      },
      porque: {
        type: 'string',
        description:
          'El motivo, con la evidencia que dio la persona. Sin inventar datos de uso, que no tenés.',
      },
    },
    required: ['pool', 'porque'],
  },
}

/* ── La conversación ─────────────────────────────────────────────────────── */

export interface Turno {
  rol: 'usuario' | 'nora'
  texto: string
}

export async function conversar(args: {
  proyectoId: string
  usuarioId: string
  puedeProponer: boolean
  historia: Turno[]
  mensaje: string
  /** Sólo para los scripts de consola, que no tienen sesión. */
  conAdmin?: boolean
}): Promise<RespuestaChat> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // No se simula una respuesta. Un asistente que contesta sin modelo es
    // exactamente lo que este archivo existe para no ser.
    return {
      texto:
        'El asistente no está disponible ahora mismo. Podés proponer el cambio a mano desde la declaración, que hace exactamente lo mismo.',
    }
  }

  const cat = await catalogoVisible(args.proyectoId, {
    puedeProponer: args.puedeProponer,
    conAdmin: args.conAdmin,
  })
  const anthropic = new Anthropic({ apiKey })

  const mensajes: Anthropic.MessageParam[] = [
    ...args.historia.map((t) => ({
      role: (t.rol === 'usuario' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: t.texto,
    })),
    { role: 'user' as const, content: args.mensaje },
  ]

  let respuesta: Anthropic.Message
  try {
    respuesta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
      system: systemPrompt(cat, args.puedeProponer),
      // Si no puede proponer, la herramienta NI SE OFRECE. No alcanza con
      // pedírselo por texto.
      tools: args.puedeProponer ? [HERRAMIENTA] : [],
      messages: mensajes,
    })
  } catch {
    return { texto: 'No pude consultar al asistente. Probá de nuevo en un rato.' }
  }

  const texto = respuesta.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()

  const uso = respuesta.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  if (!uso) return { texto }

  /* ── Quiso proponer: se decide acá, no en el modelo ───────────────── */
  const e = uso.input as {
    pool: string
    titulos?: Record<string, string>
    ocultas?: string[]
    configurable?: Record<string, unknown>
    porque: string
  }

  const cambio: Overrides = {}
  if (e.titulos && Object.keys(e.titulos).length) cambio.titulos = e.titulos
  if (e.ocultas?.length) cambio.ocultas = e.ocultas
  if (e.configurable && Object.keys(e.configurable).length) cambio.configurable = e.configurable

  if (Object.keys(cambio).length === 0) {
    return {
      texto: `${texto}\n\nNo llegué a armar un cambio concreto. Contame qué querés cambiar.`.trim(),
    }
  }

  const pool = cat.pools.find((p) => p.clave === e.pool)
  const no = porQueNo(
    {
      clave: e.pool,
      campos: Object.keys(cambio),
      rutas: Object.keys(e.titulos ?? {}).concat(e.ocultas ?? []),
      configurables: Object.keys(e.configurable ?? {}),
    },
    pool?.manifiesto ?? null,
    pool?.estado,
  )

  // Se corta, salvo cuando el motivo es "queda escrito pero todavía no se ve":
  // ahí la propuesta es legítima y lo que corresponde es advertir, no negarse.
  const soloAdvierte =
    no?.motivo === 'fuera_del_lector' &&
    Object.keys(cambio).every((c) => c in NO_LEIDO_PERO_PROPONIBLE)
  if (no && !soloAdvierte) {
    return { texto: [texto, no.texto, no.salida].filter(Boolean).join('\n\n').trim(), negativa: no }
  }

  const r = await proponer({
    proyectoId: args.proyectoId,
    clave: e.pool,
    cambio,
    porque: e.porque,
    autorId: args.usuarioId,
  })

  if (!r.ok || !r.propuesta) {
    return {
      texto: `${texto}\n\nNo pude dejarla en la cola: ${r.error ?? 'motivo desconocido'}`.trim(),
    }
  }

  const p = r.propuesta
  const cierre =
    p.carril === 'rojo'
      ? `Quedó registrada como intento prohibido y ya está rechazada: ${p.carrilMotivo}`
      : `Quedó en la cola del Taller, carril ${p.carril}. La firma una persona.`
  const extras = [no?.texto, advertencia(pool?.estado)].filter(Boolean).join(' ')

  return {
    texto: [texto, extras, cierre].filter(Boolean).join('\n\n').trim(),
    propuestaId: p.id,
    carril: p.carril,
  }
}
