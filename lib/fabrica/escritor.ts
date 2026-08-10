import { createAdminClient } from '@/lib/supabase/server'
import { MANIFIESTOS } from './manifiestos'
import { validarManifiesto } from './validador'
import {
  camposQueCambian,
  camposQueCambianEnLaPieza,
  registrarProcedencia,
} from './procedencia'
import { versionActual } from './versiones'
import { CAMPOS_DE_INSTALACION } from './clasificacion'
import {
  overridesActuales,
  validarOverrides,
  type Overrides,
  type RechazoOverride,
} from './overrides'
import type { Manifiesto, PantallaDeclarada, ParametroConfigurable } from './tipos'

/**
 * EL ESCRITOR.
 *
 * Lo que faltaba para que la fábrica se pueda arreglar en caliente. Hasta v0.62
 * gobernaba pero no se corregía: el flag apagaba y no arreglaba, que es la peor
 * combinación posible.
 *
 * TRES REGLAS INNEGOCIABLES
 *   1. Nunca se edita una versión en lugar. Cada escritura crea una nueva.
 *   2. La anterior queda intacta y consultable.
 *   3. Motivo obligatorio. Un cambio sin motivo escrito no se entiende seis
 *      meses después, que es exactamente cuando hace falta entenderlo.
 *
 * ESCRIBIR ES MÁS DIFÍCIL QUE LEER. Leer sólo necesita un fallback; escribir
 * necesita saber qué se rompe. Por eso hay cuatro validaciones antes de tocar
 * nada y un diff que se lee en castellano antes de aplicar.
 */

/* ── Qué se puede cambiar hoy ────────────────────────────────────────────── */

/**
 * Sólo presentación y navegación, que es lo único que el lector gobierna.
 *
 * Permitir editar permisos o acciones cuando el lector todavía no los lee sería
 * guardar cambios que no hacen nada — y el día que el lector empiece a leerlos
 * se aplicarían todos juntos, sin que nadie los haya revisado con esa
 * consecuencia en mente.
 */
export interface CambioPropuesto {
  /** ruta → título nuevo. */
  titulos?: Record<string, string>
}

export function aplicarCambio(base: Manifiesto, cambio: CambioPropuesto): Manifiesto {
  const nuevo: Manifiesto = JSON.parse(JSON.stringify(base))
  if (cambio.titulos) {
    nuevo.pantallas = nuevo.pantallas.map((p) =>
      cambio.titulos![p.ruta] !== undefined ? { ...p, titulo: cambio.titulos![p.ruta] } : p,
    )
  }
  return nuevo
}

/* ── El diff, en castellano ──────────────────────────────────────────────── */

export interface LineaDiff {
  /** La frase que lee una persona. */
  texto: string
  /** Qué cuesta deshacerlo. */
  costo: string
  /** true = si sale mal, se arregla con un revert y no se pierde nada. */
  reversibleSinPerdida: boolean
}

/**
 * El diff entre dos manifiestos, en frases.
 *
 * No JSON crudo: quien aprueba un cambio tiene que poder leer qué va a pasar
 * sin traducir mentalmente una estructura de datos. Y el costo de deshacerlo va
 * al lado, porque aprobar rápido sólo es seguro si se sabe qué cuesta deshacer.
 */
