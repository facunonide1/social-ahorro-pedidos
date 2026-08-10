import type { Manifiesto } from '../tipos'

/**
 * Manifiesto de CLIENTES — modo ESPEJO. Pool GENÉRICO.
 *
 * Es el primer pool con datos de personas, y eso obliga a dos cosas que ni
 * Ofertas ni Tareas habían necesitado:
 *
 *   campos_sensibles   se nombran las COLUMNAS, no se marca la tabla. Quien
 *                      exporta necesita saber qué tapar; "la tabla es sensible"
 *                      no le sirve a nadie.
 *   permisos finos     acá "ve o no ve" no es la pregunta. La pregunta es quién
 *                      puede exportar y quién puede borrar.
 *
 * También es el primero que apunta a un pool que TODAVÍA NO EXISTE: la cuponera
 * es la aplicación del cliente final, un producto aparte que hoy convive en el
 * repo sin integrarse. La relación se declara igual, marcada como externa.
 *
 * Vocabulario NEUTRO: un cliente es un tercero que compra. No hay "paciente" ni
 * "obra social" acá adentro.
 */
export const MANIFIESTO_CLIENTES: Manifiesto = {
  formato: '1.8.0',
  pool: 'clientes',
  nombre: 'Clientes',
  categoria: 'generico',
  desinstalable: true,
  alcance: 'global',
  descripcion:
    'El tercero que compra: quién es, qué compró, cuánto vale y cuándo se está yendo. Agrupa en segmentos, acumula puntos y dispara comunicación.',

  entidades: [
    {
      tabla: 'clientes',
      rol: 'La persona o empresa que compra, con su valor y su riesgo de fuga',
      acceso: 'propia',
      campos_sensibles: ['dni', 'cuit', 'telefono', 'email', 'fecha_nacimiento', 'notas'],
    },
    {
      tabla: 'clientes_crm',
      rol: 'El seguimiento comercial del cliente empresa: domicilio, condición fiscal, crédito',
      acceso: 'propia',
      campos_sensibles: [
        'dni', 'cuit', 'email', 'telefono',
        'direccion_completa', 'localidad', 'codigo_postal', 'provincia',
        'razon_social', 'notas',
      ],
    },
    {
      tabla: 'cliente_fuentes',
      rol: 'De dónde salió cada cliente y con qué identidad en cada canal',
      acceso: 'propia',
      // `datos` es jsonb libre por canal: puede traer cualquier cosa personal.
      campos_sensibles: ['id_externo', 'datos'],
    },
    { tabla: 'cliente_compras', rol: 'Qué compró y cuándo. Es la base del valor y de la recomendación', acceso: 'propia' },
    { tabla: 'segmentos', rol: 'Los grupos de clientes definidos por regla, no a mano', acceso: 'propia' },
    { tabla: 'campanias_crm', rol: 'La acción de comunicación dirigida a un segmento', acceso: 'propia' },
    // Guarda a qué cliente y por qué canal, no el destino en claro: no lleva
    // campos_sensibles porque no los tiene, no porque no se haya mirado.
    { tabla: 'campania_envios', rol: 'A quién se le mandó qué y si lo abrió', acceso: 'propia' },
    { tabla: 'automatizaciones', rol: 'Qué se dispara solo cuando un cliente hace algo', acceso: 'propia' },
    { tabla: 'puntos_reglas', rol: 'Cuántos puntos da cada cosa', acceso: 'propia' },
    { tabla: 'puntos_movimientos', rol: 'El acumulado y el canje de cada cliente', acceso: 'propia' },
    { tabla: 'dedup_pendientes', rol: 'Los que parecen la misma persona y esperan que alguien decida', acceso: 'propia' },
    { tabla: 'b2b_cuenta_corriente', rol: 'Lo que un cliente empresa debe', acceso: 'propia' },
    { tabla: 'b2b_pedidos_recurrentes', rol: 'Lo que un cliente empresa pide siempre', acceso: 'propia' },

    { tabla: 'sucursales', rol: 'Dónde compra habitualmente', acceso: 'leida', dueno: 'configuracion' },
    { tabla: 'productos_catalogo', rol: 'Qué compró', acceso: 'leida', dueno: 'configuracion' },
    { tabla: 'ventas_diarias', rol: 'El volumen contra el que se mide un cliente', acceso: 'leida', dueno: 'centro-datos' },
  ],

  pantallas: [
    { ruta: '/admin/clientes', titulo: 'Clientes', molde: 'lista_maestra', permiso: 'clientes' },
    { ruta: '/admin/clientes/segmentos', titulo: 'Segmentos', molde: 'formulario', permiso: 'clientes' },
    { ruta: '/admin/clientes/b2b', titulo: 'B2B', molde: 'lista_maestra', permiso: 'clientes' },
    { ruta: '/admin/clientes/puntos', titulo: 'Puntos', molde: 'formulario', permiso: 'clientes' },
    { ruta: '/admin/clientes/automatizaciones', titulo: 'Automatizaciones', molde: 'formulario', permiso: 'clientes' },
    { ruta: '/admin/clientes/comunicacion', titulo: 'Comunicación a clientes', molde: 'lista_maestra', permiso: 'clientes' },
    { ruta: '/admin/clientes/duplicados', titulo: 'Duplicados', molde: 'bandeja', permiso: 'clientes' },
    { ruta: '/admin/clientes/asistente', titulo: 'Asistente', molde: 'chat', permiso: 'clientes' },

    { ruta: '/admin/clientes/[id]', titulo: 'Ficha de cliente', molde: 'ficha', permiso: 'clientes', navegable: false },
    { ruta: '/admin/clientes/nuevo', titulo: 'Alta de cliente', molde: 'wizard', permiso: 'clientes', navegable: false },
  ],

  acciones: [
    { clave: 'buscar_cliente', titulo: 'Buscar un cliente', descripcion: 'Encuentra un cliente por nombre, documento o teléfono.', requiere_confirmacion: false },
    { clave: 'perfil_cliente', titulo: 'Quién es este cliente', descripcion: 'Devuelve el perfil completo: qué compra, cada cuánto, cuánto vale.', requiere_confirmacion: false },
    { clave: 'clientes_en_riesgo', titulo: 'Quiénes se están yendo', descripcion: 'Lista los clientes que dejaron de comprar respecto de su propia frecuencia.', requiere_confirmacion: false },
  ],

  /**
   * `eliminar` se declara aparte a propósito: sobre datos de personas, borrar no
   * es "editar un poco más". Es la acción que hay que poder dar a una persona y
   * a ninguna otra.
   */
  permisos: [{ modulo: 'clientes', acciones: ['ver', 'crear', 'editar', 'eliminar'] }],

  depende_de: ['configuracion', 'centro-datos'],

  agentes: [
    {
      clave: 'cuidador_de_clientes',
      nombre: 'Cuidador de clientes',
      trabajo:
        'Avisa quién dejó de comprar antes de que sea tarde, junta los que son la misma persona cargada dos veces, y dispara la comunicación que alguien dejó configurada.',
      necesita: [
        { dato: 'Historial de compras por cliente', donde: 'Centro de Datos', sin_esto: 'No puede saber la frecuencia de nadie, y sin frecuencia no hay riesgo de fuga' },
        { dato: 'Un canal de contacto', donde: 'Comunicación a clientes', sin_esto: 'Detecta pero no puede avisar' },
      ],
      se_activa_con: 'Importar el histórico de compras y configurar un canal.',
      acciones: [
        { clave: 'detectar_riesgo_fuga', titulo: 'Avisar quién se está yendo', participacion: 'sugiere', motivo: 'Marca una lista. Qué hacer con ella lo decide una persona.' },
        { clave: 'proponer_fusion_duplicados', titulo: 'Proponer fusiones', participacion: 'sugiere', motivo: 'Fusionar dos clientes reescribe compras y puntos. Se propone y espera.' },
        {
          clave: 'correr_automatizaciones',
          titulo: 'Disparar la comunicación configurada',
          // Le llega a un CLIENTE. Un mail o un push a alguien de afuera
          // compromete al negocio y no se puede des-enviar: por criterio esto
          // es `prepara`, no `informa` ni `hace_y_avisa`.
          participacion: 'prepara',
          reversible: false,
          compromete_tercero: true,
          motivo: 'Sale del equipo: le llega a un cliente por push o por mail. Nada que salga hacia afuera se manda sin que una persona lo suelte.',
          // La brecha NO va acá: es un hecho sobre el sistema de Social Ahorro,
          // no sobre la pieza. Otro proyecto puede instalar Clientes con el paso
          // de confirmación puesto. Vive en los overrides de la instalación.
        },
        {
          clave: 'eliminar_cliente',
          titulo: 'Borrar un cliente',
          participacion: 'nunca',
          motivo: 'Es dato de una persona. Borrar no es editar un poco más, y no hay vuelta atrás.',
        },
      ],
      capacidades: ['detectar', 'recomendar', 'ejecutar', 'responder'],
      // Sin `eliminar`: el permiso más peligroso del pool no se delega.
      permisos: [{ modulo: 'clientes', acciones: ['ver', 'crear', 'editar'] }],
    },
  ],

  constitucional: [
    {
      limite: 'cumplimiento_regulado',
      tipo: 'entidad',
      elemento: 'clientes',
      motivo: 'Son datos de personas. Las columnas sensibles declaradas no se exportan sin permiso explícito, y el pool no se instala en un proyecto que no vaya a manejarlas.',
    },
    {
      limite: 'confirmacion_humana',
      tipo: 'accion',
      elemento: 'eliminar_cliente',
      motivo: 'Borrar el dato de una persona no es editar un poco más, y no hay vuelta atrás.',
    },
    {
      limite: 'confirmacion_humana',
      tipo: 'accion',
      elemento: 'proponer_fusion_duplicados',
      motivo: 'Fusionar dos clientes reescribe compras y puntos de los dos. Se propone y espera.',
    },
  ],

  configurable: [
    {
      clave: 'dias_riesgo_fuga', etiqueta: 'Días sin comprar para marcarlo en riesgo', tipo: 'entero', default: 90, peso: 'operativo', peso_motivo: 'Cambia a quién se marca como en riesgo: mal puesto, se llama de más o de menos.', minimo: 7, maximo: 730, unidad: 'dias',
      brecha: "No hay ningún umbral de churn en el código. El único corte por días está en un endpoint de demo, con otros valores. La regla está declarada y el sector todavía no la aplica.",
    },
  ],

  hechos: [
    { clave: 'puntos_activos', afirma: "Acumula puntos por compra", comprobado_por: "Se buscó la clave literal en los 689 archivos del sector y no aparece; se buscaron además anclas exactas por concepto. Ningún lugar del código lee este valor: el circuito existe o no existe. v0.70/v0.71." },
    { clave: 'dedup_automatico', afirma: "Propone fusiones de clientes duplicados", comprobado_por: "Se buscó la clave literal en los 689 archivos del sector y no aparece; se buscaron además anclas exactas por concepto. Ningún lugar del código lee este valor: el circuito existe o no existe. v0.70/v0.71." },
    { clave: 'canal_b2b', afirma: "Maneja clientes empresa con cuenta corriente", comprobado_por: "Se buscó la clave literal en los 689 archivos del sector y no aparece; se buscaron además anclas exactas por concepto. Ningún lugar del código lee este valor: el circuito existe o no existe. v0.70/v0.71." },
  ],
}

/**
 * Prefijos deliberadamente precisos.
 *
 * `campania` a secas traería `campanias`, que es de Ofertas. Un prefijo ancho no
 * es un atajo: es una declaración de propiedad sobre tablas ajenas.
 */
export const PREFIJOS_CLIENTES = [
  'clientes',
  'cliente_',
  'segmentos',
  'campanias_crm',
  'campania_envios',
  'puntos_',
  'dedup_',
  'b2b_',
  'automatizaciones',
]
