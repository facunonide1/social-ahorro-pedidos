import type { PageHeaderTab } from '@/components/shared/page-header'

/**
 * LAS PANTALLAS DE CANALES.
 *
 * Los bloques C a I de la v1.4 quedaron construidos y sin pantalla: SQL,
 * lectura tipada y prueba, pero nada que mirar. Esto es el índice de las
 * siete que faltaban, en el orden en que importan.
 *
 * `/admin/canales` queda como estaba —el estado y los errores— porque es la
 * que ya está enlazada desde la grilla de sub-apps y desde los avisos.
 */
export const TABS_CANALES: PageHeaderTab[] = [
  { label: 'Estado', href: '/admin/canales' },
  { label: 'Cuánto deja', href: '/admin/canales/resultado' },
  { label: 'Salud', href: '/admin/canales/salud' },
  { label: 'Lotes', href: '/admin/canales/lotes' },
  { label: 'Errores', href: '/admin/canales/errores' },
  { label: 'Importador', href: '/admin/canales/importador' },
  { label: 'El agente', href: '/admin/canales/agente' },
]

/** Los roles que pueden ver plata de canal. Regla de oro 10. */
export const ROLES_CANAL = ['super_admin', 'gerente', 'comprador', 'administrativo'] as const
