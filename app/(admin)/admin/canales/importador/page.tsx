import { Sparkles } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { formatARS } from '@/lib/utils/format'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'
import { importaciones, perfilesAprendidos, conexionesDeCanales } from '@/lib/canales/lectura'

import { TABS_CANALES, ROLES_CANAL } from '../_nav'
import { ImportadorClient } from './importador-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Importador de canales' }

/**
 * A.6 · EL IMPORTADOR Y SU HISTÓRICO.
 *
 * ── EL PRINCIPIO QUE ESTA PANTALLA EXISTE PARA SOSTENER ─────────────────────
 *
 * «Cada plataforma tiene su formato y todas cambian. Si cada una necesita
 * código, el sector se vuelve deuda.» Por eso acá no hay un importador de
 * PedidosYa y otro de Mercado Libre: hay uno que aprende formatos.
 *
 * Un formato se identifica por la huella de sus encabezados, normalizada: un
 * cambio de mayúsculas, acentos o espacios **no** es un formato nuevo. Si la
 * huella cambia de verdad, el mapeo aprendido no se aplica y la pantalla dice
 * qué columnas aparecieron y qué columnas desaparecieron.
 *
 * ── Y POR QUÉ EL HISTÓRICO MUESTRA LO QUE QUEDÓ CRUDO ───────────────────────
 *
 * Porque «entraron 4.000 filas» sin decir que 300 no se entendieron es un
 * número que miente por omisión. Las crudas están guardadas, se pueden mirar,
 * y si el mapeo mejora se vuelven a leer.
 */
export default async function ImportadorPage() {
  await requireAdminHubAccess({ allowedRoles: [...ROLES_CANAL] })
  const adm = createAdminClient()

  const [hist, perfiles, conexiones, { data: canales }] = await Promise.all([
    importaciones(adm, 60),
    perfilesAprendidos(adm),
    conexionesDeCanales(adm),
    adm.from('canales_venta')
      .select('id, nombre, entrada_catalogo, entrada_liquidaciones')
      .eq('activo', true).order('nombre'),
  ])

  // Los canales que esperan un archivo. Es el «qué hacer» del bloque G.
  const esperando = (conexiones ?? []).filter((c) => c.anda === false && c.como === 'archivo')

  return (
    <>
      <PageHeader
        title="Importador de canales"
        description="Un importador para todas las plataformas. Aprende el formato la primera vez y avisa cuando cambia."
        breadcrumbs={[{ label: 'Canales', href: '/admin/canales' }, { label: 'Importador' }]}
        tabs={TABS_CANALES}
      />
      <div className="space-y-6 p-4 md:p-6">
        {/* ── QUÉ ARCHIVO ESTÁ ESPERANDO EL SISTEMA ────────────────────── */}
        {!!esperando.length && (
          <section className="space-y-1.5 rounded-lg border p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Archivos que el sistema está esperando ({esperando.length})
            </h2>
            {esperando.map((c, i) => (
              <p key={i} className="text-xs leading-snug">
                <b>{c.canal}</b> · {c.que} — {c.que_hacer}
              </p>
            ))}
          </section>
        )}

        <ImportadorClient canales={(canales ?? []) as any[]} />

        {/* ── LOS FORMATOS APRENDIDOS ──────────────────────────────────── */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Formatos aprendidos
          </h2>
          {perfiles === null ? (
            <p className="text-sm text-muted-foreground">No se pudieron leer los formatos.</p>
          ) : !perfiles.length ? (
            <p className="rounded-lg border border-dashed p-4 text-xs leading-snug text-muted-foreground">
              <b>Todavía no se aprendió ningún formato de plataforma.</b> Este cero es de verdad:
              se miró y no hay. El primer archivo que se confirme queda aprendido, y el segundo del
              mismo formato entra solo.
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {perfiles.map((p) => (
                <div key={p.id} className="px-3 py-2.5 text-xs">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{p.nombre}</span>
                    <Badge variant="outline" className="text-[10px]">{p.tipo}</Badge>
                    <span className="tabular-nums text-muted-foreground">
                      usado {p.veces_usado ?? 0}{' '}
                      {(p.veces_usado ?? 0) === 1 ? 'vez' : 'veces'}
                    </span>
                  </div>
                  {p.encabezados && (
                    <p className="mt-1 font-mono text-[10px] leading-snug text-muted-foreground">
                      {p.encabezados.join(' · ')}
                    </p>
                  )}
                  {p.ultima_huella_distinta_at && (
                    <p className="mt-1 leading-snug text-amber-700 dark:text-amber-500">
                      La última vez llegó un archivo con otro formato. No se aplicó el mapeo
                      aprendido: se volvió a preguntar.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── EL HISTÓRICO ─────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Qué entró y qué quedó afuera
          </h2>
          {hist === null ? (
            <p className="text-sm text-muted-foreground">No se pudo leer el histórico.</p>
          ) : !hist.length ? (
            <p className="rounded-lg border border-dashed p-4 text-xs leading-snug text-muted-foreground">
              <b>No se importó ningún archivo de plataforma todavía.</b> Los dos PedidosYa están
              declarados y esperando su catálogo; hasta que entre, todo lo que el sistema dice de
              ellos es null y no cero.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/40">
                  <tr className="text-left [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
                    <th>Cuándo</th>
                    <th>Archivo</th>
                    <th>Canal</th>
                    <th>Trae</th>
                    <th className="text-right">Filas</th>
                    <th className="text-right">Leídas</th>
                    <th className="text-right">Crudas</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {hist.map((h) => (
                    <tr key={h.id} className="[&>td]:px-3 [&>td]:py-2">
                      <td className="whitespace-nowrap tabular-nums text-muted-foreground">
                        {new Date(h.subido_at).toLocaleDateString('es-AR')}
                      </td>
                      <td className="max-w-[14rem] truncate">{h.archivo}</td>
                      <td>{h.canal_id ?? '—'}</td>
                      <td>{h.tipo}</td>
                      <td className="text-right tabular-nums">
                        {h.filas_totales?.toLocaleString('es-AR') ?? '—'}
                      </td>
                      <td className="text-right tabular-nums">
                        {h.filas_leidas?.toLocaleString('es-AR') ?? '—'}
                      </td>
                      <td
                        className={`text-right tabular-nums ${
                          (h.filas_crudas ?? 0) > 0 ? 'font-medium text-amber-700 dark:text-amber-500' : ''
                        }`}
                      >
                        {h.filas_crudas?.toLocaleString('es-AR') ?? '—'}
                      </td>
                      <td>
                        <Badge
                          variant={h.estado === 'confirmado' ? 'secondary' : 'outline'}
                          className="text-[10px]"
                        >
                          {h.estado}
                          {h.entro_solo && h.estado === 'confirmado' && (
                            <Sparkles className="ml-1 size-2.5" />
                          )}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!!hist?.length && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Las filas «crudas» están guardadas con su texto original. Un archivo con filas crudas
              no es un archivo que falló: es un archivo del que se leyó una parte, y dice cuál.
            </p>
          )}
        </section>
      </div>
    </>
  )
}
