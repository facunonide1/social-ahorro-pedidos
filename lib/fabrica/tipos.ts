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
  /**
   * Todos los pools dependen de éste, sin necesidad de declararlo.
   *
   * Es la forma de expresar "de todos" sin enumerar. Un pool base tiene que
   * poder decirlo una vez; la alternativa —listar a los diecisiete y volver a
   * editarlo con cada pool nuevo— es la dependencia invertida que un núcleo no
   * puede tener. Cuando está en true, el validador no exige reciprocidad.
   */
  usado_por_todos?: boolean
  /**
   * Id de la sub-app del registry contra la que se verifica la navegación.
   *
   * Por defecto se asume igual a `pool`. `null` significa que el pool NO es una
   * sub-app navegable: sus pantallas viven dentro de otras. Distinguirlo de
   * "hay un error en la clave" importa, porque si no el comparador reporta una
   * diferencia eterna sobre un pool que está perfectamente declarado.
   */
  subapp?: string | null
  /** Lo que cambia entre proyectos sin cambiar la pieza. */
  configurable?: ParametroConfigurable[]
  /** Lo que NO cambia nunca, con el límite que lo protege. */
  constitucional?: ElementoConstitucional[]
  /**
   * Dimensiones que PARTEN el sector sin dividirlo en sectores.
   *
   * Compras maneja tres rubros —farmacia, perfumería, supermercado— y no son
   * tres sectores: son un filtro sobre el mismo circuito, con las mismas
   * pantallas y las mismas reglas. Declararla como dimensión es lo que evita
   * que la fábrica proponga triplicar el pool cada vez que aparece un rubro.
   */
  dimensiones?: DimensionTransversal[]
  /**
   * Lo que la pieza HACE y no se puede cambiar por configuración.
   *
   * Desde 1.8.0. Antes vivían en `configurable`, donde prometían ser perillas.
   */
  hechos?: HechoDeLaPieza[]
  /** Los agentes que este pool aporta. Vacío es una respuesta válida. */
  agentes?: AgenteDeclarado[]
  /**
   * Tablas que el sector todavía tiene pero ya no usa.
   *
   * Se listan aparte y NO como entidades propias: una tabla deprecada que se
   * declara propia viaja a cada proyecto nuevo. Declararla acá deja el rastro
   * —existe, no se usa, se va a borrar— sin que la fábrica la propague.
   */
  deprecadas?: TablaDeprecada[]
}

export interface DimensionTransversal {
  clave: string
  etiqueta: string
  /** `tabla.columna` donde vive el valor, para poder verificarla. */
  columnas: string[]
  /** Los valores que toma hoy en este proyecto. Configurables. */
  valores: string[]
  motivo: string
}

