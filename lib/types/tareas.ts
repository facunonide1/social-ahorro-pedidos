/**
 * Types del sistema de Tareas Enterprise (F6).
 * Mirror de supabase/migrations/0030_tareas_enterprise_empleados.sql.
 */

export type TareaCategoria =
  | 'finanzas'
  | 'compras'
  | 'operaciones'
  | 'rrhh'
  | 'comercial'
  | 'sucursal'
  | 'regulatorio'
  | 'limpieza'
  | 'seguridad'
  | 'atencion_cliente'
  | 'inventario'
  | 'otro'

export type TareaPrioridad = 'baja' | 'media' | 'alta' | 'critica'

export type TareaEstado =
  | 'pendiente'
  | 'asignada'
  | 'en_progreso'
  | 'en_verificacion'
  | 'en_aprobacion'
  | 'bloqueada'
  | 'completada'
  | 'descartada'
  | 'vencida'
  | 'rechazada'

export type TareaOrigen =
  | 'auto_sistema'
  | 'manual'
  | 'plantilla'
  | 'recurrencia'

export type RecurrenciaPatron =
  | 'diaria'
  | 'semanal'
  | 'mensual'
  | 'anual'
  | 'custom_cron'

export type TareaHistorialAccion =
  | 'creada'
  | 'asignada'
  | 'reasignada'
  | 'iniciada'
  | 'marcada_verificacion'
  | 'verificada'
  | 'rechazada'
  | 'aprobada_final'
  | 'completada'
  | 'descartada'
  | 'reabierta'
  | 'vencida'
  | 'comentario'
  | 'adjunto'
  | 'evidencia'
  | 'dependencia'
  | 'subtarea'
  | 'cambio_prioridad'
  | 'cambio_vencimiento'
  | 'cambio_responsable'

/** Tipos de evidencia que un tipo de tarea puede requerir. */
export type TipoEvidencia =
  | 'foto'
  | 'firma'
  | 'firma_digital'
  | 'checklist'
  | 'gps'
  | 'qr'
  | 'archivo'
  | 'monto_arqueo'
  | 'duracion'
  | 'nota'
  | 'foto_termometro'
  | 'aprobacion_digital'

/** Item de campo custom en `tipos_tareas.campos_custom`. */
export type CampoCustom = {
  codigo: string
  label: string
  tipo: 'text' | 'number' | 'date' | 'select' | 'boolean' | 'textarea'
  requerido?: boolean
  opciones?: string[]
  placeholder?: string
}

export type TipoTarea = {
  id: string
  codigo: string
  nombre: string
  descripcion: string | null
  categoria: TareaCategoria
  icono: string | null
  color: string | null
  prioridad_default: TareaPrioridad
  sla_horas: number | null
  requiere_aprobacion: boolean
  niveles_workflow: 1 | 2 | 3
  evidencia_requerida: TipoEvidencia[]
  campos_custom: CampoCustom[]
  rol_responsable_default: string | null
  rol_verificador_default: string | null
  rol_aprobador_final_default: string | null
  es_auto_generable: boolean
  permite_recurrencia: boolean
  plantilla_titulo: string | null
  plantilla_descripcion: string | null
  notificar_creacion: boolean
  notificar_vencimiento: boolean
  dias_alerta_previa: number
  puntos_completar: number
  activo: boolean
  created_at: string
  updated_at: string
}

/** Item dentro de `tareas.evidencias`. */
export type EvidenciaItem = {
  tipo: TipoEvidencia
  valor: string | number | Record<string, unknown> | null
  url?: string | null
  timestamp: string
  user_id: string | null
  meta?: Record<string, unknown>
}

export type Tarea = {
  id: string
  codigo: string
  tipo_tarea_id: string | null
  tipo_origen: TareaOrigen
  titulo: string
  descripcion: string | null
  prioridad: TareaPrioridad
  estado: TareaEstado

  responsable_id: string | null
  verificador_id: string | null
  aprobador_final_id: string | null
  asignados_secundarios: string[]
  rol_destinatario: string | null
  sucursal_id: string | null
  departamento: string | null

  entidad_relacionada: string | null
  entidad_id: string | null
  entidad_url: string | null

  fecha_creacion: string
  fecha_asignacion: string | null
  fecha_vencimiento: string | null
  fecha_inicio_real: string | null
  fecha_completada: string | null
  fecha_verificada: string | null
  fecha_aprobada_final: string | null

  sla_horas: number | null
  tiempo_resolucion_horas: number | null

  datos_custom: Record<string, unknown>
  evidencias: EvidenciaItem[]

  tarea_padre_id: string | null
  dependencias_ids: string[]
  siguiente_tarea_id: string | null
  recurrencia_id: string | null

  puntos_obtenidos: number | null
  creado_por: string | null
  motivo_descartada: string | null
  motivo_rechazada: string | null
  comentario_verificacion: string | null

  created_at: string
  updated_at: string
}

export type TareaConTipo = Tarea & {
  tipo: Pick<TipoTarea, 'codigo' | 'nombre' | 'icono' | 'color' | 'categoria' | 'evidencia_requerida' | 'niveles_workflow'> | null
}

export type TareaComentario = {
  id: string
  tarea_id: string
  user_id: string
  contenido: string
  menciones: string[]
  es_cambio_estado: boolean
  estado_anterior: string | null
  estado_nuevo: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type TareaAdjunto = {
  id: string
  tarea_id: string
  nombre_archivo: string
  url: string
  tipo_mime: string | null
  tamanio_bytes: number | null
  es_evidencia: boolean
  subido_por: string | null
  created_at: string
}

export type TareaHistorialEntry = {
  id: string
  tarea_id: string
  user_id: string | null
  accion: TareaHistorialAccion
  estado_anterior: Record<string, unknown> | null
  estado_nuevo: Record<string, unknown> | null
  created_at: string
}

export type TareaRecurrencia = {
  id: string
  tipo_tarea_id: string | null
  titulo_plantilla: string
  descripcion_plantilla: string | null
  patron: RecurrenciaPatron
  dias_semana: number[] | null
  dia_mes: number | null
  hora_creacion: string
  fecha_inicio: string
  fecha_fin: string | null
  responsable_default_id: string | null
  verificador_default_id: string | null
  sucursal_id: string | null
  rol_responsable: string | null
  activa: boolean
  ultima_ejecucion: string | null
  proxima_ejecucion: string | null
  created_at: string
  created_by: string | null
}

export type TareaTriggerAuto = {
  id: string
  nombre: string
  tipo_tarea_id: string
  evento: string
  condiciones: Record<string, unknown>
  asignacion_logic: Record<string, unknown>
  prioridad_override: TareaPrioridad | null
  vencimiento_horas: number | null
  activo: boolean
  ejecuciones_count: number
  ultima_ejecucion: string | null
  created_at: string
  created_by: string | null
}

/** Eventos del sistema que pueden disparar generación automática de tareas. */
export type TriggerEvento =
  | 'factura_creada'
  | 'factura_proxima_vencer'
  | 'factura_vencida_sin_pagar'
  | 'pago_pendiente_aprobacion'
  | 'pedido_atrasado'
  | 'stock_critico_detectado'
  | 'lote_proximo_vencer'
  | 'diferencia_recepcion'
  | 'conciliacion_pendiente'
  | 'caja_no_cerrada_eod'
  | 'empleado_ausente'
  | 'empleado_no_ficho_apertura'
  | 'cliente_vip_sin_compra_60d'
  | 'habilitacion_proxima_vencer'
  | 'matricula_proxima_vencer'
  | 'temperatura_fuera_rango'
