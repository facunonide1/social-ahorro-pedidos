import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { formatARS } from '@/lib/utils/format'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Caja fuerte' }

/**
 * E.1 · LA CAJA FUERTE, CON PANTALLA PROPIA.
 *
 * Existía como tabla desde la v0.20 y se veía de costado desde Pagos: no había
 * un lugar que dijera cuánto hay. Es lo que en el circuito real de Facundo es
 * «el Drive»: de ahí salen los retiros para pagarle a los proveedores.
 *
 * ── SOLO DUEÑOS ─────────────────────────────────────────────────────────────
 *
 * La RLS la pasó al módulo `finanzas` en la v0.97, que el encargado no tiene.
 * Esta lista de roles es la segunda puerta, no la única.
 */
export default async function CajaFuertePage() {
  await requireAdminHubAccess({ allowedRoles: ['super_admin', 'gerente', 'tesoreria'] })
  const sb = createClient()

  const [{ data: cajas }, { data: movs }, { data: sucs }] = await Promise.all([
    // Sin las de demostración: una caja fuerte con saldo inventado es la peor
    // clase de número falso — alguien puede ir a buscar esa plata.
    sb.from('caja_general').select('*').eq('es_demo', false),
    sb.from('caja_general_movimientos').select('*').eq('es_demo', false)
      .order('fecha', { ascending: false }).limit(100),
    sb.from('sucursales').select('id, nombre, codigo').eq('activa', true).order('codigo'),
  ])

  const c = (cajas ?? []) as any[]
  const m = (movs ?? []) as any[]
  const s = (sucs ?? []) as any[]
  const nombre = (id: string) => s.find((x) => x.id === id)?.nombre ?? '—'
  const total = c.reduce((a, x) => a + Number(x.saldo_actual ?? 0), 0)
  const pendientes = m.filter((x) => x.estado === 'pendiente_aprobacion')

  return (
    <>
      <PageHeader
        title="Caja fuerte"
        description="Lo que entra de los cierres y lo que sale para pagar. Es el Drive del circuito real, acá adentro."
        breadcrumbs={[{ label: 'Finanzas', href: '/admin/finanzas' }, { label: 'Caja fuerte' }]}
      />
      <div className="space-y-4 p-4 md:p-6">
        <section className="rounded-lg border bg-card p-4">
          <div className="text-3xl font-semibold tabular-nums">{formatARS(total)}</div>
          <p className="text-xs text-muted-foreground">
            es lo que suman las cajas fuertes de las {c.length} sucursales que la usan.
          </p>
          {!c.length && (
            <p className="mt-2 text-xs leading-snug text-muted-foreground">
              Todavía no hay ninguna caja fuerte abierta. Eso no es cero pesos: es que el circuito no
              se empezó a usar en NORA. Se abre sola con el primer cierre que mande efectivo.
            </p>
          )}
        </section>

        {pendientes.length > 0 && (
          <Alert>
            <AlertDescription className="text-xs leading-snug">
              <b>{pendientes.length} movimiento(s) esperando aprobación</b>, por{' '}
              {formatARS(pendientes.reduce((a, x) => a + Math.abs(Number(x.monto ?? 0)), 0))}. Regla
              de oro 7: un retiro se aprueba antes de salir.
            </AlertDescription>
          </Alert>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Por sucursal
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {s.map((x) => {
              const caja = c.find((y) => y.sucursal_id === x.id)
              return (
                <div key={x.id} className="rounded-lg border p-3">
                  <div className="text-sm font-medium">{x.nombre}</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">
                    {caja ? formatARS(Number(caja.saldo_actual)) : '—'}
                  </div>
                  {!caja && (
                    <p className="text-[11px] text-muted-foreground">
                      sin caja fuerte abierta en NORA
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Últimos movimientos
          </h2>
          {!m.length ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Ninguno todavía. Cuando un cierre mande efectivo a la fuerte y cuando salga un retiro
              para pagar, aparecen acá — y el control de caja los cruza contra los pagos
              registrados.
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {m.map((x) => (
                <div key={x.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                  <Badge variant="outline" className="text-[10px]">{x.tipo}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(x.fecha).toLocaleDateString('es-AR')}
                  </span>
                  {x.notas && <span className="text-xs text-muted-foreground">· {x.notas}</span>}
                  <span className={`ml-auto font-medium tabular-nums ${
                    Number(x.monto) < 0 ? 'text-destructive' : ''}`}>
                    {formatARS(Number(x.monto))}
                  </span>
                  <Badge variant={x.estado === 'aprobado' ? 'default' : 'outline'} className="text-[10px]">
                    {x.estado}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
