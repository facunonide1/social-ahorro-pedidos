import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { ETIQUETA_CABLEADO } from '@/lib/fabrica/cableado'
import { ETIQUETA_LECTOR } from '@/lib/fabrica/flag'
import { ETIQUETA_VEREDICTO, VARIANTE_VEREDICTO } from '@/lib/fabrica/cobertura-lector'
import { estadoDeLaFabrica, laCifra, LO_QUE_NO_SE_PUEDE_AFIRMAR } from '@/lib/fabrica/estado'
import { EXCLUIDAS } from '@/lib/fabrica/exclusiones'
import { traerProyecto } from '@/lib/fabrica/datos'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Estado real' }

/**
 * EL ESTADO REAL DE LA FÁBRICA.
 *
 * Diecisiete indicadores mintieron, arreglados en seis sesiones. Cada arreglo
 * cambió lo que significaba un número, y los números viven repartidos en cinco
 * pantallas. Esta los junta con el mismo criterio.
 *
 * Dos reglas la ordenan, y la segunda es la que la hace distinta de un tablero:
 *
 *   DENOMINADOR HONESTO. Nunca "1 de 23": lo revisado y lo que no se pudo
 *   revisar se cuentan aparte, y lo segundo se muestra igual de grande.
 *
 *   LO QUE NO SE PUEDE AFIRMAR es parte del estado, no una nota al pie. Un
 *   sistema que sólo muestra lo que verificó se lee como si lo hubiera
 *   verificado todo.
 */
