/**
 * Tipos del Catálogo de productos / vademécum (F6.5.T6).
 * Mirror de `public.productos_catalogo` (migración 0036).
 */

export type ProductoCatalogoCategoria =
  | 'medicamento'
  | 'perfumeria'
  | 'cuidado_personal'
  | 'dermocosmetica'
  | 'maternidad'
  | 'ortopedia'
  | 'otros'

export const PRODUCTO_CATEGORIAS: ProductoCatalogoCategoria[] = [
  'medicamento',
  'perfumeria',
  'cuidado_personal',
  'dermocosmetica',
  'maternidad',
  'ortopedia',
  'otros',
]

export const PRODUCTO_CATEGORIA_LABELS: Record<ProductoCatalogoCategoria, string> = {
  medicamento: 'Medicamento',
  perfumeria: 'Perfumería',
  cuidado_personal: 'Cuidado personal',
  dermocosmetica: 'Dermocosmética',
  maternidad: 'Maternidad',
  ortopedia: 'Ortopedia',
  otros: 'Otros',
}

export type ProductoCatalogo = {
  id: string
  sku: string
  codigo_barras: string | null
  nombre: string
  descripcion: string | null
  categoria: ProductoCatalogoCategoria
  subcategoria: string | null
  laboratorio: string | null
  presentacion: string | null
  droga_principal: string | null
  requiere_receta: boolean
  es_psicotropico: boolean
  es_refrigerado: boolean
  foto_url: string | null
  vademecum_data: Record<string, unknown>
  precio_sugerido: number | null
  precio_costo_promedio: number | null
  margen_pct: number | null
  comision_empleado_pct: number
  sustitutos_ids: string[]
  droguerias_preferidas: string[]
  stock_minimo_global: number | null
  activo: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

/** Campos del vademécum enriquecido (todos opcionales, texto libre). */
export type VademecumData = {
  para_que_sirve?: string
  dosis?: string
  contraindicaciones?: string
  interacciones?: string
}
