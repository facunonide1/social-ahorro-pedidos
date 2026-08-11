import { createAdminClient, createClient } from '@/lib/supabase/server'
import {
  carrilDeCampo,
  carrilDePropuesta,
  tiposConVerdeHabilitado,
  type Carril,
  type TipoCampo,
} from './carriles'
import {
  DIFERENCIADOR_VERSION,
  diffLegible,
  escribirOverride,
  personasQueLoVen,
  revertirOverrideA,
  type LineaDiff,
} from './escritor'
import { efectoDe } from './efecto'
import { overridesActuales, resolver, type Overrides } from './overrides'
import { versionActual } from './versiones'

/**
 * LA COLA DEL TALLER.
 *
 * Toda propuesta declara CINCO cosas, y la quinta no es negociable:
 *
 *   1 · QUÉ CAMBIA        el diff legible en castellano
 *   2 · POR QUÉ           con evidencia, no opinión
 *   3 · A QUIÉN AFECTA    qué pantallas, cuánta gente
 *   4 · CARRIL            derivado, con el motivo
 *   5 · COSTO DE REVERTIR visible ANTES de aprobar
 *
 * Aprobar rápido sólo es seguro si se sabe qué cuesta deshacer.
 *
 * De dónde salen hoy: de un humano en el editor, o del verificador cuando
 * encuentra una diferencia entre declaración y código. No hay propuestas
 * sacadas del uso: eso necesita datos de uso que todavía no existen, y una
 * propuesta inventada sin datos es una opinión con formato de dato.
 */

export type EstadoPropuesta = 'pendiente' | 'aplicada' | 'rechazada' | 'revertida' | 'expirada'

export interface Propuesta {
  id: string
  proyectoId: string
  poolClave: string
  nivel: 'pool' | 'instalacion'
  campos: string[]
  cambio: Overrides
  carril: Carril
  carrilMotivo: string
  queCambia: LineaDiff[]
  porque: string
  afecta: { pantallas: number; personas: number; pools: string[] }
  costoRevertir: string
  estado: EstadoPropuesta
  origen: 'humano' | 'verificador'
  /** true = la aplicó el carril verde, no una persona. */
  aplicadaAutomaticamente: boolean
  /** Con qué versión del diferenciador se calculó `queCambia`. NULL = anterior a v0.70. */
  diferenciadorVersion: string | null
  huella: string
  vecesRechazada: number
  creadaAt: string
  creadaPor: string | null
  decididaAt: string | null
  notaDecision: string | null
  expiraAt: string | null
}

interface Fila {
  id: string
  proyecto_id: string
  pool_clave: string
  nivel: 'pool' | 'instalacion'
  campos: string[]
  cambio: Overrides
  carril: Carril
  carril_motivo: string
  que_cambia: LineaDiff[]
  porque: string
  afecta: { pantallas: number; personas: number; pools: string[] }
  costo_revertir: string
  estado: EstadoPropuesta
  origen: 'humano' | 'verificador'
  aplicada_automaticamente: boolean
  diferenciador_version: string | null
  huella: string
  veces_rechazada: number
  creada_at: string
  creada_por: string | null
  decidida_at: string | null
  nota_decision: string | null
  expira_at: string | null
}

const aPropuesta = (f: Fila): Propuesta => ({
  id: f.id,
  proyectoId: f.proyecto_id,
  poolClave: f.pool_clave,
  nivel: f.nivel,
  campos: f.campos ?? [],
  cambio: f.cambio ?? {},
  carril: f.carril,
  carrilMotivo: f.carril_motivo,
  queCambia: f.que_cambia ?? [],
  porque: f.porque,
  afecta: f.afecta ?? { pantallas: 0, personas: 0, pools: [] },
  costoRevertir: f.costo_revertir,
  estado: f.estado,
  origen: f.origen,
  aplicadaAutomaticamente: f.aplicada_automaticamente === true,
  diferenciadorVersion: f.diferenciador_version ?? null,
  huella: f.huella,
  vecesRechazada: f.veces_rechazada ?? 0,
  creadaAt: f.creada_at,
  creadaPor: f.creada_por,
  decididaAt: f.decidida_at,
  notaDecision: f.nota_decision,
  expiraAt: f.expira_at,
})