export default async function EstadoPage({ params }: { params: { slug: string } }) {
  const proyecto = await traerProyecto(params.slug)
  if (!proyecto) notFound()

  const { pools } = await estadoDeLaFabrica(proyecto.id)
  const prendidos = pools.filter((p) => p.lector === 'prendido')
  const sumar = (f: (p: (typeof pools)[number]) => number) => pools.reduce((a, p) => a + f(p), 0)

  return (
    <div className="space-y-8 p-4 md:p-6">
      <section>
        <h1 className="font-[family-name:var(--font-fraunces)] text-xl">Estado real</h1>
        {/* LA CIFRA. Se calcula, no se escribe, y no se redondea para arriba:
            si da vergüenza se publica igual. Es lo único que hace que suba por
            trabajo y no por redacción. */}
        <p className="mt-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-base font-medium">
          {laCifra(pools)}
        </p>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Cuenta sólo lo que gobierna <span className="font-medium">de verdad</span>:
          un parámetro con brecha, uno sensible, un hecho o un conflicto de fuente
          no entran. Durante cuatro sesiones el sistema dijo &ldquo;23 parámetros
          gobernados&rdquo; y gobernaba 2.
        </p>
      </section>

      {/* ── El resumen ────────────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ['Pools declarados', `${pools.length}`, `${prendidos.length} con el lector prendido`],
            [
              'Pantallas gobernables',
              `${sumar((p) => p.pantallas.gobernables)}`,
              `${sumar((p) => p.pantallas.verificadas)} verificaron contra el código`,
            ],
            [
              'Parámetros gobernados',
              `${sumar((p) => p.parametros.gobernados)} de ${sumar((p) => p.parametros.total)}`,
              `${sumar((p) => p.parametros.sensibles)} sensibles fuera del lector · ${sumar((p) => p.parametros.conBrecha)} con brecha · ${sumar((p) => p.hechos)} hechos (no son parámetros)`,
            ],
            [
              'Problemas abiertos',
              `${sumar((p) => p.diferencias + p.defectosAbiertos + p.parametros.conflictos + p.parametros.parciales)}`,
              `${sumar((p) => p.diferencias)} diferencias · ${sumar((p) => p.defectosAbiertos)} defectos de pieza · ${sumar((p) => p.parametros.conflictos)} conflictos de fuente · ${sumar((p) => p.parametros.parciales)} cableados a medias`,
            ],
          ] as const
        ).map(([titulo, valor, sub]) => (
          <div key={titulo} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{titulo}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
          </div>
        ))}
      </section>

      {/* ── Pool por pool ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Pool por pool</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Pool</th>
                <th className="px-3 py-2">Lector</th>
                <th className="px-3 py-2">Pantallas</th>
                <th className="px-3 py-2">Parámetros</th>
                <th className="px-3 py-2">Problemas</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((p) => (
                <tr key={p.clave} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.nombre}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.clave} · v{p.version ?? '?'} · formato {p.formato ?? '?'}
                      {p.overrides > 0 && ` · ${p.overrides} decisión(es) de este proyecto`}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={p.lector === 'prendido' ? 'success' : 'outline'} className="font-normal">
                      {ETIQUETA_LECTOR[p.lector]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={VARIANTE_VEREDICTO[p.pantallas.veredicto]} className="font-normal">
                      {ETIQUETA_VEREDICTO[p.pantallas.veredicto]}
                    </Badge>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {p.pantallas.verificadas}/{p.pantallas.gobernables} verificadas
                      {p.pantallas.motivo && ` · ${p.pantallas.motivo}`}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground">
                    {/* El denominador partido: gobernados aparte de lo que no
                        se puede gobernar, y cada motivo con su nombre. */}
                    <div className="text-foreground">
                      {p.parametros.gobernados} gobernado(s) de {p.parametros.total}
                    </div>
                    {p.parametros.gobernados > 0 && (
                      <div>
                        {p.parametros.completos} completo(s) · {p.parametros.parciales} a medias ·{' '}
                        {p.parametros.sinCablear} sin cablear · {p.parametros.sinDeclarar} sin declarar
                      </div>
                    )}
                    <div>
                      {p.parametros.sensibles} sensible(s) · {p.parametros.conBrecha} con brecha
                      {p.parametros.conflictos > 0 && ` · ${p.parametros.conflictos} EN CONFLICTO`}
                    </div>
                    {p.hechos > 0 && (
                      <div>
                        {p.hechos} hecho(s) de la pieza — no son parámetros y no se cuentan como
                        tales
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11px]">
                    {p.diferencias === 0 &&
                    p.fallbacks === 0 &&
                    p.defectosAbiertos === 0 &&
                    p.parametros.conflictos === 0 &&
                    p.brechas === 0 ? (
                      <span className="text-muted-foreground">ninguno abierto</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {p.diferencias > 0 && <li>{p.diferencias} diferencia(s) con el código</li>}
                        {p.fallbacks > 0 && <li>{p.fallbacks} caída(s) al código</li>}
                        {p.defectosAbiertos > 0 && <li>{p.defectosAbiertos} defecto(s) de pieza</li>}
                        {p.parametros.conflictos > 0 && (
                          <li className="text-amber-600">{p.parametros.conflictos} conflicto(s) de fuente</li>
                        )}
                        {p.brechas > 0 && <li className="text-muted-foreground">{p.brechas} brecha(s) declarada(s)</li>}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {Object.values(ETIQUETA_CABLEADO).length} estados posibles para un
          parámetro. <span className="font-medium">Sin declarar</span> y{' '}
          <span className="font-medium">no consumido</span> son distintos: el
          primero es un hueco, el segundo es un dato.
        </p>
      </section>

      {/* ── Lo que se miró y quedó afuera ─────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">
          Constantes revisadas y dejadas afuera
          <span className="ml-2 font-normal text-muted-foreground">{EXCLUIDAS.length}</span>
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Es la contracara del denominador honesto: si sólo se publica lo
          declarado, lo no declarado se lee como olvido. Y los dos motivos no son
          lo mismo — una decisión cerrada no es una deuda.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[40rem] text-sm">
            <tbody>
              {EXCLUIDAS.map((e) => (
                <tr key={e.nombre} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{e.nombre}</td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={e.motivo === 'tecnica' ? 'outline' : 'warning'}
                      className="font-normal"
                    >
                      {e.motivo === 'tecnica' ? 'técnica · decisión cerrada' : 'pendiente · deuda'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{e.porque}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Lo que no se puede afirmar ────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold tracking-tight">Lo que no se puede afirmar hoy</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Es parte del estado, no una nota al pie. Un sistema que sólo muestra lo
          que verificó se lee como si lo hubiera verificado todo.
        </p>
        <div className="mt-3 divide-y divide-border rounded-lg border border-border">
          {LO_QUE_NO_SE_PUEDE_AFIRMAR.map((l) => (
            <div key={l.que} className="px-4 py-3">
              <p className="text-sm font-medium">{l.que}</p>
              <p className="mt-1 text-xs text-muted-foreground">{l.porque}</p>
              <p className="mt-1 text-xs">
                <span className="text-muted-foreground">Para poder afirmarlo:</span> {l.paraPoder}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