export function diffLegible(
  actual: Manifiesto,
  propuesto: Manifiesto,
  contexto: { gobernando: boolean; personasConAcceso: number },
): LineaDiff[] {
  const out: LineaDiff[] = []
  const porRuta = new Map(actual.pantallas.map((p) => [p.ruta, p]))

  for (const p of propuesto.pantallas) {
    const antes = porRuta.get(p.ruta)
    if (!antes) {
      out.push({
        texto: `Se agrega la pantalla ${p.ruta} con el título "${p.titulo}".`,
        costo: 'Deshacerlo la saca de la declaración. La pantalla en sí no se toca.',
        reversibleSinPerdida: true,
      })
      continue
    }
    if (antes.titulo !== p.titulo) {
      out.push({
        texto: describirTitulo(antes, p, contexto),
        costo: contexto.gobernando
          ? 'Deshacerlo la devuelve al título anterior en la request siguiente. No se pierde nada.'
          : 'El pool no está gobernado: el cambio queda declarado y todavía no se ve en ningún lado.',
        reversibleSinPerdida: true,
      })
    }
  }

  /* ── Los parámetros ────────────────────────────────────────────────── */
  //
  // Hasta v0.69 el diff sólo miraba pantallas, así que una propuesta que
  // cambiaba un parámetro llegaba a la cola con `queCambia: []` y costo "No
  // cambia nada." — sobre un cambio que altera el COMPORTAMIENTO del sistema.
  // Es la peor versión del cero mentiroso: no dice que hay poco, dice que no
  // hay nada, sobre lo único que sí cambia lo que el sistema hace.
  const confAntes = new Map((actual.configurable ?? []).map((c) => [c.clave, c]))
  for (const c of propuesto.configurable ?? []) {
    const x = confAntes.get(c.clave)
    if (!x || JSON.stringify(x.default) === JSON.stringify(c.default)) continue
    out.push({
      texto: describirParametro(x, c, contexto),
      costo: costoDeParametro(c, contexto),
      // Un parámetro se deshace volviendo el valor, pero lo que el sistema hizo
      // MIENTRAS estuvo puesto no se deshace solo. Ver `costoDeParametro`.
      reversibleSinPerdida: true,
    })
  }

  for (const [ruta, p] of porRuta) {
    if (!propuesto.pantallas.some((x) => x.ruta === ruta)) {
      out.push({
        texto: `Se quita de la declaración la pantalla ${ruta} ("${p.titulo}").`,
        costo: contexto.gobernando
          ? 'Mientras no esté declarada, la pantalla vuelve a usar el título de su código. No se rompe.'
          : 'El pool no está gobernado: no cambia nada visible.',
        reversibleSinPerdida: true,
      })
    }
  }

  return out
}

/**
 * Qué cambia cuando cambia un parámetro, en una frase que se lea antes de
 * firmar.
 *
 * Dice el valor con su unidad —"7 días", no "7"—, DÓNDE se usa, y si el
 * cableado está completo. Lo último importa más de lo que parece: aprobar un
 * cambio sobre un parámetro cableado a medias es aprobar que el sistema se
 * comporte de dos maneras distintas al mismo tiempo, y quien firma tiene que
 * saberlo antes y no después.
 */
function describirParametro(
  antes: ParametroConfigurable,
  ahora: ParametroConfigurable,
  contexto: { gobernando: boolean; personasConAcceso: number },
): string {
  const u = ahora.unidad ? ` ${ahora.unidad}` : ''
  const deps = ahora.depende_de ?? []
  const cableados = deps.filter((d) => d.via !== 'literal')
  const literales = deps.filter((d) => d.via === 'literal')

  const donde =
    deps.length === 0
      ? ' El manifiesto no dice dónde se usa, así que NO se puede estimar el efecto.'
      : literales.length === 0
        ? ` Se usa en ${deps.length} lugar(es), todos gobernados: ${deps.map((d) => d.donde).join(', ')}.`
        : ` Se usa en ${deps.length} lugar(es) y ${literales.length} todavía usa(n) un valor fijo ` +
          `(${literales.map((d) => d.donde).join(', ')}): el cambio va a regir en ${cableados.length} y no en ${literales.length}.`

  const quien = contexto.gobernando
    ? ` Lo ven ${contexto.personasConAcceso} persona(s) con acceso al sector.`
    : ' Todavía no lo ve nadie: el pool no está gobernado.'

  return `${ahora.etiqueta} pasa de ${JSON.stringify(antes.default)}${u} a ${JSON.stringify(ahora.default)}${u}.${donde}${quien}`
}

/**
 * Qué cuesta deshacer un cambio de parámetro.
 *
 * El valor vuelve con un revert, como un título. Lo que NO vuelve es lo que el
 * sistema hizo mientras el valor estuvo puesto: una tarea creada, un aviso
 * mandado, un renglón asociado solo. Eso hay que decirlo, porque "se deshace
 * con un revert" a secas es una promesa que no se cumple.
 */
function costoDeParametro(
  p: ParametroConfigurable,
  contexto: { gobernando: boolean },
): string {
  if (!contexto.gobernando) {
    return 'El pool no está gobernado: el cambio queda declarado y todavía no se ve.'
  }
  const efectos = (p.depende_de ?? []).map((d) => d.efecto ?? '').join(' ')
  const dejaRastro = /avis|tarea|notific|asoci|crea/i.test(efectos)
  return dejaRastro
    ? 'El valor vuelve con un revert en la request siguiente. Lo que el sistema haya hecho mientras tanto —avisos, tareas, asociaciones— NO se deshace solo.'
    : 'El valor vuelve con un revert en la request siguiente. No se pierde nada.'
}

