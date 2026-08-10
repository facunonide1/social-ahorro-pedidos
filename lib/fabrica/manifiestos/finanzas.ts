import type { Manifiesto } from '../tipos'

/**
 * Manifiesto de FINANZAS — modo ESPEJO. Pool GENÉRICO.
 *
 * El sector más grande del sistema y el de mayor riesgo: acá vive la plata.
 * Eso obliga a cuatro cosas que ningún pool anterior había necesitado.
 *
 *   constitucional     El arqueo ciego y los umbrales de aprobación NO son
 *                      configurables. Es la primera vez que un pool declara
 *                      algo que la fábrica no puede tocar ni aunque se lo pidan.
 *   restringido_a_rol  El saldo de caja general no se filtra por punto: se
 *                      filtra por quién maneja plata. Son dos filtros distintos.
 *   generada_por       La cuenta por pagar NACE de un documento leído, en una
 *                      sola dirección. No es "escriben otros": es de dónde
 *                      vienen las filas.
 *   deprecadas         Las tablas zz_* de v0.54 existen y no se usan. Se listan
 *                      aparte para que no viajen a cada proyecto nuevo.
 *
 * Vocabulario NEUTRO: no hay "farmacia" ni "obra social". Hay documentos a
 * pagar, terceros, cuentas, turnos de caja y obligaciones. Existe igual en
 * cualquier negocio que mueva plata.
 */
