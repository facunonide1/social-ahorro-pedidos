import Anthropic from '@anthropic-ai/sdk'

import { createAdminClient } from '@/lib/supabase/server'

import { CAMPOS_DE_INSTALACION } from './clasificacion'
import { estadoDelLector, type EstadoPool } from './flag'
import {
  advertencia,
  NO_LEIDO_PERO_PROPONIBLE,
  porQueNo,
  type MotivoNegativa,
  type Negativa,
} from './negativas'
import { anotarPedido, ETIQUETA_FALTA, type QueFalta } from './pedidos'
import { camposConHistoriaDificil } from './procedencia'
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
  /** Si anotó un pedido de construcción. */
  pedidoId?: string
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
  /** Campos que ya se cambiaron y se dieron para atrás. */
  historiaDificil: { campo: string; poolClave: string; reversiones: number }[]
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
    historiaDificil: await camposConHistoriaDificil(proyectoId),
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
  títulos gobernables (si dice "oficio", el equipo de ACÁ le dice distinto y
  vos entendés las DOS formas: si te nombran cualquiera de las dos, es la misma
  pantalla, y contestá con la que usó la persona):
${
    gob
      .map(
        (x) =>
          `    ${x.ruta} = "${x.titulo}"` +
          (x.nombre_en_el_negocio && x.titulo_de_oficio !== x.titulo
            ? ` (oficio: "${x.titulo_de_oficio}")`
            : ''),
      )
      .join('\n') || '    ninguno'
  }
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
HAY DOS NOMBRES PARA CADA PANTALLA Y NO SON LO MISMO:
  · el TÉRMINO DEL OFICIO vive en la pieza. Es el nombre de la cosa en el rubro.
  · el NOMBRE DE ESTE NEGOCIO vive en la instalación. Es cómo le dice el equipo.
Si alguien quiere cambiar un nombre, distinguí cuál de los dos casos es:
  · "acá le decimos distinto" → es vocabulario. Va en el campo vocabulario y NO borra
    el término del oficio. Es legítimo y permanente.
  · "la pieza dice algo que está mal, para todos" → eso NO es vocabulario, es un
    defecto de la pieza. Un override así tapa el defecto y el próximo negocio
    que instale la pieza se lo come. Decilo y ofrecé anotarlo contra la pieza.

LO ÚNICO QUE HOY GOBIERNA EL LECTOR: títulos de pantalla y qué se ve en el menú.
Los parámetros y las acciones del asistente se DECLARAN, pero el sistema sigue
usando su código: cambiarlos queda escrito y no se ve. Eso se dice ANTES, no
después de que la persona se ilusione.

${puedeProponer ? `CAMPOS QUE PODÉS PROPONER, y ninguno más:\n${cat.camposPropuestos.map((c) => `  · ${c}`).join('\n')}` : ''}

CUATRO MOTIVOS PARA DECIR QUE NO. Decilos en castellano llano, en la primera
frase, ofrecé siempre qué SÍ se puede hacer en su lugar, y llamá además a
no_se_puede con el motivo — la explicación la lee una persona, el motivo se
cuenta:
  1. TOCA LA CONSTITUCIÓN — está en la lista de INTOCABLES del pool. No se hace
     por esta vía, nunca, ni con aprobación. Explicá qué protege ese límite.
  2. NECESITA ALGO QUE NO EXISTE — una pantalla, un parámetro o un
     comportamiento que no está declarado. OFRECÉ anotarlo como pedido de
     construcción y, si te dicen que sí, llamá a anotar_pedido. No lo intentes,
     no lo simules, no prometas que después sí, y no digas que "va a estar":
     anotarlo es dejar registro de que se pidió, no un compromiso de que se
     construya. Decilo así.
  3. ESTÁ FUERA DE LO QUE EL LECTOR GOBIERNA — permisos, acciones del asistente
     y automatizaciones no se leen de la declaración.
  4. EL PROYECTO NO ESTÁ LISTO — el pool está apagado o en sombra, o tiene
     diferencias sin resolver. Es el más importante de los cuatro: proponer
     sobre algo que no gobierna da la ilusión de que el cambio se va a ver.

ANTES DE PROPONER, PREGUNTÁ LO QUE CAMBIA EL RESULTADO. Una o dos preguntas, no
un interrogatorio, y sólo si la respuesta cambia lo que vas a proponer.

HAY UNA QUE SIEMPRE CAMBIA EL RESULTADO Y VA SIEMPRE, aunque el pedido parezca
inequívoco: ¿esto es una decisión de ESTE negocio, o la pieza está mal para
todos los que la usan? No preguntás porque necesites permiso —desde acá sólo
podés tocar lo de este negocio y con eso alcanza para hacerlo—; preguntás porque
si la pieza está mal para todos, taparlo con un override local esconde el
defecto en vez de arreglarlo, y el próximo negocio que instale la pieza se come
el mismo problema. Preguntala, esperá la respuesta, y recién ahí proponé. Si te
dicen que es de la pieza, decilo y no propongas el override.

