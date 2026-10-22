/**
 * Lo que la pantalla de descripciones lee.
 *
 * Mismo criterio que `lib/deteccion/lectura.ts`: si una consulta falla,
 * devuelve null y la pantalla dice que no pudo mirar. Null es «no lo puedo
 * saber»; cero es «lo miré y no hay».
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type EnCola = {
  producto_id: string; sku: string | null
  nombre_canal: string | null; nombre_sifaco: string | null
  laboratorio: string | null; presentacion: string | null
  rubro: string | null; categoria: string | null
  unidades_3m: number; stock: number; plata_parada: number | null
  por_que_este: string; estado: string; texto: string | null
}

export type SinPoder = {
  producto_id: string; nombre_canal: string | null
  nombre_sifaco: string | null; por_que_no: string | null
}

export type Resumen = {
  publicaciones: number; productos_publicados: number
  sin_cruzar_con_el_catalogo: number
  aprobadas: number; propuestas: number; rechazadas: number
  no_se_pueden: number; sin_describir: number
}

type Adm = Pick<SupabaseClient, 'rpc' | 'from'>

export async function cola(adm: Adm, limite = 40): Promise<EnCola[] | null> {
  const { data, error } = await adm.rpc('descripciones_cola', { p_limite: limite })
  if (error) { console.error(`[descripciones] cola: ${error.message}`); return null }
  return (data ?? []) as EnCola[]
}

export async function sinPoder(adm: Adm): Promise<SinPoder[] | null> {
  const { data, error } = await adm.rpc('descripciones_sin_poder')
  if (error) { console.error(`[descripciones] sin_poder: ${error.message}`); return null }
  return (data ?? []) as SinPoder[]
}

export async function resumen(adm: Adm): Promise<Resumen | null> {
  const { data, error } = await adm.rpc('descripciones_resumen')
  if (error) { console.error(`[descripciones] resumen: ${error.message}`); return null }
  return (data ?? null) as Resumen | null
}

export async function canales(adm: Adm) {
  const { data, error } = await adm.from('canales_venta')
    .select('id, nombre').eq('activo', true).order('nombre').limit(50)
  if (error) { console.error(`[descripciones] canales: ${error.message}`); return null }
  return (data ?? []) as { id: string; nombre: string }[]
}