export const MANIFIESTO_FINANZAS: Manifiesto = {
  formato: '1.7.0',
  pool: 'finanzas',
  nombre: 'Finanzas',
  categoria: 'generico',
  desinstalable: true,
  alcance: 'mixto',
  descripcion:
    'La plata: qué se debe, qué se cobró, qué hay en cada caja y en cada cuenta. Cierra el circuito entre el papel que llegó, la obligación que generó y el pago que la canceló.',

  entidades: [
    {
      tabla: 'facturas_proveedor',
      rol: 'La obligación de pagar: cuánto, a quién y para cuándo',
      acceso: 'propia',
      // Nace de un documento leído por el motor. Nunca al revés: una cuenta por
      // pagar no genera un papel.
      generada_por: 'documentos',
    },
    { tabla: 'pagos', rol: 'La cancelación: cuánto se pagó, cuándo y por qué medio', acceso: 'propia' },
    { tabla: 'pago_facturas', rol: 'Qué pago cancela qué obligación, y por cuánto', acceso: 'propia' },
    { tabla: 'cheques', rol: 'Los valores a fecha, propios y de terceros', acceso: 'propia' },
    { tabla: 'impuestos_obligaciones', rol: 'Lo que hay que pagarle al Estado y cuándo vence', acceso: 'propia' },
    { tabla: 'cuentas_bancarias_propias', rol: 'Dónde está la plata del negocio', acceso: 'propia' },
    { tabla: 'movimientos_bancarios', rol: 'Cada entrada y salida de una cuenta', acceso: 'propia' },
    { tabla: 'conciliacion_items', rol: 'Qué línea del extracto corresponde a qué movimiento propio', acceso: 'propia' },
    { tabla: 'extracto_lineas_pendientes', rol: 'Lo que el banco dice y el sistema todavía no explica', acceso: 'propia' },
    { tabla: 'gastos_fijos', rol: 'Lo que se paga todos los meses sin que nadie lo pida', acceso: 'propia' },
    { tabla: 'gastos_fijos_instancias', rol: 'La ocurrencia concreta de cada mes', acceso: 'propia' },
    { tabla: 'gastos_operativos', rol: 'Lo que se gasta y no es mercadería', acceso: 'propia', alcance: 'por_sucursal' },

    // ── Caja. Todo por punto, y el saldo además por rol. ──────────────
    {
      tabla: 'caja_general',
      rol: 'El saldo del punto: lo que hay de verdad en la caja fuerte',
      acceso: 'propia',
      alcance: 'por_sucursal',
      restringido_a_rol: ['super_admin', 'gerente', 'administrativo'],
    },
    {
      tabla: 'caja_general_movimientos',
      rol: 'Cada entrada y salida de la caja del punto',
      acceso: 'propia',
      alcance: 'por_sucursal',
      restringido_a_rol: ['super_admin', 'gerente', 'administrativo'],
    },
    { tabla: 'caja_turnos', rol: 'El turno de un cajero: desde cuándo, con cuánto abrió', acceso: 'propia', alcance: 'por_sucursal' },
    {
      tabla: 'arqueos_caja',
      rol: 'El conteo al cerrar el turno. Se cuenta a ciegas: el cajero no ve lo que el sistema espera',
      acceso: 'propia',
      alcance: 'por_sucursal',
    },
    { tabla: 'config_caja_sucursal', rol: 'Cómo opera la caja de cada punto', acceso: 'propia', alcance: 'por_sucursal' },
    { tabla: 'movimientos_caja', rol: 'El detalle del turno, movimiento por movimiento', acceso: 'propia', alcance: 'por_sucursal' },

    { tabla: 'proveedores', rol: 'A quién se le debe', acceso: 'leida', dueno: 'compras' },
    { tabla: 'sucursales', rol: 'Qué punto compró y qué punto paga. Tiene impacto fiscal', acceso: 'leida', dueno: 'configuracion' },
    { tabla: 'doc_documentos', rol: 'El papel del que nace cada obligación', acceso: 'leida', dueno: 'documentos' },
    { tabla: 'users_admin', rol: 'Quién abrió el turno, quién arqueó, quién aprobó', acceso: 'leida', dueno: 'configuracion' },
  ],

  pantallas: [
    { ruta: '/admin/finanzas', titulo: 'Tablero', molde: 'tablero', permiso: 'finanzas' },
    { ruta: '/admin/finanzas/caja', titulo: 'Caja y arqueos', molde: 'tablero', permiso: 'caja' },
    { ruta: '/admin/finanzas/pagos', titulo: 'Pagos', molde: 'bandeja', permiso: 'finanzas' },
    { ruta: '/admin/finanzas/gastos-fijos', titulo: 'Gastos fijos', molde: 'lista_maestra', permiso: 'finanzas' },
    { ruta: '/admin/finanzas/cheques', titulo: 'Cheques', molde: 'lista_maestra', permiso: 'finanzas' },
    { ruta: '/admin/finanzas/impuestos', titulo: 'Impuestos', molde: 'lista_maestra', permiso: 'finanzas' },
    { ruta: '/admin/finanzas/cuentas', titulo: 'Cuentas y movimientos', molde: 'lista_maestra', permiso: 'finanzas' },
    { ruta: '/admin/finanzas/conciliacion', titulo: 'Conciliación bancaria', molde: 'bandeja', permiso: 'finanzas' },
    { ruta: '/admin/finanzas/cash-flow', titulo: 'Cash flow', molde: 'tablero', permiso: 'finanzas' },
    { ruta: '/admin/finanzas/calendario', titulo: 'Calendario de pagos', molde: 'calendario', permiso: 'finanzas' },
    { ruta: '/admin/finanzas/asistente', titulo: 'Asistente', molde: 'chat', permiso: 'finanzas' },

    { ruta: '/admin/finanzas/caja/historico', titulo: 'Histórico de caja', molde: 'lista_maestra', permiso: 'caja', navegable: false },
    { ruta: '/admin/finanzas/cheques/nueva', titulo: 'Alta de cheque', molde: 'wizard', permiso: 'finanzas', navegable: false },
    { ruta: '/admin/finanzas/cuentas/nueva', titulo: 'Alta de cuenta', molde: 'wizard', permiso: 'finanzas', navegable: false },
    { ruta: '/admin/finanzas/cuentas/[id]', titulo: 'Ficha de cuenta', molde: 'ficha', permiso: 'finanzas', navegable: false },
    { ruta: '/admin/sucursales/gastos', titulo: 'Gastos por punto', molde: 'lista_maestra', permiso: 'finanzas', navegable: false },

    // PRESTADAS: el menú de Finanzas las lleva y son de otros pools. Si Finanzas
    // se las llevara al instalarse, arrastraría el motor de documentos entero.
    { ruta: '/admin/finanzas/documentos', titulo: 'Documentos a pagar', molde: 'lista_maestra', pertenencia: 'prestada' },
    { ruta: '/admin/aprobaciones', titulo: 'Aprobaciones', molde: 'bandeja', pertenencia: 'prestada' },
  ],

  acciones: [
    { clave: 'get_facturas_vencer', titulo: 'Qué hay que pagar', descripcion: 'Lista las obligaciones que vencen en los próximos días, con su monto y su tercero.', requiere_confirmacion: false },
    { clave: 'get_cash_flow_resumen', titulo: 'Cómo viene la plata', descripcion: 'Resume lo que entra y lo que sale en el período, y el saldo proyectado.', requiere_confirmacion: false },
  ],

  permisos: [
    { modulo: 'finanzas', acciones: ['ver', 'crear', 'editar', 'aprobar'] },
    { modulo: 'caja', acciones: ['ver', 'crear', 'editar', 'aprobar'] },
  ],

  depende_de: ['configuracion', 'tareas', 'documentos'],
  usado_por: ['compras'],

  /**
   * Lo que la fábrica NO puede tocar en este pool.
   *
   * Los dos primeros son la razón por la que existe el campo: un arqueo que el
   * cajero puede ver antes de contar no es un arqueo, y un umbral de aprobación
   * que se puede bajar por configuración no es un control — es una sugerencia.
   */
  constitucional: [
    {
      limite: 'control_de_caja',
      tipo: 'entidad',
      elemento: 'arqueos_caja',
      motivo: 'El arqueo es ciego: el cajero cuenta sin ver lo que el sistema espera. Si se pudiera configurar en visible, el control desaparece y la tabla queda igual de llena.',
    },
    {
      limite: 'control_de_caja',
      tipo: 'campo',
      elemento: 'arqueos_caja.secuencia_alterada',
      motivo: 'Marca que los montos sellados al abrir no son los que llegaron al cerrar. Es la única señal de que alguien reintentó el cierre con otros números.',
    },
    {
      limite: 'control_de_caja',
      tipo: 'campo',
      elemento: 'caja_turnos.arqueo_ciego',
      motivo: 'Se sella al abrir el turno y no se puede cambiar con el turno abierto.',
    },
    {
      limite: 'umbrales_y_permisos',
      tipo: 'parametro',
      elemento: 'umbral_aprobacion_pago',
      motivo: 'A partir de qué monto un pago necesita una segunda firma se cambia a mano, con nombre y apellido. No por configuración de proyecto ni por chat.',
    },
    {
      limite: 'confirmacion_humana',
      tipo: 'accion',
      elemento: 'ejecutar_pago',
      motivo: 'Ningún agente ejecuta un pago. La plata sale cuando una persona dice que sale.',
    },
    {
      limite: 'auditoria',
      tipo: 'automatizacion',
      elemento: 'registro_de_movimientos',
      motivo: 'Todo movimiento de caja y de cuenta queda registrado con autor. No se desactiva ni se edita después.',
    },
  ],

  agentes: [
    {
      clave: 'tesorero',
      nombre: 'Tesorero',
      trabajo:
        'Mira qué vence, con qué plata se cuenta y arma la propuesta de pagos de la semana. Vigila los cierres de caja que no cierran y avisa las obligaciones que se vienen.',
      necesita: [
        { dato: 'Documentos de compra cargados', donde: 'Motor de documentos', sin_esto: 'No sabe qué se debe, y sin eso no hay nada que proponer' },
        { dato: 'Al menos una cuenta con saldo', donde: 'Cuentas y movimientos', sin_esto: 'Puede listar vencimientos pero no puede decir con qué pagarlos' },
        { dato: 'Turnos de caja abriéndose y cerrándose', donde: 'Caja y arqueos', sin_esto: 'No tiene contra qué comparar un descuadre' },
      ],
      se_activa_con: 'Cargar la primera factura de compra y dar de alta una cuenta.',
      acciones: [
        { clave: 'armar_propuesta_de_pagos', titulo: 'Armar la tanda de pagos', participacion: 'prepara', motivo: 'Deja la propuesta armada con qué pagar, a quién y con qué cuenta. La suelta una persona.' },
        { clave: 'detectar_descuadre', titulo: 'Marcar cierres que no cierran', participacion: 'sugiere', motivo: 'Un descuadre puede ser un error de conteo o algo peor. La conclusión no la saca el agente.' },
        { clave: 'avisar_vencimientos', titulo: 'Avisar lo que vence', participacion: 'informa', reversible: false, compromete_tercero: false, motivo: 'Aviso al equipo con lo que se viene. No sale del sistema ni compromete un pago.' },
        { clave: 'proponer_conciliacion', titulo: 'Proponer qué línea del banco es qué movimiento', participacion: 'sugiere', motivo: 'Conciliar mal deja dos veces el mismo pago o esconde uno que falta.' },
        {
          clave: 'ejecutar_pago',
          titulo: 'Pagar',
          participacion: 'nunca',
          toca_dinero: true,
          motivo: 'La plata sale cuando una persona dice que sale. No hay monto lo bastante chico como para que valga la pena la excepción.',
        },
        {
          clave: 'cerrar_arqueo',
          titulo: 'Dar por bueno un arqueo',
          participacion: 'nunca',
          motivo: 'El arqueo lo cierra quien contó, y lo verifica otra persona. Un agente que lo cierre convierte el control en un trámite.',
        },
      ],
      capacidades: ['detectar', 'recomendar', 'priorizar', 'explicar'],
      // Sin `aprobar` sobre finanzas ni sobre caja: son los dos permisos que no
      // se delegan en un sector donde se mueve plata.
      permisos: [
        { modulo: 'finanzas', acciones: ['ver', 'crear', 'editar'] },
        { modulo: 'caja', acciones: ['ver'] },
      ],
    },
  ],

  configurable: [
    { clave: 'dias_aviso_vencimiento', etiqueta: 'Días de anticipación para avisar un vencimiento', tipo: 'entero', default: 7, peso: 'operativo', peso_motivo: 'Anticipación del aviso de un vencimiento de pago.', minimo: 1, maximo: 90, unidad: 'dias' },
    { clave: 'maneja_cheques', etiqueta: 'Opera con valores a fecha', tipo: 'booleano', default: true, peso: 'operativo', peso_motivo: 'Prende o apaga el circuito de valores a fecha.'  },
    { clave: 'caja_por_turno', etiqueta: 'La caja se abre y cierra por turno', tipo: 'booleano', default: true, peso: 'sensible', peso_motivo: 'Apagarlo saca el arqueo por turno, que es donde vive el control de caja.'  },
    { clave: 'concilia_banco', etiqueta: 'Concilia contra el extracto bancario', tipo: 'booleano', default: true, peso: 'operativo', peso_motivo: 'Prende o apaga la conciliación contra el extracto.'  },
  ],

  deprecadas: [
    {
      tabla: 'zz_deprecated_factura_items',
      reemplazada_por: 'doc_lineas',
      desde: '2026-07',
      motivo: 'El renglón de una factura pasó a vivir en el motor de documentos, que es quien lo lee.',
    },
  ],
}

export const PREFIJOS_FINANZAS = [
  'facturas_proveedor',
  'pagos',
  'pago_',
  'cheques',
  'impuestos_',
  'movimientos_bancarios',
  'cuentas_bancarias',
  'caja_',
  'arqueos_',
  'config_caja',
  'movimientos_caja',
  'gastos_',
  'conciliacion_',
  'extracto_',
  'zz_deprecated_factura',
]

/**
 * Las deprecadas se excluyen del comparador a propósito.
 *
 * Van declaradas en `deprecadas`, no en `entidades`: existen, no se usan y se
 * van a borrar. Si se declararan propias viajarían a cada proyecto nuevo; si no
 * se excluyeran acá, el comparador las reportaría para siempre como tablas sin
 * declarar.
 */
export const EXCLUIR_FINANZAS = ['zz_deprecated_factura_items']
