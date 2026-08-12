import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { traerProyecto } from '@/lib/fabrica/datos'
import { artefactosVisibles } from '@/lib/fabrica/prueba'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Actividad' }

/**
 * La auditoría de la propia fábrica.
 *
 * Qué se declaró, qué se revirtió, quién prendió o apagó el lector, y cuándo.
 * La fábrica cambia el comportamiento de un sistema en producción: tiene que
 * poder rendir cuentas con la misma seriedad que le exige a los sectores.
 */
export default async function ActividadPage({ params }: { params: { slug: string } }) {
  const proyecto = await traerProyecto(params.slug)
  if (!proyecto) notFound()

  const sb = createClient()

  const [{ data: versiones }, { data: cambios }, { data: espejo }] = await Promise.all([
    sb
      .from('fab_pool_versiones')
      .select('numero, notas_cambio, created_at, created_by, revierte_a, es_actual, pool:fab_pools!inner(clave, nombre)')
      .in('es_prueba', artefactosVisibles())
      .order('created_at', { ascending: false })
      .limit(60),
    sb
      .from('fab_lector_cambios')
      .select('pool_clave, desde, hasta, panico, motivo, cambiado_at, cambiado_por')
      .eq('proyecto_id', proyecto.id)
      .in('es_prueba', artefactosVisibles())
      .order('cambiado_at', { ascending: false })
      .limit(60),
    sb
      .from('fab_declaraciones_espejo')
      .select('resultado, resumen, verificado_at')
      .order('verificado_at', { ascending: false })
      .limit(20),
  ])

  type Fila = {
    cuando: string
    tipo: 'declaracion' | 'revert' | 'lector' | 'espejo'
    titulo: string
    detalle: string
    autorId: string | null
  }

  const filas: Fila[] = []

  for (const v of (versiones ?? []) as unknown as {
    numero: number
    notas_cambio: string | null
    created_at: string
    created_by: string | null
    revierte_a: string | null
    es_actual: boolean
    pool: { clave: string; nombre: string }
  }[]) {
    filas.push({
      cuando: v.created_at,
      tipo: v.revierte_a ? 'revert' : 'declaracion',
      titulo: `${v.pool.nombre} · versión ${v.numero}${v.es_actual ? ' (gobierna hoy)' : ''}`,
      detalle: v.notas_cambio ?? 'sin motivo registrado',
      autorId: v.created_by,
    })
  }

  for (const c of (cambios ?? []) as {
    pool_clave: string | null
    desde: string
    hasta: string
    panico: boolean
    motivo: string | null
    cambiado_at: string
    cambiado_por: string | null
  }[]) {
    filas.push({
      cuando: c.cambiado_at,
      tipo: 'lector',
      titulo: `${c.pool_clave ?? 'todos'} · lector ${c.desde} → ${c.hasta}${c.panico ? ' (pánico)' : ''}`,
      detalle: c.motivo ?? 'sin motivo registrado',
      autorId: c.cambiado_por,
    })
  }

  filas.sort((a, b) => b.cuando.localeCompare(a.cuando))

  // Los emails viven en auth.users, que no se lee con la sesión del usuario.
  const adm = createAdminClient()
  const emails = new Map<string, string>()
  await Promise.all(
    [...new Set(filas.map((f) => f.autorId).filter(Boolean) as string[])].map(async (id) => {
      const { data } = await adm.auth.admin.getUserById(id)
      if (data?.user?.email) emails.set(id, data.user.email)
    }),
  )

  const VARIANTE = {
    declaracion: 'info',
    revert: 'warning',
    lector: 'default',
    espejo: 'outline',
  } as const
  const ETIQUETA = {
    declaracion: 'declaración',
    revert: 'revert',
    lector: 'lector',
    espejo: 'espejo',
  } as const

  return (
    <div className="space-y-8 p-4 md:p-6">
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Actividad de la fábrica</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Qué se declaró, qué se revirtió y quién prendió o apagó el lector. La
          fábrica cambia el comportamiento de un sistema en producción: tiene que
          poder rendir cuentas con la misma seriedad que le exige a los sectores.
        </p>

        {filas.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            Todavía no pasó nada.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-border rounded-lg border border-border">
            {filas.map((f, i) => (
              <div key={i} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <Badge variant={VARIANTE[f.tipo]} className="shrink-0 font-normal">
                  {ETIQUETA[f.tipo]}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{f.titulo}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{f.detalle}</p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <div>{String(f.cuando).slice(0, 16).replace('T', ' ')}</div>
                  {f.autorId && <div>{emails.get(f.autorId) ?? '—'}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {(espejo ?? []).length > 0 && (
        <section>
          <h2 className="text-sm font-semibold tracking-tight">Verificaciones de espejo</h2>
          <div className="mt-3 divide-y divide-border rounded-lg border border-border">
            {((espejo ?? []) as { resultado: string; resumen: string | null; verificado_at: string }[]).map(
              (e, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  <Badge
                    variant={e.resultado === 'coincide' ? 'success' : 'warning'}
                    className="shrink-0 font-normal"
                  >
                    {e.resultado}
                  </Badge>
                  <span className="min-w-0 flex-1 text-muted-foreground">{e.resumen ?? '—'}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {String(e.verificado_at).slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
              ),
            )}
          </div>
        </section>
      )}
    </div>
  )
}
