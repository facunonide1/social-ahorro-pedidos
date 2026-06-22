/** CRM unificado (B2C + B2B) — tipos compartidos (v0.29). */

export type ClienteTipo = 'b2c' | 'b2b'
export type ClienteNivel = 'socio' | 'plus' | 'premium'
export type ClienteRiesgo = 'bajo' | 'medio' | 'alto'
export type SegmentoTipo = 'auto' | 'manual'
export type CampaniaEstado = 'borrador' | 'programada' | 'enviada' | 'finalizada'
export type EnvioEstado = 'encolado' | 'enviado' | 'abierto' | 'convertido' | 'error'
export type AutomatizacionTrigger = 'cumpleanos' | 'inactividad_30d' | 'recompra_cronico' | 'nivel_alcanzado'
export type PuntosEvento = 'compra' | 'cargar_ticket' | 'resena' | 'encuesta' | 'ajuste'
export type Canal = 'push' | 'email' | 'whatsapp'

/** Las 5 fuentes de clientes. */
export const FUENTES = ['cuponera', 'crm_pedidos', 'tickets', 'web', 'sifaco'] as const
export type Fuente = (typeof FUENTES)[number]

export const FUENTE_LABEL: Record<string, string> = {
  cuponera: 'Club (cuponera)', crm_pedidos: 'Pedidos web', tickets: 'Tickets OCR',
  web: 'WooCommerce', sifaco: 'SIFACO',
}
export const NIVEL_LABEL: Record<ClienteNivel, string> = { socio: 'Socio', plus: 'Plus', premium: 'Premium' }
export const RIESGO_LABEL: Record<ClienteRiesgo, string> = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto' }
export const CANAL_LABEL: Record<Canal, string> = { push: 'Push (Club)', email: 'Email', whatsapp: 'WhatsApp' }

export type Cliente = {
  id: string
  tipo: ClienteTipo
  nombre: string
  dni: string | null
  cuit: string | null
  telefono: string | null
  email: string | null
  fecha_nacimiento: string | null
  sucursal_habitual_id: string | null
  fuentes: string[]
  cuponera_user_id: string | null
  nivel: ClienteNivel | null
  puntos: number
  total_gastado_12m: number
  n_compras_12m: number
  ultima_compra: string | null
  frecuencia_compra_dias: number | null
  riesgo_churn: ClienteRiesgo
  score_valor: number
  notas: string | null
  activo: boolean
  es_demo: boolean
  created_at: string
  updated_at: string
}

/** Regla de segmento (criterios combinables). */
export type SegmentoRegla = {
  gasto_min?: number
  frecuencia_max_dias?: number
  ultima_compra_dias_min?: number   // no compra hace >= N días
  ultima_compra_dias_max?: number   // compró en los últimos N días
  nivel?: ClienteNivel
  sucursal_id?: string
  tipo?: ClienteTipo
  riesgo?: ClienteRiesgo
  cumple_mes?: number                // 1-12
  top_pct_gasto?: number             // top N% por gasto
}

export type Segmento = {
  id: string; nombre: string; descripcion: string | null; tipo: SegmentoTipo
  regla: SegmentoRegla; clave_auto: string | null; n_clientes: number
  dinamico: boolean; es_demo: boolean; created_at: string
}

export type MensajeCanal = { title?: string; subject?: string; body?: string; html?: string }
export type CampaniaMensaje = Partial<Record<Canal, MensajeCanal>>
export type CampaniaMetricas = { enviados?: number; abiertos?: number; convirtieron?: number; facturacion?: number }

export type CampaniaCrm = {
  id: string; nombre: string; segmento_id: string | null; objetivo: string | null
  canales: string[]; mensaje: CampaniaMensaje; cupon_ref: string | null
  estado: CampaniaEstado; programada_at: string | null; redactado_por: string
  metricas: CampaniaMetricas; es_demo: boolean; created_at: string
}

export type Automatizacion = {
  id: string; nombre: string; trigger: AutomatizacionTrigger; config: Record<string, unknown>
  canales: string[]; mensaje_template: MensajeCanal; cupon_ref: string | null
  activa: boolean; ultima_corrida: string | null; n_disparos: number; es_demo: boolean
}

export const AUTOMATIZACION_LABEL: Record<AutomatizacionTrigger, string> = {
  cumpleanos: 'Cumpleaños', inactividad_30d: 'Reactivación por inactividad',
  recompra_cronico: 'Recordatorio de recompra (crónicos)', nivel_alcanzado: 'Nivel alcanzado',
}

export type PuntosRegla = {
  id: string; evento: PuntosEvento; descripcion: string | null
  puntos: number; ratio_monto: number | null; activa: boolean
}
export const PUNTOS_EVENTO_LABEL: Record<PuntosEvento, string> = {
  compra: 'Por compra', cargar_ticket: 'Cargar ticket', resena: 'Reseña / encuesta',
  encuesta: 'Encuesta', ajuste: 'Ajuste manual',
}

export const OBJETIVOS_CAMPANIA = [
  { value: 'reactivar', label: 'Reactivar inactivos' },
  { value: 'fidelizar', label: 'Fidelizar VIP' },
  { value: 'promo', label: 'Promoción / oferta' },
  { value: 'cumpleanos', label: 'Saludo de cumpleaños' },
  { value: 'recompra', label: 'Recordar recompra' },
] as const