CUANDO HAY MÁS DE UN CAMINO, ofrecé dos o tres opciones con lo que cuesta cada
una, y SIEMPRE la opción de no cambiar nada, con el argumento honesto a favor.
Un asistente que siempre encuentra algo para cambiar es un asistente que agranda
el sistema por deporte.

LA COLA DE CONSTRUCCIÓN NO SE LLENA SOLA. anotar_pedido se llama DESPUÉS de que
la persona dijo que sí, nunca antes. Si todavía no contestó, ofrecé y esperá: un
pedido anotado porque creíste entender que hacía falta ensucia una cola que
después nadie mira. Cuando lo anotes, guardá sus palabras, no tu resumen.

CADA PROPUESTA DICE CINCO COSAS y las arma la cola sola: qué cambia, por qué, a
quién afecta, en qué carril cae y qué cuesta volver atrás. Vos ocupate de que el
"por qué" tenga la evidencia que dio la persona. Nunca inventes datos de uso: no
los tenés.

EL CATÁLOGO:
${cat.pools.map(unPool).join('\n')}

CAMPOS QUE YA SE CAMBIARON Y SE DIERON PARA ATRÁS. Antes de proponer sobre
alguno de éstos, decilo y preguntá qué cambió desde entonces. No te niegues por
esto —a veces la tercera es la buena— pero mandarlo sin un motivo nuevo es
hacerle perder el tiempo a quien firma. El motivo de cada reversión está
guardado; si te lo preguntan, decí que se puede ver en la declaración del pool.
${cat.historiaDificil.map((h) => `  ${h.poolClave} · ${h.campo} · ${h.reversiones} reversión(es)`).join('\n') || '  ninguno'}

PROPUESTAS RECIENTES (no repitas lo que ya se rechazó):
${cat.propuestasRecientes.map((p) => `  ${p.pool}: ${p.que} → ${p.estado} (${p.carril})`).join('\n') || '  ninguna'}

Castellano rioplatense, directo, sin adornos. Nada de emojis, nada de "¡Excelente
pregunta!". Respuestas cortas: esto es una herramienta de trabajo.`
}

/* ── Las tres herramientas ───────────────────────────────────────────────── */

/**
 * Anotar lo que no existe.
 *
 * En v0.66 NORA ofreció seis veces "lo anoto como pedido de construcción" y no
 * había dónde. Ahora hay.
 *
 * NUNCA SE LLAMA SIN QUE LA PERSONA HAYA DICHO QUE SÍ. Un pedido registrado
 * porque el asistente creyó entender que hacía falta ensucia la cola con
 * comentarios al pasar, y una cola con ruido se deja de mirar. La descripción
 * de la herramienta lo dice, y el prompt lo repite: es la única regla del chat
 * que no se puede verificar en código, porque desde acá no se distingue un "sí"
 * de un "bueno, dale".
 */
const HERRAMIENTA_PEDIDO: Anthropic.Tool = {
  name: 'anotar_pedido',
  description:
    'Anota en la cola de construcción algo que no existe todavía. Llamala SÓLO después de haberlo ofrecido y de que la persona haya dicho explícitamente que sí. Si todavía no te contestó, no la llames: ofrecé y esperá.',
  input_schema: {
    type: 'object',
    properties: {
      pedido: {
        type: 'string',
        description:
          'Qué pidió, EN LAS PALABRAS DE LA PERSONA. No lo resumas ni lo traduzcas a jerga: lo que se pierde al resumir es el motivo, que es lo único que después permite saber si dos pedidos son el mismo.',
      },
      contexto: {
        type: 'string',
        description:
          'Lo que se supo: para qué, quién lo usaría, contra qué dato. Sólo lo que la persona dijo. No inventes.',
      },
      falta: {
        type: 'string',
        enum: ['molde', 'entidad', 'comportamiento', 'integracion', 'capacidad_lector'],
        description:
          'molde: no hay patrón de pantalla o flujo que lo cubra. entidad: hace falta guardar algo que hoy no se guarda. comportamiento: hace falta que el sistema haga algo que no hace. integracion: depende de un sistema de afuera. capacidad_lector: ya está declarado y el lector todavía no lo lee.',
      },
      pool: { type: 'string', description: 'La clave del pool al que se le pidió, si tenía uno.' },
      se_parece_a: {
        type: 'string',
        description: 'A qué cosa que ya existe se parece, si a alguna. Opcional.',
      },
    },
    required: ['pedido', 'falta'],
  },
}

