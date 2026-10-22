'use client'

import { useState } from 'react'
import { FileText, Stethoscope, AlertTriangle, Plus, Loader2, Paperclip } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const TIPOS = [
  'habilitacion_municipal', 'habilitacion_provincial', 'matricula_farmaceutico',
  'certificado_anmat', 'seguro', 'contrato_alquiler', 'otro',
]

function diasPara(fecha: string | null): number | null {
  if (!fecha) return null
  return Math.floor((new Date(`${fecha}T12:00:00`).getTime() - Date.now()) / 86_400_000)
}

export function DocumentosEmpresaClient({ docs, farmaceuticos, sucursales, diasAviso }: {
  docs: any[]; farmaceuticos: any[]; sucursales: any[]; diasAviso: number
}) {
  const [lista, setLista] = useState(docs)
  const [farma, setFarma] = useState(farmaceuticos)
  const [nuevo, setNuevo] = useState(false)
  const [nuevoFarma, setNuevoFarma] = useState(false)
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

  const sinFarmaceutico = sucursales.filter(
    (s) => !farma.some((f) => f.sucursal_id === s.id && f.activo),
  )
  const matriculasVencidas = farma.filter((f) => {
    const n = diasPara(f.matricula_vence); return f.activo && n !== null && n < 0
  })

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

  async function guardarFarma(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setBusy(true)
    try {
      const sb = createClient()
      const { data, error } = await sb.from('farmaceuticos').insert({
        sucursal_id: f.get('sucursal') as string,
        nombre: f.get('nombre') as string,
        matricula: (f.get('matricula') as string) || null,
        matricula_vence: (f.get('vence') as string) || null,
        es_director: f.get('director') === 'on',
      }).select('*').maybeSingle()
      if (error) throw new Error(error.message)
      setFarma((p) => [...p, data])
      setNuevoFarma(false)
      toast.success('Guardado.')
    } catch (e: any) { toast.error(e?.message ?? 'No se pudo guardar.') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      {(vencidos.length > 0 || matriculasVencidas.length > 0) && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-xs leading-snug">
            <b>
              {vencidos.length > 0 && <>{vencidos.length} documento(s) vencido(s). </>}
              {matriculasVencidas.length > 0 && <>{matriculasVencidas.length} matrícula(s) vencida(s). </>}
            </b>
            Una habilitación vencida no es un recordatorio: es un problema de habilitación.
          </AlertDescription>
        </Alert>
      )}

      {sinFarmaceutico.length > 0 && (
        <Alert>
          <Stethoscope className="size-4" />
          <AlertDescription className="text-xs leading-snug">
            <b>{sinFarmaceutico.length} sucursal(es) sin farmacéutico declarado</b>:{' '}
            {sinFarmaceutico.map((s) => s.nombre).join(', ')}. Sin eso, las tareas que solo puede
            firmar el farmacéutico no se le pueden asignar a nadie.
          </AlertDescription>
        </Alert>
      )}

      {/* ── F.4 · LOS FARMACÉUTICOS ─────────────────────────────────────── */}
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">El farmacéutico de cada sucursal</h2>
          <Button size="sm" variant="outline" onClick={() => setNuevoFarma((v) => !v)}>
            <Plus className="size-4" /> Agregar
          </Button>
        </div>

        {nuevoFarma && (
          <form onSubmit={guardarFarma} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
            <select name="sucursal" required className="rounded-md border bg-background px-2 py-1.5 text-sm">
              <option value="">Sucursal…</option>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <Input name="nombre" placeholder="Nombre y apellido" required />
            <Input name="matricula" placeholder="Matrícula" />
            <label className="text-xs">
              <div className="mb-1 text-muted-foreground">Vence la matrícula</div>
              <Input name="vence" type="date" />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="director" defaultChecked /> Es director técnico
            </label>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : 'Guardar'}
            </Button>
          </form>
        )}

        <div className="divide-y rounded-lg border">
          {!farma.length && (
            <p className="p-3 text-sm text-muted-foreground">
              Ninguno cargado. Es lo primero que Facundo tiene que completar: sin el nombre del
              farmacéutico de cada sucursal, el permiso por tipo de tarea no se puede evaluar.
            </p>
          )}
          {farma.map((f) => {
            const n = diasPara(f.matricula_vence)
            return (
              <div key={f.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <Stethoscope className="size-4 text-muted-foreground" />
                <span className="font-medium">{f.nombre}</span>
                <span className="text-xs text-muted-foreground">{sucNombre(f.sucursal_id)}</span>
                {f.es_director && <Badge variant="outline" className="text-[10px]">director técnico</Badge>}
                {f.matricula && <code className="text-xs text-muted-foreground">mat. {f.matricula}</code>}
                <span className="ml-auto text-xs">
                  {f.matricula_vence == null
                    ? <span className="text-muted-foreground">sin vencimiento cargado</span>
                    : n! < 0
                      ? <span className="font-medium text-destructive">vencida hace {-n!} días</span>
                      : n! <= diasAviso
                        ? <span className="font-medium text-amber-600 dark:text-amber-400">vence en {n} días</span>
                        : <span className="text-muted-foreground">vence {f.matricula_vence}</span>}
                </span>
              </div>
            )
          })}
        </div>
      </section>

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
