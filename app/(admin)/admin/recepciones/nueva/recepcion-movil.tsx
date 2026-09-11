'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Check, Loader2, FileText, Monitor, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { subirDocumentoCliente } from '@/lib/documentos/subir-cliente'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

type Sucursal = { id: string; nombre: string; codigo: string | null }
type Proveedor = { id: string; razon_social: string; es_drogueria: boolean | null }

type Foto = {
  rol: 'factura' | 'pantalla_sifaco'
  nombre: string
  extraccion_id?: string | null
  estado: 'subiendo' | 'listo' | 'duplicado' | 'error'
  mensaje?: string
}

export function RecepcionMovil({
  sucursales, proveedores, sucursalDelUsuario,
}: { sucursales: Sucursal[]; proveedores: Proveedor[]; sucursalDelUsuario: string | null }) {
  const router = useRouter()
  const [proveedorId, setProveedorId] = useState('')
  const [sucursalId, setSucursalId] = useState(sucursalDelUsuario ?? '')
  const [remito, setRemito] = useState('')
  const [notas, setNotas] = useState('')
  const [sellado, setSellado] = useState(false)
  const [enSifaco, setEnSifaco] = useState(false)
  const [fotos, setFotos] = useState<Foto[]>([])
  const [guardando, setGuardando] = useState(false)

  const subiendo = fotos.some((f) => f.estado === 'subiendo')
  const puedeGuardar = !!proveedorId && !!sucursalId && !subiendo && !guardando

  async function agregar(rol: Foto['rol'], files: FileList | null) {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      const marca: Foto = { rol, nombre: file.name, estado: 'subiendo' }
      setFotos((f) => [...f, marca])

      // La foto de la PANTALLA DE SIFACO no se procesa: es la evidencia de que
      // el ingreso se hizo, no un dato para leer. Se sube igual y queda atada a
      // la recepción.
      if (rol === 'pantalla_sifaco') {
        const r = await subirDocumentoCliente(file)
        setFotos((f) => f.map((x) => x === marca
          ? { ...x, estado: r.estado === 'error' ? 'error' : 'listo',
              extraccion_id: 'extraccionId' in r ? r.extraccionId : null,
              mensaje: r.estado === 'error' ? r.mensaje : undefined }
          : x))
        continue
      }

      const r = await subirDocumentoCliente(file)
      setFotos((f) => f.map((x) => x === marca
        ? r.estado === 'error'
          ? { ...x, estado: 'error', mensaje: r.mensaje }
          : r.estado === 'duplicado'
            ? { ...x, estado: 'duplicado', extraccion_id: r.extraccionId, mensaje: r.mensaje }
            : { ...x, estado: 'listo', extraccion_id: r.extraccionId }
        : x))
    }
  }

  async function guardar() {
    setGuardando(true)
    try {
      const r = await fetch('/api/recepciones/crear', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedor_id: proveedorId, sucursal_id: sucursalId,
          numero_remito: remito || null, observaciones: notas || null,
          sellado, ingresado_a_sifaco: enSifaco,
          comprobantes: fotos.filter((f) => f.estado !== 'error').map((f) => ({
            rol: f.rol, extraccion_id: f.extraccion_id ?? null, nota: f.nombre,
          })),
        }),
      })
      const j = await r.json()
      if (!r.ok) { toast.error(j.error ?? 'No se pudo guardar'); return }
      toast.success(
        j.para_revisar?.length
          ? `Recepción guardada. ${j.para_revisar.length} factura(s) para revisar.`
          : 'Recepción guardada.',
      )
      router.push(`/admin/recepciones/${j.id}`)
    } finally { setGuardando(false) }
  }

  const facturas = fotos.filter((f) => f.rol === 'factura')
  const sifaco = fotos.filter((f) => f.rol === 'pantalla_sifaco')

  return (
    <div className="space-y-4">
      {/* ── QUIÉN Y DÓNDE ─────────────────────────────────────────────── */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Proveedor *</Label>
          <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}
            className="h-12 w-full rounded-lg border border-border bg-background px-3 text-base">
            <option value="">Elegir…</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.razon_social}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sucursal *</Label>
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}
            className="h-12 w-full rounded-lg border border-border bg-background px-3 text-base">
            <option value="">Elegir…</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Obligatoria: la compra tiene impacto fiscal y se declara por sucursal.
          </p>
        </div>
      </div>

      {/* ── LAS DOS FOTOS QUE YA SE SACAN ─────────────────────────────── */}
      <div className="space-y-3">
        <BotonFoto
          icono={FileText}
          titulo="Foto de la factura"
          detalle="Se lee sola: proveedor, número, total y los renglones con su costo."
          fotos={facturas}
          onPick={(fs) => agregar('factura', fs)}
        />
        <BotonFoto
          icono={Monitor}
          titulo="Foto de la pantalla de SIFACO"
          detalle="No se procesa. Queda como comprobante de que el ingreso se hizo."
          fotos={sifaco}
          onPick={(fs) => agregar('pantalla_sifaco', fs)}
        />
      </div>

      {/* ── LO QUE YA SE HACE, TILDADO ────────────────────────────────── */}
      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
        <Tilde label="Ya la sellé" v={sellado} on={setSellado} />
        <Tilde label="Ya la ingresé a SIFACO" v={enSifaco} on={setEnSifaco} />
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Remito (opcional)</Label>
          <Input className="h-12 text-base" value={remito} onChange={(e) => setRemito(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Algo para anotar</Label>
          <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)}
            placeholder="Faltó una tira de Ketorolac…" />
          <p className="text-[11px] leading-snug text-muted-foreground">
            Lo que falta se carga renglón por renglón después, al revisar la factura. Esto es sólo
            para no olvidárselo ahora.
          </p>
        </div>
      </div>

      <Alert>
        <AlertDescription className="text-xs leading-snug">
          Guardar esto <b>no ingresa nada a SIFACO</b>: SIFACO sigue siendo la autoridad de stock y
          de precio. Lo que queda acá es la deuda con el proveedor y el costo de cada producto, que
          es lo que hoy se pierde.
        </AlertDescription>
      </Alert>

      <Button className="h-14 w-full text-base" disabled={!puedeGuardar} onClick={guardar}>
        {guardando ? <Loader2 className="size-5 animate-spin" /> : <><Check className="size-5" /> Guardar la recepción</>}
      </Button>
      {!puedeGuardar && !guardando && (
        <p className="text-center text-xs text-muted-foreground">
          {subiendo ? 'Esperá a que terminen de subir las fotos.'
            : `Falta ${[!proveedorId && 'el proveedor', !sucursalId && 'la sucursal'].filter(Boolean).join(' y ')}.`}
        </p>
      )}
    </div>
  )
}

