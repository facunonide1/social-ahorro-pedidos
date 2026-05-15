/**
 * Labels, colores y configuración estática del sistema de tareas (F6).
 */

import type {
  TareaCategoria,
  TareaEstado,
  TareaPrioridad,
  TipoEvidencia,
  TareaHistorialAccion,
} from '@/lib/types/tareas'

export const TAREA_CATEGORIA_LABELS: Record<TareaCategoria, string> = {
  finanzas: 'Finanzas',
  compras: 'Compras',
  operaciones: 'Operaciones',
  rrhh: 'RRHH',
  comercial: 'Comercial',
  sucursal: 'Sucursal',
  regulatorio: 'Regulatorio',
  limpieza: 'Limpieza',
  seguridad: 'Seguridad',
  atencion_cliente: 'Atención al cliente',
  inventario: 'Inventario',
  otro: 'Otro',
}

export const TAREA_PRIORIDAD_LABELS: Record<TareaPrioridad, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
  critica: 'Crítica',
}

export const TAREA_PRIORIDAD_VARIANT: Record<
  TareaPrioridad,
  'secondary' | 'info' | 'warning' | 'destructive'
> = {
  baja: 'secondary',
  media: 'info',
  alta: 'warning',
  critica: 'destructive',
}

export const TAREA_PRIORIDAD_ORDER: TareaPrioridad[] = ['baja', 'media', 'alta', 'critica']

export const TAREA_ESTADO_LABELS: Record<TareaEstado, string> = {
  pendiente: 'Pendiente',
  asignada: 'Asignada',
  en_progreso: 'En progreso',
  en_verificacion: 'En verificación',
  en_aprobacion: 'En aprobación',
  bloqueada: 'Bloqueada',
  completada: 'Completada',
  descartada: 'Descartada',
  vencida: 'Vencida',
  rechazada: 'Rechazada',
}

export const TAREA_ESTADO_VARIANT: Record<
  TareaEstado,
  'secondary' | 'info' | 'warning' | 'success' | 'destructive' | 'outline'
> = {
  pendiente: 'outline',
  asignada: 'secondary',
  en_progreso: 'info',
  en_verificacion: 'warning',
  en_aprobacion: 'warning',
  bloqueada: 'destructive',
  completada: 'success',
  descartada: 'secondary',
  vencida: 'destructive',
  rechazada: 'destructive',
}

/** Estados que se consideran "abiertos" / accionables. */
export const TAREA_ESTADOS_ABIERTOS: TareaEstado[] = [
  'pendiente',
  'asignada',
  'en_progreso',
  'en_verificacion',
  'en_aprobacion',
  'bloqueada',
]

/** Estados terminales (no se puede transicionar desde acá sin reabrir). */
export const TAREA_ESTADOS_TERMINALES: TareaEstado[] = [
  'completada',
  'descartada',
  'rechazada',
]

export const EVIDENCIA_LABELS: Record<TipoEvidencia, string> = {
  foto: 'Foto',
  firma: 'Firma',
  firma_digital: 'Firma digital',
  checklist: 'Checklist',
  gps: 'Ubicación GPS',
  qr: 'Escanear QR',
  archivo: 'Archivo',
  monto_arqueo: 'Monto de arqueo',
  duracion: 'Duración',
  nota: 'Nota',
  foto_termometro: 'Foto del termómetro',
  aprobacion_digital: 'Aprobación digital',
}

export const HISTORIAL_LABELS: Record<TareaHistorialAccion, string> = {
  creada: 'creó la tarea',
  asignada: 'asignó la tarea',
  reasignada: 'reasignó la tarea',
  iniciada: 'empezó la tarea',
  marcada_verificacion: 'marcó para verificación',
  verificada: 'verificó la tarea',
  rechazada: 'rechazó la tarea',
  aprobada_final: 'aprobó definitivamente',
  completada: 'completó la tarea',
  descartada: 'descartó la tarea',
  reabierta: 'reabrió la tarea',
  vencida: 'la tarea venció',
  comentario: 'comentó',
  adjunto: 'adjuntó un archivo',
  evidencia: 'agregó evidencia',
  dependencia: 'cambió las dependencias',
  subtarea: 'creó una subtarea',
  cambio_prioridad: 'cambió la prioridad',
  cambio_vencimiento: 'cambió el vencimiento',
  cambio_responsable: 'cambió el responsable',
}

/** Bucket de Storage donde van fotos/firmas/archivos de evidencia. */
export const TAREAS_BUCKET = 'tareas-evidencias'
