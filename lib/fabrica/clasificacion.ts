/**
 * QUÉ ES DEL POOL Y QUÉ ES DE LA INSTALACIÓN.
 *
 * La pregunta que resuelve cada caso es una sola:
 *
 *   "Si dos negocios instalan esta misma pieza, ¿querrían este campo distinto
 *    SIN que deje de ser la misma pieza?"
 *
 *   Sí → instalación.  No → pool.
 *
 * El pool siempre lleva el valor por defecto. "De la instalación" quiere decir
 * que se puede sobrescribir por proyecto, no que el pool no lo declare.
 *
 * Esta clasificación existe como CÓDIGO y no sólo como documento porque el
 * escritor la consulta para rechazar un cambio de pool hecho desde el contexto
 * de un proyecto. Un documento no rechaza nada.
 */

export type Nivel = 'pool' | 'instalacion'

export interface CampoClasificado {
  campo: string
  nivel: Nivel
  /** Por qué. Se lee cuando alguien discute la clasificación. */
  motivo: string
  /** true = costó decidirlo. Se reporta aparte. */
  fueAmbiguo?: boolean
}

export const CLASIFICACION: CampoClasificado[] = [
  /* ── Identidad de la pieza ─────────────────────────────────────────── */
  { campo: 'formato', nivel: 'pool', motivo: 'La versión del esquema es del formato, no del negocio.' },
  { campo: 'pool', nivel: 'pool', motivo: 'La clave identifica la pieza en el catálogo.' },
  {
    campo: 'nombre',
    nivel: 'instalacion',
    fueAmbiguo: true,
    motivo:
      'El catálogo necesita un nombre y el pool lo trae, pero un negocio puede llamarle "Depósito" a lo que otro llama "Stock" sin que deje de ser la misma pieza. El pool pone el default, el proyecto lo pisa.',
  },
  {
    campo: 'descripcion',
    nivel: 'instalacion',
    fueAmbiguo: true,
    motivo: 'Mismo caso que el nombre: describe cómo lo usa este negocio.',
  },
  { campo: 'categoria', nivel: 'pool', motivo: 'Que sea núcleo o genérico es una propiedad de la pieza.' },
  {
    campo: 'desinstalable',
    nivel: 'pool',
    motivo: 'Si medio sistema le cuelga entidades, sacarlo no es una opción que el proyecto pueda tomar.',
  },
  { campo: 'alcance', nivel: 'pool', motivo: 'Que sea por punto o global es estructura, no preferencia.' },

  /* ── Estructura ────────────────────────────────────────────────────── */
  {
    campo: 'entidades',
    nivel: 'pool',
    motivo: 'Las tablas, quién es dueño y quién escribe son LA pieza. Cambiarlas es cambiar de pieza.',
  },
  {
    campo: 'pantallas[].ruta',
    nivel: 'pool',
    motivo: 'La ruta la define el código de la pieza. Un proyecto no la mueve.',
  },
  {
    campo: 'pantallas[].titulo',
    nivel: 'instalacion',
    motivo:
      'EL CAMPO QUE ORIGINÓ ESTA SESIÓN. "Transferencias entre sucursales" es el texto de ESTE proyecto; otro querría el suyo. Vivía en la pieza compartida y cambiarlo en un proyecto se lo cambiaba al otro.',
  },
  {
    campo: 'pantallas[].vocabulario',
    nivel: 'instalacion',
    motivo:
      'Cómo le dice ESTE equipo a una pantalla. Es lo más de instalación que hay: no corrige nada de la pieza, no viaja a otro negocio, y el término del oficio queda intacto abajo. Es la mitad legítima de lo que hasta 1.4.0 se hacía pisando el título.',
  },
  {
    campo: 'pantallas[].molde',
    nivel: 'pool',
    fueAmbiguo: true,
    motivo:
      'Tentaba ponerlo en instalación —"acá la queremos como tablero"— pero el molde define cómo se construye la pantalla. Cambiarlo no es configurar: es pedir otra pantalla.',
  },
  {
    campo: 'pantallas[].permiso',
    nivel: 'pool',
    fueAmbiguo: true,
    motivo:
      'Quién puede ver qué toca la constitución. Si cada proyecto pudiera reasignar permisos por configuración, el límite de umbrales_y_permisos deja de existir.',
  },
  {
    campo: 'pantallas[].navegable',
    nivel: 'instalacion',
    motivo: 'Qué aparece en el menú de este negocio. No cambia lo que la pieza sabe hacer.',
  },
  {
    campo: 'pantallas[].titulo_dinamico',
    nivel: 'pool',
    motivo: 'Que el título salga de los datos es un hecho del código de la pantalla, igual en todos lados.',
  },

  /* ── Acciones y permisos ───────────────────────────────────────────── */
  {
    campo: 'acciones',
    nivel: 'pool',
    motivo: 'Qué sabe hacer el asistente es la pieza. Un proyecto no inventa herramientas nuevas por configuración.',
  },
  {
    campo: 'permisos',
    nivel: 'pool',
    motivo: 'Qué permisos exige la pieza para funcionar. Aflojarlo por proyecto es aflojar un control.',
  },

  /* ── Relaciones ────────────────────────────────────────────────────── */
  { campo: 'depende_de', nivel: 'pool', motivo: 'De qué otras piezas depende es estructura del catálogo.' },
  { campo: 'usado_por', nivel: 'pool', motivo: 'La relación inversa de la anterior.' },
  { campo: 'usado_por_todos', nivel: 'pool', motivo: 'Ídem.' },
  { campo: 'subapp', nivel: 'pool', motivo: 'Si la pieza es navegable o vive dentro de otra, lo define su código.' },

  /* ── Constitución ──────────────────────────────────────────────────── */
  {
    campo: 'constitucional',
    nivel: 'pool',
    motivo:
      'Un límite que cada proyecto pudiera aflojar no es un límite. Es la razón entera por la que el campo existe.',
  },

  /* ── Configuración ─────────────────────────────────────────────────── */
  {
    campo: 'configurable[].clave / etiqueta / tipo',
    nivel: 'pool',
    motivo: 'Qué se puede configurar lo define la pieza.',
  },
  {
    campo: 'configurable → valores',
    nivel: 'instalacion',
    motivo: 'Para qué otra cosa existiría un parámetro configurable.',
  },
  {
    campo: 'dimensiones[].clave / columnas',
    nivel: 'pool',
    motivo: 'Que el sector se parta por una dimensión es estructura.',
  },
  {
    campo: 'dimensiones → valores',
    nivel: 'instalacion',
    fueAmbiguo: true,
    motivo:
      'Los rubros concretos son de este negocio: una farmacia tiene farmacia/perfumería/supermercado y una ferretería tendría otros. Que la dimensión EXISTA es del pool; cuáles son sus valores, del proyecto.',
  },

  /* ── Agentes ───────────────────────────────────────────────────────── */
  {
    campo: 'agentes[].clave / nombre / trabajo / capacidades',
    nivel: 'pool',
    motivo: 'Qué agente aporta la pieza y qué sabe hacer.',
  },
  {
    campo: 'agentes[].necesita',
    nivel: 'pool',
    motivo: 'Qué datos precisa para funcionar es del agente, no del negocio que lo contrata.',
  },
  {
    campo: 'agentes[].acciones[].participacion',
    nivel: 'instalacion',
    motivo:
      'Un negocio puede tener al agente en `sugiere` y otro en `prepara`, según su confianza y su evidencia. PERO sólo hacia abajo: la instalación puede ser más conservadora que el pool, nunca más audaz, y un `nunca` no se mueve.',
  },
  {
    campo: 'agentes[].acciones[].brecha',
    nivel: 'instalacion',
    motivo:
      'Es un hecho sobre un sistema real —"este cron manda sin confirmación"— no sobre la pieza. Otro proyecto puede tener la misma pieza sin la brecha.',
  },
  {
    campo: 'agentes[].acciones[].motivo / reversible / toca_dinero / compromete_tercero',
    nivel: 'pool',
    motivo: 'Son propiedades de la acción, iguales en todos lados. Si un mail no se des-envía acá, tampoco allá.',
  },
  {
    campo: 'agentes[].permisos',
    nivel: 'pool',
    motivo: 'El techo de permisos del agente sale de la constitución de la pieza.',
  },

  /* ── Otros ─────────────────────────────────────────────────────────── */
  {
    campo: 'deprecadas',
    nivel: 'pool',
    fueAmbiguo: true,
    motivo:
      'Duda razonable: una tabla puede estar deprecada acá y viva allá. Pero deprecar es una decisión sobre la PIEZA —dejó de usarse y se va a borrar— y si cada proyecto decidiera por su cuenta, la pieza no tendría una historia sino diecisiete.',
  },
]