/** Días que una propuesta espera antes de expirar. */
export const DIAS_HASTA_EXPIRAR = 14

/**
 * La identidad de un cambio, para no volver a proponer lo mismo.
 *
 * ── HALLAZGO 17 ─────────────────────────────────────────────────────────────
 *
 * La primera versión era `JSON.stringify(cambio, Object.keys(cambio).sort())`,
 * con la intención de serializar con las claves ordenadas. Pero el segundo
 * argumento de `JSON.stringify` no ordena: FILTRA. Y filtra en todos los
 * niveles, así que sólo sobrevivían las claves de primer nivel y el contenido se
 * vaciaba:
 *
 *   { configurable: { dias_aviso_vencimiento: 45 } }  →  {"configurable":{}}
 *   { configurable: { dias_aviso_vencimiento: 7 } }   →  {"configurable":{}}
 *   { configurable: { control_por_zonas: false } }    →  {"configurable":{}}
 *   { titulos: { '/x': 'A' } }                        →  {"titulos":{}}
 *
 * TODAS las propuestas de un mismo tipo compartían huella. Consecuencias: dos
 * rechazos de CUALQUIER cambio de parámetro bloqueaban para siempre cualquier
 * otro cambio de parámetro del mismo pool, y una propuesta pendiente sobre un
 * título hacía rebotar la de otro título como "idéntica".
 *
 * Se descubrió porque la prueba del carril verde no pudo proponer: "este cambio
 * ya se rechazó dos veces", sobre un valor que nunca se había propuesto.
 *
 * Ahora se serializa con las claves ordenadas DE VERDAD, recursivamente.
 */
function ordenado(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(ordenado)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, ordenado((v as Record<string, unknown>)[k])]),
    )
  }
  return v
}

function huellaDe(clave: string, cambio: Overrides): string {
  return `${clave}:${JSON.stringify(ordenado(cambio))}`
}

/* ── Proponer ────────────────────────────────────────────────────────────── */

export interface ResultadoProponer {
  ok: boolean
  propuesta?: Propuesta
  /** true = ya se rechazó dos veces y no se vuelve a proponer. */
  yaRechazada?: boolean
  error?: string
}

