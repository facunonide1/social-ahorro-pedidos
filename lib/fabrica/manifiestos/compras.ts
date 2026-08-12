import type { Manifiesto } from '../tipos'

/**
 * Manifiesto de COMPRAS — modo ESPEJO. Pool GENÉRICO.
 *
 * El sector que más creció en las últimas sesiones: comparador de costos,
 * conciliación de tres puntas, radar de demanda. Lo que obliga a resolver:
 *
 *   dimensiones        Tres rubros que NO son tres sectores: son un filtro
 *                      sobre el mismo circuito. Declararlo evita que la fábrica
 *                      proponga triplicar el pool cada vez que aparece uno.
 *   dos comparadores   Listas vigentes y costos realmente pagados responden
 *                      preguntas distintas. Se declaran separados con su
 *                      propósito, no fusionados.
 *   punto comprador    `ordenes_compra.sucursal_compradora_id` es fiscal y es
 *                      OTRA COSA que el punto destino de la recepción.
 *
 * Vocabulario NEUTRO: no hay "droguería" ni "medicamento". Hay terceros que
 * proveen, órdenes, recepciones y devoluciones. La devolución a droguería es un
 * caso del mismo circuito, no una entidad aparte del rubro.
 */
export const MANIFIESTO_COMPRAS: Manifiesto = {
  formato: '2.2.0',
  pool: 'compras',
  nombre: 'Compras',
  categoria: 'generico',
  desinstalable: true,
  alcance: 'mixto',
  descripcion:
    'Qué comprar, a quién y a qué precio. Del faltante detectado a la orden, de la orden a la recepción, y de la recepción al cruce contra el papel que llegó.',

  entidades: [
    {
      tabla: 'ordenes_compra',
      rol: 'El pedido a un tercero: qué, cuánto y a qué precio acordado',
      acceso: 'propia',
      alcance: 'por_sucursal',
    },
    { tabla: 'orden_compra_items', rol: 'Renglón por renglón de cada orden', acceso: 'propia' },
    { tabla: 'avisos_faltante', rol: 'Lo que alguien marcó que falta antes de que el sistema lo note', acceso: 'propia', escriben_otros: true, alcance: 'por_sucursal' },
    { tabla: 'demanda_invisible', rol: 'La venta que se perdió porque no había: se registra con un tap', acceso: 'propia', alcance: 'por_sucursal' },
    { tabla: 'listas_precios', rol: 'La lista vigente de un tercero: lo que dice que cobra', acceso: 'propia' },
    { tabla: 'listas_precios_items', rol: 'Precio por item de cada lista', acceso: 'propia' },
    { tabla: 'recepciones_mercaderia', rol: 'Lo que efectivamente llegó, a qué punto y cuándo', acceso: 'propia', alcance: 'por_sucursal' },
    { tabla: 'recepcion_items', rol: 'Qué llegó de cada renglón, y qué faltó', acceso: 'propia' },
    { tabla: 'devoluciones_proveedor', rol: 'Lo que se le devuelve al tercero y por qué', acceso: 'propia', alcance: 'por_sucursal' },
    { tabla: 'devolucion_items', rol: 'Qué se devuelve en cada devolución', acceso: 'propia' },
    { tabla: 'devoluciones_drogueria', rol: 'El circuito de devolución con plazo del tercero mayorista', acceso: 'propia' },
    { tabla: 'proveedor_devolucion_rubros', rol: 'Qué acepta devolver cada tercero y con qué plazo', acceso: 'propia' },

    // ── El tercero que provee ─────────────────────────────────────────
    {
      tabla: 'proveedores',
      rol: 'El tercero que provee: quién es, cómo se le paga, qué tan bien cumple',
      acceso: 'propia',
      // Datos fiscales, bancarios y de contacto del tercero. Los nombres se
      // sacaron del esquema, no de memoria: `email`, `telefono` y `direccion`
      // no existen — son `email_general`, `telefono_general` y
      // `domicilio_fiscal`. Y hay CBU en la tabla del tercero, además de la
      // tabla de cuentas.
      campos_sensibles: [
        'cuit', 'razon_social', 'domicilio_fiscal', 'localidad', 'provincia',
        'codigo_postal', 'email_general', 'telefono_general',
        'cbu', 'alias_cbu', 'banco', 'notas',
      ],
    },
    { tabla: 'proveedor_contactos', rol: 'Con quién se habla en cada tercero', acceso: 'propia', campos_sensibles: ['email', 'telefono', 'whatsapp', 'nombre'] },
    { tabla: 'proveedor_cuentas_bancarias', rol: 'A dónde se le transfiere', acceso: 'propia', campos_sensibles: ['cbu', 'alias', 'titular', 'cuit_titular', 'banco'] },
    { tabla: 'proveedor_documentos', rol: 'Los papeles del tercero: constancias, habilitaciones', acceso: 'propia' },
    { tabla: 'proveedor_score_eventos', rol: 'Cada vez que cumplió o no cumplió. De acá sale el puntaje', acceso: 'propia' },

    // ── Conciliación de tres puntas ───────────────────────────────────
    // Viven en el namespace doc_ porque nacieron con el motor, pero el proceso
    // es de compras: cruzar la orden contra el remito contra la factura.
    { tabla: 'doc_conciliaciones', rol: 'El cruce entre lo pedido, lo recibido y lo facturado', acceso: 'propia' },
    { tabla: 'doc_conciliacion_ordenes', rol: 'Qué órdenes entran en un cruce', acceso: 'propia' },
    { tabla: 'doc_conciliacion_documentos', rol: 'Qué papeles entran en un cruce', acceso: 'propia' },
    { tabla: 'doc_factores_unidad', rol: 'Cuántas unidades trae un bulto, por tercero y por item', acceso: 'propia' },

    // ── Escritura cruzada ─────────────────────────────────────────────
    // Una recepción mueve stock; una factura genera una cuenta por pagar. Las
    // dos son escrituras legítimas en tablas de otro, declaradas como tales.
    { tabla: 'movimientos_stock', rol: 'La recepción entra la mercadería al depósito', acceso: 'escrita', dueno: 'stock' },
    { tabla: 'alertas_stock', rol: 'Un faltante confirmado levanta la alerta del item', acceso: 'escrita', dueno: 'stock' },

    { tabla: 'productos_catalogo', rol: 'Los items que se compran', acceso: 'leida', dueno: 'configuracion' },
    { tabla: 'sucursales', rol: 'El punto que compra y el punto que recibe. No son lo mismo', acceso: 'leida', dueno: 'configuracion' },
    { tabla: 'doc_documentos', rol: 'El papel que llegó, para cruzarlo contra la orden', acceso: 'leida', dueno: 'documentos' },
    { tabla: 'doc_precios_historial', rol: 'Lo que se pagó de verdad. Es la base del comparador de costos', acceso: 'leida', dueno: 'documentos' },
    { tabla: 'stock_sucursal', rol: 'Cuánto hay, para saber cuánto pedir', acceso: 'leida', dueno: 'stock' },
    { tabla: 'facturas_proveedor', rol: 'La obligación que generó la compra', acceso: 'leida', dueno: 'finanzas' },
  ],

  pantallas: [
    { ruta: '/admin/compras', titulo: 'Tablero', molde: 'tablero', permiso: 'compras' },
    { ruta: '/admin/compras/recomendaciones', titulo: 'Qué comprar', molde: 'tablero', permiso: 'compras' },
    { ruta: '/admin/compras/faltantes', titulo: 'Avisos de faltantes', molde: 'bandeja', permiso: 'compras' },

    // LOS DOS COMPARADORES. Se declaran separados porque responden preguntas
    // distintas: uno compara lo que los terceros DICEN que cobran, el otro lo
    // que efectivamente SE PAGÓ. Fusionarlos en la declaración sería declarar
    // una pantalla que no existe.
    { ruta: '/admin/compras/comparador', titulo: 'Comparador de listas vigentes', molde: 'lista_maestra', permiso: 'compras' },
    { ruta: '/admin/compras/costos', titulo: 'Comparador de costos pagados', molde: 'lista_maestra', permiso: 'compras' },

    { ruta: '/admin/compras/conciliaciones', titulo: 'Conciliaciones', molde: 'lista_maestra', permiso: 'compras' },
    { ruta: '/admin/compras/ordenes', titulo: 'Órdenes de compra', molde: 'lista_maestra', permiso: 'compras' },
    { ruta: '/admin/compras/recepciones', titulo: 'Recepciones', molde: 'lista_maestra', permiso: 'compras' },
    { ruta: '/admin/compras/devoluciones', titulo: 'Devoluciones', molde: 'lista_maestra', permiso: 'compras' },
    { ruta: '/admin/compras/listas-precios', titulo: 'Listas de precios', molde: 'lista_maestra', permiso: 'compras' },
    { ruta: '/admin/compras/demanda', titulo: 'Radar de demanda', molde: 'tablero', permiso: 'compras' },
    { ruta: '/admin/proveedores', titulo: 'Terceros que proveen', molde: 'lista_maestra', permiso: 'compras' },
    { ruta: '/admin/compras/asistente', titulo: 'Asistente', molde: 'chat', permiso: 'compras' },

    { ruta: '/admin/compras/costos/[itemId]', titulo: 'Historia de costo de un item', molde: 'ficha', permiso: 'compras', navegable: false },
    { ruta: '/admin/compras/conciliaciones/[id]', titulo: 'Ficha de conciliación', molde: 'ficha', permiso: 'compras', navegable: false },
    { ruta: '/admin/compras/ordenes/nueva', titulo: 'Nueva orden', molde: 'wizard', permiso: 'compras', navegable: false },
    { ruta: '/admin/compras/devoluciones/nueva', titulo: 'Nueva devolución', molde: 'wizard', permiso: 'compras', navegable: false },
    { ruta: '/admin/compras/devoluciones/[id]', titulo: 'Ficha de devolución', molde: 'ficha', permiso: 'compras', navegable: false },
    { ruta: '/admin/proveedores/nuevo', titulo: 'Alta de tercero', molde: 'wizard', permiso: 'compras', navegable: false },
    { ruta: '/admin/proveedores/[id]', titulo: 'Ficha de tercero', molde: 'ficha', permiso: 'compras', navegable: false },
    { ruta: '/admin/recepciones', titulo: 'Recepciones en el punto', molde: 'lista_maestra', permiso: 'compras', navegable: false },
    { ruta: '/admin/recepciones/nueva', titulo: 'Registrar una recepción', molde: 'wizard', permiso: 'compras', navegable: false },
    { ruta: '/admin/recepciones/[id]', titulo: 'Ficha de recepción', molde: 'ficha', permiso: 'compras', navegable: false },
  ],

  acciones: [
    { clave: 'get_faltantes', titulo: 'Qué falta', descripcion: 'Lista los faltantes marcados y los detectados, por punto.', requiere_confirmacion: false },
    { clave: 'score_proveedor', titulo: 'Qué tan bien cumple un tercero', descripcion: 'Devuelve el puntaje de cumplimiento a partir de lo que entregó y lo que no.', requiere_confirmacion: false },
    { clave: 'get_proveedor_resumen', titulo: 'Resumen de un tercero', descripcion: 'Qué se le compra, cuánto se le debe y cómo viene cumpliendo.', requiere_confirmacion: false },
  ],

  permisos: [{ modulo: 'compras', acciones: ['ver', 'crear', 'editar', 'aprobar'] }],

  depende_de: ['configuracion', 'tareas', 'documentos', 'stock', 'finanzas'],

  dimensiones: [
    {
      clave: 'rubro',
      etiqueta: 'Rubro',
      columnas: ['ordenes_compra.rubro', 'listas_precios.rubro', 'proveedores.rubros'],
      valores: ['farmacia', 'perfumeria', 'supermercado'],
      motivo:
        'Tres rubros con circuitos, pantallas y reglas idénticas. Son un filtro sobre el mismo pool, no tres pools: separarlos triplicaría el mantenimiento para no ganar nada.',
    },
  ],

  constitucional: [
    {
      limite: 'umbrales_y_permisos',
      tipo: 'campo',
      elemento: 'ordenes_compra.sucursal_compradora_id',
      motivo: 'Define qué punto emite el comprobante y por lo tanto quién declara la compra. No es lo mismo que el punto destino, y no se completa solo ni se infiere: tiene impacto fiscal.',
    },
    {
      limite: 'autoridad_precio',
      tipo: 'entidad',
      elemento: 'doc_precios_historial',
      motivo: 'Es lo que se pagó, no lo que se cobra. Ningún proceso de compras escribe un precio de venta a partir de un costo: la autoridad del precio de venta es del sistema de facturación.',
    },
    {
      limite: 'confirmacion_humana',
      tipo: 'accion',
      elemento: 'emitir_orden',
      motivo: 'Una orden emitida es un compromiso con un tercero. Se manda cuando una persona la manda.',
    },
    {
      limite: 'auditoria',
      tipo: 'entidad',
      elemento: 'proveedor_score_eventos',
      motivo: 'El puntaje de un tercero se construye con hechos registrados uno por uno. Si se pudieran editar, el puntaje deja de significar algo.',
    },
  ],

  agentes: [
    {
      clave: 'comprador',
      nombre: 'Comprador',
      trabajo:
        'Junta lo que falta, lo que no rota y lo que se vende sin stock, y arma el pedido sugerido por tercero. Después cruza lo que llegó contra lo que se pidió y contra lo que se facturó, y marca lo que no cierra.',
      necesita: [
        { dato: 'Al menos un tercero cargado', donde: 'Terceros que proveen', sin_esto: 'No tiene a quién pedirle nada' },
        { dato: 'Stock por punto', donde: 'Stock', sin_esto: 'No puede saber cuánto pedir' },
        { dato: 'Costos reales de compras anteriores', donde: 'Motor de documentos', sin_esto: 'Propone a quién comprarle sin saber quién sale más barato' },
      ],
      se_activa_con: 'Dar de alta un tercero y cargar la primera factura de compra.',
      acciones: [
        { clave: 'armar_pedido_sugerido', titulo: 'Armar el pedido', participacion: 'prepara', motivo: 'Deja la orden armada con cantidades y tercero sugerido. La emite una persona.' },
        { clave: 'detectar_suba_de_costo', titulo: 'Marcar aumentos fuera de patrón', participacion: 'sugiere', motivo: 'Con inflación, todo sube. El agente marca lo que sube distinto al resto; decidir si se reclama es de una persona.' },
        { clave: 'proponer_conciliacion', titulo: 'Proponer el cruce de tres puntas', participacion: 'sugiere', motivo: 'Un cruce mal hecho da por pagado algo que no llegó.' },
        { clave: 'avisar_faltantes', titulo: 'Avisar lo que falta', participacion: 'informa', reversible: false, compromete_tercero: false, motivo: 'Aviso al equipo. No le pide nada a ningún tercero.' },
        { clave: 'proponer_reclamo', titulo: 'Preparar el reclamo al tercero', participacion: 'prepara', reversible: false, compromete_tercero: true, motivo: 'Un reclamo sale del negocio hacia un tercero. Se deja escrito y lo manda una persona.' },
        {
          clave: 'emitir_orden',
          titulo: 'Emitir la orden de compra',
          participacion: 'nunca',
          toca_dinero: true,
          compromete_tercero: true,
          motivo: 'Una orden emitida compromete plata con alguien de afuera. No hay monto lo bastante chico como para justificar la excepción.',
        },
        {
          clave: 'dar_por_recibido',
          titulo: 'Dar por recibida una mercadería',
          participacion: 'nunca',
          motivo: 'La recepción la firma quien abrió la caja. Un agente que la dé por buena borra la única evidencia de que faltaba algo.',
        },
      ],
      capacidades: ['detectar', 'recomendar', 'priorizar', 'explicar'],
      permisos: [{ modulo: 'compras', acciones: ['ver', 'crear', 'editar'] }],
    },
  ],

  configurable: [
    {
      clave: 'dias_volumen', etiqueta: "Ventana para medir cuánto se compró", tipo: 'entero', default: 90, peso: 'operativo', peso_motivo: "Pondera el ahorro por unidades compradas. Corta, subestima el impacto; larga, arrastra un volumen que ya no es el de hoy.", minimo: 7, maximo: 730, unidad: 'dias',
      fuente: { tipo: 'variable_de_entorno', nombre: "DOC_DIAS_VOLUMEN", resuelto: 'no_gobernable', nota: "Declarado en v0.73 con peso, rango y unidad. Todavía NO cableado: mientras exista DOC_DIAS_VOLUMEN el valor efectivo sale de ahí y la declaración es documentación, no gobierno. Cablearlo es el trabajo siguiente." },
      depende_de: [
        { archivo: "lib/documentos/alertas-costo.ts", consume: "alertaAumentoFueraDePatron", simbolo: "DOC_DIAS_VOLUMEN", via: 'literal', efecto: "Mide las unidades compradas en la ventana para calcular el impacto en plata." },
      ],
    },
    {
      clave: 'alerta_monto_minimo', etiqueta: "Plata en juego para que sea alerta y no sugerencia", tipo: 'numero', default: 10000, peso: 'operativo', peso_motivo: "Decide si algo interrumpe a alguien o queda como sugerencia. Mal puesto, molesta por monedas o se calla ante plata de verdad.", minimo: 0, maximo: 10000000, unidad: 'pesos',
      fuente: { tipo: 'variable_de_entorno', nombre: "DOC_ALERTA_MONTO_MINIMO", resuelto: 'no_gobernable', nota: "Declarado en v0.73 con peso, rango y unidad. Todavía NO cableado: mientras exista DOC_ALERTA_MONTO_MINIMO el valor efectivo sale de ahí y la declaración es documentación, no gobierno. Cablearlo es el trabajo siguiente." },
      depende_de: [
        { archivo: "lib/documentos/alertas-costo.ts", consume: "alertaAumentoFueraDePatron", simbolo: "DOC_ALERTA_MONTO_MINIMO", via: 'literal', efecto: "Sube la severidad de sugerencia a alerta." },
        { archivo: "lib/documentos/alertas-costo.ts", consume: "alertaContraLista", simbolo: "DOC_ALERTA_MONTO_MINIMO", via: 'literal', efecto: "Ídem para la alerta contra lista de precios." },
      ],
    },
    {
      clave: 'conc_ventana_dias', etiqueta: "Días atrás para buscar órdenes candidatas", tipo: 'entero', default: 60, peso: 'operativo', peso_motivo: "Acota qué órdenes compiten por ser la del documento. Corta, no encuentra la orden y la conciliación queda sin par; larga, ofrece órdenes viejas que confunden.", minimo: 7, maximo: 365, unidad: 'dias',
      fuente: { tipo: 'variable_de_entorno', nombre: "DOC_CONC_VENTANA_DIAS", resuelto: 'no_gobernable', nota: "Declarado en v0.73 con peso, rango y unidad. Todavía NO cableado: mientras exista DOC_CONC_VENTANA_DIAS el valor efectivo sale de ahí y la declaración es documentación, no gobierno. Cablearlo es el trabajo siguiente." },
      depende_de: [
        { archivo: "lib/documentos/vincular.ts", consume: "ordenesCandidatas", simbolo: "DOC_CONC_VENTANA_DIAS", via: 'literal', efecto: "Acota la búsqueda de órdenes y penaliza las lejanas." },
      ],
    },
    {
      clave: 'conc_tol_cantidad', etiqueta: "Tolerancia de cantidad al conciliar", tipo: 'entero', default: 0, peso: 'sensible', peso_motivo: "Cero por defecto y a propósito: las unidades son enteras y una de menos es una de menos. Subirla da por buena mercadería que no llegó, que es plata.", minimo: 0, maximo: 100, unidad: 'unidades',
      fuente: { tipo: 'variable_de_entorno', nombre: "DOC_CONC_TOL_CANTIDAD", resuelto: 'no_gobernable', nota: "Declarado en v0.73 con peso, rango y unidad. Todavía NO cableado: mientras exista DOC_CONC_TOL_CANTIDAD el valor efectivo sale de ahí y la declaración es documentación, no gobierno. Cablearlo es el trabajo siguiente." },
      depende_de: [
        { archivo: "lib/documentos/conciliar.ts", consume: "conciliar", simbolo: "DOC_CONC_TOL_CANTIDAD", via: 'literal', efecto: "Decide si una diferencia de cantidad se da por buena." },
      ],
    },
    {
      clave: 'conc_tol_precio_pct', etiqueta: "Tolerancia de precio al conciliar, en porcentaje", tipo: 'numero', default: 1, peso: 'sensible', peso_motivo: "Afloja el control de que te cobren lo pactado. Subirla deja pasar sobreprecios sin que nadie los mire.", minimo: 0, maximo: 100, unidad: 'porcentaje',
      fuente: { tipo: 'variable_de_entorno', nombre: "DOC_CONC_TOL_PRECIO_PCT", resuelto: 'no_gobernable', nota: "Declarado en v0.73 con peso, rango y unidad. Todavía NO cableado: mientras exista DOC_CONC_TOL_PRECIO_PCT el valor efectivo sale de ahí y la declaración es documentación, no gobierno. Cablearlo es el trabajo siguiente." },
      depende_de: [
        { archivo: "lib/documentos/conciliar.ts", consume: "conciliar", simbolo: "DOC_CONC_TOL_PRECIO_PCT", via: 'literal', efecto: "Junto con la tolerancia en pesos, decide si una diferencia de precio se da por buena." },
      ],
    },
    {
      clave: 'conc_tol_precio_ars', etiqueta: "Tolerancia de precio al conciliar, en pesos", tipo: 'numero', default: 5, peso: 'sensible', peso_motivo: "La otra mitad de la tolerancia de precio: se toma la mayor de las dos. Mismo riesgo.", minimo: 0, maximo: 100000, unidad: 'pesos',
      fuente: { tipo: 'variable_de_entorno', nombre: "DOC_CONC_TOL_PRECIO_ARS", resuelto: 'no_gobernable', nota: "Declarado en v0.73 con peso, rango y unidad. Todavía NO cableado: mientras exista DOC_CONC_TOL_PRECIO_ARS el valor efectivo sale de ahí y la declaración es documentación, no gobierno. Cablearlo es el trabajo siguiente." },
      depende_de: [
        { archivo: "lib/documentos/conciliar.ts", consume: "conciliar", simbolo: "DOC_CONC_TOL_PRECIO_ARS", via: 'literal', efecto: "Piso en pesos de la tolerancia de precio." },
      ],
    },
    {
      clave: 'conc_monto_minimo', etiqueta: "Diferencia mínima para abrir una conciliación", tipo: 'numero', default: 2000, peso: 'sensible', peso_motivo: "Decide qué diferencias se miran y cuáles pasan sin que nadie las vea. Subirlo esconde plata por debajo del umbral.", minimo: 0, maximo: 1000000, unidad: 'pesos',
      fuente: { tipo: 'variable_de_entorno', nombre: "DOC_CONC_MONTO_MINIMO", resuelto: 'no_gobernable', nota: "Declarado en v0.73 con peso, rango y unidad. Todavía NO cableado: mientras exista DOC_CONC_MONTO_MINIMO el valor efectivo sale de ahí y la declaración es documentación, no gobierno. Cablearlo es el trabajo siguiente." },
      depende_de: [
        { archivo: "lib/documentos/conciliar.ts", consume: "conciliar", simbolo: "DOC_CONC_MONTO_MINIMO", via: 'literal', efecto: "Decide si la diferencia total amerita abrir una conciliación." },
        { archivo: "lib/documentos/acciones-conciliacion.ts", consume: "reclamarFaltante", simbolo: "DOC_CONC_MONTO_MINIMO", via: 'literal', efecto: "Sube la severidad del reclamo de sugerencia a alerta." },
        { archivo: "lib/documentos/acciones-conciliacion.ts", consume: "avisarDiferencia", simbolo: "DOC_CONC_MONTO_MINIMO", via: 'literal', efecto: "Decide si una diferencia amerita avisar." },
      ],
    },
    {
      clave: 'conc_dias_tarea', etiqueta: "Días con una diferencia sin resolver antes de avisar", tipo: 'entero', default: 7, peso: 'operativo', peso_motivo: "Cuánto se espera antes de generar la tarea de control. Corto, genera tareas de cosas que se estaban resolviendo; largo, la plata queda parada.", minimo: 1, maximo: 90, unidad: 'dias',
      fuente: { tipo: 'variable_de_entorno', nombre: "DOC_CONC_DIAS_TAREA", resuelto: 'no_gobernable', nota: "Declarado en v0.73 con peso, rango y unidad. Todavía NO cableado: mientras exista DOC_CONC_DIAS_TAREA el valor efectivo sale de ahí y la declaración es documentación, no gobierno. Cablearlo es el trabajo siguiente." },
      depende_de: [
        { archivo: "lib/documentos/dossier-proveedor.ts", consume: "generarTareasDeControl", simbolo: "DOC_CONC_DIAS_TAREA", via: 'literal', efecto: "Umbral de antigüedad para generar la tarea de control." },
      ],
    },
    {
      clave: 'dias_ventana_costo', etiqueta: 'Días para comparar la evolución de un costo', tipo: 'entero', default: 60, peso: 'operativo', peso_motivo: 'Ventana para comparar la evolución de un costo.', minimo: 7, maximo: 365, unidad: 'dias',
      fuente: { tipo: 'variable_de_entorno', nombre: "DOC_DIAS_DATO_FRESCO", resuelto: 'es_el_fallback', nota: "Cableado en v0.72: DOC_DIAS_DATO_FRESCO pasa a ser el tercer argumento de parametro() en los cinco lugares de consumo. Las dos fuentes quedan ordenadas —declaración primero con el pool prendido, variable de entorno después— en vez de compitiendo. No confundir con DOC_CONC_VENTANA_DIAS, que vale lo mismo pero es de conciliación: esa ambigüedad se resolvió leyendo en v0.70." },
      depende_de: [
        { archivo: "lib/documentos/costos.ts", consume: "fichaCostos", via: 'resuelve', efecto: "Marca cada precio de la ficha como fresco o viejo." },
        { archivo: "lib/documentos/costos.ts", consume: "grillaComparador", via: 'resuelve', efecto: "Marca cada celda del comparador como fresca o vieja." },
        { archivo: "app/api/documentos/costo/[itemId]/route.ts", consume: "GET", via: 'resuelve', efecto: "Filtra los precios frescos que compiten por ser el mejor, y devuelve la ventana usada." },
        { archivo: "app/(admin)/admin/compras/costos/page.tsx", consume: "ComparadorCostosPage", via: 'resuelve', efecto: "Resuelve la ventana y se la pasa a la pantalla." },
        { archivo: "lib/documentos/alertas-costo.ts", consume: "sugerenciaCambioProveedor", simbolo: "DOC_DIAS_DATO_FRESCO", via: 'resuelve', efecto: "Acota desde cuándo se miran precios para sugerir cambiar de proveedor." },
      ],
    },
    {
      clave: 'alerta_exceso_pct', etiqueta: 'Cuánto tiene que despegarse del promedio del proveedor', tipo: 'numero', default: 8, peso: 'operativo', peso_motivo: 'Separa "aumentó" de "aumentó más que el resto". Mal puesto, con inflación alta avisa de todo o de nada.', minimo: 1, maximo: 100, unidad: 'porcentaje',
      fuente: { tipo: 'variable_de_entorno', nombre: "DOC_ALERTA_EXCESO_PCT", resuelto: 'es_el_fallback', nota: "Se declara en v0.71: era la otra mitad de la alerta de costo y el manifiesto sólo conocía alerta_suba_pct. Declarar una y no la otra hacía creer que la alerta se controla con un solo número." },
      depende_de: [
        { archivo: "lib/documentos/alertas-costo.ts", consume: "alertaAumentoFueraDePatron", simbolo: "DOC_ALERTA_EXCESO_PCT", via: 'resuelve', efecto: "Descarta las subas que no se despegan del promedio del proveedor." },
      ],
    },
    {
      clave: 'alerta_suba_pct', etiqueta: 'Porcentaje de suba que dispara un aviso', tipo: 'numero', default: 15, peso: 'operativo', peso_motivo: 'Umbral de suba que dispara un aviso: mal puesto, avisa siempre o no avisa nunca.', minimo: 1, maximo: 100, unidad: 'porcentaje',
      fuente: { tipo: 'variable_de_entorno', nombre: "DOC_ALERTA_SUBA_PCT", resuelto: 'es_el_fallback', nota: "La constante se pasa como tercer argumento de parametro(): la declaración gana con el pool prendido, la variable de entorno gana si no. Ordenadas, no compitiendo." },
      depende_de: [
        { archivo: "lib/documentos/alertas-costo.ts", consume: "alertaAumentoFueraDePatron", simbolo: "DOC_ALERTA_SUBA_PCT", via: 'resuelve', efecto: "Descarta las subas por debajo del umbral antes de avisar." },
      ],
    },
    { clave: 'concilia_tres_puntas', etiqueta: 'Cruza orden, remito y factura', tipo: 'booleano', default: true, peso: 'sensible', peso_motivo: 'Apagarlo da por buena una factura sin cruzarla contra lo pedido y lo recibido.'  },
  ],

  hechos: [
    { clave: 'maneja_devoluciones', afirma: "Devuelve mercadería al tercero", tipo: 'permanente', comprobado_por: "Se buscó la clave literal en los 689 archivos del sector y no aparece; se buscaron además anclas exactas por concepto. Ningún lugar del código lee este valor: el circuito existe o no existe. v0.70/v0.71." },
    { clave: 'radar_demanda', afirma: "Registra la venta perdida por faltante", tipo: 'permanente', comprobado_por: "Se buscó la clave literal en los 689 archivos del sector y no aparece; se buscaron además anclas exactas por concepto. Ningún lugar del código lee este valor: el circuito existe o no existe. v0.70/v0.71." },
  ],

  deprecadas: [
    {
      tabla: 'zz_deprecated_matcheos_aprendidos_compras',
      reemplazada_por: 'doc_items_alias',
      desde: '2026-07',
      motivo: 'El aprendizaje de cómo llama cada tercero a cada item pasó al motor de documentos, que es quien lo lee.',
    },
  ],
}

export const PREFIJOS_COMPRAS = [
  'ordenes_compra',
  'orden_compra',
  'avisos_faltante',
  'demanda_invisible',
  'listas_precios',
  'recepcion',
  'devolucion',
  'devoluciones',
  'proveedor',
  'doc_conciliacion',
  'doc_factores',
  'zz_deprecated_matcheos',
]

export const EXCLUIR_COMPRAS = [
  'zz_deprecated_matcheos_aprendidos_compras', // declarada en `deprecadas`
]
