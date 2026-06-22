'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database, Trash2, Loader2, AlertTriangle, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

async function post(accion: string, extra: any = {}) {
  const r = await fetch('/api/admin/demo-maestro', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion, ...extra }) })
  const j = await r.json(); if (!r.ok) throw new Error(j?.error || 'Error')
  return j
}

export function DemoMaestroSection() {
  const router = useRouter()
  const [conteo, setConteo] = useState<Record<string, number> | null>(null)
  const [busy, setBusy] = useState<'cargar' | 'limpiar' | null>(null)
  const [confirm, setConfirm] = useState('')

  async function refrescar() {
    try { const j = await post('contar'); setConteo(j.conteo) } catch { /* */ }
  }
  useEffect(() => { refrescar() }, [])

  const totalDemo = conteo ? Object.values(conteo).reduce((a, b) => a + Number(b), 0) : 0

  async function cargar() {
    setBusy('cargar')
    try { const j = await post('cargar'); const r = j.resultado; toast.success(r?.skipped ? 'Ya había datos demo cargados' : `Demo cargado: ${r?.productos ?? 0} productos, ${r?.clientes ?? 0} clientes, ${r?.ventas_diarias ?? 0} ventas`); await refrescar(); router.refresh() }
    catch (e: any) { toast.error(e?.message) } finally { setBusy(null) }
  }
  async function limpiar() {
    setBusy('limpiar')
    try { const j = await post('limpiar', { confirmacion: confirm }); toast.success(`Demo borrado: ${j.resultado?.borrados ?? 0} registros. El sistema quedó en cero.`); setConfirm(''); await refrescar(); router.refresh() }
    catch (e: any) { toast.error(e?.message) } finally { setBusy(null) }
  }

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="flex items-center gap-2"><Sparkles className="size-5 text-primary" /><h2 className="text-base font-semibold">Datos de demostración</h2></div>
      <p className="mt-1 text-sm text-muted-foreground">
        Poblá todo el sistema con datos ficticios coherentes (productos, stock, ventas, clientes, caja, ofertas) para probarlo, o limpiá el demo para empezar de cero con datos reales.
      </p>

      {conteo && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {Object.entries(conteo).map(([k, v]) => Number(v) > 0 && (
            <span key={k} className="rounded-md bg-muted px-2 py-1"><b>{Number(v).toLocaleString('es-AR')}</b> {k.replace(/_/g, ' ')}</span>
          ))}
          {totalDemo === 0 && <span className="text-muted-foreground">No hay datos demo cargados — el sistema está en cero.</span>}
        </div>
      )}

      {/* Cargar */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button disabled={!!busy} onClick={cargar}>{busy === 'cargar' ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />} Cargar datos demo</Button>
        <span className="text-xs text-muted-foreground">Seguro: marca todo como demo (es_demo), no toca datos reales.</span>
      </div>

      {/* Limpiar (peligroso) */}
      <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-rose-700"><AlertTriangle className="size-4" /> Limpiar datos demo</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Borra <b>SOLO</b> los datos de demostración (es_demo y productos DEMO-). Los datos reales (cargados por vos / por SIFACO) <b>NUNCA</b> se tocan. Escribí <b>CONFIRMAR</b> para habilitar.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Escribí CONFIRMAR" className="h-9 w-44" />
          <Button variant="destructive" disabled={confirm !== 'CONFIRMAR' || !!busy || totalDemo === 0} onClick={limpiar}>
            {busy === 'limpiar' ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Limpiar demo ({totalDemo.toLocaleString('es-AR')})
          </Button>
        </div>
      </div>
    </section>
  )
}