function describirTitulo(
  antes: PantallaDeclarada,
  ahora: PantallaDeclarada,
  contexto: { gobernando: boolean; personasConAcceso: number },
): string {
  const quien =
    contexto.personasConAcceso === 1
      ? 'Lo ve 1 persona con acceso'
      : `Lo ven ${contexto.personasConAcceso} personas con acceso`
  const cola = contexto.gobernando ? ` ${quien} al sector.` : ' Todavía no lo ve nadie: el pool no está gobernado.'
  return `El título de ${antes.ruta} pasa de "${antes.titulo}" a "${ahora.titulo}".${cola}`
}

/* ── Las cuatro validaciones ─────────────────────────────────────────────── */

export interface Rechazo {
  paso: 1 | 2 | 3 | 4
  motivo: string
}

/**
 * Se corren en orden y si falla cualquiera NO se escribe.
 *
 * El orden no es casual: primero lo que hace al manifiesto inválido, después lo
 * que rompe la constitución, después lo que rompe a otros pools, y al final lo
 * que rompe la pantalla de alguien que está mirándola ahora.
 */
export async function validarAntesDeEscribir(
  clave: string,
  propuesto: Manifiesto,
  gobernando: boolean,
): Promise<Rechazo[]> {
  const rechazos: Rechazo[] = []

  // 1 · ¿valida contra el esquema vigente?
  const errores = validarManifiesto(propuesto).filter((p) => p.gravedad === 'error')
  for (const e of errores) {
    rechazos.push({ paso: 1, motivo: `${e.campo}: ${e.mensaje}` })
  }

  // 2 · ¿marca como modificable algo constitucional?
  // El validador ya lo cubre, pero se comprueba aparte para poder decirlo con
  // sus palabras: "esto no se toca" no es lo mismo que "el campo está mal".
  for (const c of propuesto.constitucional ?? []) {
    if ((c as { modificable?: unknown }).modificable === true) {
      rechazos.push({
        paso: 2,
        motivo: `"${c.elemento}" está protegido por el límite ${c.limite} y no se puede marcar modificable.`,
      })
    }
  }

  // 3 · ¿rompe dependencias declaradas de otros pools?
  // Si otro pool dice que lee una entidad de éste, no se la puede sacar sin
  // avisarle: el otro se quedaría leyendo algo que ya nadie declara.
  const propias = new Set(
    propuesto.entidades.filter((e) => e.acceso === 'propia').map((e) => e.tabla),
  )
  for (const [otraClave, otra] of Object.entries(MANIFIESTOS)) {
    if (otraClave === clave) continue
    for (const e of otra.manifiesto.entidades) {
      if (e.dueno === clave && !propias.has(e.tabla)) {
        rechazos.push({
          paso: 3,
          motivo: `"${otraClave}" declara que ${e.tabla} es de este pool, y la propuesta ya no la declara propia.`,
        })
      }
    }
    if (otra.manifiesto.depende_de.includes(clave) && propuesto.entidades.length === 0) {
      rechazos.push({ paso: 3, motivo: `"${otraClave}" depende de este pool y la propuesta lo deja vacío.` })
    }
  }

  // 4 · si está gobernando, ¿deja alguna pantalla sin título?
  // Con el pool apagado un título vacío es un dato feo; con el pool prendido es
  // una cabecera en blanco en la cara de alguien.
  if (gobernando) {
    for (const p of propuesto.pantallas) {
      if (p.titulo_dinamico) continue
      if (!p.titulo || !p.titulo.trim()) {
        rechazos.push({ paso: 4, motivo: `La pantalla ${p.ruta} quedaría sin título y el pool está gobernando.` })
      }
    }
    for (const a of propuesto.acciones) {
      if (!a.descripcion?.trim()) {
        rechazos.push({ paso: 4, motivo: `La acción ${a.clave} quedaría sin descripción.` })
      }
    }
  }

  return rechazos
}

/* ── Escribir ────────────────────────────────────────────────────────────── */

export interface ResultadoEscritura {
  ok: boolean
  versionId?: string
  numero?: number
  rechazos?: Rechazo[]
  error?: string
}

/**
 * Crea una versión nueva y la deja como actual.
 *
 * La transacción vive en `fab_escribir_version` (migración 0098): bajar la
 * anterior, insertar la nueva y apuntar la instalación tienen que pasar juntos
 * o no pasar.
 */