export interface TablaDeprecada {
  tabla: string
  /** Qué la reemplazó. */
  reemplazada_por?: string
  /** Desde cuándo no se usa. */
  desde: string
  motivo: string
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
  /**
   * propia  = este pool es el DUEÑO: la escribe y define su forma.
   * escrita = la escribe SIN ser el dueño. Legítimo y explícito.
   * leida   = sólo la consulta.
   *
   * `escrita` apareció con el importador: un pool cuya función es cargar datos
   * ajenos escribe en tablas de medio sistema por diseño. Sin este valor había
   * que elegir entre mentir (declararlas propias y romper la regla de un dueño
   * por tabla) o esconder la escritura (declararlas leídas). Se declara la
   * escritura y se nombra al dueño.
   */
  acceso: 'propia' | 'escrita' | 'leida'
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
   * Roles que pueden verla, además del alcance por punto.
   *
   * El alcance por sucursal no alcanza cuando el dato es sensible dentro del
   * propio punto: el saldo de caja general lo ve quien maneja plata, no todo
   * el que trabaja ahí. Son dos filtros distintos y hacen falta los dos.
   */
  restringido_a_rol?: string[]
  /**
   * Qué pool genera las filas de esta entidad, cuando no es el dueño.
   *
   * Distinto de `escriben_otros`, que dice "acá también escribe alguien más".
   * Esto dice de dónde VIENEN las filas: la cuenta por pagar nace de un
   * documento leído, en una sola dirección y nunca al revés.
   */
  generada_por?: string
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
  /**
   * EL TÉRMINO DEL OFICIO. Cómo se llama esta cosa en el rubro.
   *
   * Vive en la PIEZA porque es lo que hace que la pieza sirva en otro negocio:
   * "Recartelado" es el término del oficio en farmacia, lo entienda o no el
   * equipo de un negocio en particular.
   *
   * Desde 1.5.0 esto NO es "el título que se muestra". El que se muestra es el
   * nombre del negocio si existe, y éste si no. La distinción existe porque
   * hasta 1.4.0 la única forma de registrar cómo le dice un equipo a algo era
   * pisar el título, y eso BORRABA el término del oficio: el pool se llevaba el
   * vocabulario de un negocio al negocio siguiente.
   */
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
  /**
   * El título sale de los datos, no de una etiqueta fija.
   *
   * La ficha de un documento se titula con el tipo y el número de ESE
   * documento. `titulo` sigue existiendo —el catálogo necesita cómo llamarla—
   * pero el lector no la gobierna: reemplazar un título calculado por una
   * etiqueta fija sería quitarle información a la pantalla, no configurarla.
   */
  titulo_dinamico?: boolean
  /**
   * La ruta no muestra nada: redirige a otra.
   *
   * Existe porque el catálogo tiene que saber que la ruta existe —alguien puede
   * tener el link guardado— pero no hay cabecera que gobernar. Declararla como
   * pantalla común la dejaba para siempre en la lista de "sin cablear", que es
   * una deuda que nunca se puede pagar.
   */
  redirige_a?: string
  /**
   * Sólo aparece en el manifiesto EFECTIVO (pieza + instalación), nunca en la
   * declaración de la pieza: es el `titulo` de la pieza, guardado antes de que
   * el vocabulario del negocio lo tape.
   *
   * Existe para tres cosas concretas, y las tres se necesitaban:
   *   · que el chat entienda las dos formas de nombrar lo mismo
   *   · que un pool instalado en otro negocio NO herede este vocabulario
   *   · que se pueda volver al término del oficio sin buscarlo en el historial
   */
  titulo_de_oficio?: string
  /**
   * Cómo le dice ESTE negocio. Sólo en el manifiesto efectivo.
   *
   * Ausente significa "acá le decimos como en el oficio", que es una respuesta
   * distinta de "acá le decimos igual que en el oficio pero lo declaramos": la
   * segunda deja un override que no cambia nada y hace que el origen mienta.
   */
  nombre_en_el_negocio?: string
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
  /**
   * Avisa hacia adentro del equipo. Se ejecuta solo y NO es reversible —
   * un aviso leído no se puede des-leer — y eso está bien, porque no
   * compromete nada con nadie de afuera.
   *
   * Existe porque `hace_y_avisa` exige reversibilidad, y meter los avisos
   * internos ahí obligaba a mentir sobre la reversibilidad o a bloquear
   * automatizaciones que no tienen nada de riesgoso. La pregunta que separa
   * los dos niveles no es "¿se deshace?" sino "¿compromete algo con un
   * tercero?".
   */
  | 'informa'
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

/**
 * EL CONTRATO DE UNA AUTOMATIZACIÓN.
 *
 * ── QUÉ SE PUEDE GOBERNAR, Y QUÉ NO ─────────────────────────────────────────
 *
 * GOBERNABLE   si está activa · su nivel de participación, SOLO HACIA ABAJO ·
 *              sus parámetros, que ya tienen contrato desde 1.6.0.
 * NO GOBERNABLE qué hace —eso es código— · subir el nivel por encima del piso
 *              que declara la pieza · cualquier cosa marcada constitucional.
 *
 * Confundirlos es prometer de más, que es lo que esta fábrica no hace.
 *
 * ── APAGAR NO ES DESHACER ───────────────────────────────────────────────────
 *
 * Apagar una automatización evita lo que fuera a hacer de acá en adelante. Lo
 * que ya hizo QUEDA: los avisos mandados, las tareas creadas, los registros
 * escritos. Es la diferencia con un título, que se revierte y no deja rastro, y
 * por eso va en el costo de revertir y no en la letra chica.
 */
export interface ContratoDeAutomatizacion {
  /**
   * Corre sola. `false` o ausente = alguien la dispara, y entonces no es una
   * automatización: es una acción.
   *
   * De las 54 acciones declaradas en v0.74, 43 caen de este lado.
   */
  corre_sola: true
  /** cron | trigger de base | evento del sistema. */
  disparo: 'cron' | 'trigger' | 'evento'
  /** Dónde vive: la ruta del cron, el nombre del trigger, el evento. */
  donde_corre: string
  /**
   * Si está agendada de verdad.
   *
   * Se declara porque ya apareció una que no lo estaba: `generar_recurrencias`
   * tiene su ruta y no figura en vercel.json, o sea que está declarada como
   * `hace_y_avisa` y no corre sola. Ausente no es lo mismo que false: ausente
   * es "no se relevó".
   */
  agendada?: boolean
  /**
   * Si este proyecto la tiene activa.
   *
   * Es lo ÚNICO gobernable por declaración hoy, y es lo más útil: poder apagar
   * una automatización sin un deploy. Ausente = activa, que es el estado de
   * todas antes de que esto existiera.
   */
  activa?: boolean
  /**
   * Qué queda hecho si se apaga.
   *
   * Obligatorio: sin esto, "apagala" se lee como "que no haya pasado", y eso es
   * falso para toda automatización que ya corrió una vez.
   */
  al_apagar: string
  /**
   * La OTRA puerta: qué persona puede disparar lo mismo a mano, si existe.
   *
   * Apareció relevando los crons huérfanos: `/api/cron/gastos-fijos` tiene un
   * GET para el cron y un POST para tesorería. Apagar la automatización apaga
   * el cron y NO apaga el botón, así que sin este campo "apagala" volvía a leerse
   * como "que no pase" — el mismo error que `al_apagar` existe para evitar, por
   * otra puerta.
   *
   * Ausente = no se relevó otra puerta. No es lo mismo que "no hay".
   */
  tambien_manual?: string
}

export interface AccionDeAgente {
  /**
   * El contrato, si corre sola. Ausente = es una acción que alguien dispara.
   *
   * Vive acá y no en un bloque aparte porque una automatización ES una acción
   * de agente: tiene el mismo nivel de participación, las mismas marcas de
   * tercero y dinero, y la misma brecha. Lo que cambia es quién la dispara.
   */
  automatizacion?: ContratoDeAutomatizacion
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
  /** Sale del equipo: le llega a un cliente, a un proveedor, a alguien de afuera. */
  compromete_tercero?: boolean
  /**
   * El código de hoy TODAVÍA NO cumple el nivel declarado.
   *
   * Existe por un choque real entre dos reglas que las dos están bien: el
   * nivel se decide por criterio (qué DEBE hacer la acción) y el manifiesto
   * describe el sistema (qué HACE hoy). Cuando difieren, poner el nivel que
   * corresponde y borrar la diferencia sería declarar un sistema que no
   * existe; poner el nivel que el código tiene sería bendecir lo que hay.
   *
   * Se declara el nivel correcto y se escribe la brecha al lado. El validador
   * la levanta y la pantalla la muestra.
   */
  brecha?: string
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

/**
 * Cuánto duele que este parámetro esté mal.
 *
 * Hasta v0.65 todos los configurables pesaban igual y todos eran amarillos, así
 * que el grueso no molestaba. El día que se habilite el carril verde, tratar
 * `dias_aviso_vencimiento` y `umbral_aprobacion_pago` como la misma cosa se
 * vuelve peligroso. Se resuelve ANTES de habilitar el primer verde.
 */
export type Peso =
  /** Si se cambia mal, alguien ve algo raro. */
  | 'inocuo'
  /** Si se cambia mal, alguien trabaja de más o de menos. */
  | 'operativo'
  /** Si se cambia mal, se pierde plata, se afloja un control o se incumple algo. */
  | 'sensible'

/**
 * La unidad de un parámetro numérico.
 *
 * No es decoración: es lo que hace que un valor sea legible y comparable. "7"
 * no dice nada; "7 días" se puede discutir. Y sin unidad, dos parámetros que
 * miden cosas distintas se ven iguales — que fue exactamente el problema que
 * el peso vino a resolver en v0.66, un nivel más abajo.
 */
export type Unidad = 'dias' | 'horas' | 'pesos' | 'porcentaje' | 'unidades' | 'veces'

/**
 * DÓNDE SE USA UN PARÁMETRO.
 *
 * Es lo que permite contestar dos preguntas que hasta 1.5.0 no se podían
 * contestar:
 *
 *   · ¿qué se rompe si cambio esto?
 *   · ¿el cableado está completo o a medias?
 *
 * La segunda es la peligrosa. Un parámetro usado en tres lugares y cableado en
 * dos es PEOR que uno sin cablear: se comporta distinto en cada pantalla y
 * nadie lo nota. Sin esta lista, ese estado es indetectable.
 *
 * NO SE ESCRIBE DE MEMORIA. Se detecta recorriendo el código —ver
 * `scripts/fabrica-detectar-dependencias.ts`— y una persona confirma. Escribir
 * de memoria dónde se usa algo es el mismo error que escribir de memoria un
 * nombre de columna, que ya falló cuatro veces.
 */
export interface DependenciaDeParametro {
  /** Ruta del archivo, relativa a la raíz del repo. */
  archivo: string
  /**
   * QUIÉN CONSUME el valor: la función, el componente o el endpoint que lo usa.
   *
   * Es lo único que se verifica, y por eso está separado del símbolo desde
   * 2.0.0. Hasta 1.9.0 un solo campo `donde` admitía las dos lecturas —quién
   * consume y qué se consume— y nada obligaba a elegir: cuatro dependencias de
   * `dias_ventana_costo` decían `DOC_DIAS_DATO_FRESCO`, el nombre de la
   * CONSTANTE, y pasaban la verificación porque la constante sí existe en esos
   * archivos. Verificaba una cosa cierta que no era la que hacía falta.
   */
  consume: string
  /**
   * QUÉ SE CONSUME ahí, si tiene nombre: la constante o el símbolo que se lee.
   *
   * Es documentación, no lo que se verifica. Un archivo que sólo DECLARA la
   * constante no es un lugar de consumo: eso ya lo dice `fuente`.
   */
  simbolo?: string
  /**
   * CÓMO llega el valor a este lugar. Tres formas, y confundirlas hace que la
   * verificación mienta:
   *
   *   resuelve  llama a `parametro()`. Es donde el valor ENTRA al sector.
   *   recibe    lo toma como argumento o prop de quien lo resolvió. Está
   *             cableado igual de bien, pero no se puede verificar buscando
   *             `parametro(` — hay que buscar la señal.
   *   literal   usa un valor fijo. Es lo que falta.
   *
   * La primera versión de esto era un booleano `cableado`, y la verificación
   * marcó como "DESMIENTE AL MANIFIESTO" dos archivos que estaban perfectamente
   * cableados: recibían el valor por argumento. El modelo estaba mal, no el
   * código — y lo encontró la propia verificación, que es para lo que sirve.
   */
  via: 'resuelve' | 'recibe' | 'literal'
  /**
   * El identificador por el cual se verifica un `recibe`: el nombre del
   * argumento o de la prop. Sin esto, "recibe" sería una afirmación que nadie
   * puede comprobar, y una afirmación incomprobable en el contrato es peor que
   * un hueco.
   */
  senal?: string
  /**
   * ANCLAJE PARA LO QUE NO TIENE NOMBRE DE FUNCIÓN.
   *
   * Hay lugares de consumo que no son una función con nombre: un badge que es
   * una arrow anónima dentro de un objeto, por ejemplo. Ahí `donde` es una
   * descripción —"badge de Operaciones"— y no hay identificador que buscar, así
   * que la verificación los dejaba en `ambiguo` sin poder decir nada.
   *
   * `ancla` es un fragmento EXACTO que tiene que aparecer en el archivo: la
   * expresión concreta que consume el valor. Se verifica por coincidencia
   * literal, que es fuerte justamente porque es específica — anclar en algo
   * genérico volvería a dar verde sobre cualquier cosa, que es el detector
   * difuso de v0.69.
   *
   * Si un lugar no tiene ni identificador ni un ancla honesta, se deja sin
   * `ancla` y queda declarado como no verificable. Forzar un anclaje falso
   * sería peor que el hueco.
   *
   * ── ES UNA VERIFICACIÓN DÉBIL, Y SE DICE ────────────────────────────────
   *
   * Un ancla es un fragmento de código en el manifiesto: si alguien reformatea
   * esa línea, deja de coincidir sin que nada haya cambiado de fondo. Una
   * alarma que suena por un cambio de formato es la que entrena a ignorar el
   * tablero, así que el indicador la cuenta APARTE de las verificaciones
   * fuertes en vez de sumarlas.
   *
   * Por eso conviene el ancla más corta que siga probando el consumo. La
   * primera versión era "params?.diasAvisoVencimiento ?? 30" e incluía el
   * fallback: cambiar ese 30 —una decisión legítima— habría roto la
   * verificación. Ahora es "params?.diasAvisoVencimiento", que prueba lo mismo
   * y sobrevive a más cambios.
   */
  ancla?: string
  /** Qué hace con el valor, en una línea. Se lee antes de aprobar un cambio. */
  efecto?: string
}

/**
 * OTRA FUENTE DEL MISMO VALOR.
 *
 * ── EL PROBLEMA ─────────────────────────────────────────────────────────────
 *
 * Cuatro parámetros se leían además de una variable de entorno, y nada decía
 * cuál ganaba. El sistema se habría comportado según una mientras el Taller
 * mostraba la otra, y ningún indicador lo habría detectado: cada lado es
 * coherente consigo mismo. Es el modo de falla del cableado a medias, un nivel
 * más arriba.
 *
 * ── LA REGLA DE PRECEDENCIA, ÚNICA PARA TODOS ───────────────────────────────
 *
 *   1 · si el pool está prendido y hay valor declarado VÁLIDO → gana la
 *       declaración
 *   2 · si no → gana el valor del código, que es el que el sector pasa como
 *       tercer argumento de `parametro()`
 *
 * Una variable de entorno no es una tercera regla: es UNA FORMA de escribir el
 * valor del código. Se resuelve pasándola como fallback —
 * `parametro('compras', 'alerta_suba_pct', DOC_ALERTA_SUBA_PCT)`— y entonces las
 * dos fuentes quedan ordenadas en vez de compitiendo.
 *
 * Lo que NO se hace es dejar las dos vivas sin decir cuál gana.
 */
export interface FuenteDeParametro {
  tipo: 'variable_de_entorno' | 'constante' | 'tabla'
  /** El nombre exacto: la constante, la variable o la tabla.columna. */
  nombre: string
  /**
   * es_el_fallback  la otra fuente se pasa como valor del código. Ordenadas.
   * no_gobernable   el parámetro NO lo lee el lector mientras exista la otra
   *                 fuente. Es una respuesta válida y se muestra así.
   * sin_resolver    hay dos fuentes y nadie decidió. Es un CONFLICTO.
   */
  resuelto: 'es_el_fallback' | 'no_gobernable' | 'sin_resolver'
  nota?: string
}

/**
 * UN HECHO SOBRE LA PIEZA.
 *
 * ── POR QUÉ HACE FALTA UN BLOQUE APARTE ─────────────────────────────────────
 *
 * Hasta 1.7.0 estas cosas vivían en `configurable`, y no son configuración:
 * "opera con valores a fecha", "mueve mercadería entre puntos", "acumula puntos
 * por compra". El circuito existe o no existe; no hay ningún booleano que
 * alguien lea. Ponerlos en `configurable` PROMETE que se pueden cambiar y tener
 * efecto, y no lo tienen.
 *
 * Y mientras vivieran ahí, cualquier métrica de la fábrica estaba inflada: en
 * v0.70 el sistema decía "23 parámetros gobernados" y gobernaba 2. Separarlos no
 * es prolijidad, es lo que hace que el conteo signifique algo.
 *
 * ── CÓMO SE COMPROBÓ ────────────────────────────────────────────────────────
 *
 * Un hecho sin `comprobado_por` es una afirmación sin respaldo, y este proyecto
 * ya sabe lo que cuesta una de ésas. Es obligatorio.
 */
export interface HechoDeLaPieza {
  clave: string
  /** Qué afirma, en una línea que se lea sin contexto. */
  afirma: string
  /**
   * PERMANENTE o CONDICIONADO, y la diferencia importa al instalar.
   *
   *   permanente   es cierto siempre que la pieza esté instalada. Viaja con
   *                ella: si el pool está, el circuito está.
   *   condicionado es cierto mientras se cumpla algo que NO depende de la
   *                pieza — cómo está armado el negocio, qué datos tiene. Al
   *                instalar la pieza en otro lado puede dejar de ser cierto sin
   *                que nadie toque nada.
   *
   * Sin la distinción, un hecho condicionado se lee como una garantía. "El
   * negocio opera en más de un punto" no es una propiedad del software: es una
   * propiedad de ESTE negocio, y la pieza no la puede prometer.
   */
  tipo: 'permanente' | 'condicionado'
  /** De qué depende, si es condicionado. Obligatorio en ese caso. */
  depende_de?: string
  /**
   * Cómo se comprobó que es cierto. Un archivo, una tabla, una búsqueda: algo
   * que otra persona pueda repetir.
   */
  comprobado_por: string
}

export interface ParametroConfigurable {
  clave: string
  etiqueta: string
  /**
   * Desde 1.6.0 se distingue `numero` de `entero`.
   *
   * No es purismo: una ventana de vencimientos en 7.5 días no significa nada, y
   * un umbral de confianza en 1 en vez de 0.9 sí. Sin la distinción el
   * validador no puede rechazar ninguno de los dos.
   */
  tipo: 'texto' | 'numero' | 'entero' | 'booleano' | 'lista'
  default?: unknown

