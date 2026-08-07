import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MessageSquareOff } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  listarInstalaciones,
  sectoresSinDeclarar,
  traerProyecto,
} from '@/lib/fabrica/datos'
import { verificarEspejo } from '@/lib/fabrica/comparador'
import { MANIFIESTOS } from '@/lib/fabrica/manifiestos'
import { createClient } from '@/lib/supabase/server'
import {
  ETIQUETA_CATEGORIA,
  ETIQUETA_CLASIFICACION,
  type ClasificacionSector,
} from '@/lib/fabrica/tipos'

export const dynamic = 'force-dynamic'

const VARIANTE_CLASIF: Record<ClasificacionSector, 'outline' | 'info' | 'success' | 'warning' | 'secondary'> = {
  nucleo: 'info',
  generico: 'success',
  vertical: 'warning',
  a_medida: 'secondary',
  incompleto: 'outline',
}

export default async function PoolsDelProyectoPage({
  params,
}: {
  params: { slug: string }
}) {
  const proyecto = await traerProyecto(params.slug)
  if (!proyecto) notFound()

  const [instalaciones, sinDeclarar] = await Promise.all([
    listarInstalaciones(proyecto.id),
    sectoresSinDeclarar(proyecto.id),
  ])

  // El estado del espejo se calcula acá, no se guarda: una declaración
  // verificada hace tres semanas no dice nada sobre el código de hoy.
  const sb = createClient()
  const estados = new Map<string, string>(
    await Promise.all(
      instalaciones.map(async (i) => {
        const clave = i.pool?.clave ?? ''
        const entrada = MANIFIESTOS[clave]
        if (!entrada) return [clave, 'sin manifiesto'] as [string, string]
        const v = await verificarEspejo(entrada.manifiesto, entrada.prefijos, sb, entrada.excluir)
        return [clave, v.resultado] as [string, string]
      }),
    ),
  )

  return (
    <div className="space-y-8 p-4 md:p-6">
      {/* ── Lo declarado ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">
          Pools instalados
          <span className="ml-2 font-normal text-muted-foreground">
            {instalaciones.length}
          </span>
        </h2>

        {instalaciones.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            Ningún pool declarado todavía. Todo lo que hace este proyecto está
            escrito a mano y la fábrica no lo conoce.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Pool</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Versión</th>
                  <th className="px-3 py-2">Espejo</th>
                  <th className="px-3 py-2 text-right">Entidades</th>
                  <th className="px-3 py-2 text-right">Pantallas</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                  <th className="px-3 py-2 text-right">Agentes</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {instalaciones.map((i) => {
                  const clave = i.pool?.clave ?? ''
                  const est = estados.get(clave)
                  const m = MANIFIESTOS[clave]?.manifiesto
                  return (
                    <tr key={i.id} className="border-t border-border">
                      <td className="px-3 py-2 font-medium">
                        {i.pool?.nombre ?? '—'}
                        <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                          {clave}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={i.pool?.categoria === 'nucleo' ? 'info' : 'outline'}
                          className="font-normal"
                        >
                          {i.pool ? ETIQUETA_CATEGORIA[i.pool.categoria] : '—'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{i.version?.version ?? '—'}</td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={
                            est === 'coincide' ? 'success' : est === 'difiere' ? 'warning' : 'outline'
                          }
                          className="font-normal"
                        >
                          {est ?? 'sin verificar'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{m?.entidades.length ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m?.pantallas.length ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m?.acciones.length ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m?.agentes?.length ?? 0}</td>
                      <td className="px-3 py-2 text-right">
                        {clave && (
                          <Link
                            href={`/fabrica/${proyecto.slug}/pools/${clave}`}
                            className="text-primary hover:underline"
                          >
                            ver
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Lo que existe pero la fábrica no conoce ───────────────────── */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">
          Sectores sin declarar
          <span className="ml-2 font-normal text-muted-foreground">
            {sinDeclarar.length}
          </span>
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Están construidos y funcionando, pero la fábrica no los tiene como
          pieza. Mientras esta lista sea larga, la fábrica no puede armar un
          proyecto nuevo con lo que ya sabe hacer.
        </p>

        {sinDeclarar.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            Todo el censo está declarado.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Sector</th>
                  <th className="px-3 py-2">Clasificación</th>
                  <th className="px-3 py-2 text-right">Entidades</th>
                  <th className="px-3 py-2 text-right">Pantallas</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                  <th className="px-3 py-2">Datos</th>
                </tr>
              </thead>
              <tbody>
                {sinDeclarar.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="font-medium">{s.nombre}</span>
                      {s.ruta_base && s.ruta_base !== '#' && (
                        <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                          {s.ruta_base}
                        </span>
                      )}
                      {s.completitud !== 'completo' && (
                        <Badge variant="outline" className="ml-2 font-normal">
                          {s.completitud === 'a_medias' ? 'a medias' : 'placeholder'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={VARIANTE_CLASIF[s.clasificacion]} className="font-normal">
                        {ETIQUETA_CLASIFICACION[s.clasificacion]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.entidades_propias.length}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.pantallas}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.acciones_chat}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {s.tiene_datos ? 'sí' : 'vacío'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── El lugar del chat ─────────────────────────────────────────────
          Está reservado y vacío a propósito. Un chat que promete declarar y
          después no puede escribir el manifiesto es peor que no tenerlo: es
          exactamente el bug que ya existe en /admin/finanzas/asistente. El
          hueco se llena cuando el escritor de manifiestos exista. */}
      <section aria-labelledby="lugar-chat">
        <h2 id="lugar-chat" className="text-sm font-semibold tracking-tight">
          Componer hablando
        </h2>
        <div className="mt-3 flex items-start gap-3 rounded-lg border border-dashed border-border p-5">
          <MessageSquareOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Todavía no.</p>
            <p className="mt-1 max-w-2xl">
              Acá va a ir la conversación que arma un proyecto. No está porque
              hoy la fábrica sabe leer una declaración pero no sabe escribirla:
              un chat que prometa declarar y después no pueda hacerlo es peor
              que no tenerlo. El lugar queda guardado.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