/** Los campos que un proyecto puede sobrescribir. */
export const CAMPOS_DE_INSTALACION = new Set(
  CLASIFICACION.filter((c) => c.nivel === 'instalacion').map((c) => c.campo),
)

export const AMBIGUOS = CLASIFICACION.filter((c) => c.fueAmbiguo)

/**
 * Cuánta autonomía tiene cada nivel de participación.
 *
 * Sirve para una regla concreta: la instalación puede BAJAR el nivel de una
 * acción, nunca subirlo. Un negocio con menos evidencia puede ser más
 * conservador que la pieza; ninguno puede ser más audaz que ella.
 */
export const AUTONOMIA: Record<string, number> = {
  nunca: -1,
  sugiere: 1,
  prepara: 2,
  informa: 3,
  hace_y_avisa: 4,
}

/** `nunca` no se mueve por configuración: es constitucional. */
export function puedeBajarA(delPool: string, deLaInstalacion: string): { ok: boolean; motivo?: string } {
  if (delPool === 'nunca') {
    return { ok: false, motivo: 'La pieza declara esta acción como `nunca`. Ningún proyecto la habilita.' }
  }
  const a = AUTONOMIA[delPool]
  const b = AUTONOMIA[deLaInstalacion]
  if (a === undefined || b === undefined) return { ok: false, motivo: 'Nivel de participación desconocido.' }
  if (b === -1) return { ok: true } // bajar a `nunca` siempre se puede
  if (b > a) {
    return {
      ok: false,
      motivo: `La pieza la declara en "${delPool}" y el proyecto pide "${deLaInstalacion}": una instalación puede ser más conservadora que la pieza, nunca más audaz.`,
    }
  }
  return { ok: true }
}
