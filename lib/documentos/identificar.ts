import { TENANT_ACTUAL } from '@/lib/documentos/config'

type Adm = any

export type IdentificacionTercero =
  | { estado: 'encontrado'; terceroId: string; razonSocial: string; via: 'cuit' | 'alias' }
  | { estado: 'sin_match'; identFiscal: string | null; nombreLeido: string | null }

/**
 * Deja sólo los dígitos. En el papel el CUIT viene como 30-71234567-9,
 * 30712345679 o 30.71234567.9 según quién imprima.
 */
export function normalizarCuit(raw: string | null | undefined): string | null {
  if (!raw) return null
  const d = String(raw).replace(/\D/g, '')
  return d.length === 11 ? d : null
}

/**
 * Identifica al emisor de un documento.
 *
 * REGLA: el tercero se identifica por identificación fiscal, NUNCA por nombre.
 * El nombre cambia, se abrevia y se escribe distinto en cada papel; el CUIT no.
 *
 * Si no hay match NO se crea el proveedor: se devuelve `sin_match` y la pantalla
 * de revisión ofrece elegir uno existente o crear uno nuevo con confirmación
 * explícita. Crear proveedores solo llena la tabla de duplicados que después
 * nadie limpia.
 */
export async function identificarTercero(
  adm: Adm,
  identFiscal: string | null,
  nombreLeido: string | null,
): Promise<IdentificacionTercero> {
  const cuit = normalizarCuit(identFiscal)
  if (!cuit) return { estado: 'sin_match', identFiscal, nombreLeido }

  // 1 · Contra proveedores. El CUIT guardado puede tener guiones o no.
  const { data: provs } = await adm.from('proveedores').select('id, razon_social, cuit').limit(5000)
  const match = ((provs ?? []) as any[]).find((p) => normalizarCuit(p.cuit) === cuit)
  if (match) return { estado: 'encontrado', terceroId: match.id, razonSocial: match.razon_social, via: 'cuit' }

  // 2 · Contra los alias ya aprendidos (mismo CUIT, otra forma de escribir el nombre).
  const { data: alias } = await adm
    .from('doc_terceros_alias')
    .select('tercero_id, proveedores(razon_social)')
    .eq('tenant_id', TENANT_ACTUAL)
    .eq('ident_fiscal', cuit)
    .not('tercero_id', 'is', null)
    .limit(1)
    .maybeSingle()

  if (alias?.tercero_id) {
    return {
      estado: 'encontrado',
      terceroId: alias.tercero_id,
      razonSocial: (alias as any).proveedores?.razon_social ?? nombreLeido ?? 'proveedor',
      via: 'alias',
    }
  }

  // 3 · No se crea nada: decide una persona.
  return { estado: 'sin_match', identFiscal: cuit, nombreLeido }
}

/**
 * Guarda cómo vino escrito el nombre de este tercero en este papel.
 *
 * Se llama al confirmar, no al leer: recién ahí sabemos que la asociación
 * CUIT → proveedor es correcta porque una persona la miró.
 */
export async function aprenderAliasTercero(
  adm: Adm,
  identFiscal: string | null,
  nombreVariante: string | null,
  terceroId: string,
  userId: string | null,
): Promise<void> {
  const cuit = normalizarCuit(identFiscal)
  const nombre = (nombreVariante ?? '').trim()
  if (!cuit || !nombre) return

  const { data: ya } = await adm
    .from('doc_terceros_alias')
    .select('id, veces_visto')
    .eq('tenant_id', TENANT_ACTUAL)
    .eq('ident_fiscal', cuit)
    .eq('nombre_variante', nombre)
    .maybeSingle()

  if (ya) {
    await adm
      .from('doc_terceros_alias')
      .update({ veces_visto: (ya.veces_visto ?? 1) + 1, tercero_id: terceroId })
      .eq('id', ya.id)
    return
  }

  await adm.from('doc_terceros_alias').insert({
    ident_fiscal: cuit,
    nombre_variante: nombre,
    tercero_id: terceroId,
    origen: 'automatico',
    veces_visto: 1,
    created_by: userId,
  })
}