/* ── Las otras dos ───────────────────────────────────────────────────────── */

/**
 * Decir que no también es un resultado, y hay que poder contarlo.
 *
 * Sin esto, una negativa es un párrafo de prosa: se puede leer, no se puede
 * medir. Y la medición es el punto — el día que "necesita algo que no existe"
 * sea el 40% de las negativas, eso no es un problema del chat, es la lista de
 * lo que hay que construir ordenada por cuánta gente la pidió.
 *
 * No cambia lo que la persona lee: el texto lo escribe el modelo igual. Esto
 * sólo le pide que además clasifique lo que acaba de decir.
 */
const HERRAMIENTA_NO: Anthropic.Tool = {
  name: 'no_se_puede',
  description:
    'Llamala SIEMPRE que le digas a la persona que algo no se puede hacer, además de explicárselo en tu respuesta. No reemplaza la explicación: la clasifica para poder contarla después.',
  input_schema: {
    type: 'object',
    properties: {
      motivo: {
        type: 'string',
        enum: ['constitucional', 'no_existe', 'fuera_del_lector', 'proyecto_no_listo'],
        description:
          'constitucional: está en los intocables. no_existe: pantalla, parámetro o comportamiento no declarado. fuera_del_lector: se declara pero el lector todavía no lo lee. proyecto_no_listo: el pool está apagado, en sombra o con diferencias sin resolver.',
      },
      que_pidio: {
        type: 'string',
        description: 'En una línea, qué pidió la persona. Es lo que se va a contar.',
      },
    },
    required: ['motivo', 'que_pidio'],
  },
}

