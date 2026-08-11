import type { Manifiesto } from '../tipos'

/**
 * Manifiesto de DOCUMENTOS — modo ESPEJO. Pool de NÚCLEO.
 *
 * El motor que convierte una foto de un papel en datos. Es el primer pool
 * declarado que NO es una sub-app: no tiene entrada en el dock ni menú propio,
 * y sus pantallas viven dentro de Finanzas. Por eso lleva `subapp: null`.
 *
 * Esa distinción hacía falta: sin ella el comparador reportaba para siempre "no
 * hay sub-app registrada con esa clave" sobre un pool perfectamente declarado, y
 * una diferencia que nunca se puede cerrar entrena a ignorar el comparador.
 *
 * Vocabulario NEUTRO —y acá cuesta más que en ningún otro—: el motor no sabe qué
 * es una receta, un psicotrópico ni un remito de droguería. Sabe de documentos
 * con líneas, terceros, items y precios. Ese fue el punto de la sesión que lo
 * construyó y el manifiesto no lo rompe.
 */
export const MANIFIESTO_DOCUMENTOS: Manifiesto = {
  formato: '2.0.0',
  pool: 'documentos',
  nombre: 'Motor de documentos',
  categoria: 'nucleo',
  desinstalable: false,
  alcance: 'global',
  subapp: null,
  descripcion:
    'Convierte la foto de un papel en datos: lee el documento con un modelo de visión, identifica al tercero y a cada item, y deja el precio real en el historial. Lo usan Compras y Finanzas por igual, así que no pertenece a ninguno de los dos.',

  entidades: [
    { tabla: 'doc_documentos', rol: 'El papel: de quién, de cuándo, por cuánto', acceso: 'propia' },
    { tabla: 'doc_lineas', rol: 'Renglón por renglón: qué item, cuánto y a qué precio', acceso: 'propia' },
    { tabla: 'doc_extracciones', rol: 'Qué leyó el modelo y con cuánta confianza. Queda para poder auditarlo', acceso: 'propia' },
    { tabla: 'doc_terceros_alias', rol: 'Cómo se llama el mismo tercero en cada papel distinto', acceso: 'propia' },
    { tabla: 'doc_items_alias', rol: 'Cómo se llama el mismo item en el papel de cada tercero', acceso: 'propia' },
    { tabla: 'doc_precios_historial', rol: 'Lo que se pagó de verdad por cada item, y cuándo. La base del costo', acceso: 'propia' },

    { tabla: 'proveedores', rol: 'El tercero que emite el papel', acceso: 'leida', dueno: 'compras' },
    { tabla: 'productos_catalogo', rol: 'El item al que hay que asociar cada renglón', acceso: 'leida', dueno: 'configuracion' },
    { tabla: 'sucursales', rol: 'Qué punto compró. Tiene impacto fiscal, así que va siempre explícito', acceso: 'leida', dueno: 'configuracion' },
  ],

  // Los títulos de la PIEZA son etiquetas de catálogo, no el texto exacto de un
  // proyecto. En v0.62 se metió acá el texto de Social Ahorro para que el lector
  // no le cambiara la cabecera a nadie; eso funcionó pero estaba en el nivel
  // equivocado. Desde v0.64 el texto exacto de cada negocio vive en los
  // overrides de su instalación, y acá queda el default de la pieza.
  pantallas: [
    // Todas viven bajo /admin/finanzas: el motor no tiene sección propia.
    { ruta: '/admin/finanzas/documentos', titulo: 'Documentos', molde: 'lista_maestra', permiso: 'finanzas', navegable: false },
    { ruta: '/admin/finanzas/documentos/lote', titulo: 'Carga en lote', molde: 'wizard', permiso: 'finanzas', navegable: false },
        // Tiene parámetro pero su título es fijo: se revisó y se deja constancia.
    { ruta: '/admin/finanzas/documentos/revision/[id]', titulo: 'Revisión de lectura', molde: 'ficha', permiso: 'finanzas', navegable: false, titulo_dinamico: false },

    // El título sale del documento: tipo, punto de venta y número. El lector no
    // la gobierna — reemplazar eso por una etiqueta fija sería quitarle
    // información a la pantalla, no configurarla.
    { ruta: '/admin/finanzas/documentos/[docId]', titulo: 'Ficha de documento', molde: 'ficha', permiso: 'finanzas', navegable: false, titulo_dinamico: true },
  ],

  // El asistente no tiene herramientas sobre documentos: leer un papel empieza
  // con una foto, no con una frase.
  acciones: [],

  permisos: [
    { modulo: 'finanzas', acciones: ['ver', 'crear', 'editar'] },
    { modulo: 'compras', acciones: ['ver', 'crear', 'editar'] },
  ],

  depende_de: ['configuracion', 'tareas'],
  usado_por: ['ofertas', 'compras', 'finanzas'],

  agentes: [
    {
      clave: 'lector_de_papeles',
      nombre: 'Lector de papeles',
      trabajo:
        'Lee la foto de un documento, saca el tercero, los renglones y los importes, y trata de asociar cada renglón a un item del catálogo. Lo que no puede leer con confianza, lo deja marcado en vez de inventarlo.',
      necesita: [
        { dato: 'El catálogo de items', donde: 'Configuración', sin_esto: 'Lee los renglones pero no los puede asociar a nada' },
        { dato: 'Al menos un tercero cargado', donde: 'Proveedores', sin_esto: 'No puede identificar de quién es el papel' },
      ],
      se_activa_con: 'Cargar el catálogo de items y dar de alta el primer tercero.',
      acciones: [
        { clave: 'extraer_documento', titulo: 'Leer el papel', participacion: 'prepara', motivo: 'Deja la lectura completa esperando revisión. Nada entra a las cuentas sin que alguien confirme.' },
        { clave: 'proponer_asociacion', titulo: 'Proponer a qué item corresponde cada renglón', participacion: 'sugiere', motivo: 'Una asociación equivocada mete un costo en el item que no es, y de ahí sale una oferta a pérdida.' },
        { clave: 'aprender_alias', titulo: 'Recordar cómo llama cada tercero a cada item', participacion: 'hace_y_avisa', reversible: true, motivo: 'Sólo aprende de lo que una persona ya confirmó, y el alias se borra en un clic.' },
        { clave: 'avisar_revision_pendiente', titulo: 'Avisar que hay papeles esperando', participacion: 'informa', reversible: false, compromete_tercero: false, motivo: 'Aviso al equipo. No sale del sistema ni compromete a nadie.' },
        {
          clave: 'inventar_dato_ilegible',
          titulo: 'Completar lo que no se puede leer',
          participacion: 'nunca',
          motivo: 'Un importe adivinado es peor que un campo vacío: el vacío se ve, el número inventado se contabiliza. Si no se lee, se marca y espera.',
        },
      ],
      capacidades: ['cargar', 'detectar', 'explicar'],
      permisos: [
        { modulo: 'finanzas', acciones: ['ver', 'crear', 'editar'] },
        { modulo: 'compras', acciones: ['ver', 'crear', 'editar'] },
      ],
    },
  ],

  constitucional: [
    {
      limite: 'confirmacion_humana',
      tipo: 'accion',
      elemento: 'extraer_documento',
      motivo: 'Lo que el modelo leyó no entra a las cuentas sin que una persona lo mire. Un importe mal leído que se contabiliza solo no se descubre hasta el cierre.',
    },
    {
      limite: 'autoridad_precio',
      tipo: 'entidad',
      elemento: 'doc_precios_historial',
      motivo: 'Guarda lo que se PAGÓ, no lo que se cobra. Ningún proceso deriva de acá un precio de venta: esa autoridad es del sistema de facturación.',
    },
    {
      limite: 'auditoria',
      tipo: 'entidad',
      elemento: 'doc_extracciones',
      motivo: 'Es lo que el modelo leyó y con cuánta confianza. Sin eso no se puede auditar por qué el sistema creyó lo que creyó.',
    },
  ],

  configurable: [
    {
      clave: 'umbral_confianza_auto', etiqueta: 'Confianza mínima para asociar solo', tipo: 'numero', default: 0.9, peso: 'sensible', peso_motivo: 'Bajarlo hace que el modelo asocie renglones sin que nadie mire, y de ahí sale un costo mal cargado.', minimo: 0.5, maximo: 1,
      fuente: { tipo: 'variable_de_entorno', nombre: "DOC_UMBRAL_AUTO", resuelto: 'no_gobernable', nota: "Es sensible, así que el lector no lo devuelve igual. Mientras exista DOC_UMBRAL_AUTO, el valor efectivo sale de ahí y la declaración es documentación, no gobierno. Se dice para que nadie lo lea al revés." },
      depende_de: [
        { archivo: "lib/documentos/matchear.ts", consume: "matchearLineas", via: 'literal', efecto: "Decide si asocia un renglón solo." },
      ],
    },
    {
      clave: 'usos_minimos_alias', etiqueta: 'Veces que hay que confirmar un alias antes de darlo por bueno', tipo: 'entero', default: 3, peso: 'sensible', peso_motivo: 'Bajarlo da por bueno un alias con poca evidencia y ensucia el historial de precios.', minimo: 1, maximo: 50, unidad: 'veces',
      fuente: { tipo: 'variable_de_entorno', nombre: "DOC_USOS_MIN_AUTO", resuelto: 'no_gobernable', nota: "Mismo caso que umbral_confianza_auto: sensible y con fuente de entorno viva." },
      depende_de: [
        { archivo: "lib/documentos/matchear.ts", consume: "matchearLineas", via: 'literal', efecto: "Cuántas veces hay que confirmar un alias antes de darlo por bueno." },
      ],
    },
    { clave: 'punto_de_compra_obligatorio', etiqueta: 'Exige indicar en qué punto se compró', tipo: 'booleano', default: true, peso: 'sensible', peso_motivo: 'Es el punto que emite el comprobante: tiene impacto fiscal.'  },
  ],
}

export const PREFIJOS_DOCUMENTOS = ['doc_']

/**
 * La conciliación vive en el namespace `doc_` pero es de Compras.
 *
 * El motor aporta el documento leído; cruzarlo contra la orden y el remito es
 * un proceso de compras, no de lectura. Se excluye con el motivo escrito en vez
 * de angostar el prefijo a mano tabla por tabla.
 */
export const EXCLUIR_DOCUMENTOS = [
  'doc_conciliaciones',
  'doc_conciliacion_ordenes',
  'doc_conciliacion_documentos',
  'doc_factores_unidad',
]
