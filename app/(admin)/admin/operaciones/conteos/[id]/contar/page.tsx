import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import type { Ambito } from '@/lib/conteo/ambito'

import ContarClient from './contar-client'

export const dynamic = 'force-dynamic'

/**
 * La pantalla de contar.
 *
 * Carga los items con el cliente de SESIÓN y enumerando columnas. Nunca toca
 * `stock_items`: si esta página consultara el stock, la esperada llegaría al
 * HTML aunque el componente no la mostrara, y bastaría con "ver código fuente".
 */
export default async function ContarPage({ params }: { params: { id: string } }) {
  await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'administrativo', 'sucursal', 'comprador', 'auditor'],
  })
  const sb = createClient()

  const { data: conteo } = await sb
    .from('cnt_conteos')
    .select('id, estado, lista_id')
    .eq('id', params.id)
    .maybeSingle<{ id: string; estado: string; lista_id: string }>()
  if (!conteo) redirect('/admin/operaciones/conteos')
  if (conteo.estado === 'cerrado' || conteo.estado === 'anulado') {
    redirect(`/admin/operaciones/conteos/${params.id}`)
  }

  const [{ data: lista }, { data: items }, { data: renglones }] = await Promise.all([
    sb
      .from('cnt_listas')
      .select('zona, ambito')
      .eq('id', conteo.lista_id)
      .maybeSingle<{ zona: string; ambito: Ambito }>(),
    sb
      .from('cnt_lista_items')
      .select('id, sku, descripcion, unidad, orden')
      .eq('lista_id', conteo.lista_id)
      .eq('activo', true)
      .order('orden'),
    sb
      .from('cnt_renglones')
      .select('lista_item_id, cantidad_contada, nota, salteado, motivo_salteo')
      .eq('conteo_id', params.id),
  ])

  const yaContado = new Map(
    ((renglones ?? []) as {
      lista_item_id: string
      cantidad_contada: number | null
      nota: string | null
      salteado: boolean
      motivo_salteo: string | null
    }[]).map((r) => [r.lista_item_id, r]),
  )

  return (
    <ContarClient
      conteoId={params.id}
      zona={lista?.zona ?? 'zona'}
      ambito={lista?.ambito ?? 'total'}
      items={((items ?? []) as {
        id: string
        sku: string | null
        descripcion: string
        unidad: string | null
        orden: number
      }[]).map((i) => {
        const r = yaContado.get(i.id)
        return {
          id: i.id,
          sku: i.sku,
          descripcion: i.descripcion,
          unidad: i.unidad,
          orden: i.orden,
          cantidad: r?.cantidad_contada ?? null,
          nota: r?.nota ?? null,
          salteado: r?.salteado ?? false,
          motivoSalteo: r?.motivo_salteo ?? null,
        }
      })}
    />
  )
}
