'use client'

import { useState } from 'react'
import { FileText, Stethoscope, AlertTriangle, Plus, Loader2, Paperclip } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// v1.3 · `matricula_farmaceutico` se fue con la formalización del mostrador
// (§1). El farmacéutico es un tilde en el usuario, no un papel con
// vencimiento.
const TIPOS = [
  'habilitacion_municipal', 'habilitacion_provincial',
  'certificado_anmat', 'seguro', 'contrato_alquiler', 'otro',
]

function diasPara(fecha: string | null): number | null {
  if (!fecha) return null
  return Math.floor((new Date(`${fecha}T12:00:00`).getTime() - Date.now()) / 86_400_000)
}

export function DocumentosEmpresaClient({ docs, sucursales, diasAviso }: {
  docs: any[]; sucursales: any[]; diasAviso: number
}) {
  const [lista, setLista] = useState(docs)
  const [nuevo, setNuevo] = useState(false)
  const [busy, setBusy] = useState(false)

  const sucNombre = (id: string | null) =>
    sucursales.find((s) => s.id === id)?.nombre ?? 'toda la empresa'

  // Lo que vence pronto, y lo que ya venció. Son dos cosas distintas: una se
  // renueva, la otra ya es un problema de habilitación.
  const vencidos = lista.filter((d) => { const n = diasPara(d.vence_at); return n !== null && n < 0 })
  const porVencer = lista.filter((d) => {
    const n = diasPara(d.vence_at); return n !== null && n >= 0 && n <= diasAviso
  })
  const sinFecha = lista.filter((d) => !d.vence_at)


  async function guardarDoc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const sb = createClient()
      const { data, error } = await sb.from('compliance_documentos').insert({
        sucursal_id: (f.get('sucursal') as string) || null,
        tipo: f.get('tipo') as string,
        descripcion: (f.get('descripcion') as string) || null,
        archivo_url: (f.get('archivo') as string) || null,
        vence_at: (f.get('vence') as string) || null,
      }).select('*').maybeSingle()
      if (error) throw new Error(error.message)
      setLista((p) => [...p, data])
      setNuevo(false)
      toast.success('Guardado.')
    } catch (e: any) { toast.error(e?.message ?? 'No se pudo guardar.') }
    finally { setBusy(false) }
  }


  return (
    <div className="space-y-6">
      {vencidos.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-xs leading-snug">
            <b>{vencidos.length} documento(s) vencido(s).</b>
            Una habilitación vencida no es un recordatorio: es un problema de habilitación.
          </AlertDescription>
        </Alert>
      )}

      {/* ── F.1 y F.2 · LOS PAPELES ────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Habilitaciones, certificados y contratos</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              NORA avisa {diasAviso} días antes. Renovar una habilitación municipal no se hace en una
              semana — por eso el aviso es largo y es configurable.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setNuevo((v) => !v)}>
            <Plus className="size-4" /> Agregar
          </Button>
        </div>

        {nuevo && (
          <form onSubmit={guardarDoc} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
            <select name="tipo" required className="rounded-md border bg-background px-2 py-1.5 text-sm">
              <option value="">Tipo…</option>
              {TIPOS.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
            <select name="sucursal" className="rounded-md border bg-background px-2 py-1.5 text-sm">
              <option value="">Toda la empresa</option>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <Input name="descripcion" placeholder="Descripción" />
            <label className="text-xs">
              <div className="mb-1 text-muted-foreground">Vence</div>
              <Input name="vence" type="date" />
            </label>
            <Input name="archivo" placeholder="Link al archivo (opcional)" className="sm:col-span-2" />
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : 'Guardar'}
            </Button>
          </form>
        )}

        {sinFecha.length > 0 && (
          <p className="text-xs leading-snug text-muted-foreground">
            {sinFecha.length} documento(s) sin fecha de vencimiento cargada. No se avisa de ésos, y
            no es que no venzan: es que no se sabe cuándo.
          </p>
        )}

        <div className="divide-y rounded-lg border">
          {!lista.length && (
            <p className="p-3 text-sm text-muted-foreground">
              Ninguno cargado todavía.
            </p>
          )}
          {[...porVencer, ...vencidos, ...lista.filter((d) => !porVencer.includes(d) && !vencidos.includes(d))]
            .map((d) => {
              const n = diasPara(d.vence_at)
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="font-medium">{String(d.tipo).replace(/_/g, ' ')}</span>
                  <span className="text-xs text-muted-foreground">{sucNombre(d.sucursal_id)}</span>
                  {d.descripcion && <span className="text-xs text-muted-foreground">· {d.descripcion}</span>}
                  {d.archivo_url && (
                    <a href={d.archivo_url} target="_blank" rel="noreferrer"
                      className="text-xs underline"><Paperclip className="inline size-3" /> archivo</a>
                  )}
                  <span className="ml-auto text-xs">
                    {n === null
                      ? <span className="text-muted-foreground">sin vencimiento</span>
                      : n < 0
                        ? <span className="font-medium text-destructive">vencido hace {-n} días</span>
                        : n <= diasAviso
                          ? <span className="font-medium text-amber-600 dark:text-amber-400">vence en {n} días</span>
                          : <span className="text-muted-foreground">vence {d.vence_at}</span>}
                  </span>
                </div>
              )
            })}
        </div>
      </section>
    </div>
  )
}
