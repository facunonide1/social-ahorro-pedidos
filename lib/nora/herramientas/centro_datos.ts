/**
 * Herramientas de CENTRO DE DATOS para NORA (tanda 3). estado_imports (RO) lee
 * import_jobs real. importar_por_chat quedó CORTADO: el endpoint de import
 * recibe headers+filas parseados en el browser (SheetJS) + perfil + mapeo, no
 * un path de archivo — no es barato con el motor actual. Nace cuando el import
 * acepte un path (backlog).
 */
import type { Herramienta } from './tipos'

export const HERRAMIENTAS_CENTRO_DATOS: Herramienta[] = [
  {
    id: 'estado_imports',
    nombre: 'Estado de las importaciones',
    descripcion: 'Responde cuándo fue el último import, filas procesadas, sin match y anomalías detectadas. Solo lectura.',
    subapp: 'centro-datos',
    soloLectura: true,
    permiso: { modulo: 'centro_datos', accion: 'ver' },
    slots: [],
    responder: async (adm) => {
      const { data } = await adm.from('import_jobs')
        .select('archivo_nombre, filas_ok, filas_sin_match, anomalias, resumen, created_at, por_usuario_nombre, estado, perfiles_datos(tipo, nombre)')
        .in('estado', ['aplicado', 'preview'])
        .order('created_at', { ascending: false }).limit(6)
      const rows = (data ?? []) as any[]
      if (!rows.length) return { texto: 'Todavía no hay importaciones registradas.' }
      const linea = (r: any) => {
        const tipo = (r.perfiles_datos as any)?.tipo ?? 'archivo'
        const anom = Array.isArray(r.anomalias) ? r.anomalias.length : 0
        const res = r.resumen ?? {}
        const extras = [res.nuevos ? `${res.nuevos} nuevos` : null, res.subieron_precio ? `${res.subieron_precio}↑precio` : null, res.bajaron_precio ? `${res.bajaron_precio}↓precio` : null].filter(Boolean).join(' · ')
        const fecha = String(r.created_at).slice(0, 16).replace('T', ' ')
        return `• ${fecha} · ${tipo} — ${r.filas_ok ?? 0} ok${r.filas_sin_match ? `, ${r.filas_sin_match} sin match` : ''}${anom ? `, ${anom} anomalía(s)` : ''}${extras ? ` (${extras})` : ''}${r.estado === 'preview' ? ' [preview]' : ''}`
      }
      const ultimo = rows[0]
      const lista = rows.map(linea).join('\n')
      return { texto: `Último import: ${String(ultimo.created_at).slice(0, 16).replace('T', ' ')} (${(ultimo.perfiles_datos as any)?.tipo ?? 'archivo'}).\n\nRecientes:\n${lista}\n\nDetalle → /admin/centro-datos/historial` }
    },
  },
]
