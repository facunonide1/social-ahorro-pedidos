import { esSinPermiso } from '@/lib/supabase/errores'

/**
 * Lo que no se pudo leer, arriba de los números. Distingue «sin permiso» de
 * «se cayó la consulta»: los dos se verían como un 0.
 */
export function AvisoLectura({ errores }: { errores: { que: string; mensaje: string }[] }) {
  if (!errores.length) return null
  const permiso = errores.filter((e) => esSinPermiso(e.mensaje))
  const caidas = errores.filter((e) => !esSinPermiso(e.mensaje))
  return (
    <div role="alert" className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      {caidas.length > 0 && (
        <p>
          No se pudo leer: {caidas.map((e) => e.que).join(', ')}. Esos números aparecen vacíos, no en cero: no se sabe cuánto son.
          <span className="block text-xs text-muted-foreground">{caidas.map((e) => `${e.que}: ${e.mensaje}`).join(' · ')}</span>
        </p>
      )}
      {permiso.length > 0 && (
        <p>Tu rol no puede ver: {permiso.map((e) => e.que).join(', ')}.</p>
      )}
    </div>
  )
}