export async function proponer(args: {
  proyectoId: string
  clave: string
  cambio: Overrides
  porque: string
  autorId: string | null
  origen?: 'humano' | 'verificador'
}): Promise<ResultadoProponer> {
  if (!args.porque?.trim()) {
    return { ok: false, error: 'Una propuesta sin motivo escrito no se puede evaluar.' }
  }

  const delPool = await versionActual(args.clave)
  if (!delPool) return { ok: false, error: 'Ese pool no tiene una versión actual.' }

  const adm = createAdminClient()
  const huella = huellaDe(args.clave, args.cambio)

  // Una propuesta rechazada dos veces no se vuelve a proponer: insistir con lo
  // que ya se dijo que no es la forma más rápida de que dejen de leerse.
  const { data: previas } = await adm
    .from('fab_propuestas')
    .select('id, estado, veces_rechazada')
    .eq('proyecto_id', args.proyectoId)
    .eq('huella', huella)
  const rechazos = ((previas ?? []) as { estado: string }[]).filter((p) => p.estado === 'rechazada').length
  if (rechazos >= 2) {
    return { ok: false, yaRechazada: true, error: 'Este cambio ya se rechazó dos veces. No se vuelve a proponer.' }
  }
  if (((previas ?? []) as { estado: string }[]).some((p) => p.estado === 'pendiente')) {
    return { ok: false, error: 'Ya hay una propuesta pendiente idéntica.' }
  }

  /* ── 4 · el carril, derivado ─────────────────────────────────────── */
  const habilitados = await tiposConVerdeHabilitado(args.proyectoId)
  const campos = camposDe(args.cambio)
  const veredictos = campos.map((c) =>
    carrilDeCampo({
      campo: c.campo,
      nivel: 'instalacion',
      delPool: delPool.manifiesto,
      valor: c.valor,
      verdeHabilitado: (t: TipoCampo) => habilitados.has(t),
    }),
  )
  const veredicto = carrilDePropuesta(veredictos)

  /* ── 1 · qué cambia · 3 · a quién afecta · 5 · costo ─────────────── */
  const instalacionId = await idInstalacion(args.proyectoId, args.clave)
  const propios = instalacionId ? await overridesActuales(instalacionId) : null
  const { manifiesto: efectivo } = resolver(delPool.manifiesto, propios?.overrides ?? null)
  // FUSIONAR, no pisar. Con un spread superficial, proponer un título borraba
  // los otros overrides del proyecto: `titulos` es un objeto y el spread lo
  // reemplaza entero. Lo destapó el diff de la prueba, que mostró tres cambios
  // en una propuesta que tocaba uno — y de no haberlo mirado, aprobarla habría
  // devuelto dos pantallas al default sin que nadie lo pidiera.
  const { manifiesto: propuesto } = resolver(
    delPool.manifiesto,
    fusionar(propios?.overrides ?? {}, args.cambio),
  )
  const personas = await personasQueLoVen(delPool.manifiesto)
  const gobernando = await estaGobernando(args.proyectoId, args.clave)
  const queCambia = diffLegible(efectivo, propuesto, { gobernando, personasConAcceso: personas })

  // EL EFECTO ESTIMADO, cuando se puede calcular. Va pegado a la línea del
  // parámetro y no aparte: quien firma lee una frase, no dos listas.
  for (const c of campos) {
    if (!c.campo.startsWith('configurable.')) continue
    const clave = c.campo.slice('configurable.'.length)
    const antes = (efectivo.configurable ?? []).find((x) => x.clave === clave)?.default
    const e = await efectoDe(args.clave, clave, antes, c.valor)
    const linea = queCambia.find((d) => d.texto.includes(
      (propuesto.configurable ?? []).find((x) => x.clave === clave)?.etiqueta ?? '\u0000',
    ))
    if (linea) linea.texto = `${linea.texto} ${e.texto}`
  }

  const { data, error } = await adm
    .from('fab_propuestas')
    .insert({
      proyecto_id: args.proyectoId,
      pool_clave: args.clave,
      nivel: 'instalacion',
      campos: campos.map((c) => c.campo),
      cambio: args.cambio as unknown as Record<string, unknown>,
      carril: veredicto.carril,
      carril_motivo: veredicto.motivo,
      que_cambia: queCambia as unknown as Record<string, unknown>[],
      porque: args.porque.trim(),
      afecta: { pantallas: queCambia.length, personas, pools: [args.clave] },
      costo_revertir: costoDe(queCambia, gobernando),
      // El rojo entra como rechazado de entrada: el Taller no lo propone, pero
      // el intento queda a la vista.
      estado: veredicto.carril === 'rojo' ? 'rechazada' : 'pendiente',
      origen: args.origen ?? 'humano',
      // Con qué versión se calculó este diff. Sin esto, un diff viejo y uno
      // nuevo se leen igual y no lo son.
      diferenciador_version: DIFERENCIADOR_VERSION,
      huella,
      creada_por: args.autorId,
      decidida_at: veredicto.carril === 'rojo' ? new Date().toISOString() : null,
      nota_decision: veredicto.carril === 'rojo' ? veredicto.motivo : null,
      expira_at:
        veredicto.carril === 'rojo'
          ? null
          : new Date(Date.now() + DIAS_HASTA_EXPIRAR * 86_400_000).toISOString(),
    })
    .select('*')
    .single()

  if (error || !data) return { ok: false, error: 'No se pudo registrar la propuesta.' }
  const propuesta = aPropuesta(data as unknown as Fila)

  /* ── 6 · el carril verde se aplica solo ───────────────────────────── */
  //
  // Hasta v0.68 el verde era una CLASIFICACIÓN y no una automatización: una
  // propuesta en verde se insertaba como `pendiente` y esperaba firma igual que
  // una amarilla. La etiqueta prometía algo que el mecanismo no hacía.
  //
  // Ahora se aplica de verdad. Y sigue sin encenderse: el interruptor por tipo
  // de campo está vacío, así que `carrilDeCampo` no devuelve verde para nada.
  // El mecanismo se construye para que el día que haya evidencia sea un
  // interruptor y no una sesión — pero la evidencia no se inventa.
  if (propuesta.carril === 'verde') {
    const r = await aplicar({
      propuestaId: propuesta.id,
      autorId: args.autorId ?? null,
      nota: 'Carril verde: se aplicó solo. Está en el Taller con su diff y su botón de deshacer.',
      automatica: true,
    })
    // Si falla, la propuesta QUEDA PENDIENTE y no se pierde: un verde que no se
    // pudo aplicar es una propuesta común, no un cambio perdido.
    if (r.ok) {
      const { data: fresca } = await adm.from('fab_propuestas').select('*').eq('id', propuesta.id).single()
      if (fresca) return { ok: true, propuesta: aPropuesta(fresca as unknown as Fila) }
    }
  }

  return { ok: true, propuesta }
}

