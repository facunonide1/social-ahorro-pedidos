import Link from 'next/link'
import { HelpCircle } from 'lucide-react'

import { cn } from '@/lib/utils'
import { formatARS } from '@/lib/utils/format'

/**
 * EL NÚMERO GRANDE, SU PROCEDENCIA Y SU BOTÓN.
 *
 * ── POR QUÉ ESTO ES UN COMPONENTE Y NO TRES DIVS EN CADA PANTALLA ───────────
 *
 * Porque la regla de la v1.5 es «ningún número grande sin un botón al lado», y
 * una regla que depende de que alguien se acuerde de escribir el botón se
 * incumple en la cuarta pantalla. Acá `accion` es obligatoria: una cifra sin
 * adónde ir no compila.
 *
 * Lo mismo con `de_donde`. Varios de los números de esta sesión son estimados
 * —la comisión del 24% la dijo una persona, el costo de 23.319 productos no
 * está cargado, el envío no se registra— y un estimado sin su marca se lee
 * como medido. El tipo obliga a declarar cuál de los dos es.
 *
 * ── Y POR QUÉ NULL NO ES CERO ───────────────────────────────────────────────
 *
 * `valor: null` no dibuja «$0»: dibuja «no se puede saber» y, si hay, qué lo
 * encendería. Es el criterio que manda desde la v1.3 y el que más veces evitó
 * que una consulta rota pasara por un negocio en orden.
 */

export type Procedencia =
  /** Medido sobre datos del sistema. Se puede defender renglón por renglón. */
  | { tipo: 'medido'; texto: string }
  /** Calculado sobre un supuesto declarado. El supuesto va en el texto. */
  | { tipo: 'estimado'; texto: string }
  /** No se puede saber. El texto dice qué lo encendería. */
  | { tipo: 'no_se_sabe'; texto: string }

export type NumeroGrandeProps = {
  /** Qué es. Corto. */
  titulo: string
  /** El número. Null es «no lo puedo saber», y se dibuja distinto que el cero. */
  valor: number | null
  /** `plata` formatea en pesos; `cantidad` en miles; `puntos` agrega « pts». */
  unidad?: 'plata' | 'cantidad' | 'puntos' | 'porcentaje'
  /** De dónde sale. Obligatorio: un número sin procedencia no se puede auditar. */
  de_donde: Procedencia
  /** Adónde se va a resolverlo. Obligatorio: es la regla de la sesión. */
  accion: { label: string; href: string }
  /** Una línea más de contexto, debajo del número. */
  detalle?: string
  /** Contra el período anterior, si se puede. Null = no se pudo comparar. */
  contra_anterior?: { valor: number | null; etiqueta: string } | null
  /** Pinta el borde. Solo cuando hay riesgo real — no para decorar. */
  riesgo?: boolean
  className?: string
}

const fmt = (v: number, u: NumeroGrandeProps['unidad']) => {
  if (u === 'plata') return formatARS(v, 0)
  if (u === 'puntos') return `${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })} pts`
  if (u === 'porcentaje') return `${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
  return v.toLocaleString('es-AR')
}

export function NumeroGrande({
  titulo, valor, unidad = 'cantidad', de_donde, accion, detalle,
  contra_anterior, riesgo = false, className,
}: NumeroGrandeProps) {
  const noSeSabe = valor === null

  return (
    <div
      className={cn(
        'flex flex-col justify-between gap-3 border-b py-4 last:border-b-0 sm:border-b-0 sm:border-l sm:py-0 sm:pl-4 sm:first:border-l-0 sm:first:pl-0',
        riesgo && !noSeSabe && 'sm:border-l-destructive',
        className,
      )}
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {titulo}
        </p>

        {noSeSabe ? (
          <p className="mt-1 flex items-start gap-1.5 text-sm font-medium leading-snug">
            <HelpCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            No se puede saber todavía
          </p>
        ) : (
          <p
            className={cn(
              'mt-1 text-2xl font-semibold tabular-nums leading-none md:text-3xl',
              riesgo && 'text-destructive',
            )}
          >
            {fmt(valor, unidad)}
          </p>
        )}

        {detalle && (
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{detalle}</p>
        )}

        {/* D.2 · contra sí misma. Sin esto un número suelto no dice si va mejor. */}
        {contra_anterior !== undefined && !noSeSabe && (
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            {contra_anterior === null || contra_anterior.valor === null ? (
              <>sin período anterior con qué comparar</>
            ) : (
              <>
                <span
                  className={cn(
                    'font-medium',
                    contra_anterior.valor > 0 && 'text-emerald-600 dark:text-emerald-500',
                    contra_anterior.valor < 0 && 'text-destructive',
                  )}
                >
                  {contra_anterior.valor > 0 ? '+' : ''}
                  {contra_anterior.valor.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%
                </span>{' '}
                {contra_anterior.etiqueta}
              </>
            )}
          </p>
        )}

        {/* El punto de procedencia. Siempre, y marcado cuando no es medido. */}
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          {de_donde.tipo === 'estimado' && (
            <span className="mr-1 rounded bg-amber-500/15 px-1 py-px font-medium text-amber-700 dark:text-amber-500">
              estimado
            </span>
          )}
          {de_donde.tipo === 'no_se_sabe' && (
            <span className="mr-1 rounded bg-muted px-1 py-px font-medium">qué lo enciende</span>
          )}
          {de_donde.texto}
        </p>
      </div>

      {/* LA REGLA DE LA SESIÓN. No es opcional en el tipo. */}
      <Link
        href={accion.href}
        className="w-fit text-xs font-medium underline decoration-dotted underline-offset-4 hover:no-underline"
      >
        {accion.label} →
      </Link>
    </div>
  )
}

/**
 * La fila de números grandes. `grid` y no `flex` para que las columnas queden
 * alineadas aunque un título ocupe dos renglones.
 */
export function NumerosGrandes({ children, columnas = 3 }: {
  children: React.ReactNode
  columnas?: 2 | 3 | 4 | 5
}) {
  const cols = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  }[columnas]
  return <div className={cn('grid gap-x-4 gap-y-1 rounded-lg border p-4', cols)}>{children}</div>
}

/**
 * C.5 · LO QUE EL SISTEMA NO SABE.
 *
 * Bloque fijo, arriba y no al pie. La diferencia importa: al pie se lee como
 * una nota legal y arriba se lee como parte del estado. Si el tablero dice que
 * el margen es tal y no dice que el costo de 23.319 productos no está cargado,
 * el margen está mal y nadie lo sabe.
 */
export function LoQueNoSeSabe({ items, titulo = 'Lo que el sistema no sabe' }: {
  items: { que: string; cuantos?: number | null; que_lo_enciende: string; href?: string }[]
  titulo?: string
}) {
  if (!items.length) return null
  return (
    <section className="space-y-2 rounded-lg border border-dashed p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </h2>
      <ul className="divide-y">
        {items.map((it, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-xs leading-snug">
            <span className="font-medium">{it.que}</span>
            {it.cuantos != null && (
              <span className="tabular-nums text-muted-foreground">
                ({it.cuantos.toLocaleString('es-AR')})
              </span>
            )}
            <span className="text-muted-foreground">— {it.que_lo_enciende}</span>
            {it.href && (
              <Link href={it.href} className="underline decoration-dotted underline-offset-2">
                ir
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
