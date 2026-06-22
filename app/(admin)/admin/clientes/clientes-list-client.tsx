'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Download, RefreshCw, Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { exportExcel } from '@/lib/utils/export-excel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { FUENTE_LABEL, NIVEL_LABEL, RIESGO_LABEL, type ClienteTipo, type ClienteNivel, type ClienteRiesgo } from '@/lib/types/crm'
import { RIESGO_VARIANT } from '@/lib/crm/segmentos'

export type ClienteRow = {
  id: string; nombre: string; tipo: ClienteTipo; dni: string | null; telefono: string | null; email: string | null
  nivel: ClienteNivel | null; riesgo: ClienteRiesgo; gastado: number; ultima_compra: string | null
  fuentes: string[]; sucursal: string | null
}

export function ClientesListClient({ rows, sucursales, puedeCrear }: { rows: ClienteRow[]; sucursales: { id: string; nombre: string }[]; puedeCrear: boolean }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [fTipo, setFTipo] = useState('todos')
  const [fNivel, setFNivel] = useState('todos')
  const [fRiesgo, setFRiesgo] = useState('todos')
  const [fFuente, setFFuente] = useState('todas')
  const [sync, setSync] = useState(false)

  const filtradas = useMemo(() => rows.filter((c) => {
    if (fTipo !== 'todos' && c.tipo !== fTipo) return false
    if (fNivel !== 'todos' && c.nivel !== fNivel) return false
    if (fRiesgo !== 'todos' && c.riesgo !== fRiesgo) return false
    if (fFuente !== 'todas' && !c.fuentes.includes(fFuente)) return false
    if (q.trim()) {
      const s = q.toLowerCase()
      if (![c.nombre, c.dni, c.telefono, c.email].some((v) => (v ?? '').toLowerCase().includes(s))) return false
    }
    return true
  }), [rows, q, fTipo, fNivel, fRiesgo, fFuente])

  async function sincronizar() {
    setSync(true)
    try {
      const r = await fetch('/api/crm/sincronizar', { method: 'POST' })
      const j = await r.json(); if (!r.ok) throw new Error(j?.error)
      toast.success(`Sincronizado: ${j.creados} nuevos, ${j.actualizados} actualizados`)
      router.refresh()
    } catch (e: any) { toast.error(e?.message ?? 'Error') } finally { setSync(false) }
  }

  function exportar() {
    exportExcel('clientes', filtradas.map((c) => ({
      Nombre: c.nombre, Tipo: c.tipo.toUpperCase(), DNI: c.dni ?? '', Teléfono: c.telefono ?? '', Email: c.email ?? '',
      Nivel: c.nivel ? NIVEL_LABEL[c.nivel] : '', Riesgo: RIESGO_LABEL[c.riesgo], Gastado_12m: Math.round(c.gastado),
      Última_compra: c.ultima_compra ?? '', Fuentes: c.fuentes.map((f) => FUENTE_LABEL[f] ?? f).join(', '), Sucursal: c.sucursal ?? '',
    })), { sheet: 'Clientes' })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, DNI, teléfono, email…" className="h-9 w-60 pl-7" />
        </div>
        <Select value={fTipo} onValueChange={setFTipo}><SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Tipo</SelectItem><SelectItem value="b2c">B2C</SelectItem><SelectItem value="b2b">B2B</SelectItem></SelectContent></Select>
        <Select value={fNivel} onValueChange={setFNivel}><SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Nivel</SelectItem><SelectItem value="socio">Socio</SelectItem><SelectItem value="plus">Plus</SelectItem><SelectItem value="premium">Premium</SelectItem></SelectContent></Select>
        <Select value={fRiesgo} onValueChange={setFRiesgo}><SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Churn</SelectItem><SelectItem value="bajo">Bajo</SelectItem><SelectItem value="medio">Medio</SelectItem><SelectItem value="alto">Alto</SelectItem></SelectContent></Select>
        <Select value={fFuente} onValueChange={setFFuente}><SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todas">Fuente</SelectItem>{Object.entries(FUENTE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
        <div className="ml-auto flex gap-2">
          {puedeCrear && <Button variant="outline" size="sm" disabled={sync} onClick={sincronizar}>{sync ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sincronizar fuentes</Button>}
          <Button variant="outline" size="sm" disabled={!filtradas.length} onClick={exportar}><Download className="size-4" /> Excel</Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">{filtradas.length} de {rows.length} clientes</div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-14 text-center">
          <Users className="size-8 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">No hay clientes unificados todavía.</div>
          {puedeCrear && <Button size="sm" disabled={sync} onClick={sincronizar}>{sync ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sincronizar fuentes (Club, pedidos, tickets)</Button>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2 text-right">Gastado 12m</th><th className="px-3 py-2">Última compra</th><th className="px-3 py-2">Nivel</th><th className="px-3 py-2">Churn</th><th className="px-3 py-2">Fuentes</th></tr>
            </thead>
            <tbody>
              {filtradas.slice(0, 500).map((c) => (
                <tr key={c.id} className="cursor-pointer border-t border-border hover:bg-muted/30" onClick={() => router.push(`/admin/clientes/${c.id}`)}>
                  <td className="px-3 py-1.5">
                    <Link href={`/admin/clientes/${c.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{c.nombre}</Link>
                    <div className="text-[11px] text-muted-foreground">{c.dni ? `DNI ${c.dni}` : c.telefono ?? c.email ?? '—'}</div>
                  </td>
                  <td className="px-3 py-1.5"><Badge variant={c.tipo === 'b2b' ? 'secondary' : 'outline'} className="text-[10px]">{c.tipo.toUpperCase()}</Badge></td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatARS(c.gastado)}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{c.ultima_compra ?? '—'}</td>
                  <td className="px-3 py-1.5">{c.nivel ? <Badge variant="outline" className="text-[10px]">{NIVEL_LABEL[c.nivel]}</Badge> : '—'}</td>
                  <td className="px-3 py-1.5"><Badge variant={RIESGO_VARIANT[c.riesgo]} className="text-[10px]">{RIESGO_LABEL[c.riesgo]}</Badge></td>
                  <td className="px-3 py-1.5"><div className="flex flex-wrap gap-0.5">{c.fuentes.slice(0, 3).map((f) => <span key={f} className="rounded bg-muted px-1 py-0.5 text-[9px]">{FUENTE_LABEL[f]?.split(' ')[0] ?? f}</span>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
