import { AlertTriangle, Check, CircleSlash, Info, Wrench } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { saludDeCanales, conexionesDeCanales } from '@/lib/canales/lectura'

import { TABS_CANALES, ROLES_CANAL } from '../_nav'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Salud de los canales' }

/**
 * A.3 · LA SALUD DE CADA CANAL.
 *
 * ── LA DISTINCIÓN QUE ESTA PANTALLA TIENE QUE DIBUJAR ───────────────────────
 *
 * `canales_conexiones()` devuelve tres estados y no dos:
 *
 *   `anda = true`   → entra y entra al día.
 *   `anda = false`  → tendría que entrar y no entra. **Está roto.**
 *   `anda = null`   → no entra **a propósito**. El mostrador no recibe pedidos
 *                     de plataforma, y no recibirlos no es una falla.
 *
 * Si los dos últimos se dibujan igual, el tablero manda a arreglar cuatro
 * conexiones de las que dos están bien — y a la tercera vez que alguien
 * revisa algo que funciona, deja de mirar el tablero.
 *
 * ── Y POR QUÉ CASI TODO ACÁ ES NULL ─────────────────────────────────────────
 *
 * Cuatro de las cinco cosas que pide el bloque no se pueden medir hoy: el
 * tiempo de preparación (ningún pedido tiene marcados los dos momentos), el
 * motivo de las cancelaciones, el rating y los horarios. Un tablero de salud
 * sin el tiempo de preparación, que no dice que le falta, hace creer que el
 * canal está sano.
 */