export async function escribirVersion(args: {
  clave: string
  manifiesto: Manifiesto
  motivo: string
  autorId: string
  gobernando: boolean
  /** Si nace de un revert, a qué versión vuelve. */
  revierteA?: string
  /** La propuesta que lo originó, si vino de una. */
  propuestaId?: string
}): Promise<ResultadoEscritura> {
  if (!args.motivo?.trim()) {
    return { ok: false, error: 'Hace falta escribir por qué se hace este cambio.' }
  }

  const rechazos = await validarAntesDeEscribir(args.clave, args.manifiesto, args.gobernando)
  if (rechazos.length > 0) return { ok: false, rechazos }

  const adm = createAdminClient()
  const { data: pool } = await adm
    .from('fab_pools')
    .select('id')
    .eq('clave', args.clave)
    .maybeSingle()
  if (!pool) return { ok: false, error: 'No existe ese pool.' }

  // Se lee ANTES de escribir: después ya no está, y sin el valor anterior la
  // procedencia dice qué quedó pero no qué se cambió.
  const previa = await versionActual(args.clave)

  const { data, error } = await adm.rpc('fab_escribir_version', {
    p_pool_id: (pool as { id: string }).id,
    p_manifiesto: args.manifiesto as unknown as Record<string, unknown>,
    p_motivo: args.motivo.trim(),
    p_autor: args.autorId,
    p_revierte_a: args.revierteA ?? null,
  })

  if (error || !data) {
    return { ok: false, error: 'No se pudo guardar la versión. No se cambió nada.' }
  }

  const nueva = await versionActual(args.clave)

  // LA PROCEDENCIA SE ESCRIBE ACÁ Y EN NINGÚN OTRO LADO, porque el escritor es
  // el único camino por el que se escribe una declaración. Si se registrara en
  // el llamador, cada llamador nuevo sería una fuente de valores sin historia.
  await registrarProcedencia({
    nivel: 'pool',
    poolClave: args.clave,
    cambios: previa ? camposQueCambianEnLaPieza(previa.manifiesto, args.manifiesto) : [],
    motivo: args.motivo.trim(),
    versionId: String(data),
    propuestaId: args.propuestaId ?? null,
    esReversion: !!args.revierteA,
    autorId: args.autorId,
  })

  return { ok: true, versionId: String(data), numero: nueva?.numero }
}

/**
 * Revertir a una versión anterior.
 *
 * CREA UNA VERSIÓN NUEVA con el contenido de la vieja. No borra ni reescribe
 * historia: si revertir borrara la versión mala, se pierde el registro de que
 * existió y de qué rompió — que es justo lo que hay que mirar después.
 */
export async function revertirA(args: {
  clave: string
  versionId: string
  motivo: string
  autorId: string
  gobernando: boolean
}): Promise<ResultadoEscritura> {
  const adm = createAdminClient()
  const { data: destino } = await adm
    .from('fab_pool_versiones')
    .select('id, numero, manifiesto')
    .eq('id', args.versionId)
    .maybeSingle()

  const v = destino as unknown as { id: string; numero: number; manifiesto: Manifiesto } | null
  if (!v) return { ok: false, error: 'No se encontró esa versión.' }

  return escribirVersion({
    clave: args.clave,
    manifiesto: v.manifiesto,
    motivo: args.motivo?.trim() || `Vuelve a la versión ${v.numero}.`,
    autorId: args.autorId,
    gobernando: args.gobernando,
    revierteA: v.id,
  })
}

/* ── Cuánta gente ve el cambio ───────────────────────────────────────────── */

/**
 * Cuántas personas del panel pueden ver las pantallas de un pool.
 *
 * Se calcula de verdad —contra los permisos reales de cada usuario— y no se
 * estima. "Lo ven 4 personas" y "lo ven 40" son decisiones distintas, y quien
 * aprueba tiene derecho a saber cuál de las dos está tomando.
 *
 * Importa del núcleo de Social Ahorro, que es la dirección permitida.
 */
export async function personasQueLoVen(manifiesto: Manifiesto): Promise<number> {
  try {
    const { puede } = await import('@/lib/types/permisos')
    const adm = createAdminClient()
    const { data } = await adm
      .from('users_admin')
      .select('rol, permisos_custom')
      .eq('activo', true)

    const usuarios = (data ?? []) as { rol: string; permisos_custom: unknown }[]
    const modulos = manifiesto.permisos.map((p) => p.modulo)
    if (modulos.length === 0) return usuarios.length

    return usuarios.filter((u) =>
      modulos.some((m) =>
        puede(
          u.rol as Parameters<typeof puede>[0],
          u.permisos_custom as Parameters<typeof puede>[1],
          m as Parameters<typeof puede>[2],
          'ver',
        ),
      ),
    ).length
  } catch {
    // Si no se puede contar, se dice que no se sabe en vez de inventar un número.
    return 0
  }
}

/* ── Escribir en el nivel de la instalación ──────────────────────────────── */

