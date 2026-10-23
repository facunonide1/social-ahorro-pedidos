import Link from 'next/link'
import { ArrowRight, CheckCircle2, HelpCircle, Info } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSucursalActiva } from '@/lib/sucursal/server'
import { ADMIN_ROLE_LABELS } from '@/lib/types/admin'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { miDia, PANELES, type Panel } from '@/lib/direccion/mi-dia'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mi día' }

/**
 * F · EL PANEL DE CADA ROL.
 *
 * ── F.5 · EL PRIMER DÍA ─────────────────────────────────────────────────────
 *
 * Alguien que entra por primera vez tiene que ver **qué tiene que hacer hoy y
 * nada más**. Por eso lo primero de la pantalla es un solo renglón —el más
 * urgente de su panel— y el resto va abajo.
 *
 * Si no hay nada urgente, lo dice. Y si su rol no tiene ninguno de los cuatro
 * paneles, también: no se le muestra un panel vacío de otro, que es la forma
 * más rápida de que alguien piense que el sistema no es para él.
 *
 * ── DISEÑADO PARA EL CELULAR ────────────────────────────────────────────────
 *
 * El del depósito trabaja con el teléfono en una mano. Una columna, números
 * grandes, cada renglón es un link entero y no un botón chico dentro de una
 * fila. Nada que requiera apuntar.
 */
export default async function MiDiaPage({
  searchParams,
}: {
  searchParams: { panel?: string }
}) {
  const perfil = await requireAdminHubAccess({})
  const sb = createClient()
  const adm = createAdminClient()

  const { data: { user } } = await sb.auth.getUser()
  const { sucursalId } = getSucursalActiva()

  const { data: suc } = sucursalId
    ? await adm.from('sucursales').select('nombre').eq('id', sucursalId).maybeSingle<{ nombre: string }>()
    : { data: null }

  const pedido = (PANELES.some((p) => p.clave === searchParams.panel)
    ? searchParams.panel
    : null) as Panel | null

  const { paneles, disponibles } = await miDia(adm, {
    userId: user?.id ?? perfil.id,
    rol: perfil.rol,
    sucursalId,
    sucursal: suc?.nombre ?? null,
    soloPanel: pedido,
  })

  // F.5 · lo primero. Uno solo, el de más arriba.
  const loPrimero = paneles.map((p) => p.lo_primero).find(Boolean) ?? null

  return (
    <>
      <PageHeader
        title="Mi día"
        description={`${ADMIN_ROLE_LABELS[perfil.rol]}${suc?.nombre ? ` · ${suc.nombre}` : ' · toda la cadena'}`}
        breadcrumbs={[{ label: 'Mi día' }]}
      />
      <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
        {/* ── SIN PANEL ────────────────────────────────────────────────── */}
        {!disponibles.length ? (
          <div className="space-y-2 rounded-lg border p-6">
            <HelpCircle className="size-6 text-muted-foreground" />
            <p className="text-base font-medium">
              Tu rol no tiene uno de estos cuatro paneles.
            </p>
            <p className="text-xs leading-snug text-muted-foreground">
              Los paneles del día son cuatro: encargado, mostrador, depósito y canal.{' '}
              <b>{ADMIN_ROLE_LABELS[perfil.rol]}</b> no es ninguno de esos, y mostrarte el de otro
              vacío sería peor que decirlo. Tu trabajo está en{' '}
              <Link href="/admin" className="underline decoration-dotted">
                el inicio
              </Link>{' '}
              y en{' '}
              <Link href="/admin/mi-panel" className="underline decoration-dotted">
                mi panel
              </Link>
              .
            </p>
          </div>
        ) : (
          <>
            {/* ── F.5 · LO PRIMERO, Y NADA MÁS ────────────────────────── */}
            {loPrimero ? (
              <Link
                href={loPrimero.href}
                className="block rounded-lg border-2 border-destructive p-4 hover:bg-destructive/5"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  lo primero de hoy
                </p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tabular-nums text-destructive">
                    {loPrimero.cuantos?.toLocaleString('es-AR') ?? '—'}
                  </span>
                  <span className="text-base font-medium">{loPrimero.que}</span>
                </p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {loPrimero.detalle}
                </p>
                <p className="mt-2 flex items-center gap-1 text-xs font-medium">
                  Ir a resolverlo
                  <ArrowRight className="size-3" />
                </p>
              </Link>
            ) : (
              <div className="rounded-lg border p-4">
                <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-500" />
                <p className="mt-1 text-base font-medium">No hay nada urgente hoy.</p>
                <p className="text-xs leading-snug text-muted-foreground">
                  <b>Este cero es de verdad:</b> se miró y no hay. Abajo está el resto, por si
                  querés adelantar.
                </p>
              </div>
            )}

            {/* ── EL SELECTOR, SI TIENE MÁS DE UNO ────────────────────── */}
            {disponibles.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <Link
                  href="/admin/mi-dia"
                  className={`rounded border px-2.5 py-1 text-xs ${
                    pedido === null ? 'bg-foreground text-background' : 'hover:bg-muted'
                  }`}
                >
                  todos ({disponibles.length})
                </Link>
                {disponibles.map((d) => {
                  const meta = PANELES.find((p) => p.clave === d)!
                  return (
                    <Link
                      key={d}
                      href={`/admin/mi-dia?panel=${d}`}
                      className={`rounded border px-2.5 py-1 text-xs ${
                        pedido === d ? 'bg-foreground text-background' : 'hover:bg-muted'
                      }`}
                    >
                      {meta.nombre}
                    </Link>
                  )
                })}
              </div>
            )}

            {/* ── LOS PANELES ──────────────────────────────────────────── */}
            {paneles.map((p) => (
              <section key={p.panel} className="space-y-2">
                <h2 className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {p.nombre}
                  {p.sucursal && (
                    <Badge variant="secondary" className="text-[10px] normal-case">
                      {p.sucursal}
                    </Badge>
                  )}
                  {!p.sucursal && p.panel !== 'canal' && (
                    <Badge variant="outline" className="text-[10px] normal-case">
                      todas las sucursales
                    </Badge>
                  )}
                </h2>

                <div className="divide-y rounded-lg border">
                  {p.pendientes.map((x, i) => (
                    <Link
                      key={i}
                      href={x.href}
                      className={`flex items-center gap-3 px-3 py-3 hover:bg-muted/50 ${
                        x.urgente && (x.cuantos ?? 0) > 0 ? 'border-l-2 border-l-destructive' : ''
                      }`}
                    >
                      <span
                        className={`w-16 shrink-0 text-right text-xl font-semibold tabular-nums ${
                          x.cuantos === null
                            ? 'text-sm font-normal text-muted-foreground'
                            : x.urgente && x.cuantos > 0
                              ? 'text-destructive'
                              : x.cuantos === 0
                                ? 'text-muted-foreground'
                                : ''
                        }`}
                      >
                        {x.cuantos === null ? '—' : x.cuantos.toLocaleString('es-AR')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{x.que}</span>
                        <span className="block text-xs leading-snug text-muted-foreground">
                          {x.cuantos === null
                            ? 'no se pudo contar: la consulta falló, y eso no es cero'
                            : x.detalle}
                          {x.cuantos === 0 && x.por_que_cero && (
                            <> — {x.por_que_cero}</>
                          )}
                        </span>
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                </div>

                {p.que_no_se_muestra && (
                  <p className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground">
                    <Info className="mt-0.5 size-3 shrink-0" />
                    <span>{p.que_no_se_muestra}</span>
                  </p>
                )}
              </section>
            ))}
          </>
        )}
      </div>
    </>
  )
}
