import { ShieldCheck, Database, AlertTriangle, MessagesSquare } from 'lucide-react'

import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { paginar } from '@/lib/supabase/paginar'
import { estadoDelSistema } from '@/lib/os/estado-sistema'
import { AUDITORES } from '@/lib/os/auditores'
import { capacidadesDe, comoSePresenta } from '@/lib/nora/capacidades'
import { PageHeader } from '@/components/shared/page-header'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

import buildInfo from '@/lib/os/build-info.json'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Estado del sistema' }

/**
 * QUÉ HAY, QUÉ FALTA Y QUÉ NO SE PUEDE CALCULAR.
 *
 * Los números se cuentan en la base cada vez que se abre. La lista de lo que el
 * sistema NO puede afirmar también: una limitación escrita a mano envejece y se
 * sigue leyendo como verdadera.
 */
export default async function EstadoPage() {
  const perfil = await requireAdminHubAccess({
    allowedRoles: ['super_admin', 'gerente', 'auditor', 'administrativo'],
  })
  const sb = createClient()

  const { data: permisos } = await sb
    .from('users_admin').select('permisos_custom').eq('id', perfil.id).maybeSingle()

  const [{ datos, limitaciones }, { filas: conversaciones }] = await Promise.all([
    estadoDelSistema(sb),
    paginar<any>(
      sb.from('nora_bitacora').select('*').order('created_at', { ascending: false }),
      { maximo: 500 },
    ),
  ])

  const cap = capacidadesDe(perfil.rol, (permisos as any)?.permisos_custom ?? null)
  const construido = new Date(buildInfo.construido_at)

  const negadas = conversaciones.filter((c) => c.ultimo_resultado === 'nego').length
  const conHerramienta = conversaciones.filter((c) => (c.herramientas_usadas ?? []).length > 0).length

  return (
    <>
      <PageHeader
        title="Estado del sistema"
        description="Qué datos hay, qué falta y qué NORA no puede afirmar hoy. Todo contado en la base."
        breadcrumbs={[{ label: 'Inteligencia', href: '/admin/nora' }, { label: 'Estado' }]}
      />
      <div className="space-y-6 p-4 md:p-6">
        {/* ── QUÉ PUEDE HACER NORA, LEÍDO DEL CATÁLOGO ─────────────────── */}
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Qué puede hacer NORA
          </h2>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm leading-relaxed">{comoSePresenta(perfil.rol, cap)}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Esto no es un texto escrito: sale del catálogo de herramientas, que es lo que el modelo
              recibe de verdad. Si mañana se agrega una, este párrafo cambia solo.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {cap.porSector.map((s) => (
                <div key={s.subapp} className="rounded-md border border-border p-2 text-xs">
                  <div className="font-medium capitalize">{s.subapp}</div>
                  <div className="text-muted-foreground">
                    {s.puede} de {s.total} · {s.soloLectura} consultan, {s.escriben} hacen
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── D.4 · LO QUE NO SE PUEDE AFIRMAR ─────────────────────────── */}
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <AlertTriangle className="size-3.5" /> Lo que el sistema NO puede afirmar hoy
          </h2>
          <p className="text-xs text-muted-foreground">
            Es tan importante como lo que sí. Cada punto sale de contar en la base, no de una lista
            escrita: una limitación que envejece se sigue leyendo como verdadera.
          </p>
          <div className="space-y-2">
            {limitaciones.map((l, i) => (
              <div key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="text-sm font-medium">{l.titulo}</div>
                <p className="mt-1 text-xs text-muted-foreground">{l.porque}</p>
                <p className="mt-1 text-xs"><span className="text-muted-foreground">Se destraba con:</span> {l.queDestraba}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── QUÉ DATOS HAY ────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <Database className="size-3.5" /> Qué datos hay
          </h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
            {datos.map((d) => (
              <div key={d.que} className="rounded-lg border border-border p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{d.que}</div>
                {d.cuantos === null ? (
                  <div className="mt-1 text-xs leading-snug text-muted-foreground">
                    <span className="block font-semibold text-foreground">Sin datos</span>
                    {d.nota ?? 'no se pudo contar'}
                  </div>
                ) : (
                  <div className="mt-1 text-xl font-semibold tabular-nums">
                    {d.cuantos.toLocaleString('es-AR')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── D.3 · LOS CUATRO AUDITORES ───────────────────────────────── */}
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Los cuatro auditores
          </h2>
          <Alert>
            <AlertDescription className="text-xs leading-snug">
              Corren en cada build y el build <b>falla</b> si alguno encuentra algo nuevo sin
              aceptar. El último corrió el{' '}
              <b>{construido.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}</b>
              {buildInfo.commit && <> sobre <code>{buildInfo.commit.slice(0, 7)}</code></>}
              {buildInfo.mensaje && <> — {buildInfo.mensaje}</>}.
            </AlertDescription>
          </Alert>
          <div className="grid gap-2 md:grid-cols-2">
            {AUDITORES.map((a) => (
              <div key={a.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{a.nombre}</span>
                  <Badge variant="outline" className="ml-auto font-mono text-[10px]">{a.comando}</Badge>
                </div>
                <p className="mt-1 text-xs">{a.verifica}</p>
                <p className="mt-1 text-xs italic text-muted-foreground">{a.porQueExiste}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── D.1 · LA BITÁCORA ────────────────────────────────────────── */}
        <section className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <MessagesSquare className="size-3.5" /> Lo que se le preguntó a NORA
          </h2>
          <p className="text-xs text-muted-foreground">
            {conversaciones.length} conversaciones · {conHerramienta} terminaron ejecutando algo ·{' '}
            {negadas} fueron negadas por permisos.
            {conversaciones.length === 0 && ' Todavía nadie le preguntó nada: no es que no sirva, es que no se usó.'}
          </p>
          {conversaciones.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Cuándo</th>
                    <th className="px-3 py-2">Quién</th>
                    <th className="px-3 py-2">Sector</th>
                    <th className="px-3 py-2">Última pregunta</th>
                    <th className="px-3 py-2">Qué hizo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {conversaciones.slice(0, 50).map((c) => (
                    <tr key={c.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {c.usuario_nombre ?? '—'}
                        {c.rol && <div className="text-muted-foreground">{c.rol}</div>}
                      </td>
                      <td className="px-3 py-2 text-xs">{c.subapp ?? '—'}</td>
                      <td className="max-w-[320px] truncate px-3 py-2 text-xs">{c.ultima_pregunta ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {(c.herramientas_usadas ?? []).length > 0
                          ? (c.herramientas_usadas as string[]).join(', ')
                          : c.motivo_negativa
                            ? <span className="text-amber-600 dark:text-amber-400">no pudo: {c.motivo_negativa}</span>
                            : <span className="text-muted-foreground">sólo contestó</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
