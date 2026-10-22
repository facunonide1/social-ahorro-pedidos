import { redirect, notFound } from 'next/navigation'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'
import { equivalencias, cobertura } from '@/lib/mostrador/producto'
import { cuandoSeLeyoElStock } from '@/lib/mostrador/buscar'

import { ProductoClient } from './producto-client'

export const dynamic = 'force-dynamic'

const VEN_PLATA: AdminRole[] = ['super_admin', 'gerente', 'comprador', 'tesoreria', 'auditor']

/**
 * LA FICHA, EN EL MOSTRADOR.
 *
 * Se lee con el cliente de servicio porque todo lo que se muestra es catálogo
 * —producto, equivalentes, convenios— y el filtro que importa es cuál es «mi
 * sucursal» y qué puede ver el rol, que lo decide esta página.
 *
 * Lo que NO se muestra acá: nada de una persona. La cobertura se consulta por
 * producto; qué afiliado tiene delante el empleado no entra al sistema.
 */
export default async function ProductoMostradorPage({ params }: { params: { id: string } }) {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect(`/login?next=/mostrador/${params.id}`)

  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) redirect('/logout?reason=sin_permiso')
  if (!puede(me.rol, me.permisos_custom ?? null, 'operaciones', 'ver')) redirect('/hub?denied=1')

  const adm = createAdminClient()
  const { data: suc } = await adm.from('sucursales')
    .select('id, nombre').eq('activa', true).eq('es_ecommerce', false).order('codigo')
  const sucursal = me.sucursal_id ?? ((suc ?? [])[0] as any)?.id
  if (!sucursal) notFound()

  const { data: p } = await adm.from('mostrador_indice')
    .select('*').eq('producto_id', params.id).maybeSingle()
  if (!p) notFound()

  const [{ filas: equis, porQue }, cob, { data: si }, { data: estado }, { data: sug }] =
    await Promise.all([
      equivalencias(adm, params.id, sucursal),
      cobertura(adm, params.id),
      adm.from('stock_items').select('cantidad')
        .eq('producto_id', params.id).eq('sucursal_id', sucursal).maybeSingle(),
      adm.rpc('mostrador_que_no_se_puede_ordenar', { p_sucursal: sucursal }),
      // E.4 · UNA sugerencia. Se pide acá y no en el cliente para que el
      // registro de «se ofreció» lo haga el servidor, no un click.
      adm.rpc('mostrador_sugerencia', { p_producto: params.id, p_sucursal: sucursal }),
    ])

  const pi = p as any
  const verPlata = VEN_PLATA.includes(me.rol)

  return (
    <ProductoClient
      producto={{
        producto_id: pi.producto_id, sku: pi.sku, nombre: pi.nombre,
        nombre_comercial: pi.nombre_comercial, laboratorio: pi.laboratorio,
        presentacion: pi.presentacion, droga_principal: pi.droga_principal,
        concentracion: pi.concentracion,
        precio: pi.precio == null ? null : Number(pi.precio),
        // F.7 · el margen no viaja si no lo puede ver.
        margen_pct: verPlata && pi.margen_pct != null ? Number(pi.margen_pct) : null,
        requiere_receta: pi.requiere_receta,
        condicion_venta: pi.condicion_venta,
        stock: (si as any)?.cantidad == null ? 0 : Number((si as any).cantidad),
      }}
      equivalentes={equis}
      porQue={porQue}
      cobertura={cob}
      sucursalNombre={((suc ?? []) as any[]).find((s) => s.id === sucursal)?.nombre ?? ''}
      fotoDelStock={cuandoSeLeyoElStock((estado as any)?.stock_leido_at ?? null)}
      verPlata={verPlata}
      sugerencia={(sug ?? null) as any}
    />
  )
}