/** Los campos que toca un cambio, con su valor. */
function camposDe(cambio: Overrides): { campo: string; valor: unknown }[] {
  const out: { campo: string; valor: unknown }[] = []
  for (const [ruta, titulo] of Object.entries(cambio.titulos ?? {})) {
    out.push({ campo: `titulos.${ruta}`, valor: titulo })
  }
  for (const ruta of cambio.ocultas ?? []) out.push({ campo: `ocultas.${ruta}`, valor: true })
  for (const [clave, activa] of Object.entries(cambio.automatizaciones ?? {})) {
    out.push({ campo: `automatizaciones.${clave}`, valor: activa })
  }
  for (const [clave, valor] of Object.entries(cambio.configurable ?? {})) {
    out.push({ campo: `configurable.${clave}`, valor })
  }
  for (const [clave, valores] of Object.entries(cambio.dimensiones ?? {})) {
    out.push({ campo: `dimensiones.${clave}`, valor: valores })
  }
  for (const [ag, ajuste] of Object.entries(cambio.agentes ?? {})) {
    for (const [acc, nivel] of Object.entries(ajuste.participacion ?? {})) {
      out.push({ campo: `agentes.${ag}.${acc}.participacion`, valor: nivel })
    }
    for (const [acc, texto] of Object.entries(ajuste.brechas ?? {})) {
      out.push({ campo: `agentes.${ag}.${acc}.brecha`, valor: texto })
    }
  }
  if (cambio.nombre !== undefined) out.push({ campo: 'nombre', valor: cambio.nombre })
  if (cambio.descripcion !== undefined) out.push({ campo: 'descripcion', valor: cambio.descripcion })
  return out
}

function costoDe(diff: LineaDiff[], gobernando: boolean): string {
  if (diff.length === 0) return 'No cambia nada.'
  const irreversible = diff.filter((d) => !d.reversibleSinPerdida)
  if (irreversible.length > 0) {
    return `${irreversible.length} de ${diff.length} cambios no se deshacen sin perder algo.`
  }
  return gobernando
    ? 'Se deshace con un revert y vuelve en la request siguiente. No se pierde nada.'
    : 'El pool no está gobernado: deshacerlo no cambia nada visible.'
}

/* ── Decidir ─────────────────────────────────────────────────────────────── */

export async function aplicar(args: {
  propuestaId: string
  autorId: string | null
  nota?: string
  /**
   * true = la aplicó el carril verde, no una persona.
   *
   * Se guarda porque un cambio que se aplicó solo y un cambio que alguien firmó
   * NO son lo mismo a la hora de mirar la historia, aunque los dos terminen en
   * `aplicada`. Sin esta marca, la evidencia que hace falta para encender el
   * verde —cuántos cambios aprobó una persona sin incidentes— sería
   * incontable: se mezclaría con los que se aplicaron solos.
   */
  automatica?: boolean
}): Promise<{ ok: boolean; numero?: number; error?: string }> {
  const adm = createAdminClient()
  const { data } = await adm.from('fab_propuestas').select('*').eq('id', args.propuestaId).maybeSingle()
  const p = data ? aPropuesta(data as unknown as Fila) : null
  if (!p) return { ok: false, error: 'No se encontró la propuesta.' }
  if (p.estado !== 'pendiente') return { ok: false, error: `La propuesta está ${p.estado}.` }
  if (p.carril === 'rojo') return { ok: false, error: 'Una propuesta prohibida no se aplica.' }

  const instalacionId = await idInstalacion(p.proyectoId, p.poolClave)
  const propios = instalacionId ? await overridesActuales(instalacionId) : null

  // Se aplica con el ESCRITOR que ya existe. Duplicar la lógica de escritura
  // sería tener dos caminos a la misma tabla, y uno de los dos sin validar.
  const r = await escribirOverride({
    proyectoId: p.proyectoId,
    clave: p.poolClave,
    overrides: fusionar(propios?.overrides ?? {}, p.cambio),
    motivo: `${p.porque} (propuesta del Taller${args.nota ? ` · ${args.nota}` : ''})`,
    autorId: args.autorId,
    // La propuesta viaja hasta la procedencia: es lo que después permite leer
    // "por qué está así" y llegar a la conversación que lo pidió.
    propuestaId: p.id,
  })
  if (!r.ok) {
    return { ok: false, error: r.error ?? r.rechazos?.map((x) => `${x.campo}: ${x.motivo}`).join(' · ') }
  }

  await adm
    .from('fab_propuestas')
    .update({
      estado: 'aplicada',
      decidida_at: new Date().toISOString(),
      decidida_por: args.autorId,
      nota_decision: args.nota ?? null,
      aplicada_automaticamente: args.automatica === true,
    })
    .eq('id', p.id)

  return { ok: true, numero: r.numero }
}