function BotonFoto({
  icono: Icono, titulo, detalle, fotos, onPick,
}: {
  icono: any; titulo: string; detalle: string; fotos: Foto[]
  onPick: (f: FileList | null) => void
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <label className="flex cursor-pointer items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icono className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{titulo}</span>
          <span className="block text-xs leading-snug text-muted-foreground">{detalle}</span>
        </span>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border">
          <Camera className="size-5" />
        </span>
        {/* `capture` abre la cámara directo en el celular. Y acepta varias: una
            entrega puede traer más de una factura. */}
        <input type="file" accept="image/*,application/pdf" capture="environment" multiple
          className="hidden" onChange={(e) => { onPick(e.target.files); e.currentTarget.value = '' }} />
      </label>

      {fotos.length > 0 && (
        <ul className="mt-2 space-y-1">
          {fotos.map((f, i) => (
            <li key={i} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs">
              {f.estado === 'subiendo' && <Loader2 className="size-3.5 shrink-0 animate-spin" />}
              {f.estado === 'listo' && <Check className="size-3.5 shrink-0 text-emerald-600" />}
              <span className="min-w-0 flex-1 truncate">{f.nombre}</span>
              {f.estado === 'duplicado' && <Badge variant="outline" className="text-[10px]">ya estaba</Badge>}
              {f.estado === 'error' && <Badge variant="destructive" className="text-[10px]">no subió</Badge>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Tilde({ label, v, on }: { label: string; v: boolean; on: (b: boolean) => void }) {
  return (
    <button type="button" onClick={() => on(!v)}
      className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-3 text-left">
      <span className={`flex size-6 shrink-0 items-center justify-center rounded-md border ${
        v ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
        {v && <Check className="size-4" />}
      </span>
      <span className="text-sm">{label}</span>
    </button>
  )
}
