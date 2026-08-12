import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * La pantalla vieja de inventarios físicos, que ahora lleva a los conteos.
 *
 * ── POR QUÉ REDIRIGE Y NO DESAPARECE ────────────────────────────────────────
 *
 * `/admin/operaciones/inventarios` estuvo en el menú, en el hub de Operaciones
 * y en una acción rápida destacada. Alguien la tiene en el historial del
 * navegador, y un link que muere sin explicación es peor que uno que redirige.
 *
 * ── QUÉ SE FUE, Y NO ES UN DETALLE ──────────────────────────────────────────
 *
 * El motor viejo mostraba el stock del sistema al lado del casillero donde se
 * escribía lo contado —o sea que no se podía contar a ciegas— y su botón de
 * cierre ajustaba stock, que es la regla de oro 1 al revés: la autoridad de
 * stock es SIFACO, y NORA pide la corrección en vez de hacerla.
 *
 * Las tablas quedaron como `zz_deprecated_*` (migración 0109), no borradas.
 */
export default function InventariosPage() {
  redirect('/admin/operaciones/conteos')
}