export async function rechazar(args: {
  propuestaId: string
  autorId: string
  nota: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!args.nota?.trim()) {
    return { ok: false, error: 'Rechazar sin decir por qué obliga a adivinar en la siguiente.' }
  }
  const adm = createAdminClient()
  const { data } = await adm
    .from('fab_propuestas')
    .select('veces_rechazada, estado')
    .eq('id', args.propuestaId)
    .maybeSingle()
  const previa = data as unknown as { veces_rechazada: number; estado: string } | null
  if (!previa) return { ok: false, error: 'No se encontró la propuesta.' }

  await adm
    .from('fab_propuestas')
    .update({
      estado: 'rechazada',
      veces_rechazada: (previa.veces_rechazada ?? 0) + 1,
      decidida_at: new Date().toISOString(),
      decidida_por: args.autorId,
      nota_decision: args.nota.trim(),
    })
    .eq('id', args.propuestaId)
  return { ok: true }
}

/** Revertir una propuesta ya aplicada, desde el Taller. */
export async function revertirPropuesta(args: {
  propuestaId: string
  autorId: string
  nota: string
}): Promise<{ ok: boolean; error?: string }> {
  const adm = createAdminClient()
  const { data } = await adm.from('fab_propuestas').select('*').eq('id', args.propuestaId).maybeSingle()
  const p = data ? aPropuesta(data as unknown as Fila) : null
  if (!p) return { ok: false, error: 'No se encontró la propuesta.' }
  if (p.estado !== 'aplicada') return { ok: false, error: `La propuesta está ${p.estado}, no aplicada.` }

  const instalacionId = await idInstalacion(p.proyectoId, p.poolClave)
  if (!instalacionId) return { ok: false, error: 'No se encontró la instalación.' }

  // Se vuelve a la versión inmediatamente anterior a la que aplicó esto.
  const { data: versiones } = await adm
    .from('fab_instalacion_versiones')
    .select('id, numero')
    .eq('instalacion_id', instalacionId)
    .order('numero', { ascending: false })
    .limit(2)
  const lista = (versiones ?? []) as { id: string; numero: number }[]
  if (lista.length < 2) return { ok: false, error: 'No hay una versión anterior a la que volver.' }

  const r = await revertirOverrideA({
    proyectoId: p.proyectoId,
    clave: p.poolClave,
    versionId: lista[1].id,
    motivo: args.nota?.trim() || 'Revertida desde el Taller.',
    autorId: args.autorId,
    propuestaId: p.id,
  })
  if (!r.ok) return { ok: false, error: r.error }

  await adm
    .from('fab_propuestas')
    .update({ estado: 'revertida', nota_decision: args.nota ?? null })
    .eq('id', p.id)
  return { ok: true }
}

/**
 * Expira lo que lleva demasiado esperando.
 *
 * Chequeo perezoso, igual que el resto del proyecto: corre cuando alguien abre
 * el Taller. NO hay un cron: el plan del entorno no da crons finos, y simular
 * que corre solo sería peor que decir cuándo corre.
 */
export async function expirarVencidas(proyectoId: string): Promise<number> {
  const adm = createAdminClient()
  const { data } = await adm
    .from('fab_propuestas')
    .update({ estado: 'expirada', decidida_at: new Date().toISOString() })
    .eq('proyecto_id', proyectoId)
    .eq('estado', 'pendiente')
    .lt('expira_at', new Date().toISOString())
    .select('id')
  return (data ?? []).length
}

