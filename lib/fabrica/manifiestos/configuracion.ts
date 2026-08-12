import type { Manifiesto } from '../tipos'

/**
 * Manifiesto de CONFIGURACIÓN — modo ESPEJO. Pool de NÚCLEO.
 *
 * Es la raíz del catálogo: no depende de nadie y todos dependen de él. Los
 * cuatro pools ya declarados lo listaban en `depende_de` y el validador lo
 * avisaba en cada corrida — declararlo es lo que cierra ese aviso.
 *
 * Obligó a agregar `usado_por_todos`. La alternativa era enumerar los
 * diecisiete sectores y volver a editar este archivo con cada pool nuevo: la
 * dependencia invertida que un núcleo no puede tener.
 *
 * Vocabulario NEUTRO: acá no hay "farmacia" ni "producto de farmacia". Un item
 * es lo que el negocio maneja; un punto es donde opera; una persona del panel
 * es quien lo usa.
 */
export const MANIFIESTO_CONFIGURACION: Manifiesto = {
  formato: '2.2.0',
  pool: 'configuracion',
  nombre: 'Configuración',
  categoria: 'nucleo',
  desinstalable: false,
  alcance: 'global',
  descripcion:
    'La identidad del proyecto: quién entra y con qué permisos, dónde opera, y el catálogo de items sobre el que trabaja todo lo demás. Es la raíz: no depende de nadie.',

  entidades: [
    {
      tabla: 'users_admin',
      rol: 'Quién entra al panel, con qué rol y qué permisos finos',
      acceso: 'propia',
      // No tiene email ni nombre: eso vive en auth.users, fuera del esquema
      // del proyecto. Lo que sí guarda es una CREDENCIAL — el hash del PIN de
      // mostrador — que es más delicado que cualquier dato de contacto.
      campos_sensibles: ['pin_hash', 'numero_empleado'],
    },
    { tabla: 'sucursales', rol: 'Los puntos donde el negocio opera', acceso: 'propia' },
    {
      tabla: 'productos_catalogo',
      rol: 'El item que el negocio maneja, con su identidad y su código. LA maestra',
      acceso: 'propia',
      // La escribe el importador de Centro de Datos, además del alta manual.
      escriben_otros: true,
    },
    { tabla: 'app_settings', rol: 'Los parámetros del sistema que no son de ningún sector', acceso: 'propia' },
  ],

  pantallas: [
    { ruta: '/admin/configuracion/usuarios', titulo: 'Usuarios y permisos', molde: 'lista_maestra', permiso: 'configuracion' },
    { ruta: '/admin/configuracion/catalogo', titulo: 'Catálogo de items', molde: 'lista_maestra', permiso: 'configuracion' },
    { ruta: '/admin/configuracion/general', titulo: 'General', molde: 'formulario', permiso: 'configuracion' },

    { ruta: '/admin/configuracion/catalogo/importar', titulo: 'Importar catálogo', molde: 'wizard', permiso: 'configuracion', navegable: false },
    { ruta: '/admin/sucursales', titulo: 'Puntos', molde: 'lista_maestra', permiso: 'sucursales', navegable: false },
    { ruta: '/admin/sucursales/nueva', titulo: 'Alta de punto', molde: 'wizard', permiso: 'sucursales', navegable: false },
    { ruta: '/admin/sucursales/[id]', titulo: 'Ficha de punto', molde: 'ficha', permiso: 'sucursales', navegable: false },

    // PRESTADAS: el menú de Configuración las lleva, pero son de Tareas
    // (definen el catálogo de trabajos) y de Personas (turnos). Se declaran
    // prestadas para que Configuración no se las lleve al instalarse.
    { ruta: '/admin/configuracion/tipos-tareas', titulo: 'Tipos de tareas', molde: 'formulario', pertenencia: 'prestada' },
    { ruta: '/admin/configuracion/recurrencias', titulo: 'Recurrencias', molde: 'formulario', pertenencia: 'prestada' },
    { ruta: '/admin/configuracion/supervisores', titulo: 'Supervisores', molde: 'formulario', pertenencia: 'prestada' },
    { ruta: '/admin/configuracion/turnos', titulo: 'Turnos', molde: 'formulario', pertenencia: 'prestada' },
  ],

  // El asistente no tiene herramientas de configuración, y está bien: cambiar
  // quién entra al sistema no se pide por chat.
  acciones: [],

  permisos: [
    { modulo: 'configuracion', acciones: ['ver', 'crear', 'editar', 'eliminar'] },
    { modulo: 'sucursales', acciones: ['ver', 'crear', 'editar'] },
  ],

  depende_de: [],
  usado_por_todos: true,

  // Sin agentes, y es la respuesta correcta: configurar es un acto humano. Un
  // agente que se otorgue permisos o dé de alta usuarios rompe la única puerta
  // que tiene el sistema.
  agentes: [],

  constitucional: [
    {
      limite: 'umbrales_y_permisos',
      tipo: 'campo',
      elemento: 'users_admin.rol',
      motivo: 'Quién puede qué se cambia a mano, con nombre y apellido. Ninguna configuración de proyecto ni ningún chat reparte roles.',
    },
    {
      limite: 'umbrales_y_permisos',
      tipo: 'campo',
      elemento: 'users_admin.permisos_custom',
      motivo: 'Los permisos finos son el último control que queda cuando el rol es amplio. Se editan a mano o no son un control.',
    },
    {
      limite: 'umbrales_y_permisos',
      tipo: 'campo',
      elemento: 'users_admin.pin_hash',
      motivo: 'Es una credencial. No se lee, no se copia entre proyectos y no se muestra en ninguna pantalla ni exportación.',
    },
  ],

  configurable: [
    { clave: 'permisos_finos', etiqueta: 'Permisos por módulo y acción, además del rol', tipo: 'booleano', default: true, peso: 'sensible', peso_motivo: 'Apagarlo deja el permiso sólo en manos del rol y afloja un control. Cae bajo umbrales_y_permisos.'  },
  ],

  hechos: [
    { clave: 'multi_punto', afirma: "El negocio opera en más de un punto", tipo: 'condicionado', depende_de: "Cuántos puntos de venta tiene el negocio. No es una propiedad del software: la pieza funciona con uno o con veinte, y el hecho es cierto porque hoy hay cuatro sucursales cargadas.", comprobado_por: "Se buscó la clave literal en los 689 archivos del sector y no aparece; se buscaron además anclas exactas por concepto. Ningún lugar del código lee este valor: el circuito existe o no existe. v0.70/v0.71." },
    { clave: 'codigo_item_externo', afirma: "Los items tienen un código de un sistema externo", tipo: 'condicionado', depende_de: "Si el catálogo de este negocio trae códigos de otro sistema. La pieza soporta las dos formas; el hecho depende de cómo se cargó el catálogo.", comprobado_por: "Se buscó la clave literal en los 689 archivos del sector y no aparece; se buscaron además anclas exactas por concepto. Ningún lugar del código lee este valor: el circuito existe o no existe. v0.70/v0.71." },
  ],
}

export const PREFIJOS_CONFIGURACION = [
  'users_admin',
  'sucursales',
  'productos_catalogo',
  'app_settings',
]

/**
 * `sucursales` como prefijo alcanza tablas de métricas que no son de acá.
 *
 * Se excluyen con el motivo escrito en vez de angostar el prefijo, para que el
 * prefijo siga sirviendo de red: si mañana aparece un `sucursales_horarios`, el
 * comparador lo va a levantar como tabla sin declarar.
 */
export const EXCLUIR_CONFIGURACION = [
  'sucursales_metricas_diarias', // performance por punto: es de Inteligencia
]