const HERRAMIENTA: Anthropic.Tool = {
  name: 'proponer_cambio',
  description:
    'Deja una propuesta en la cola del Taller. NO la aplica: una persona firma después. Usala sólo cuando ya sepas exactamente qué campo cambiar y a qué valor, y después de haber preguntado lo que hacía falta.',
  input_schema: {
    type: 'object',
    properties: {
      pool: { type: 'string', description: 'La clave del pool, tal cual figura en el catálogo.' },
      vocabulario: {
        type: 'object',
        description:
          'ruta de pantalla → cómo le dice ESTE negocio. Usá esto cuando el término del oficio está bien y el equipo lo nombra distinto. No borra el término del oficio.',
        additionalProperties: { type: 'string' },
      },
      titulos: {
        type: 'object',
        description:
          'ruta de pantalla → título nuevo, CORRIGIENDO la pieza. Usá esto SÓLO cuando la pieza dice algo que está mal para todos, y avisá que es deuda: tapa un defecto en vez de arreglarlo.',
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

/* ── El registro ─────────────────────────────────────────────────────────── */

export interface Turno {
  rol: 'usuario' | 'nora'
  texto: string
}

/**
 * La bitácora.
 *
 * Se escribe con service_role y NUNCA lanza: si el registro falla, la persona
 * igual tiene que ver su respuesta. Perder una línea de bitácora es malo;
 * perder la conversación por perder la bitácora es peor.
 *
 * Registra TODOS los turnos, no sólo los que terminan en propuesta. Un chat
 * donde sólo quedan los pedidos que salieron bien no sirve para medir nada: lo
 * interesante son los que dijeron que no.
 */
async function registrar(args: {
  proyectoId: string
  usuarioId: string
  puedeProponer: boolean
  mensaje: string
  r: RespuestaChat
}): Promise<RespuestaChat> {
  try {
    const adm = createAdminClient()
    const { data } = await adm
      .from('fab_chat_turnos')
      .insert({
        proyecto_id: args.proyectoId,
        usuario_id: args.usuarioId,
        mensaje: args.mensaje,
        respuesta: args.r.texto,
        podia_proponer: args.puedeProponer,
        propuesta_id: args.r.propuestaId ?? null,
        carril: args.r.carril ?? null,
        negativa: args.r.negativa?.motivo ?? null,
      })
      .select('id')
      .single()

    // El pedido apunta a la conversación de la que salió. Se ata acá y no al
    // crearlo porque el turno todavía no existía: el pedido nace en medio de la
    // respuesta, el turno se cierra cuando la respuesta terminó.
    const turnoId = (data as { id: string } | null)?.id
    if (turnoId && args.r.pedidoId) {
      await adm
        .from('fab_pedidos_construccion')
        .update({ turno_id: turnoId })
        .eq('id', args.r.pedidoId)
    }
  } catch {
    // A propósito en silencio. Ver arriba.
  }
  return args.r
}

export interface TurnoRegistrado {
  id: string
  mensaje: string
  respuesta: string
  podiaProponer: boolean
  propuestaId: string | null
  carril: string | null
  negativa: string | null
  creadoAt: string
}

/** La bitácora, para mirarla desde el Taller. */
export async function bitacora(proyectoId: string, limite = 20): Promise<TurnoRegistrado[]> {
  const { data } = await createAdminClient()
    .from('fab_chat_turnos')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .order('creado_at', { ascending: false })
    .limit(limite)
  return ((data ?? []) as unknown as Record<string, never>[]).map((f) => ({
    id: f.id,
    mensaje: f.mensaje,
    respuesta: f.respuesta,
    podiaProponer: f.podia_proponer,
    propuestaId: f.propuesta_id,
    carril: f.carril,
    negativa: f.negativa,
    creadoAt: f.creado_at,
  }))
}

/* ── La conversación ─────────────────────────────────────────────────────── */

export interface PedidoDeChat {
  proyectoId: string
  usuarioId: string
  puedeProponer: boolean
  historia: Turno[]
  mensaje: string
  /** Sólo para los scripts de consola, que no tienen sesión. */
  conAdmin?: boolean
}

/**
 * Un turno de conversación, de punta a punta.
 *
 * El registro se hace acá y no en cada `return` de adentro: una salida sin
 * registrar es exactamente la que después nadie encuentra.
 */
export async function conversar(args: PedidoDeChat): Promise<RespuestaChat> {
  const r = await responder(args)
  return registrar({
    proyectoId: args.proyectoId,
    usuarioId: args.usuarioId,
    puedeProponer: args.puedeProponer,
    mensaje: args.mensaje,
    r,
  })
}

async function responder(args: PedidoDeChat): Promise<RespuestaChat> {
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
      // Si no puede proponer, la herramienta de proponer NI SE OFRECE. No
      // alcanza con pedírselo por texto. La de decir que no va siempre: el que
      // sólo consulta también recibe negativas, y también hay que contarlas.
      tools: args.puedeProponer
        ? [HERRAMIENTA, HERRAMIENTA_NO, HERRAMIENTA_PEDIDO]
        : [HERRAMIENTA_NO],
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

  const usos = respuesta.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')

  // La negativa declarada por el modelo. No corta nada ni cambia el texto: sólo
  // etiqueta para la bitácora lo que el modelo ya explicó a su manera.
  const declarada = usos.find((u) => u.name === 'no_se_puede')
  const negativaDeclarada: Negativa | undefined = declarada
    ? {
        motivo: (declarada.input as { motivo: MotivoNegativa }).motivo,
        texto: (declarada.input as { que_pidio: string }).que_pidio,
        salida: '',
      }
    : undefined

  /* ── ¿Anotó un pedido de construcción? ─────────────────────────────── */
  const anota = usos.find((u) => u.name === 'anotar_pedido')
  let cierrePedido: string | undefined
  let pedidoId: string | undefined
  if (anota) {
    const e = anota.input as {
      pedido: string
      contexto?: string
      falta: QueFalta
      pool?: string
      se_parece_a?: string
    }
    const r = await anotarPedido({
      proyectoId: args.proyectoId,
      poolClave: e.pool ?? null,
      pedido: e.pedido,
      contexto: e.contexto,
      falta: e.falta,
      seParece: e.se_parece_a,
      turnoId: null,
      autorId: args.usuarioId,
    })
    if (!r.ok) {
      cierrePedido = `No pude anotarlo: ${r.error}`
    } else {
      const p = r.parecidos ?? []
      cierrePedido =
        `Anotado en la cola de construcción: ${ETIQUETA_FALTA[e.falta]}.` +
        (p.length
          ? ` Hay ${p.length} pedido(s) parecido(s) ya anotado(s); no los junté —eso lo decide una persona— pero van a aparecer al lado en la cola.`
          : '')
      pedidoId = r.pedido!.id
    }
  }

  const uso = usos.find((u) => u.name === 'proponer_cambio')
  if (!uso) {
    return {
      texto: [texto, cierrePedido].filter(Boolean).join('\n\n').trim(),
      negativa: negativaDeclarada,
      pedidoId,
    }
  }

  /* ── Quiso proponer: se decide acá, no en el modelo ───────────────── */
  const e = uso.input as {
    pool: string
    vocabulario?: Record<string, string>
    titulos?: Record<string, string>
    ocultas?: string[]
    configurable?: Record<string, unknown>
    porque: string
  }

  const cambio: Overrides = {}
  if (e.vocabulario && Object.keys(e.vocabulario).length) cambio.vocabulario = e.vocabulario
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
      rutas: [
        ...Object.keys(e.vocabulario ?? {}),
        ...Object.keys(e.titulos ?? {}),
        ...(e.ocultas ?? []),
      ],
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