/* ── Leer ────────────────────────────────────────────────────────────────── */

export async function listarPropuestas(
  proyectoId: string,
  opciones: { conAdmin?: boolean } = {},
): Promise<Propuesta[]> {
  const sb = opciones.conAdmin ? createAdminClient() : createClient()
  const { data } = await sb
    .from('fab_propuestas')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .order('creada_at', { ascending: false })
    .limit(200)
  return ((data ?? []) as unknown as Fila[]).map(aPropuesta)
}

export interface SaludTaller {
  pendientes: number
  aplicadas: number
  rechazadas: number
  expiradas: number
  prohibidas: number
  /** Horas promedio hasta que alguien decide. */
  horasHastaDecision: number | null
  /**
   * Proporción de lo propuesto que nadie miró. `null` = todavía no hay nada
   * que medir, que NO es lo mismo que 0% ignoradas.
   */
  tasaIgnoradas: number | null
  /** Si sube, el motor hace ruido. */
  alerta: string | null
}

export function salud(propuestas: Propuesta[]): SaludTaller {
  const p = (e: EstadoPropuesta) => propuestas.filter((x) => x.estado === e).length
  const prohibidas = propuestas.filter((x) => x.carril === 'rojo').length
  const decididas = propuestas.filter((x) => x.decididaAt && x.estado !== 'expirada' && x.carril !== 'rojo')
  const horas =
    decididas.length === 0
      ? null
      : decididas.reduce(
          (a, x) => a + (new Date(x.decididaAt!).getTime() - new Date(x.creadaAt).getTime()) / 3_600_000,
          0,
        ) / decididas.length

  // Sin propuestas evaluables no hay tasa: devolver 0 pintaría de "0% ignoradas"
  // —que se lee como salud perfecta— una cola donde nadie propuso nada todavía.
  const evaluables = propuestas.filter((x) => x.carril !== 'rojo').length
  const tasa = evaluables === 0 ? null : p('expirada') / evaluables

  // Si sube la tasa de ignoradas, el motor hace ruido. Eso tiene que verse:
  // una cola que nadie mira no es una cola, es un depósito.
  let alerta: string | null = null
  if (tasa !== null && evaluables >= 5 && tasa > 0.3) {
    alerta = `${Math.round(tasa * 100)}% de lo propuesto expiró sin que nadie lo mirara. O sobran propuestas o falta quien las mire.`
  } else if (horas !== null && horas > 24 * 7) {
    alerta = `Tardan ${Math.round(horas / 24)} días promedio en decidirse.`
  }

  return {
    pendientes: p('pendiente'),
    aplicadas: p('aplicada'),
    rechazadas: p('rechazada'),
    expiradas: p('expirada'),
    prohibidas,
    horasHastaDecision: horas,
    tasaIgnoradas: tasa,
    alerta,
  }
}

/* ── Utilidades ──────────────────────────────────────────────────────────── */

function fusionar(base: Overrides, encima: Overrides): Overrides {
  return {
    ...base,
    ...encima,
    titulos: { ...(base.titulos ?? {}), ...(encima.titulos ?? {}) },
    configurable: { ...(base.configurable ?? {}), ...(encima.configurable ?? {}) },
    dimensiones: { ...(base.dimensiones ?? {}), ...(encima.dimensiones ?? {}) },
    agentes: { ...(base.agentes ?? {}), ...(encima.agentes ?? {}) },
    ocultas: [...new Set([...(base.ocultas ?? []), ...(encima.ocultas ?? [])])],
  }
}

async function idInstalacion(proyectoId: string, clave: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('fab_instalaciones')
    .select('id, pool:fab_pools!inner(clave)')
    .eq('proyecto_id', proyectoId)
    .eq('fab_pools.clave', clave)
    .maybeSingle()
  return (data as unknown as { id: string } | null)?.id ?? null
}

async function estaGobernando(proyectoId: string, clave: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('fab_instalaciones')
    .select('lector, pool:fab_pools!inner(clave)')
    .eq('proyecto_id', proyectoId)
    .eq('fab_pools.clave', clave)
    .maybeSingle()
  return (data as unknown as { lector: string } | null)?.lector === 'prendido'
}