  /* ── El contrato, desde 1.6.0 ─────────────────────────────────────── */

  /**
   * Mínimo y máximo, para los numéricos.
   *
   * Hasta 1.5.0 nada impedía aprobar una ventana de vencimientos en -5 o en
   * 100000. El primero no avisa nunca y el segundo avisa siempre; los dos
   * cambian el comportamiento en silencio y ninguno se veía raro en el diff.
   */
  minimo?: number
  maximo?: number
  /** Qué mide. Obligatoria en los numéricos: un número sin unidad no se discute. */
  unidad?: Unidad
  /** Los valores posibles, si es lista cerrada. */
  valores?: string[]

  /** Dónde se usa. Detectada contra el código, nunca escrita de memoria. */
  depende_de?: DependenciaDeParametro[]
  /**
   * Otra fuente conocida del mismo valor, y cómo se resolvió la convivencia.
   *
   * Ausente significa "no se le conoce otra fuente", que es distinto de "se
   * revisó y no tiene". Lo primero es un hueco, lo segundo es un dato — y hoy
   * el relevamiento (scripts/fabrica-relevar-fuentes.ts) cubre variables de
   * entorno y fallbacks distintos, no tablas.
   */
  fuente?: FuenteDeParametro
  /**
   * SE BUSCÓ EN EL CÓDIGO Y NO LO LEE NADIE.
   *
   * Es distinto de no tener `depende_de`. Sin `depende_de` la respuesta es
   * "nadie declaró dónde se usa" —un hueco—; con esto la respuesta es "se
   * revisó, y el código no lo consulta" —un dato—. La distinción es la misma
   * que separa un cero porque está bien de un cero porque no miró.
   *
   * Aparecieron 20 así en v0.70, y casi todos por el mismo motivo: describen
   * QUÉ HACE la pieza —"opera con valores a fecha", "mueve mercadería entre
   * puntos"— y no un valor que el código consulte. Ponerlos en `configurable`
   * promete que se pueden cambiar y tener efecto, y no lo tienen.
   */
  sin_consumo?: {
    motivo: string
    /** Cómo se comprobó. Sin esto sería una afirmación sin respaldo. */
    verificado_por: string
  }

