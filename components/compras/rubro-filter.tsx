'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { RUBROS, parseRubro, type Rubro } from '@/components/compras/rubro'

// Re-export para consumidores cliente (los Server Components deben importar
// estos helpers desde '@/components/compras/rubro', no desde este archivo).
export { RUBROS, parseRubro }
export type { Rubro }

/**
 * Filtro de rubro transversal del sector Compras. Vive en la URL (?rubro=)
 * para que todas las páginas del sector lo lean server-side.
 */
export function RubroFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const actual = parseRubro(params.get('rubro'))

  function set(v: Rubro) {
    const p = new URLSearchParams(params.toString())
    if (v === 'todos') p.delete('rubro')
    else p.set('rubro', v)
    router.push(`${pathname}${p.toString() ? '?' + p.toString() : ''}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rubro</span>
      {RUBROS.map((r) => (
        <button
          key={r.v}
          type="button"
          onClick={() => set(r.v)}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs transition-colors',
            actual === r.v ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-accent',
          )}
        >
          {r.l}
        </button>
      ))}
    </div>
  )
}
