/**
 * Tipos de la FÁBRICA NORA.
 *
 * Vocabulario NEUTRO a propósito: proyecto, pool, entidad, acción, molde,
 * tercero, item. Nada de vocabulario de farmacia acá adentro — el día que la
 * fábrica arme un taller mecánico, este archivo no se toca.
 *
 * FRONTERA: la fábrica puede importar del núcleo de Social Ahorro. Nada de
 * Social Ahorro importa de acá.
 */

export type RolFabrica = 'dueño_fabrica' | 'armador' | 'observador'

export type EstadoProyecto = 'alta' | 'armando' | 'operando' | 'pausado'

export type CategoriaPool = 'nucleo' | 'generico' | 'vertical'
export type EstadoPool = 'borrador' | 'declarado' | 'estable' | 'deprecado'

export type EstadoVersion = 'borrador' | 'publicada' | 'deprecada'
export type ModoVersion = 'espejo' | 'generado'

export type EstadoInstalacion = 'declarada' | 'activa' | 'pausada' | 'desinstalada'

export type ClasificacionSector =
  | 'nucleo'
  | 'generico'
  | 'vertical'
  | 'a_medida'
  | 'incompleto'

export type Completitud = 'completo' | 'a_medias' | 'placeholder'

export interface Proyecto {
  id: string
  nombre: string
  slug: string
  rubro: string | null
  descripcion: string | null
  estado: EstadoProyecto
  fecha_alta: string
  configuracion: Record<string, unknown>
  notas: string | null
}

export interface MiembroProyecto {
  id: string
  proyecto_id: string
  usuario_id: string
  rol: RolFabrica
  created_at: string
}

export interface Pool {
  id: string
  clave: string
  nombre: string
  descripcion: string | null
  categoria: CategoriaPool
  estado: EstadoPool
  depende_de: string[]
  rubros: string[]
  origen_proyecto_id: string | null
  notas: string | null
}

export interface PoolVersion {
  id: string
  pool_id: string
  version: string
  manifiesto: Manifiesto
  estado: EstadoVersion
  modo: ModoVersion
  notas_cambio: string | null
  publicada_at: string | null
}

export interface Instalacion {
  id: string
  proyecto_id: string
  pool_id: string
  version_id: string
  estado: EstadoInstalacion
  configuracion: Record<string, unknown>
  instalada_at: string | null
  notas: string | null
}

export interface SectorCenso {
  id: string
  proyecto_id: string
  clave: string
  nombre: string
  ruta_base: string | null
  completitud: Completitud
  clasificacion: ClasificacionSector
  entidades_propias: string[]
  entidades_leidas: string[]
  pantallas: number
  moldes: Record<string, number>
  acciones_chat: number
  permisos: string[]
  depende_de: string[]
  tiene_datos: boolean
  notas: string | null
}

/* ── El manifiesto ───────────────────────────────────────────────────────── */

/**
 * La declaración de una pieza como DATO.
 *
 * No se valida en SQL a propósito: congelar la forma del manifiesto en un check
 * de Postgres antes de saber cuál es la forma correcta cuesta una migración por
 * cada cambio de idea. La validación vive acá, donde evoluciona barato.
 */
export interface Manifiesto {
  /** Versión del formato del manifiesto, no del pool. */
  formato: string
  pool: string
  nombre: string
  descripcion?: string
  entidades: EntidadDeclarada[]
  pantallas: PantallaDeclarada[]
  acciones: AccionDeclarada[]
  permisos: string[]
  /** Claves de otros pools necesarios. */
  depende_de: string[]
  /** Lo que cambia entre proyectos sin cambiar la pieza. */
  configurable?: ParametroConfigurable[]
}

export interface EntidadDeclarada {
  /** Nombre de la tabla. */
  tabla: string
  /** Qué es, en una línea, para una persona. */
  rol: string
  /** propia = el pool la escribe. leida = solo la consulta. */
  acceso: 'propia' | 'leida'
}

/** Los cinco moldes previstos más los cuatro que salieron del censo. */
export type Molde =
  | 'lista_maestra'
  | 'ficha'
  | 'tablero'
  | 'bandeja'
  | 'wizard'
  | 'chat'
  | 'formulario'
  | 'feed'
  | 'calendario'
  | 'otro'

export interface PantallaDeclarada {
  ruta: string
  titulo: string
  molde: Molde
  /** Permiso que la habilita. Vacío = cualquiera del proyecto. */
  permiso?: string
  /**
   * propia   = el pool es dueño de la pantalla y se la lleva al instalarse.
   * prestada = el menú del pool la navega, pero pertenece a otro pool.
   *
   * La distinción existe porque sin ella un pool absorbe pantallas ajenas cada
   * vez que el menú apunta afuera, y al instalarlo en otro proyecto se arrastra
   * software que no le corresponde.
   */
  pertenencia?: 'propia' | 'prestada'
  /**
   * ¿Se llega desde el menú del sector? Las fichas de detalle no (se llega
   * desde una lista) y eso es normal. Una pantalla de primer nivel con
   * `navegable: false` es un hallazgo: existe y no hay cómo llegar.
   */
  navegable?: boolean
}

export interface AccionDeclarada {
  clave: string
  titulo: string
  /** Qué hace, en una línea. Es lo que leería una persona antes de confirmar. */
  descripcion: string
  /** true = NORA la propone y un humano confirma. */
  requiere_confirmacion: boolean
}

export interface ParametroConfigurable {
  clave: string
  etiqueta: string
  tipo: 'texto' | 'numero' | 'booleano' | 'lista'
  default?: unknown
}

/* ── Comparador declaración ↔ código ─────────────────────────────────────── */

export type TipoDiferencia = 'entidad' | 'pantalla' | 'accion' | 'permiso'

export interface Diferencia {
  tipo: TipoDiferencia
  elemento: string
  /** Dónde aparece y dónde falta. */
  en_declaracion: boolean
  en_codigo: boolean
  nota?: string
}

export interface ResultadoVerificacion {
  resultado: 'coincide' | 'difiere' | 'error'
  diferencias: Diferencia[]
  faltan_en_codigo: number
  faltan_en_declaracion: number
  resumen: string
}

/* ── Etiquetas para pantalla ─────────────────────────────────────────────── */

export const ETIQUETA_CLASIFICACION: Record<ClasificacionSector, string> = {
  nucleo: 'Núcleo',
  generico: 'Genérico',
  vertical: 'Vertical',
  a_medida: 'A medida',
  incompleto: 'Incompleto',
}

export const ETIQUETA_CATEGORIA: Record<CategoriaPool, string> = {
  nucleo: 'Núcleo',
  generico: 'Genérico',
  vertical: 'Vertical',
}

export const ETIQUETA_MOLDE: Record<Molde, string> = {
  lista_maestra: 'Lista maestra',
  ficha: 'Ficha',
  tablero: 'Tablero',
  bandeja: 'Bandeja',
  wizard: 'Wizard',
  chat: 'Chat',
  formulario: 'Formulario',
  feed: 'Feed',
  calendario: 'Calendario',
  otro: 'Sin molde',
}

export const ETIQUETA_ROL: Record<RolFabrica, string> = {
  'dueño_fabrica': 'Dueño de la fábrica',
  armador: 'Armador',
  observador: 'Observador',
}
