import { createAdminClient } from '@/lib/supabase/server'

/**
 * LOS DEFECTOS DE LA PIEZA.
 *
 * Lo que la declaración compartida dice mal.
 *
 * ── POR QUÉ NO VA EN LA COLA DE CONSTRUCCIÓN ────────────────────────────────
 *
 * Un pedido de construcción es algo que no existe y hay que construir. Un
 * defecto es algo que YA existe y está mal escrito. Ponerlos juntos haría que la
 * cola de construcción —que se ordena por demanda justamente para decidir qué
 * construir— se llene de cosas que no hay que construir, y perdería la única
 * propiedad por la que existe.
 *
 * ── POR QUÉ IMPORTA QUE ESTÉN LISTADOS ──────────────────────────────────────
 *
 * Un override de instalación que tapa un defecto de la pieza es cómodo y es
 * deuda: el próximo negocio que instale la pieza se come el mismo problema. El
 * override lo hace invisible. Esta tabla es lo que lo hace visible de nuevo.
 */

export type EstadoDefecto = 'abierto' | 'corregido' | 'descartado'

export interface DefectoPieza {
  id: string
  poolClave: string
  campo: string
  dice: string | null
  deberiaDecir: string | null
  detectadoPor: string
  evidencia: string | null
  enQueProyectos: string[]
  estado: EstadoDefecto
  motivoCierre: string | null
  detectadoAt: string
}

interface Fila {
  id: string
  campo: string
  dice: string | null
  deberia_decir: string | null
  detectado_por: string
  evidencia: string | null
  en_que_proyectos: string[]
  estado: EstadoDefecto
  motivo_cierre: string | null
  detectado_at: string
  pool: { clave: string } | null
}

const aDefecto = (f: Fila): DefectoPieza => ({
  id: f.id,
  poolClave: f.pool?.clave ?? '?',
  campo: f.campo,
  dice: f.dice,
  deberiaDecir: f.deberia_decir,
  detectadoPor: f.detectado_por,
  evidencia: f.evidencia,
  enQueProyectos: f.en_que_proyectos ?? [],
  estado: f.estado,
  motivoCierre: f.motivo_cierre,
  detectadoAt: f.detectado_at,
})

const SELECT = '*, pool:fab_pools(clave)'

/**
 * Anota un defecto. Idempotente sobre los abiertos: si el campo ya tiene uno
 * abierto, no crea otro — el índice parcial lo impide y acá se evita el error.
 */
export async function anotarDefecto(args: {
  poolClave: string
  campo: string
  dice: string | null
  deberiaDecir: string | null
  detectadoPor: string
  evidencia?: string
  enQueProyectos?: string[]
}): Promise<{ ok: boolean; id?: string; yaEstaba?: boolean; error?: string }> {
  const adm = createAdminClient()
  const { data: pool } = await adm
    .from('fab_pools')
    .select('id')
    .eq('clave', args.poolClave)
    .maybeSingle()
  const poolId = (pool as { id: string } | null)?.id
  if (!poolId) return { ok: false, error: `No existe el pool ${args.poolClave}.` }

  const { data: ya } = await adm
    .from('fab_defectos_pieza')
    .select('id')
    .eq('pool_id', poolId)
    .eq('campo', args.campo)
    .eq('estado', 'abierto')
    .maybeSingle()
  if (ya) return { ok: true, id: (ya as { id: string }).id, yaEstaba: true }

  const { data, error } = await adm
    .from('fab_defectos_pieza')
    .insert({
      pool_id: poolId,
      campo: args.campo,
      dice: args.dice,
      deberia_decir: args.deberiaDecir,
      detectado_por: args.detectadoPor,
      evidencia: args.evidencia ?? null,
      en_que_proyectos: args.enQueProyectos ?? [],
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? 'No se pudo anotar.' }
  return { ok: true, id: (data as { id: string }).id }
}

export async function cerrarDefecto(args: {
  id: string
  estado: 'corregido' | 'descartado'
  motivo: string
  versionId?: string | null
  autorId: string | null
}): Promise<{ ok: boolean; error?: string }> {
  if (!args.motivo?.trim()) {
    // Igual que en los pedidos: un defecto que desaparece sin motivo se vuelve
    // a detectar y nadie sabe que ya se había decidido.
    return { ok: false, error: 'Cerrar un defecto exige decir por qué.' }
  }
  const { error } = await createAdminClient()
    .from('fab_defectos_pieza')
    .update({
      estado: args.estado,
      motivo_cierre: args.motivo.trim(),
      version_id: args.versionId ?? null,
      cerrado_at: new Date().toISOString(),
      cerrado_por: args.autorId,
    })
    .eq('id', args.id)
  return { ok: !error, error: error?.message }
}

export async function defectos(
  opciones: { soloAbiertos?: boolean } = {},
): Promise<DefectoPieza[]> {
  const adm = createAdminClient()
  let q = adm.from('fab_defectos_pieza').select(SELECT)
  if (opciones.soloAbiertos) q = q.eq('estado', 'abierto')
  const { data } = await q.order('detectado_at', { ascending: true }).limit(500)
  return ((data ?? []) as unknown as Fila[]).map(aDefecto)
}
