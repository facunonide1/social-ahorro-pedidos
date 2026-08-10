import type { Manifiesto } from '../tipos'

/**
 * Manifiesto de TAREAS — modo ESPEJO. Pool de NÚCLEO.
 *
 * Es el primer pool de núcleo declarado, y obligó a agregar cuatro cosas al
 * formato que Ofertas no había necesitado:
 *
 *   desinstalable: false   un núcleo no es una opción del proyecto
 *   usado_por              la relación inversa: quién lo necesita
 *   escriben_otros         media docena de pools crean tareas
 *   referencia_abierta     una tarea cuelga de cualquier fila de cualquier pool
 *
 * Esa última es la que define a este pool. Sin ella, el manifiesto de Tareas
 * tendría que enumerar a qué entidades puede apuntar — y cada pool nuevo
 * obligaría a editar el núcleo. Un núcleo que depende de sus consumidores deja
 * de ser núcleo.
 *
 * Vocabulario NEUTRO: no hay "farmacia" ni "sucursal de farmacia". Una tarea es
 * trabajo asignado con vencimiento y verificación. Existe igual en un taller.
 */
export const MANIFIESTO_TAREAS: Manifiesto = {
  formato: '1.8.0',
  pool: 'tareas',
  nombre: 'Tareas',
  categoria: 'nucleo',
  desinstalable: false,
  alcance: 'mixto',
  descripcion:
    'Trabajo asignado con responsable, vencimiento y verificación. Cualquier pool puede crear una tarea colgada de cualquier cosa suya, y ése es el mecanismo con el que el sistema cierra sus propios loops.',

  entidades: [
    {
      tabla: 'tareas',
      rol: 'El trabajo asignado: qué, quién, para cuándo, en qué estado',
      acceso: 'propia',
      escriben_otros: true,
      alcance: 'por_sucursal',
      referencia_abierta: {
        campo_tipo: 'entidad_relacionada',
        campo_id: 'entidad_id',
        campo_destino: 'entidad_url',
        nota: 'Una tarea cuelga de cualquier fila de cualquier pool sin FK. Es lo que permite que un pool nuevo genere tareas sin tocar el núcleo.',
      },
    },
    { tabla: 'tipos_tareas', rol: 'El catálogo de trabajos posibles, con su SLA y su forma de verificarse', acceso: 'propia' },
    { tabla: 'tareas_comentarios', rol: 'La conversación alrededor de una tarea', acceso: 'propia' },
    { tabla: 'tareas_adjuntos', rol: 'La evidencia de que el trabajo se hizo', acceso: 'propia' },
    { tabla: 'tareas_historial', rol: 'Quién cambió qué y cuándo', acceso: 'propia', escriben_otros: true },
    { tabla: 'tareas_recurrencias', rol: 'Los trabajos que vuelven solos: cada día, cada semana, cada mes', acceso: 'propia' },
    { tabla: 'tareas_triggers_auto', rol: 'Qué condición del negocio genera qué tarea, sin que nadie la pida', acceso: 'propia' },
    { tabla: 'supervisores_tareas', rol: 'Quién verifica el trabajo de quién, por punto', acceso: 'propia', alcance: 'por_sucursal' },
    { tabla: 'agendas_dia', rol: 'El plan del día de un punto: qué hay que hacer y en qué orden', acceso: 'propia', alcance: 'por_sucursal' },
    { tabla: 'tipos_tareas_metricas_mensuales', rol: 'Cuánto tardó cada tipo de trabajo, mes a mes', acceso: 'propia' },

    { tabla: 'users_admin', rol: 'A quién se le asigna y quién verifica', acceso: 'leida', dueno: 'configuracion' },
    { tabla: 'sucursales', rol: 'Dónde se hace el trabajo', acceso: 'leida', dueno: 'configuracion' },
    { tabla: 'empleados', rol: 'El legajo de quien ejecuta, para puntaje y objetivos', acceso: 'leida', dueno: 'personas' },
  ],

  pantallas: [
    { ruta: '/admin/tareas', titulo: 'Tareas', molde: 'lista_maestra', permiso: 'tareas' },
    { ruta: '/admin/tareas/agenda', titulo: 'Agenda del día', molde: 'calendario', permiso: 'tareas' },
    { ruta: '/admin/tareas/reportes', titulo: 'Reportes', molde: 'tablero', permiso: 'tareas' },
    { ruta: '/admin/verificaciones', titulo: 'Verificaciones', molde: 'bandeja', permiso: 'tareas' },
    { ruta: '/admin/tareas/asistente', titulo: 'Asistente', molde: 'chat', permiso: 'tareas' },

    { ruta: '/admin/tareas/[id]', titulo: 'Ficha de tarea', molde: 'ficha', permiso: 'tareas', navegable: false },

    // Viven bajo /admin/configuracion pero son de Tareas: definen el catálogo de
    // trabajos y las condiciones que los disparan. El menú de Tareas no las lleva.
    { ruta: '/admin/configuracion/tipos-tareas', titulo: 'Tipos de tarea', molde: 'formulario', permiso: 'tareas', navegable: false },
    { ruta: '/admin/configuracion/triggers-tareas', titulo: 'Disparadores automáticos', molde: 'formulario', permiso: 'tareas', navegable: false },
    { ruta: '/admin/configuracion/recurrencias', titulo: 'Recurrencias', molde: 'formulario', permiso: 'tareas', navegable: false },
    { ruta: '/admin/configuracion/supervisores', titulo: 'Supervisores', molde: 'formulario', permiso: 'tareas', navegable: false },

    // PRESTADA: el menú de Tareas la lleva, pero el panel personal es de
    // Personas (legajo, objetivos, badges). Tareas sólo aporta el listado.
    { ruta: '/admin/mi-panel', titulo: 'Mi panel', molde: 'tablero', pertenencia: 'prestada' },
  ],

  acciones: [
    { clave: 'listar_tareas', titulo: 'Qué hay pendiente', descripcion: 'Lista las tareas abiertas con su estado y vencimiento.', requiere_confirmacion: false },
    { clave: 'priorizar_mis_tareas', titulo: 'Por dónde empiezo', descripcion: 'Ordena las tareas de la persona por urgencia real, no por fecha de carga.', requiere_confirmacion: false },
    { clave: 'get_ranking_sucursal', titulo: 'Cómo viene el punto', descripcion: 'Devuelve el cumplimiento del punto de trabajo contra el resto.', requiere_confirmacion: false },
    { clave: 'crear_tarea', titulo: 'Crear una tarea', descripcion: 'Da de alta trabajo con responsable y vencimiento.', requiere_confirmacion: true },
    { clave: 'actualizar_estado_tarea', titulo: 'Mover una tarea de estado', descripcion: 'Avanza o retrocede una tarea en su circuito.', requiere_confirmacion: true },
    { clave: 'asignar_tarea', titulo: 'Asignar una tarea', descripcion: 'Cambia el responsable de un trabajo.', requiere_confirmacion: true },
  ],

  permisos: [{ modulo: 'tareas', acciones: ['ver', 'crear', 'editar', 'aprobar'] }],

  depende_de: ['configuracion'],

  // Relevado buscando quién inserta en `tareas`. El validador contrasta contra
  // el depende_de de los manifiestos declarados; los que todavía no se
  // declararon quedan anotados como no verificables, no como verdad.
  usado_por: ['ofertas', 'stock', 'compras', 'documentos', 'finanzas', 'comunicacion', 'compliance'],

  agentes: [
    {
      clave: 'organizador_del_dia',
      nombre: 'Organizador del día',
      trabajo:
        'Arma el día del equipo: genera el trabajo que se repite, marca lo que se venció, escala lo que quedó trabado y revisa la evidencia antes de que la mire una persona.',
      necesita: [
        { dato: 'Tipos de trabajo cargados', donde: 'Tipos de tarea', sin_esto: 'No sabe qué generar ni con qué plazo' },
        { dato: 'Al menos una recurrencia activa', donde: 'Recurrencias', sin_esto: 'No arma la agenda del día' },
        { dato: 'Un verificador por punto', donde: 'Supervisores', sin_esto: 'No puede escalar lo trabado a nadie' },
      ],
      se_activa_con: 'Cargar tipos de trabajo y marcar cuáles se repiten.',
      acciones: [
        { clave: 'generar_agenda_dia', titulo: 'Armar la agenda del día', participacion: 'hace_y_avisa', reversible: true, motivo: 'Crea trabajo a partir de reglas que una persona configuró. Una tarea de más se descarta en un clic.' },
        { clave: 'generar_recurrencias', titulo: 'Generar el trabajo que se repite', participacion: 'hace_y_avisa', reversible: true, motivo: 'Ejecuta una regla explícita, no una decisión propia.' },
        { clave: 'marcar_vencidas', titulo: 'Marcar lo que se pasó de fecha', participacion: 'hace_y_avisa', reversible: true, motivo: 'Cambia un estado calculable a partir de la hora. No decide nada.' },
        // Emite hacia afuera de la pantalla: le notifica al supervisor. Pero es
        // hacia ADENTRO del equipo y no compromete a nadie, así que `informa`.
        { clave: 'escalar_trabadas', titulo: 'Escalar lo que quedó parado', participacion: 'informa', reversible: false, compromete_tercero: false, motivo: 'Le avisa a un supervisor del equipo. Un aviso leído no se des-lee, y está bien: no compromete nada con nadie de afuera. El escalamiento no cierra ni reasigna nada solo.' },
        { clave: 'evaluar_triggers', titulo: 'Crear trabajo cuando pasa algo', participacion: 'hace_y_avisa', reversible: true, motivo: 'Las condiciones las escribió una persona; el agente sólo las evalúa.' },
        { clave: 'pre_verificar_evidencia', titulo: 'Revisar la evidencia antes que una persona', participacion: 'sugiere', motivo: 'Deja una opinión. La verificación que vale sigue siendo humana.' },
        { clave: 'crear_tarea', titulo: 'Crear una tarea puntual', participacion: 'prepara' },
        { clave: 'verificar_trabajo_propio', titulo: 'Dar por bueno un trabajo', participacion: 'nunca', motivo: 'Nadie verifica lo que él mismo generó. Si el agente crea y aprueba, la verificación deja de existir.' },
      ],
      capacidades: ['detectar', 'priorizar', 'ejecutar', 'explicar'],
      // Sin `aprobar`: es exactamente el permiso que no puede tener.
      permisos: [{ modulo: 'tareas', acciones: ['ver', 'crear', 'editar'] }],
    },
  ],

  constitucional: [
    {
      limite: 'confirmacion_humana',
      tipo: 'campo',
      elemento: 'tareas.verificacion_humana',
      motivo: 'Marca que el trabajo lo dio por bueno una persona, no el sistema. Si se pudiera apagar por configuración, la verificación deja de existir y las tareas siguen cerrándose igual.',
    },
    {
      limite: 'confirmacion_humana',
      tipo: 'accion',
      elemento: 'verificar_trabajo_propio',
      motivo: 'Nadie verifica lo que él mismo generó. Si el agente crea y aprueba, el circuito de control es decorativo.',
    },
    {
      limite: 'auditoria',
      tipo: 'entidad',
      elemento: 'tareas_historial',
      motivo: 'Quién cambió qué y cuándo. Es lo que permite reconstruir por qué una tarea terminó como terminó.',
    },
  ],

  configurable: [
    { clave: 'verificacion_obligatoria', etiqueta: 'Todo trabajo terminado pasa por un verificador', tipo: 'booleano', default: true, peso: 'sensible', peso_motivo: 'Apagarlo hace que las tareas se cierren solas: la verificación deja de existir.'  },
    {
      clave: 'sla_default_horas', etiqueta: 'Horas de plazo cuando el tipo no lo define', tipo: 'entero', default: 24, peso: 'operativo', peso_motivo: 'Define el plazo cuando el tipo no lo dice. Mal puesto, las tareas vencen antes o después de lo razonable.', minimo: 1, maximo: 720, unidad: 'horas',
      brecha: "El código NO tiene este default: cuando el tipo de tarea no define sla_horas, la tarea se crea con null, o sea sin plazo. Implementarlo es construir un comportamiento que hoy no existe, no cablear uno que existe.",
    },
  ],

  hechos: [
    { clave: 'exige_evidencia', afirma: "Pide foto o archivo al cerrar", comprobado_por: "Se buscó la clave literal en los 689 archivos del sector y no aparece; se buscaron además anclas exactas por concepto. Ningún lugar del código lee este valor: el circuito existe o no existe. v0.70/v0.71." },
    { clave: 'puntaje_activo', afirma: "Suma puntos al que ejecuta", comprobado_por: "Se buscó la clave literal en los 689 archivos del sector y no aparece; se buscaron además anclas exactas por concepto. Ningún lugar del código lee este valor: el circuito existe o no existe. v0.70/v0.71." },
  ],
}

export const PREFIJOS_TAREAS = ['tarea', 'tipos_tarea', 'supervisores_tarea', 'agendas_dia']
