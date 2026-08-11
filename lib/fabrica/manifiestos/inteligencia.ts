import type { Manifiesto } from '../tipos'

/**
 * Manifiesto de INTELIGENCIA — modo ESPEJO. Pool de NÚCLEO.
 *
 * El asistente, el feed de avisos, las aprobaciones y la auditoría. Es el
 * núcleo más transversal: lee de todos los sectores y le escribe a ninguno.
 *
 * Es también el pool donde la capa de agentes se muerde la cola: Inteligencia
 * es la infraestructura sobre la que corren los agentes de los demás pools. Su
 * propio agente no hace trabajo de negocio — resume, prioriza y audita lo que
 * hicieron los otros.
 *
 * Sobre las entidades leídas: el censo anotaba `["*"]`, que no es una tabla y no
 * se puede verificar. Acá se declaran las que efectivamente consulta el
 * asistente; el resto entra por las herramientas de cada pool, que ya están
 * declaradas en sus propios manifiestos.
 *
 * Vocabulario NEUTRO: asistente, aviso, aprobación, registro de auditoría.
 */
export const MANIFIESTO_INTELIGENCIA: Manifiesto = {
  formato: '1.9.0',
  pool: 'inteligencia',
  nombre: 'Inteligencia',
  categoria: 'nucleo',
  desinstalable: false,
  alcance: 'global',
  descripcion:
    'La capa que atraviesa todo: el asistente que responde y actúa, el feed donde aparece lo que hay que mirar, la cola de lo que espera aprobación, y el registro de quién hizo qué.',

  entidades: [
    { tabla: 'nora_config', rol: 'Qué puede hacer el asistente y con cuánta autonomía', acceso: 'propia' },
    { tabla: 'nora_avisos', rol: 'Lo que el sistema quiere que alguien mire hoy', acceso: 'propia', escriben_otros: true },
    { tabla: 'nora_acciones', rol: 'Qué acciones ejecutó el asistente y con qué resultado', acceso: 'propia' },
    { tabla: 'nora_conversaciones', rol: 'Las conversaciones con el asistente', acceso: 'propia' },
    { tabla: 'ai_conversaciones', rol: 'Historial de mensajes del asistente por persona', acceso: 'propia' },
    { tabla: 'ai_resumenes_diarios', rol: 'El resumen del día, armado sin que nadie lo pida', acceso: 'propia' },
    { tabla: 'aprobaciones', rol: 'Lo que espera que una persona diga que sí', acceso: 'propia', escriben_otros: true },
    { tabla: 'notificaciones_admin', rol: 'El buzón interno del equipo. Le escribe medio sistema', acceso: 'propia', escriben_otros: true },
    { tabla: 'auditoria_logs', rol: 'Quién hizo qué, cuándo y sobre qué. No se edita', acceso: 'propia', escriben_otros: true },
    { tabla: 'adjuntos', rol: 'Archivos colgados de cualquier cosa del sistema', acceso: 'propia', escriben_otros: true },
    { tabla: 'sucursales_metricas_diarias', rol: 'Cómo viene cada punto, día a día. La base del tablero de performance', acceso: 'propia', alcance: 'por_sucursal' },

    { tabla: 'sucursales', rol: 'Los puntos que compara el tablero', acceso: 'leida', dueno: 'configuracion' },
    { tabla: 'users_admin', rol: 'Quién pregunta, y con qué permisos puede actuar el asistente en su nombre', acceso: 'leida', dueno: 'configuracion' },
    { tabla: 'ventas_diarias', rol: 'El volumen contra el que se calcula todo indicador', acceso: 'leida', dueno: 'centro-datos' },
  ],

  pantallas: [
    { ruta: '/admin/nora', titulo: 'Asistente', molde: 'chat', permiso: 'ia' },
    { ruta: '/admin/nora/feed', titulo: 'Feed', molde: 'feed', permiso: 'ia' },
    { ruta: '/admin/bi', titulo: 'Reportes', molde: 'tablero', permiso: 'bi' },
    { ruta: '/admin/ia/resumen', titulo: 'Resumen del día', molde: 'tablero', permiso: 'ia' },
    { ruta: '/admin/ia', titulo: 'Panel del asistente', molde: 'tablero', permiso: 'ia' },
    { ruta: '/admin/sucursales/performance', titulo: 'Performance por punto', molde: 'tablero', permiso: 'bi' },

    { ruta: '/admin/aprobaciones', titulo: 'Aprobaciones', molde: 'bandeja', permiso: 'aprobaciones', navegable: false },
    { ruta: '/admin/asistente', titulo: 'Asistente general', molde: 'chat', permiso: 'ia', navegable: false },
    { ruta: '/admin/ia/tickets', titulo: 'Validación de tickets', molde: 'bandeja', permiso: 'ia', navegable: false },

    // PRESTADA: el menú de Inteligencia la lleva para comparar puntos, pero el
    // listado de puntos es de Configuración.
    { ruta: '/admin/sucursales', titulo: 'Listado de puntos', molde: 'lista_maestra', pertenencia: 'prestada' },
  ],

  // Ninguna herramienta propia, y no es un olvido: Inteligencia es la capa
  // SOBRE la que corre el asistente. Las herramientas que el asistente ofrece
  // son de cada pool y están declaradas en el manifiesto de cada uno.
  acciones: [],

  permisos: [
    { modulo: 'ia', acciones: ['ver', 'crear', 'editar'] },
    { modulo: 'bi', acciones: ['ver'] },
    { modulo: 'aprobaciones', acciones: ['ver', 'aprobar'] },
    { modulo: 'auditoria', acciones: ['ver'] },
  ],

  depende_de: ['configuracion', 'centro-datos'],
  usado_por_todos: true,

  agentes: [
    {
      clave: 'coordinador',
      nombre: 'Coordinador',
      trabajo:
        'Junta lo que pasó en todos los sectores y arma el resumen del día: qué se salió de lo normal, qué está esperando una decisión, y qué conviene mirar primero. No hace trabajo de ningún sector: ordena el de todos.',
      necesita: [
        { dato: 'Al menos un sector con datos cargados', sin_esto: 'No tiene qué resumir y el resumen queda vacío' },
        { dato: 'Ventas diarias', donde: 'Centro de Datos', sin_esto: 'Puede listar pendientes pero no puede decir si el día fue bueno o malo' },
      ],
      se_activa_con: 'Cargar ventas de al menos un mes.',
      acciones: [
        { clave: 'armar_resumen_diario', titulo: 'Armar el resumen del día', participacion: 'hace_y_avisa', reversible: true, motivo: 'Escribe un resumen y nada más. Se regenera a la corrida siguiente.' },
        { clave: 'publicar_aviso', titulo: 'Poner algo en el feed', participacion: 'informa', reversible: false, compromete_tercero: false, motivo: 'Es el buzón interno del equipo. Un aviso leído no se des-lee, y está bien: no compromete nada.' },
        { clave: 'priorizar_pendientes', titulo: 'Ordenar qué mirar primero', participacion: 'sugiere', motivo: 'Propone un orden. La agenda del día la decide una persona.' },
        { clave: 'auditar_acciones', titulo: 'Registrar quién hizo qué', participacion: 'informa', reversible: false, compromete_tercero: false, motivo: 'Deja el registro. Es lo que permite reconstruir qué pasó cuando algo sale mal.' },
        {
          clave: 'aprobar_en_nombre_de_alguien',
          titulo: 'Aprobar algo que espera decisión',
          participacion: 'nunca',
          motivo: 'La cola de aprobaciones existe justamente para que una persona decida. Un asistente que se auto-aprueba convierte el control en un trámite.',
        },
        {
          clave: 'borrar_auditoria',
          titulo: 'Borrar o editar el registro de auditoría',
          participacion: 'nunca',
          motivo: 'Un registro que se puede editar no sirve para nada. Es la única tabla del sistema que sólo crece.',
        },
      ],
      capacidades: ['detectar', 'priorizar', 'explicar', 'responder'],
      permisos: [
        { modulo: 'ia', acciones: ['ver', 'crear', 'editar'] },
        { modulo: 'bi', acciones: ['ver'] },
        // Sin `aprobar`: es exactamente el permiso que no puede tener.
        { modulo: 'aprobaciones', acciones: ['ver'] },
        { modulo: 'auditoria', acciones: ['ver'] },
      ],
    },
  ],

  constitucional: [
    {
      limite: 'auditoria',
      tipo: 'entidad',
      elemento: 'auditoria_logs',
      motivo: 'No se desactiva, no se borra y no se edita. Es la única tabla del sistema que sólo crece, y un registro que se puede editar no sirve para nada.',
    },
    {
      limite: 'auditoria',
      tipo: 'accion',
      elemento: 'acortar_retencion_auditoria',
      // El validador levantó la contradicción: el plazo estaba declarado
      // intocable arriba y ofrecido como parámetro abajo. Las dos cosas eran
      // ciertas a medias. Alargar el plazo es configuración; acortarlo es
      // borrar auditoría con otro nombre. Lo constitucional es la acción de
      // acortarlo, no el parámetro.
      motivo: 'El plazo de retención se puede alargar por configuración. Acortarlo, no: sería borrar registros de auditoría llamándolo de otra manera.',
    },
    {
      limite: 'confirmacion_humana',
      tipo: 'entidad',
      elemento: 'aprobaciones',
      motivo: 'La cola existe para que una persona decida. Un asistente que se auto-aprueba convierte el control en un trámite.',
    },
    {
      limite: 'confirmacion_humana',
      tipo: 'accion',
      elemento: 'aprobar_en_nombre_de_alguien',
      motivo: 'Nadie aprueba en nombre de otro. La aprobación vale por quién la firma.',
    },
  ],

  configurable: [
    { clave: 'requiere_aprobacion_acciones', etiqueta: 'Toda acción del asistente pasa por aprobación', tipo: 'booleano', default: true, peso: 'sensible', peso_motivo: 'Apagarlo saca la cola de aprobaciones del medio. Es el control, no una preferencia.'  },
    { clave: 'retencion_auditoria_dias', etiqueta: 'Días que se guarda el registro de auditoría', tipo: 'entero', default: 3650, peso: 'sensible', peso_motivo: 'Acortarlo es borrar auditoría con otro nombre.', minimo: 365, maximo: 7300, unidad: 'dias' },
  ],

  hechos: [
    { clave: 'resumen_diario_activo', afirma: "Arma el resumen del día solo", comprobado_por: "Se buscó la clave literal en los 689 archivos del sector y no aparece; se buscaron además anclas exactas por concepto. Ningún lugar del código lee este valor: el circuito existe o no existe. v0.70/v0.71." },
  ],
}

export const PREFIJOS_INTELIGENCIA = [
  'nora_',
  'ai_',
  'aprobaciones',
  'notificaciones_admin',
  'auditoria_',
  'adjuntos',
  'sucursales_metricas_diarias',
]

export const EXCLUIR_INTELIGENCIA: string[] = []
