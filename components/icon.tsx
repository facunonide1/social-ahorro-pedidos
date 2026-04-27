'use client'

import {
  LayoutDashboard,
  ShoppingCart,
  Wallet,
  Building2,
  Boxes,
  Megaphone,
  Users,
  UserCog,
  BarChart3,
  LayoutGrid,
  CheckCircle2,
  FileBarChart,
  ClipboardList,
  PackageCheck,
  PackageX,
  TrendingUp,
  FileText,
  Banknote,
  Landmark,
  GitMerge,
  LineChart,
  Calculator,
  Activity,
  Receipt,
  ArrowRightLeft,
  CalendarClock,
  MessageSquare,
  PieChart,
  UserSquare2,
  CalendarDays,
  CalendarX,
  DollarSign,
  Search,
  Star,
  ExternalLink,
  Clock,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'

const REGISTRY: Record<string, LucideIcon> = {
  LayoutDashboard,
  ShoppingCart,
  Wallet,
  Building2,
  Boxes,
  Megaphone,
  Users,
  UserCog,
  BarChart3,
  LayoutGrid,
  CheckCircle2,
  FileBarChart,
  ClipboardList,
  PackageCheck,
  PackageX,
  TrendingUp,
  FileText,
  Banknote,
  Landmark,
  GitMerge,
  LineChart,
  Calculator,
  Activity,
  Receipt,
  ArrowRightLeft,
  CalendarClock,
  MessageSquare,
  PieChart,
  UserSquare2,
  CalendarDays,
  CalendarX,
  DollarSign,
  Search,
  Star,
  ExternalLink,
  Clock,
}

/**
 * Renderiza un icono Lucide por nombre. Si el nombre no está en el
 * registry, fallback a HelpCircle (visible para detectar typos en
 * `lib/constants/navegacion.ts`).
 */
export function Icon({
  name,
  className,
  ...props
}: { name: string } & React.SVGProps<SVGSVGElement>) {
  const C = REGISTRY[name] ?? HelpCircle
  return <C className={cn('size-4', className)} {...props} />
}
