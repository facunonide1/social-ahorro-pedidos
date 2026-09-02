'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Loader2, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * LOS FILTROS VIVEN EN LA URL, NO EN EL NAVEGADOR.
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────
 *
 * Un filtro en `useState` sólo puede filtrar lo que ya se trajo. Con 46.009
 * productos eso significa una de dos: o se traen los 46.009 —que es una
 * descarga, no una tabla— o se filtra sobre un recorte y la pantalla dice
 * «3 resultados» cuando hay 300.
 *
 * Puesto en la URL, el filtro viaja al servidor, la consulta se hace en la base
 * y vuelve la página con su total. Además el enlace se puede compartir y el
 * botón de atrás funciona.
 */

export type OpcionSelect = { valor: string; texto: string }

export interface FiltroSelect {
  clave: string
  etiqueta: string
  opciones: OpcionSelect[]
}

export function FiltrosCatalogoUrl({
  selects = [],
  chips = [],
  placeholder = 'Nombre, SKU o código de barras…',
}: {
  selects?: FiltroSelect[]
  chips?: { clave: string; valor: string; texto: string }[]
  placeholder?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pendiente, empezar] = useTransition()
  const [q, setQ] = useState(params.get('q') ?? '')

  // Debounce del buscador: cada tecla no puede ser una consulta a la base.
  useEffect(() => {
    const actual = params.get('q') ?? ''
    if (q === actual) return
    const t = setTimeout(() => navegar('q', q), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  function navegar(clave: string, valor: string) {
    const p = new URLSearchParams(params.toString())
    if (valor) p.set(clave, valor); else p.delete(clave)
    // Cualquier cambio de filtro vuelve a la primera página: quedarse en la 7
    // de un resultado que ahora tiene 2 muestra una tabla vacía sin motivo.
    p.delete('pagina')
    empezar(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-8" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
        {pendiente && <Loader2 className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {selects.map((s) => (
        <select key={s.clave} value={params.get(s.clave) ?? ''}
          onChange={(e) => navegar(s.clave, e.target.value)}
          className="h-9 max-w-[190px] rounded-md border border-border bg-background px-2 text-sm">
          <option value="">{s.etiqueta}</option>
          {s.opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select>
      ))}

      {chips.map((c) => {
        const activo = params.get(c.clave) === c.valor
        return (
          <Button key={`${c.clave}-${c.valor}`} variant={activo ? 'default' : 'outline'} size="sm"
            onClick={() => navegar(c.clave, activo ? '' : c.valor)}>
            {c.texto}
          </Button>
        )
      })}
    </div>
  )
}

/**
 * Cuántos hay, en qué página estamos y cómo se pasa a la siguiente.
 *
 * «Mostrando 50 de 46.009» no es un detalle: es la diferencia entre informar y
 * mentir. Un listado que dice «50 productos» cuando hay 46.009 le hace tomar
 * decisiones a alguien sobre el 0,1% del catálogo creyendo que lo vio entero.
 */
export function Paginador({
  total, pagina, paginas, porPagina, mostrando,
}: { total: number; pagina: number; paginas: number; porPagina: number; mostrando: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function ir(n: number) {
    const p = new URLSearchParams(params.toString())
    if (n <= 1) p.delete('pagina'); else p.set('pagina', String(n))
    router.replace(`${pathname}?${p.toString()}`, { scroll: false })
  }

  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1
  const hasta = (pagina - 1) * porPagina + mostrando

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        {total === 0
          ? 'Ningún producto coincide con estos filtros.'
          : <>Mostrando <b className="text-foreground">{desde.toLocaleString('es-AR')}–{hasta.toLocaleString('es-AR')}</b> de <b className="text-foreground">{total.toLocaleString('es-AR')}</b></>}
      </span>
      {paginas > 1 && (
        <span className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={pagina <= 1} onClick={() => ir(pagina - 1)}>Anterior</Button>
          <span className="px-1 tabular-nums">{pagina} / {paginas}</span>
          <Button variant="outline" size="sm" disabled={pagina >= paginas} onClick={() => ir(pagina + 1)}>Siguiente</Button>
        </span>
      )}
    </div>
  )
}
