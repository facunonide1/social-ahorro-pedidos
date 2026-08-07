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
  /** nucleo | generico | vertical. Va acá para que el manifiesto se explique solo. */
  categoria: CategoriaPool
  /**
   * false = pool de núcleo: no se desinstala. Es una propiedad del pool, no del
   * proyecto: si medio sistema le cuelga entidades, sacarlo no es una opción
   * que el proyecto pueda tomar.
   */
  desinstalable: boolean
  /**
   * global      = una sola instancia para todo el proyecto
   * por_sucursal = cada punto tiene lo suyo y no ve lo del otro
   * mixto       = hay entidades de las dos clases (se aclara por entidad)
   */
  alcance: 'global' | 'por_sucursal' | 'mixto'

  entidades: EntidadDeclarada[]
  pantallas: PantallaDeclarada[]
  acciones: AccionDeclarada[]
  permisos: PermisoDeclarado[]
  /** Claves de otros pools necesarios. */
  depende_de: string[]
  /**
   * Claves de pools que necesitan a éste. Es la relación inversa de depende_de.
   *
   * Está declarada y no derivada porque un pool de núcleo tiene que poder decir
   * solo quién lo usa, sin cargar el catálogo entero. El riesgo obvio es que se
   * desincronice, así que el validador la contrasta contra el depende_de de los
   * demás manifiestos y falla si no coinciden. Declarada Y verificada.
   */
  usado_por?: string[]
  /** Lo que cambia entre proyectos sin cambiar la pieza. */
  configurable?: ParametroConfigurable[]
  /** Los agentes que este pool aporta. Vacío es una respuesta válida. */
  agentes?: AgenteDeclarado[]
}

/**
 * Permiso con grano fino.
 *
 * Antes era un `string[]` con el módulo solo, que alcanzaba para Ofertas y se
 * quedó corto en cuanto apareció un sector con datos de personas: ahí "ve o no
 * ve" no es la pregunta — la pregunta es quién puede exportar y quién puede
 * borrar.
 */
export interface PermisoDeclarado {
  modulo: string
  /** ver | crear | editar | aprobar | eliminar */
  acciones: string[]
}

export interface EntidadDeclarada {
  /** Nombre de la tabla. */
  tabla: string
  /** Qué es, en una línea, para una persona. */
  rol: string
  /** propia = este pool es el DUEÑO. leida = la consulta y no la escribe. */
  acceso: 'propia' | 'leida'
  /**
   * Sobre una entidad propia: otros pools también escriben acá.
   *
   * No es lo mismo que compartir una tabla: el dueño sigue siendo uno solo y es
   * quien define la forma. Marcarlo importa porque al desinstalar el pool esas
   * escrituras quedan huérfanas.
   */
  escriben_otros?: boolean
  /** Sobre una entidad leída: qué pool la posee. Vacío = maestra del proyecto. */
  dueno?: string
  /**
   * Columnas con dato personal. Se nombran, no se marca la tabla entera: quien
   * exporta necesita saber qué columna tapar, no que "la tabla es sensible".
   */
  campos_sensibles?: string[]
  /** Esta entidad existe por sucursal aunque el pool sea global (o al revés). */
  alcance?: 'global' | 'por_sucursal'
  /**
   * Referencia polimórfica: la entidad apunta a cualquier fila de cualquier
   * pool, sin FK y sin enumerar destinos.
   *
   * Hace falta para expresar el patrón sin nombrar los pools uno por uno. Si un
   * pool de núcleo tuviera que listar a quién puede apuntar, cada pool nuevo
   * obligaría a editar el manifiesto del núcleo — que es exactamente la
   * dependencia que un núcleo no puede tener.
   */
  referencia_abierta?: ReferenciaAbierta
}

export interface ReferenciaAbierta {
  /** Columna que guarda QUÉ tipo de cosa es (normalmente el nombre de la tabla). */
  campo_tipo: string
  /** Columna que guarda el id de esa cosa. */
  campo_id: string
  /** Columna opcional con la ruta para ir a verla. */
  campo_destino?: string
  nota: string
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

/* ── Agentes ─────────────────────────────────────────────────────────────── */

/**
 * Nivel de participación de un agente en una acción.
 *
 * Es lo único que una persona necesita saber antes de encenderlo: cuánto va a
 * hacer solo. Ordenado de menos a más.
 */
export type Participacion =
  /** Propone; la persona decide. */
  | 'sugiere'
  /** Deja todo hecho; falta confirmar. */
  | 'prepara'
  /** Lo hace y avisa. Solo si es reversible y no toca plata. */
  | 'hace_y_avisa'
  /** Nunca, por más permisos que tenga. Lo que protege la constitución. */
  | 'nunca'

/** Las capacidades del núcleo que un agente puede usar. */
export type Capacidad =
  | 'cargar'
  | 'recomendar'
  | 'detectar'
  | 'ejecutar'
  | 'responder'
  | 'explicar'
  | 'priorizar'

export interface AccionDeAgente {
  /** Referencia a una AccionDeclarada del mismo pool, o una automatización propia. */
  clave: string
  titulo: string
  participacion: Participacion
  /** Por qué ese nivel y no otro. Se lee antes de encender el agente. */
  motivo?: string
  /**
   * ¿Se puede deshacer lo que hizo?
   *
   * Existe porque `hace_y_avisa` está definido como "sólo reversible y sin
   * efecto sobre plata", y en modo espejo aparecieron automatizaciones que
   * actúan solas haciendo cosas que NO se deshacen (mandar un mail). El
   * manifiesto describe lo que hay; el validador avisa cuando lo que hay
   * contradice la regla. Tapar la contradicción sería declarar un sistema
   * que no existe.
   */
  reversible?: boolean
  /** Toca plata: cobra, paga, o cambia un precio de venta. */
  toca_dinero?: boolean
}

/**
 * Un agente es la unidad que ve el cliente: por dentro hay pools, por fuera hay
 * empleados.
 *
 * REGLA: el agente posee DECISIONES y AUTOMATIZACIONES, no pantallas ni
 * entidades. Ésas son compartidas. Si cada agente poseyera las suyas, tres
 * agentes de stock producirían tres listados de stock casi iguales — que es
 * exactamente el sistema que la fábrica existe para no construir.
 */
export interface AgenteDeclarado {
  clave: string
  nombre: string
  /** Qué trabajo hace, en lenguaje de negocio. Lo lee quien lo contrata. */
  trabajo: string
  /**
   * Qué datos necesita para funcionar. Si falta alguno, el agente aparece
   * APAGADO con el motivo a la vista. Nunca inventa para parecer que funciona.
   */
  necesita: RequisitoAgente[]
  /** Qué se enciende cuando se le completa lo que le falta. */
  se_activa_con?: string
  acciones: AccionDeAgente[]
  capacidades: Capacidad[]
  /**
   * Un agente NUNCA tiene más permisos que quien lo creó. Esto declara el techo;
   * el piso lo pone la persona.
   */
  permisos: PermisoDeclarado[]
}

export interface RequisitoAgente {
  /** Qué le falta, en lenguaje de negocio. */
  dato: string
  /** Dónde se carga. */
  donde?: string
  /** Qué no puede hacer mientras falte. */
  sin_esto: string
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
