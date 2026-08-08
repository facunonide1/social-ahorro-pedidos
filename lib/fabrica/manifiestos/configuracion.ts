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
  formato: '1.2.0',
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

  configurable: [
    { clave: 'multi_punto', etiqueta: 'El negocio opera en más de un punto', tipo: 'booleano', default: true },
    { clave: 'codigo_item_externo', etiqueta: 'Los items tienen un código de un sistema externo', tipo: 'booleano', default: true },
    { clave: 'permisos_finos', etiqueta: 'Permisos por módulo y acción, además del rol', tipo: 'booleano', default: true },
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
