import Link from 'next/link'
import {
  Plus, RefreshCw, Download, Upload, ClipboardCheck, ShoppingCart, FileText,
  CreditCard, Receipt, Wallet, FileBadge, Tag, Megaphone, Users, PieChart,
  UserCheck, Target, CheckCircle2, Clock, MessageSquare, BarChart3, Sparkles,
  ShoppingBag, Boxes, type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { getPerfilPermisos } from '@/lib/admin-hub/permisos-server'
import { puede, type PermisoModulo, type PermisoAccion } from '@/lib/types/permisos'

type Variant = 'primary' | 'secondary' | 'sifaco'
type Accion = {
  label: string; href: string; icon: LucideIcon
  modulo: PermisoModulo; accion: PermisoAccion; variant?: Variant
}

/** Set de acciones por sector. La primera es la principal (violeta). */
export type SectorKey =
  | 'inicio' | 'operacion' | 'compras' | 'finanzas' | 'comercial'
  | 'equipo' | 'comunicacion' | 'inteligencia' | 'centro_datos'

const ACCIONES: Record<SectorKey, Accion[]> = {
  inicio: [
    { label: 'Cargar ventas', href: '/admin/centro-datos/ventas-diarias', icon: Upload, modulo: 'centro_datos', accion: 'crear', variant: 'sifaco' },
    { label: 'Cerrar caja', href: '/admin/finanzas/caja', icon: Wallet, modulo: 'caja', accion: 'crear' },
    { label: 'Nueva oferta', href: '/admin/ofertas', icon: Tag, modulo: 'ofertas', accion: 'crear' },
    { label: 'Nuevo pago', href: '/admin/finanzas/pagos', icon: CreditCard, modulo: 'finanzas', accion: 'aprobar' },
  ],
  operacion: [
    { label: 'Nueva transferencia', href: '/admin/operaciones/transferencias/nueva', icon: RefreshCw, modulo: 'operaciones', accion: 'crear' },
    { label: 'Reponer góndola', href: '/admin/operaciones/stock', icon: Boxes, modulo: 'operaciones', accion: 'editar' },
    { label: 'Nueva tarea', href: '/admin/tareas', icon: Plus, modulo: 'tareas', accion: 'crear' },
    { label: 'Iniciar inventario', href: '/admin/operaciones/inventarios', icon: ClipboardCheck, modulo: 'operaciones', accion: 'crear' },
    { label: 'Exportar dif. de stock (SIFACO)', href: '/admin/centro-datos/exportar', icon: Download, modulo: 'centro_datos', accion: 'ver', variant: 'sifaco' },
  ],
  compras: [
    { label: 'Nueva orden de compra', href: '/admin/compras/ordenes/nueva', icon: ShoppingCart, modulo: 'compras', accion: 'crear' },
    { label: 'Comprar lo sugerido', href: '/admin/compras/recomendaciones', icon: Sparkles, modulo: 'compras', accion: 'ver' },
    { label: 'Nueva recepción', href: '/admin/recepciones/nueva', icon: ClipboardCheck, modulo: 'compras', accion: 'crear' },
    { label: 'Importar lista de precios', href: '/admin/compras/listas-precios', icon: Upload, modulo: 'compras', accion: 'crear', variant: 'sifaco' },
  ],
  finanzas: [
    { label: 'Nuevo pago', href: '/admin/finanzas/pagos', icon: CreditCard, modulo: 'finanzas', accion: 'aprobar' },
    { label: 'Nuevo documento', href: '/admin/finanzas/documentos', icon: FileText, modulo: 'finanzas', accion: 'crear' },
    { label: 'Nuevo gasto', href: '/admin/sucursales/gastos', icon: Receipt, modulo: 'caja', accion: 'crear' },
    { label: 'Cerrar caja (arqueo)', href: '/admin/finanzas/caja', icon: Wallet, modulo: 'caja', accion: 'crear' },
    { label: 'Nuevo cheque', href: '/admin/finanzas/cheques/nueva', icon: FileBadge, modulo: 'finanzas', accion: 'crear' },
  ],
  comercial: [
    { label: 'Nueva oferta', href: '/admin/ofertas', icon: Tag, modulo: 'ofertas', accion: 'crear' },
    { label: 'Nueva campaña', href: '/admin/clientes/comunicacion', icon: Megaphone, modulo: 'clientes', accion: 'crear' },
    { label: 'Nuevo cliente', href: '/admin/clientes/nuevo', icon: Users, modulo: 'clientes', accion: 'crear' },
    { label: 'Enviar cupón a segmento', href: '/admin/clientes/segmentos', icon: PieChart, modulo: 'clientes', accion: 'crear' },
    { label: 'Exportar ofertas (SIFACO)', href: '/admin/centro-datos/exportar', icon: Download, modulo: 'centro_datos', accion: 'ver', variant: 'sifaco' },
  ],
  equipo: [
    { label: 'Nuevo empleado', href: '/admin/rrhh/empleados/nuevo', icon: UserCheck, modulo: 'rrhh', accion: 'crear' },
    { label: 'Nuevo objetivo', href: '/admin/objetivos', icon: Target, modulo: 'tareas', accion: 'crear' },
    { label: 'Revisar aprobaciones', href: '/admin/aprobaciones', icon: CheckCircle2, modulo: 'aprobaciones', accion: 'ver' },
    { label: 'Cargar turnos', href: '/admin/configuracion/turnos', icon: Clock, modulo: 'configuracion', accion: 'crear' },
  ],
  comunicacion: [
    { label: 'Nuevo mensaje / canal', href: '/admin/comunicacion', icon: MessageSquare, modulo: 'comunicacion', accion: 'crear' },
    { label: 'Nuevo comunicado', href: '/admin/comunicacion/comunicados', icon: Megaphone, modulo: 'comunicacion', accion: 'crear' },
  ],
  inteligencia: [
    { label: 'Generar reporte', href: '/admin/bi', icon: BarChart3, modulo: 'bi', accion: 'ver' },
    { label: 'Preguntarle a NORA', href: '/admin/nora', icon: Sparkles, modulo: 'mission_control', accion: 'ver' },
  ],
  centro_datos: [
    { label: 'Importar productos', href: '/admin/centro-datos/importar?tipo=productos', icon: Upload, modulo: 'centro_datos', accion: 'crear', variant: 'sifaco' },
    { label: 'Cargar ventas del día', href: '/admin/centro-datos/ventas-diarias', icon: ShoppingBag, modulo: 'centro_datos', accion: 'crear', variant: 'sifaco' },
    { label: 'Importar clientes', href: '/admin/centro-datos/importar?tipo=clientes', icon: Upload, modulo: 'centro_datos', accion: 'crear', variant: 'sifaco' },
    { label: 'Acciones de exportación', href: '/admin/centro-datos/exportar', icon: Download, modulo: 'centro_datos', accion: 'ver' },
  ],
}

/**
 * Fila de botones de acción rápida para el dashboard de un sector. Server
 * component: filtra por permiso fino (no muestra lo que el rol no puede). La
 * sucursal activa la resuelve cada flujo destino (selector global).
 */
export async function AccionesSector({ sector, className }: { sector: SectorKey; className?: string }) {
  const perfil = await getPerfilPermisos()
  if (!perfil) return null
  const visibles = (ACCIONES[sector] ?? []).filter((a) => puede(perfil.rol, perfil.permisos_custom, a.modulo, a.accion))
  if (!visibles.length) return null

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {visibles.map((a, i) => {
        const variant = a.variant ?? (i === 0 ? 'primary' : 'secondary')
        const I = a.icon
        return (
          <Link key={a.href + a.label} href={a.href}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
              variant === 'secondary' && 'border border-border bg-card hover:bg-accent/50',
              variant === 'sifaco' && 'border border-mint/50 bg-mint/10 text-mint-foreground hover:bg-mint/20',
            )}>
            <I className="size-4" /> {a.label}
          </Link>
        )
      })}
    </div>
  )
}
