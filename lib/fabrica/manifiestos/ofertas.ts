import type { Manifiesto } from '../tipos'

/**
 * Manifiesto de OFERTAS — modo ESPEJO.
 *
 * Espejo quiere decir: esto DESCRIBE código que ya existe y funciona. La
 * fábrica no lo generó y no lo va a regenerar. El valor de escribirlo es
 * descubrir si la fábrica es capaz de describir un sector real sin deformarlo,
 * antes de intentar generar uno.
 *
 * REGLA: si el comparador encuentra una diferencia entre esto y el código, se
 * corrige ESTO. El código de Ofertas no se toca para que la declaración cierre.
 *
 * Vocabulario NEUTRO: acá abajo no hay "farmacia", "droguería" ni "receta". Una
 * oferta es una acción comercial sobre items, con vigencia y medición. Eso
 * existe igual en una ferretería.
 */
export const MANIFIESTO_OFERTAS: Manifiesto = {
  formato: '1.0.0',
  pool: 'ofertas',
  nombre: 'Ofertas',
  categoria: 'generico',
  desinstalable: true,
  alcance: 'mixto',
  descripcion:
    'Acciones comerciales sobre items: se proponen, se aprueban, salen a la calle y se miden. Cierra el loop entre lo que se decidió ofrecer y lo que efectivamente se vendió.',

  entidades: [
    { tabla: 'ofertas', rol: 'La acción comercial: qué, cuánto, desde cuándo hasta cuándo', acceso: 'propia' },
    { tabla: 'oferta_items', rol: 'Los items alcanzados por la oferta', acceso: 'propia' },
    { tabla: 'ofertas_versiones', rol: 'Historial de cambios de una oferta antes de aprobarse', acceso: 'propia' },
    { tabla: 'ofertas_confirmaciones', rol: 'Quién confirmó que la oferta llegó al punto de venta', acceso: 'propia' },
    { tabla: 'ofertas_aprendizaje', rol: 'Qué funcionó y qué no, para la próxima propuesta', acceso: 'propia' },
    { tabla: 'ofertas_experimentos', rol: 'Pruebas controladas sobre variantes de una oferta', acceso: 'propia' },
    { tabla: 'ofertas_exports_sifaco', rol: 'Envío al sistema que tiene la autoridad sobre el precio de venta', acceso: 'propia' },
    { tabla: 'ofertas_briefs', rol: 'Encargo al tercero que produce la pieza de comunicación', acceso: 'propia' },
    { tabla: 'mostrador_destacados', rol: 'Qué conviene ofrecer hoy en el punto de venta', acceso: 'propia' },
    { tabla: 'campanias', rol: 'Agrupación de ofertas bajo una misma idea', acceso: 'propia' },

    { tabla: 'productos_catalogo', rol: 'Los items sobre los que se hace la oferta', acceso: 'leida', dueno: 'configuracion' },
    { tabla: 'sucursales', rol: 'Dónde aplica la oferta', acceso: 'leida', dueno: 'configuracion' },
    { tabla: 'clientes', rol: 'A quién se le puede ofrecer', acceso: 'leida', dueno: 'clientes' },
    { tabla: 'doc_precios_historial', rol: 'Costo real del item, para no ofertar a pérdida', acceso: 'leida', dueno: 'documentos' },
  ],

  pantallas: [
    { ruta: '/admin/ofertas', titulo: 'Ofertas', molde: 'lista_maestra', permiso: 'ofertas' },
    { ruta: '/admin/ofertas/propuestas', titulo: 'Propuestas', molde: 'bandeja', permiso: 'ofertas' },
    { ruta: '/admin/ofertas/calendario', titulo: 'Calendario', molde: 'calendario', permiso: 'ofertas' },
    { ruta: '/admin/ofertas/rendimiento', titulo: 'Rendimiento', molde: 'tablero', permiso: 'ofertas' },
    { ruta: '/admin/ofertas/panel', titulo: 'Para ofrecer', molde: 'tablero', permiso: 'ofertas' },
    { ruta: '/admin/ofertas/asistente', titulo: 'Asistente', molde: 'chat', permiso: 'ofertas' },

    // Existen, son de Ofertas, y el menú de la sub-app no las lleva. Se declara
    // así porque es lo que pasa; corregirlo es cambiar el menú de Ofertas, y el
    // código de un sector que funciona no se toca desde la fábrica.
    { ruta: '/admin/ofertas/briefs', titulo: 'Encargos al tercero', molde: 'lista_maestra', permiso: 'ofertas', navegable: false },
    { ruta: '/admin/ofertas/importar', titulo: 'Importar', molde: 'wizard', permiso: 'ofertas', navegable: false },

    // Fichas de detalle: se llega desde una lista, no desde el menú.
    { ruta: '/admin/ofertas/[id]', titulo: 'Ficha de oferta', molde: 'ficha', permiso: 'ofertas', navegable: false },
    { ruta: '/admin/ofertas/[id]/cartel', titulo: 'Cartel', molde: 'ficha', permiso: 'ofertas', navegable: false },
    { ruta: '/admin/ofertas/exports/[id]', titulo: 'Detalle de envío', molde: 'ficha', permiso: 'ofertas', navegable: false },

    // PRESTADA: el menú de Ofertas la navega, pero la pantalla es de
    // Inteligencia. Se declara prestada y no propia para que Ofertas no se la
    // lleve al instalarse en otro proyecto.
    { ruta: '/admin/ia/tickets', titulo: 'Validación de tickets', molde: 'bandeja', pertenencia: 'prestada' },
  ],

  acciones: [
    {
      clave: 'ofertas_activas',
      titulo: 'Qué está vigente',
      descripcion: 'Lista las ofertas en curso con su tipo, valor y fecha de vencimiento.',
      requiere_confirmacion: false,
    },
    {
      clave: 'oferta_para_cliente',
      titulo: 'Qué ofrecerle a este cliente',
      descripcion: 'Dado un item, sugiere las ofertas vigentes que lo alcanzan.',
      requiere_confirmacion: false,
    },
    {
      clave: 'estado_lectura_oferta',
      titulo: 'Estado de una oferta',
      descripcion: 'Devuelve en qué punto del circuito está una oferta.',
      requiere_confirmacion: false,
    },
  ],

  permisos: [{ modulo: 'ofertas', acciones: ['ver', 'crear', 'editar', 'aprobar'] }],

  depende_de: ['configuracion', 'tareas'],

  configurable: [
    { clave: 'exporta_a_sistema_externo', etiqueta: 'Exporta el precio a un sistema externo', tipo: 'booleano', default: true },
    { clave: 'requiere_confirmacion_en_punto', etiqueta: 'Pide confirmar la llegada al punto de venta', tipo: 'booleano', default: true },
    { clave: 'usa_briefs', etiqueta: 'Encarga la pieza de comunicación a un tercero', tipo: 'booleano', default: true },
  ],
}

/**
 * Prefijos con los que se buscan tablas del sector en el esquema real.
 *
 * Sirven para la pregunta que importa de verdad: ¿hay tablas de Ofertas que el
 * manifiesto NO declara? Una declaración incompleta pasa cualquier verificación
 * que sólo mire en un sentido.
 */
export const PREFIJOS_OFERTAS = ['ofertas', 'oferta_']