  /**
   * Obligatorio desde 1.4.0.
   *
   * Sin default a propósito: si no se puede decidir, se marca `sensible` y se
   * reporta. La duda va del lado seguro, y un default silencioso convertiría
   * "no lo pensé" en "es inocuo".
   */
  peso: Peso
  /** Por qué ese peso. Se lee cuando alguien discute la clasificación. */
  peso_motivo?: string
  /**
   * EL CÓDIGO TODAVÍA NO IMPLEMENTA ESTE PARÁMETRO.
   *
   * Mismo campo y mismo criterio que la brecha de una acción de agente, y por
   * el mismo choque: el manifiesto declara qué DEBERÍA ser configurable y el
   * código dice qué HACE hoy. Cuando difieren, borrar la declaración sería
   * perder la decisión y sacarla de `configurable` sería fingir que nadie la
   * pensó.
   *
   * Es la diferencia con un hecho: un hecho afirma lo que la pieza HACE; una
   * brecha declara lo que la pieza DEBERÍA poder configurar y todavía no puede.
   *
   * `sla_default_horas` declara 24 y el código deja null: cablearlo no sería
   * cablear, sería construir un comportamiento que no existe.
   */
  brecha?: string
}

/**
 * ¿El valor entra en el contrato del parámetro?
 *
 * Vive acá y no en el validador porque lo usan TRES: el validador del
 * manifiesto, el escritor —que rechaza antes de guardar— y el lector, que cae
 * al código si lo que está guardado quedó fuera de rango. Si cada uno tuviera
 * su copia, tarde o temprano uno aceptaría lo que otro rechaza.
 *
 * Devuelve el motivo en castellano, o `null` si el valor es válido.
 */
/**
 * ¿Este parámetro tiene una segunda fuente sin resolver?
 *
 * Es la única condición que se agrega a "lo lee el lector", y se pone acá al
 * lado del contrato porque es la misma clase de pregunta: si el valor no se
 * puede usar con confianza, no se usa.
 */
export function tieneConflictoDeFuente(p: ParametroConfigurable): boolean {
  return p.fuente?.resuelto === 'sin_resolver'
}

/** ¿El lector puede devolver este parámetro? Peso Y fuente, las dos cosas. */
export function esGobernable(p: ParametroConfigurable, pesosGobernados: readonly string[]): boolean {
  if (!pesosGobernados.includes(p.peso)) return false
  // Con una brecha declarada, el código no lo implementa: devolver el valor
  // sería devolver algo que nadie va a usar, y contarlo como gobernado infla el
  // número — que es lo que esta sesión vino a arreglar.
  if (p.brecha) return false
  // Con la fuente sin resolver o marcada no gobernable, el lector se calla. Un
  // valor que compite con otro no es un valor: es una discusión.
  return p.fuente?.resuelto !== 'sin_resolver' && p.fuente?.resuelto !== 'no_gobernable'
}

export function fueraDeContrato(p: ParametroConfigurable, valor: unknown): string | null {
  if (valor === undefined || valor === null) return 'no tiene valor'

  if (p.tipo === 'booleano') {
    return typeof valor === 'boolean' ? null : `tiene que ser sí o no, y llegó ${typeof valor}`
  }
  if (p.tipo === 'texto') {
    return typeof valor === 'string' ? null : `tiene que ser texto, y llegó ${typeof valor}`
  }
  if (p.tipo === 'lista') {
    if (typeof valor !== 'string') return `tiene que ser uno de los valores permitidos`
    if (p.valores && !p.valores.includes(valor)) {
      return `"${valor}" no está entre los valores permitidos (${p.valores.join(', ')})`
    }
    return null
  }

  // numero | entero
  if (typeof valor !== 'number' || Number.isNaN(valor)) {
    return `tiene que ser un número, y llegó ${typeof valor}`
  }
  if (p.tipo === 'entero' && !Number.isInteger(valor)) {
    const u = p.unidad ? ` ${p.unidad}` : ''
    return `tiene que ser un número entero: ${valor}${u} no significa nada`
  }
  const u = p.unidad ? ` ${p.unidad}` : ''
  if (p.minimo !== undefined && valor < p.minimo) {
    return `${valor}${u} está por debajo del mínimo (${p.minimo}${u})`
  }
  if (p.maximo !== undefined && valor > p.maximo) {
    return `${valor}${u} está por encima del máximo (${p.maximo}${u})`
  }
  return null
}

/* ── Constitución ────────────────────────────────────────────────────────── */

/**
 * Los seis límites que la fábrica NO puede mover: ni por configuración, ni por
 * chat, ni a pedido del dueño del proyecto.
 *
 * Están en el formato y no sólo en la doctrina porque la próxima pieza es el
 * lector: una declaración que gobierna sin conocer los límites puede apagar un
 * control sin que nadie se entere de que lo apagó.
 */
export type LimiteConstitucional =
  /** Lo que el rubro obliga por ley. */
  | 'cumplimiento_regulado'
  /** Quién manda sobre el precio de venta. */
  | 'autoridad_precio'
  /** Umbrales de aprobación y permisos: se cambian a mano. */
  | 'umbrales_y_permisos'
  /** Control de caja: el arqueo ciego no se configura. */
  | 'control_de_caja'
  /** Auditoría: no se desactiva, no se borra, no se edita. */
  | 'auditoria'
  /** Confirmación humana antes de ejecutar. */
  | 'confirmacion_humana'

/**
 * Un elemento del pool que cae bajo un límite constitucional.
 *
 * `modificable: false` es el default y el único valor sensato; el campo existe
 * para que el validador pueda RECHAZAR una declaración que lo ponga en true.
 * Sin el campo, marcar algo como modificable sería simplemente no declararlo,
 * y no habría nada que rechazar.
 */
export interface ElementoConstitucional {
  limite: LimiteConstitucional
  /** entidad | campo | accion | automatizacion | parametro */
  tipo: 'entidad' | 'campo' | 'accion' | 'automatizacion' | 'parametro'
  /** Qué es exactamente: nombre de tabla, `tabla.columna`, clave de acción. */
  elemento: string
  /** Por qué no se puede tocar. Se lee cuando alguien pide tocarlo. */
  motivo: string
  /** Siempre false. Ponerlo en true es un error de validación. */
  modificable?: false
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