export default async function SaludDeCanalesPage() {
  await requireAdminHubAccess({ allowedRoles: [...ROLES_CANAL] })
  const adm = createAdminClient()

  const [salud, conexiones] = await Promise.all([
    saludDeCanales(adm, 90),
    conexionesDeCanales(adm),
  ])

  // Las tres categorías, separadas acá y no en la vista: el SQL ya las
  // distingue y la pantalla solo tiene que no volver a juntarlas.
  const rotas = (conexiones ?? []).filter((c) => c.anda === false)
  const andan = (conexiones ?? []).filter((c) => c.anda === true)
  const aProposito = (conexiones ?? []).filter((c) => c.anda === null)

  return (
    <>
      <PageHeader
        title="Salud de los canales"
        description="Si el canal responde, si cancela, y si los datos entran. Lo que no se puede medir, dicho."
        breadcrumbs={[{ label: 'Canales', href: '/admin/canales' }, { label: 'Salud' }]}
        tabs={TABS_CANALES}
      />
      <div className="space-y-6 p-4 md:p-6">
        {/* ── LAS CONEXIONES, EN TRES ESTADOS ──────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cómo entra cada cosa
          </h2>

          {conexiones === null ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription className="text-sm">
                No se pudieron leer las conexiones. No es que no haya: la consulta falló.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* Rojo solo acá. Es la única de las tres que es un problema. */}
              {!!rotas.length && (
                <div className="space-y-2 rounded-lg border border-destructive p-4">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
                    <Wrench className="size-4" />
                    {rotas.length} conexiones que deberían traer datos y no traen
                  </h3>
                  <div className="divide-y">
                    {rotas.map((c, i) => (
                      <div key={i} className="flex flex-wrap items-baseline gap-x-2 py-2 text-xs">
                        <span className="font-medium">{c.canal}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {c.que}
                        </Badge>
                        <span className="text-muted-foreground">por {c.como}</span>
                        {c.dias_sin_mover !== null && (
                          <span className="font-medium tabular-nums text-destructive">
                            {c.dias_sin_mover} días sin mover
                          </span>
                        )}
                        <span className="w-full leading-snug text-muted-foreground sm:w-auto">
                          {c.que_hacer}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {/* Verde, y sin botón: no hay nada que resolver. */}
                <div className="space-y-1.5 rounded-lg border p-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Check className="size-3.5" />
                    Andan ({andan.length})
                  </h3>
                  {andan.length ? (
                    andan.map((c, i) => (
                      <p key={i} className="text-xs">
                        <b>{c.canal}</b> · {c.que} por {c.como}
                        {c.dias_sin_mover !== null && (
                          <span className="text-muted-foreground">
                            {' '}
                            · hace {c.dias_sin_mover}{' '}
                            {c.dias_sin_mover === 1 ? 'día' : 'días'}
                          </span>
                        )}
                      </p>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">Ninguna.</p>
                  )}
                </div>

                {/* LA DISTINCIÓN. Ni verde ni rojo: gris, y dicho. */}
                <div className="space-y-1.5 rounded-lg border border-dashed bg-muted/30 p-4">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <CircleSlash className="size-3.5" />
                    No entran a propósito ({aProposito.length})
                  </h3>
                  {aProposito.length ? (
                    aProposito.map((c, i) => (
                      <p key={i} className="text-xs leading-snug">
                        <b>{c.canal}</b> · {c.que} — {c.que_hacer}
                      </p>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">Ninguna.</p>
                  )}
                  <p className="pt-1 text-[11px] leading-snug text-muted-foreground">
                    Estas no están rotas. <b>Están declaradas como «no entra»</b>, y mandarlas a
                    arreglar sería mandar a arreglar algo que funciona.
                  </p>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ── LA SALUD, CANAL POR CANAL ────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cancelaciones, tiempos y rating
          </h2>

          {salud === null ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription className="text-sm">
                No se pudo leer la salud de los canales.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {salud.map((s) => (
                <div key={s.canal_id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{s.canal}</span>
                    {s.sucursal && (
                      <Badge variant="secondary" className="text-[10px]">
                        {s.sucursal}
                      </Badge>
                    )}
                    {s.cerrado_hasta && (
                      <Badge variant="destructive" className="text-[10px]">
                        cerrado — {s.cerrado_motivo}
                      </Badge>
                    )}
                    {!s.responsable && (
                      <Badge variant="outline" className="text-[10px]">
                        sin responsable
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {[
                      {
                        t: `pedidos (${s.dias_mirados}d)`,
                        v: s.pedidos.toLocaleString('es-AR'),
                      },
                      {
                        t: 'cancelados',
                        v:
                          s.cancelados_pct === null
                            ? '—'
                            : `${s.cancelados} · ${s.cancelados_pct}%`,
                      },
                      {
                        t: 'preparación',
                        v:
                          s.minutos_preparacion === null
                            ? 'no se mide'
                            : `${s.minutos_preparacion} min`,
                      },
                      {
                        t: 'promete',
                        v: s.promete_minutos === null ? 'sin declarar' : `${s.promete_minutos} min`,
                      },
                      { t: 'rating', v: s.rating === null ? 'no lo informa' : String(s.rating) },
                    ].map((x) => (
                      <div key={x.t}>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {x.t}
                        </p>
                        <p
                          className={`tabular-nums ${
                            x.v === 'no se mide' || x.v === 'sin declarar' || x.v === 'no lo informa'
                              ? 'text-sm text-muted-foreground'
                              : 'text-lg font-semibold'
                          }`}
                        >
                          {x.v}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* La ventana viaja con el número: «0 en 90 días» ≠ «no hay». */}
                  {s.pedidos === 0 && s.pedidos_fuera_de_la_ventana > 0 && (
                    <p className="mt-2 rounded border bg-muted/40 px-2.5 py-1.5 text-[11px] leading-snug">
                      El cero es de la ventana, no del canal: hay{' '}
                      <b>{s.pedidos_fuera_de_la_ventana} pedidos más viejos</b> que{' '}
                      {s.dias_mirados} días.
                    </p>
                  )}

                  {s.que_no_se_puede_medir && (
                    <p className="mt-2 flex gap-1.5 border-t pt-2 text-[11px] leading-snug text-muted-foreground">
                      <Info className="mt-0.5 size-3 shrink-0" />
                      <span>{s.que_no_se_puede_medir}.</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