/**
 * Un cambio de instalación NO es un cambio de pool.
 *
 * Cambiar un título creaba una versión del pool, y eso está mal: el pool es la
 * pieza compartida y un título es de este negocio. Desde v0.64 cada nivel tiene
 * su propia línea de versiones, con las mismas reglas.
 */
export async function escribirOverride(args: {
  proyectoId: string
  clave: string
  overrides: Overrides
  motivo: string
  /** NULL cuando la escribió el carril verde: no hubo persona detrás. */
  autorId: string | null
  revierteA?: string
  /** La propuesta que lo originó, si vino de una. */
  propuestaId?: string
}): Promise<{ ok: boolean; numero?: number; rechazos?: RechazoOverride[]; error?: string }> {
  if (!args.motivo?.trim()) {
    return { ok: false, error: 'Hace falta escribir por qué se hace este cambio.' }
  }

  const adm = createAdminClient()
  const { data: inst } = await adm
    .from('fab_instalaciones')
    .select('id, pool:fab_pools!inner(clave)')
    .eq('proyecto_id', args.proyectoId)
    .eq('fab_pools.clave', args.clave)
    .maybeSingle()
  const instalacion = inst as unknown as { id: string } | null
  if (!instalacion) return { ok: false, error: 'Ese pool no está instalado en este proyecto.' }

  const delPool = await versionActual(args.clave)
  if (!delPool) return { ok: false, error: 'La pieza no tiene una versión actual.' }

  const rechazos = validarOverrides(delPool.manifiesto, args.overrides)
  if (rechazos.length > 0) return { ok: false, rechazos }

  const previos = await overridesActuales(instalacion.id)

  const { error } = await adm.rpc('fab_escribir_override', {
    p_instalacion_id: instalacion.id,
    p_overrides: args.overrides as unknown as Record<string, unknown>,
    p_motivo: args.motivo.trim(),
    p_autor: args.autorId,
    p_revierte_a: args.revierteA ?? null,
  })
  if (error) return { ok: false, error: 'No se pudo guardar. No se cambió nada.' }

  const nueva = await overridesActuales(instalacion.id)

  await registrarProcedencia({
    nivel: 'instalacion',
    poolClave: args.clave,
    proyectoId: args.proyectoId,
    cambios: camposQueCambian(previos?.overrides ?? null, args.overrides),
    motivo: args.motivo.trim(),
    versionId: nueva?.id ?? null,
    propuestaId: args.propuestaId ?? null,
    esReversion: !!args.revierteA,
    autorId: args.autorId,
  })

  return { ok: true, numero: nueva?.numero }
}

/**
 * Rechaza un cambio de pool hecho desde el contexto de un proyecto.
 *
 * Es la regla que impide que "configurar" se convierta en "bifurcar". Alguien
 * parado en un proyecto puede cambiar lo suyo; para cambiar la PIEZA hay que
 * estar parado en el catálogo, y eso es una decisión distinta con otras
 * consecuencias — la toman todos los proyectos que la instalaron.
 */
export function rechazarSiEsDelPool(campos: string[]): { ok: boolean; motivo?: string } {
  const delPool = campos.filter((c) => !CAMPOS_DE_INSTALACION.has(c))
  if (delPool.length === 0) return { ok: true }
  return {
    ok: false,
    motivo:
      `${delPool.join(', ')} ${delPool.length === 1 ? 'es de la pieza' : 'son de la pieza'} y no de este proyecto. ` +
      'Cambiarlo desde acá lo cambiaría para todos los proyectos que la instalaron.',
  }
}

export async function revertirOverrideA(args: {
  proyectoId: string
  clave: string
  versionId: string
  motivo: string
  autorId: string
  propuestaId?: string
}): Promise<{ ok: boolean; numero?: number; error?: string }> {
  const adm = createAdminClient()
  const { data } = await adm
    .from('fab_instalacion_versiones')
    .select('id, numero, overrides')
    .eq('id', args.versionId)
    .maybeSingle()
  const v = data as unknown as { id: string; numero: number; overrides: Overrides } | null
  if (!v) return { ok: false, error: 'No se encontró esa versión.' }

  const r = await escribirOverride({
    proyectoId: args.proyectoId,
    clave: args.clave,
    overrides: v.overrides,
    motivo: args.motivo?.trim() || `Vuelve a la versión ${v.numero} de la instalación.`,
    autorId: args.autorId,
    revierteA: v.id,
    propuestaId: args.propuestaId,
  })
  return { ok: r.ok, numero: r.numero, error: r.error ?? r.rechazos?.map((x) => x.motivo).join(' · ') }
}
