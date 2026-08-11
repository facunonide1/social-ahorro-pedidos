import type { Manifiesto } from '../tipos'

/**
 * Manifiesto de CENTRO DE DATOS — modo ESPEJO. Pool de NÚCLEO.
 *
 * El importador/exportador genérico. Es el pool que obligó a agregar
 * `acceso: 'escrita'`, porque su función ES escribir en tablas de otros: un
 * importador que sólo pudiera tocar lo suyo no importaría nada.
 *
 * Antes de ese valor había dos salidas y las dos eran malas: declarar propias
 * las tablas ajenas (y romper la regla de un dueño por tabla, que es lo que
 * evita que dos pools se pisen) o declararlas leídas (y esconder que las
 * escribe, que es peor: el dueño le cambia la forma sin enterarse de que hay
 * alguien más adentro).
 *
 * Vocabulario NEUTRO: perfil, trabajo de importación, mapeo. Nada de "SIFACO"
 * ni de nombres de sistemas concretos adentro del manifiesto — eso es
 * configuración del proyecto, no de la pieza.
 */
export const MANIFIESTO_CENTRO_DATOS: Manifiesto = {
  formato: '1.9.0',
  pool: 'centro-datos',
  nombre: 'Centro de Datos',
  categoria: 'nucleo',
  desinstalable: false,
  alcance: 'global',
  descripcion:
    'La puerta por la que entran y salen los datos. Perfiles de importación reutilizables, mapeo de lo que no matchea, y exportación hacia el sistema que tenga la autoridad sobre cada cosa.',

  entidades: [
    { tabla: 'perfiles_datos', rol: 'Cómo leer un archivo: qué columna es qué, y qué hacer con ella', acceso: 'propia' },
    { tabla: 'import_jobs', rol: 'Cada carga: qué se subió, cuándo y cómo salió', acceso: 'propia' },
    { tabla: 'export_jobs', rol: 'Cada envío hacia afuera', acceso: 'propia' },
    { tabla: 'snapshots_import', rol: 'Cómo estaban los datos antes de la carga, para poder volver', acceso: 'propia' },
    { tabla: 'acciones_export', rol: 'Qué se exporta, a dónde y con qué formato', acceso: 'propia' },
    { tabla: 'config_import_stock', rol: 'El mapeo guardado para cargas de existencias', acceso: 'propia' },
    { tabla: 'config_import_finanzas', rol: 'El mapeo guardado para cargas de movimientos', acceso: 'propia' },
    { tabla: 'stock_imports', rol: 'Las cargas de existencias, con su resultado', acceso: 'propia' },
    { tabla: 'stock_imports_items', rol: 'Fila por fila de cada carga de existencias', acceso: 'propia' },
    { tabla: 'items_sin_match', rol: 'Lo que entró y no se pudo identificar: espera que alguien decida', acceso: 'propia' },
    { tabla: 'ventas_diarias', rol: 'El volumen de salida por punto y por día. La base de casi todo cálculo', acceso: 'propia', escriben_otros: true, alcance: 'por_sucursal' },

    // ESCRITAS: la función del pool es cargar datos ajenos. El dueño de cada
    // una lo reconoce con `escriben_otros`, y el validador lo verifica.
    { tabla: 'productos_catalogo', rol: 'Da de alta y actualiza items desde un archivo', acceso: 'escrita', dueno: 'configuracion' },
    { tabla: 'stock_sucursal', rol: 'Carga las existencias por punto', acceso: 'escrita', dueno: 'stock' },
    { tabla: 'stock_items', rol: 'Da de alta items de depósito que aparecen en una carga', acceso: 'escrita', dueno: 'stock' },

    { tabla: 'sucursales', rol: 'A qué punto pertenece cada fila del archivo', acceso: 'leida', dueno: 'configuracion' },
  ],

  pantallas: [
    { ruta: '/admin/centro-datos', titulo: 'Centro de Datos', molde: 'tablero', permiso: 'centro_datos' },
    { ruta: '/admin/centro-datos/importar', titulo: 'Importar', molde: 'wizard', permiso: 'centro_datos' },
    { ruta: '/admin/centro-datos/exportar', titulo: 'Exportar', molde: 'wizard', permiso: 'centro_datos' },
    { ruta: '/admin/centro-datos/ventas-diarias', titulo: 'Ventas diarias', molde: 'lista_maestra', permiso: 'centro_datos' },
    { ruta: '/admin/centro-datos/perfiles', titulo: 'Perfiles', molde: 'lista_maestra', permiso: 'centro_datos' },
    { ruta: '/admin/centro-datos/historial', titulo: 'Historial', molde: 'lista_maestra', permiso: 'centro_datos' },
    { ruta: '/admin/centro-datos/sin-matchear', titulo: 'Sin identificar', molde: 'bandeja', permiso: 'centro_datos' },
    { ruta: '/admin/centro-datos/asistente', titulo: 'Asistente', molde: 'chat', permiso: 'centro_datos' },

    // Existe, es de este pool, y el menú no la lleva: muestra el resultado de
    // las cargas de existencias desde el lado de Stock.
    { ruta: '/admin/operaciones/importaciones', titulo: 'Importaciones de existencias', molde: 'lista_maestra', pertenencia: 'prestada', navegable: false },
  ],

  // Las tres son de lectura. El asistente no importa ni exporta: cargar datos
  // es un acto con archivo adjunto y confirmación, no una frase en un chat.
  acciones: [
    { clave: 'centro_datos_estado', titulo: 'Cómo viene la carga de datos', descripcion: 'Devuelve qué se cargó último, cuándo, y qué quedó pendiente de identificar.', requiere_confirmacion: false },
    { clave: 'ventas_dia', titulo: 'Cuánto se vendió', descripcion: 'Devuelve el volumen de salida de un día por punto.', requiere_confirmacion: false },
    { clave: 'items_sin_match', titulo: 'Qué quedó sin identificar', descripcion: 'Lista las filas que entraron y no se pudieron asociar a un item del catálogo.', requiere_confirmacion: false },
  ],

  permisos: [{ modulo: 'centro_datos', acciones: ['ver', 'crear', 'editar'] }],

  depende_de: ['configuracion'],
  usado_por: ['stock', 'clientes', 'inteligencia'],

  agentes: [
    {
      clave: 'cargador_de_datos',
      nombre: 'Cargador de datos',
      trabajo:
        'Toma los archivos que llegan, los mapea con un perfil ya conocido, carga lo que identifica y deja separado lo que no, para que una persona decida.',
      necesita: [
        { dato: 'Un perfil de importación guardado', donde: 'Perfiles', sin_esto: 'No sabe qué columna es qué y no puede cargar nada solo' },
        { dato: 'El catálogo de items cargado', donde: 'Configuración', sin_esto: 'Todo lo que entre va a quedar sin identificar' },
      ],
      se_activa_con: 'Cargar el catálogo de items y guardar un perfil desde la primera importación manual.',
      acciones: [
        { clave: 'aplicar_perfil_conocido', titulo: 'Cargar con un perfil ya usado', participacion: 'prepara', motivo: 'Deja la carga armada con el resumen de qué entra y qué queda afuera. La suelta una persona.' },
        { clave: 'separar_sin_identificar', titulo: 'Apartar lo que no reconoce', participacion: 'hace_y_avisa', reversible: true, motivo: 'No adivina: separa. La fila queda esperando en una bandeja y no se pierde.' },
        { clave: 'avisar_carga_terminada', titulo: 'Avisar cómo salió la carga', participacion: 'informa', reversible: false, compromete_tercero: false, motivo: 'Aviso al equipo con el resultado. No sale del sistema.' },
        { clave: 'proponer_match', titulo: 'Proponer a qué item corresponde', participacion: 'sugiere', motivo: 'Un match equivocado ensucia el catálogo maestro para siempre. Lo confirma una persona.' },
        {
          clave: 'crear_item_nuevo',
          titulo: 'Dar de alta un item que no existía',
          participacion: 'nunca',
          motivo: 'El catálogo es la maestra de la que dependen todos los pools. Un alta automática desde un archivo mal formateado lo contamina y nadie sabe de dónde salió.',
        },
      ],
      capacidades: ['cargar', 'detectar', 'explicar'],
      permisos: [{ modulo: 'centro_datos', acciones: ['ver', 'crear', 'editar'] }],
    },
  ],

  constitucional: [
    {
      limite: 'confirmacion_humana',
      tipo: 'accion',
      elemento: 'crear_item_nuevo',
      motivo: 'El catálogo es la maestra de la que dependen todos los pools. Un alta automática desde un archivo mal formateado lo contamina y después nadie sabe de dónde salió esa fila.',
    },
    {
      limite: 'confirmacion_humana',
      tipo: 'accion',
      elemento: 'aplicar_perfil_conocido',
      motivo: 'Una carga masiva toca tablas de medio sistema. Se deja armada con el resumen de qué entra y qué queda afuera, y la suelta una persona.',
    },
    {
      limite: 'auditoria',
      tipo: 'entidad',
      elemento: 'snapshots_import',
      motivo: 'Es cómo estaba todo antes de la carga. Si se pudiera borrar, una importación mal hecha sería irreversible.',
    },
  ],

  configurable: [
    { clave: 'guarda_snapshot', etiqueta: 'Guarda cómo estaba todo antes de cada carga', tipo: 'booleano', default: true, peso: 'sensible', peso_motivo: 'Sin la foto previa, una importación mal hecha es irreversible.'  },
    { clave: 'umbral_match_automatico', etiqueta: 'Confianza mínima para identificar solo', tipo: 'numero', default: 0.9, peso: 'sensible', peso_motivo: 'Bajarlo mete filas en el item equivocado y contamina el catálogo maestro del que dependen todos los pools.', minimo: 0.5, maximo: 1 },
  ],

  hechos: [
    { clave: 'exporta_a_sistema_externo', afirma: "Exporta hacia un sistema externo", comprobado_por: "Se buscó la clave literal en los 689 archivos del sector y no aparece; se buscaron además anclas exactas por concepto. Ningún lugar del código lee este valor: el circuito existe o no existe. v0.70/v0.71." },
  ],
}

export const PREFIJOS_CENTRO_DATOS = [
  'perfiles_datos',
  'import_jobs',
  'export_jobs',
  'snapshots_import',
  'acciones_export',
  'config_import',
  'stock_imports',
  'ventas_diarias',
  'items_sin_match',
]

export const EXCLUIR_CENTRO_DATOS: string[] = []
