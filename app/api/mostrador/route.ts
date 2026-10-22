import { NextResponse, type NextRequest } from 'next/server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { puede, type PermisosCustom } from '@/lib/types/permisos'
import type { AdminRole } from '@/lib/types/admin'
import { buscar, motivos, loQueNoSeSabe } from '@/lib/mostrador/buscar'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * EL MOSTRADOR · LA BÚSQUEDA.
 *
 * ── POR QUÉ EL MOTIVO SE ARMA ACÁ Y NO EN EL NAVEGADOR ──────────────────────
 *
 * F.7 · Quien atiende no ve costos ni márgenes. Si el margen viajara al
 * navegador y el componente decidiera ocultarlo, estaría en el HTML: cualquiera
 * con la consola abierta lo ve.
 *
 * Entonces el servidor decide con el rol y manda **el motivo ya escrito**.
 * Para un cajero sale «deja más»; para un dueño, «deja 52%». El número no
 * viaja.
 *
 * ── Y LA LÍNEA QUE NO SE CRUZA ──────────────────────────────────────────────
 *
 * Esta ruta recibe un texto de búsqueda de PRODUCTO. No recibe síntoma ni
 * motivo de compra, no los guarda y no hay dónde guardarlos. Si alguien manda
 * «dolor de garganta», lo va a tratar como texto de producto, no va a
 * encontrar nada y va a ofrecer registrar el faltante — que es lo correcto.
 */

/** Quién puede ver la plata detrás del orden. */
const VEN_PLATA: AdminRole[] = ['super_admin', 'gerente', 'comprador', 'tesoreria', 'auditor']

async function gate() {
  const sb = createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'no autenticado', status: 401 as const }
  const { data: me } = await sb.from('users_admin')
    .select('rol, activo, permisos_custom, sucursal_id').eq('id', user.id)
    .maybeSingle<{ rol: AdminRole; activo: boolean; permisos_custom: PermisosCustom | null; sucursal_id: string | null }>()
  if (!me?.activo) return { error: 'usuario inactivo', status: 403 as const }
  if (!puede(me.rol, me.permisos_custom ?? null, 'operaciones', 'ver')) {
    return { error: 'sin permiso sobre el mostrador', status: 403 as const }
  }
  return {
    ok: true as const, userId: user.id, rol: me.rol,
    sucursalId: me.sucursal_id, verPlata: VEN_PLATA.includes(me.rol),
  }
}

export async function POST(req: NextRequest) {
  const g = await gate()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })

  const b = await req.json().catch(() => null)
  const q = typeof b?.q === 'string' ? b.q.trim() : ''
  const codigo = typeof b?.codigo === 'string' ? b.codigo.trim() : null
  // Regla de oro 8: la sucursal es explícita. Quien no tiene una asignada
  // (un dueño) tiene que decir cuál: el stock y el orden son de UNA sucursal.
  const sucursal = g.sucursalId ?? (typeof b?.sucursal_id === 'string' ? b.sucursal_id : null)

  if (!sucursal) {
    return NextResponse.json({
      error: 'Falta la sucursal. El stock, el vencimiento y lo que se vende son de una sucursal: sin eso el orden no significa nada.',
    }, { status: 400 })
  }
  if (!q && !codigo) return NextResponse.json({ error: 'falta qué buscar' }, { status: 400 })
  if (g.sucursalId && b?.sucursal_id && b.sucursal_id !== g.sucursalId) {
    return NextResponse.json({ error: 'sólo podés mirar el mostrador de tu sucursal' }, { status: 403 })
  }

  // Se lee con el cliente de servicio porque la función es la misma para todos
  // y el filtro que importa —qué se muestra y con qué motivo— lo aplica esta
  // ruta con el rol. La RLS de `mostrador_indice` es de lectura abierta: es el
  // catálogo, y el catálogo ya lo ve todo el mundo adentro.
  const adm = createAdminClient()

  try {
    const { filas, tardoMs } = await buscar(adm, { q, sucursalId: sucursal, codigo })

    return NextResponse.json({
      ok: true,
      tardo_ms: tardoMs,
      ver_plata: g.verPlata,
      filas: filas.map((h) => ({
        producto_id: h.producto_id,
        sku: h.sku,
        nombre: h.nombre,
        nombre_comercial: h.nombre_comercial,
        laboratorio: h.laboratorio,
        presentacion: h.presentacion,
        droga_principal: h.droga_principal,
        precio: h.precio,
        stock: h.stock,
        disponible: h.disponible,
        requiere_receta: h.requiere_receta,
        condicion_venta: h.condicion_venta,
        marca_pedida: h.marca_pedida,
        en_oferta: h.en_oferta,
        dias_para_vencer: h.dias_para_vencer,
        // A.4 · el motivo, ya escrito según quién mira.
        motivos: motivos(h, g.verPlata),
        // A.5 · y lo que de este producto no se puede saber.
        no_se_sabe: loQueNoSeSabe(h),
        // F.7 · el margen sólo viaja si lo puede ver. No se manda y se oculta:
        // no se manda.
        margen_pct: g.verPlata ? h.margen_pct : undefined,
        meses_cobertura: g.verPlata ? h.meses_cobertura : undefined,
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'falló la búsqueda' }, { status: 500 })
  }
}
