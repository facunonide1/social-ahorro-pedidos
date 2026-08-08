import type { Manifiesto } from '../tipos'

/**
 * Manifiesto de STOCK — modo ESPEJO. Pool GENÉRICO.
 *
 * El pool más grande de los cuatro: 18 entidades propias. Lo que obliga a
 * resolver no es el tamaño sino la propiedad compartida.
 *
 *   `productos_catalogo` es la tabla MAESTRA del proyecto. La lee medio
 *   sistema y la escribe uno solo. Sin declarar quién es el dueño, dos pools
 *   que la usan parecen tener el mismo derecho sobre ella — y al instalarlos
 *   juntos uno le cambia la forma al otro.
 *
 * También es el primero donde el alcance por punto de venta importa de verdad:
 * `stock_items` es el catálogo de lo que se maneja (global) y `stock_sucursal`
 * es cuánto hay en cada lugar (por punto). Son dos cosas distintas y el
 * manifiesto tiene que poder decirlo entidad por entidad.
 *
 * Vocabulario NEUTRO: no hay "droguería" ni "medicamento". Vencimientos y lotes
 * son de cualquier perecedero; una zona es un pedazo del depósito.
 */
export const MANIFIESTO_STOCK: Manifiesto = {
  formato: '1.3.0',
  pool: 'stock',
  nombre: 'Stock',
  categoria: 'generico',
  desinstalable: true,
  alcance: 'mixto',
  descripcion:
    'Qué hay, dónde está y cuánto queda. Movimientos, transferencias entre puntos, inventarios físicos, vencimientos y las irregularidades que aparecen cuando la cuenta no da.',

  entidades: [
    { tabla: 'stock_items', rol: 'El item que se maneja en depósito, con su mínimo y su punto de pedido', acceso: 'propia', escriben_otros: true, alcance: 'global' },
    { tabla: 'stock_sucursal', rol: 'Cuánto hay de cada item en cada punto', acceso: 'propia', escriben_otros: true, alcance: 'por_sucursal' },
    { tabla: 'movimientos_stock', rol: 'Cada entrada y salida, con su motivo', acceso: 'propia', escriben_otros: true, alcance: 'por_sucursal' },
    { tabla: 'stock_snapshots', rol: 'La foto periódica, para poder decir cómo estaba el martes', acceso: 'propia', alcance: 'por_sucursal' },
    { tabla: 'transferencias_sucursal', rol: 'Mercadería que se mueve de un punto a otro', acceso: 'propia', alcance: 'por_sucursal' },
    { tabla: 'transferencia_items', rol: 'Qué se mandó en cada transferencia', acceso: 'propia' },
    { tabla: 'inventarios_fisicos', rol: 'El conteo real contra lo que el sistema dice', acceso: 'propia', alcance: 'por_sucursal' },
    { tabla: 'inventario_items', rol: 'Item por item, cuánto había de verdad', acceso: 'propia' },
    { tabla: 'vencimientos', rol: 'Lo que se vence y cuándo, para sacarlo antes de perderlo', acceso: 'propia', alcance: 'por_sucursal' },
    { tabla: 'lotes_productos', rol: 'La partida de la que viene cada unidad', acceso: 'propia' },
    { tabla: 'zonas', rol: 'El pedazo de depósito o de salón que alguien tiene a cargo', acceso: 'propia', alcance: 'por_sucursal' },
    { tabla: 'controles_zona', rol: 'La recorrida de una zona: qué se revisó y qué se encontró', acceso: 'propia', alcance: 'por_sucursal' },
    { tabla: 'control_zona_items', rol: 'El detalle de lo revisado en la recorrida', acceso: 'propia' },
    { tabla: 'alertas_stock', rol: 'Lo que está por faltar o ya faltó', acceso: 'propia', escriben_otros: true, alcance: 'por_sucursal' },
    { tabla: 'irregularidades_stock', rol: 'Diferencias sin explicación entre lo contado y lo esperado', acceso: 'propia', alcance: 'por_sucursal' },
    { tabla: 'listas_recartelado', rol: 'Qué carteles hay que rehacer porque cambió el precio', acceso: 'propia', alcance: 'por_sucursal' },
    { tabla: 'recartelado_items', rol: 'Los items de cada lista de carteles', acceso: 'propia' },
    { tabla: 'producto_rotacion', rol: 'Qué tan rápido se mueve cada item; define el mínimo', acceso: 'propia' },

    // LA MAESTRA. La lee medio sistema, la escribe uno. Declarar el dueño es lo
    // que evita que dos pools se crean con el mismo derecho sobre ella.
    { tabla: 'productos_catalogo', rol: 'El item, su identidad y su código. Maestra del proyecto', acceso: 'leida', dueno: 'configuracion' },
    { tabla: 'sucursales', rol: 'Los puntos entre los que se mueve la mercadería', acceso: 'leida', dueno: 'configuracion' },
    { tabla: 'ventas_diarias', rol: 'Cuánto sale, para calcular rotación y reposición', acceso: 'leida', dueno: 'centro-datos' },
    // El importador es de Centro de Datos; Stock sólo mira el resultado.
    { tabla: 'stock_imports', rol: 'Las cargas masivas de stock que hizo el importador', acceso: 'leida', dueno: 'centro-datos' },
    { tabla: 'stock_imports_items', rol: 'El detalle de cada carga masiva', acceso: 'leida', dueno: 'centro-datos' },
  ],

  // Etiquetas de catálogo. Las 8 "diferencias" que encontró sombra en v0.63 no
  // eran errores de declaración: era el texto de Social Ahorro metido en la
  // pieza compartida. Desde v0.64 eso vive en los overrides de la instalación.
  pantallas: [
    { ruta: '/admin/operaciones', titulo: 'Panel', molde: 'tablero', permiso: 'operaciones' },
    { ruta: '/admin/operaciones/stock', titulo: 'Stock', molde: 'lista_maestra', permiso: 'operaciones' },
    { ruta: '/admin/operaciones/transferencias', titulo: 'Transferencias', molde: 'lista_maestra', permiso: 'operaciones' },
    { ruta: '/admin/operaciones/vencimientos', titulo: 'Vencimientos', molde: 'lista_maestra', permiso: 'operaciones' },
    { ruta: '/admin/operaciones/recartelado', titulo: 'Recartelado', molde: 'lista_maestra', permiso: 'operaciones' },
    { ruta: '/admin/operaciones/inventarios', titulo: 'Inventarios', molde: 'lista_maestra', permiso: 'operaciones' },
    { ruta: '/admin/operaciones/control-zonas', titulo: 'Control por zonas', molde: 'lista_maestra', permiso: 'operaciones' },
    { ruta: '/admin/operaciones/alertas', titulo: 'Alertas', molde: 'feed', permiso: 'operaciones' },
    { ruta: '/admin/operaciones/analisis', titulo: 'Análisis', molde: 'tablero', permiso: 'operaciones' },
    { ruta: '/admin/operaciones/reposicion', titulo: 'Reposición', molde: 'tablero', permiso: 'operaciones' },
    { ruta: '/admin/operaciones/irregularidades', titulo: 'Irregularidades', molde: 'bandeja', permiso: 'operaciones' },
    { ruta: '/admin/operaciones/asistente', titulo: 'Asistente', molde: 'chat', permiso: 'operaciones' },

    { ruta: '/admin/operaciones/stock/[id]', titulo: 'Ficha de item', molde: 'ficha', permiso: 'operaciones', navegable: false },
    { ruta: '/admin/operaciones/stock/nuevo', titulo: 'Alta de item', molde: 'wizard', permiso: 'operaciones', navegable: false },
    { ruta: '/admin/operaciones/transferencias/[id]', titulo: 'Ficha de transferencia', molde: 'ficha', permiso: 'operaciones', navegable: false },
    { ruta: '/admin/operaciones/transferencias/nueva', titulo: 'Nueva transferencia', molde: 'wizard', permiso: 'operaciones', navegable: false },
    { ruta: '/admin/operaciones/inventarios/[id]', titulo: 'Ficha de inventario', molde: 'ficha', permiso: 'operaciones', navegable: false },
    { ruta: '/admin/operaciones/control-zonas/[id]', titulo: 'Ficha de control de zona', molde: 'ficha', permiso: 'operaciones', navegable: false },

    // Existe, es de Stock, y el menú no la lleva: muestra el resultado de las
    // cargas masivas que hace el importador de Centro de Datos.
    { ruta: '/admin/operaciones/importaciones', titulo: 'Importaciones de stock', molde: 'lista_maestra', permiso: 'operaciones', navegable: false },
  ],

  acciones: [
    { clave: 'get_stock_critico', titulo: 'Qué está por faltar', descripcion: 'Lista los items por debajo del mínimo, por punto.', requiere_confirmacion: false },
    { clave: 'get_vencimientos_proximos', titulo: 'Qué se vence', descripcion: 'Devuelve lo que vence en los próximos días, para sacarlo antes de perderlo.', requiere_confirmacion: false },
    { clave: 'get_anomalias', titulo: 'Qué no cierra', descripcion: 'Señala diferencias entre lo contado y lo esperado que nadie explicó.', requiere_confirmacion: false },
    { clave: 'get_resumen_ventas', titulo: 'Cuánto salió', descripcion: 'Resume el movimiento de salida del período.', requiere_confirmacion: false },
  ],

  permisos: [{ modulo: 'operaciones', acciones: ['ver', 'crear', 'editar', 'aprobar'] }],

  depende_de: ['configuracion', 'tareas', 'centro-datos'],
  usado_por: ['compras'],

  agentes: [
    {
      clave: 'vigia_de_deposito',
      nombre: 'Vigía de depósito',
      trabajo:
        'Avisa lo que está por faltar y lo que está por vencerse, propone qué reponer, y señala las diferencias que nadie explicó.',
      necesita: [
        { dato: 'Stock inicial cargado', donde: 'Centro de Datos', sin_esto: 'No tiene contra qué comparar: sin punto de partida no hay faltante' },
        { dato: 'Mínimo por item', donde: 'Stock', sin_esto: 'No puede decir qué está por faltar' },
        { dato: 'Ventas diarias', donde: 'Centro de Datos', sin_esto: 'Calcula el faltante pero no la rotación, y propone reponer lo que no se vende' },
      ],
      se_activa_con: 'Importar el stock inicial y definir mínimos.',
      acciones: [
        { clave: 'recalcular_alertas', titulo: 'Recalcular qué está por faltar', participacion: 'hace_y_avisa', reversible: true, motivo: 'Reescribe una lista derivada del stock. Se recalcula sola en la corrida siguiente.' },
        // Notifica a los supervisores del punto. Interno y sin compromiso.
        { clave: 'notificar_faltantes', titulo: 'Avisarle al encargado del punto', participacion: 'informa', reversible: false, compromete_tercero: false, motivo: 'Le llega a quien tiene el punto a cargo. Es información para trabajar, no un compromiso con nadie.' },
        { clave: 'avisar_vencimientos', titulo: 'Avisar lo que se vence', participacion: 'informa', reversible: false, compromete_tercero: false, motivo: 'Aviso al equipo. Sacar la mercadería del salón lo hace una persona.' },
        { clave: 'recalcular_rotacion', titulo: 'Recalcular la rotación', participacion: 'hace_y_avisa', reversible: true, motivo: 'Es un cálculo sobre ventas. No cambia stock ni precios.' },
        { clave: 'proponer_reposicion', titulo: 'Proponer qué reponer', participacion: 'sugiere', motivo: 'De acá sale una orden de compra. La decide una persona.' },
        { clave: 'detectar_irregularidades', titulo: 'Señalar lo que no cierra', participacion: 'sugiere', motivo: 'Marca la diferencia; explicarla es de quien estuvo ahí.' },
        {
          clave: 'ajustar_stock',
          titulo: 'Corregir la cantidad en sistema',
          participacion: 'nunca',
          motivo: 'Un ajuste sin conteo humano no corrige el stock: borra la evidencia de que faltaba algo.',
        },
      ],
      capacidades: ['detectar', 'recomendar', 'priorizar', 'explicar'],
      permisos: [{ modulo: 'operaciones', acciones: ['ver', 'crear', 'editar'] }],
    },
  ],

  constitucional: [
    {
      limite: 'confirmacion_humana',
      tipo: 'accion',
      elemento: 'ajustar_stock',
      motivo: 'Un ajuste sin conteo humano no corrige el stock: borra la evidencia de que faltaba algo.',
    },
    {
      limite: 'auditoria',
      tipo: 'entidad',
      elemento: 'movimientos_stock',
      motivo: 'Cada entrada y salida con su motivo y su autor. No se edita: corregir un movimiento se hace con otro movimiento.',
    },
    {
      limite: 'auditoria',
      tipo: 'entidad',
      elemento: 'irregularidades_stock',
      motivo: 'Las diferencias sin explicación no se borran cuando incomodan. Se explican o siguen abiertas.',
    },
  ],

  configurable: [
    { clave: 'controla_vencimientos', etiqueta: 'Sigue fechas de vencimiento', tipo: 'booleano', default: true },
    { clave: 'controla_lotes', etiqueta: 'Sigue partidas o lotes', tipo: 'booleano', default: true },
    { clave: 'dias_aviso_vencimiento', etiqueta: 'Días de anticipación para avisar', tipo: 'numero', default: 30 },
    { clave: 'transferencias_entre_puntos', etiqueta: 'Mueve mercadería entre puntos', tipo: 'booleano', default: true },
    { clave: 'control_por_zonas', etiqueta: 'Divide el espacio en zonas con responsable', tipo: 'booleano', default: true },
  ],
}

/**
 * Prefijos del sector.
 *
 * `stock_` a secas trae `stock_imports*`, que es del importador de Centro de
 * Datos. Ahí sí conviene angostar, porque son tablas de otro sector que sólo
 * comparten el sustantivo.
 */
export const PREFIJOS_STOCK = [
  'stock_items',
  'stock_sucursal',
  'stock_snapshots',
  'movimientos_stock',
  'transferencia',
  'inventario',
  'vencimientos',
  'lotes_',
  'zonas',
  'controles_zona',
  'control_zona',
  'alertas_stock',
  'irregularidades_stock',
  'listas_recartelado',
  'recartelado_',
  'producto_rotacion',
]

/**
 * Lo que el prefijo alcanza y no es de Stock.
 *
 * Se excluye con nombre y motivo en vez de angostar el prefijo hasta que no la
 * toque: las dos cosas producen el mismo resultado, pero sólo una deja escrito
 * de quién es la tabla.
 */
export const EXCLUIR_STOCK = [
  'zonas_reparto', // zonas de entrega a domicilio: son de Pedidos
]
