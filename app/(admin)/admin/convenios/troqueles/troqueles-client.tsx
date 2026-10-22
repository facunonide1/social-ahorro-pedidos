'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Camera, Loader2, Check, Ticket } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { formatARS } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

type Pres = {
  id: string; periodo_desde: string; periodo_hasta: string; estado: string
  fecha_envio: string | null; total_declarado: number | null; cantidad_comprobantes: number | null
  convenios: { nombre: string; troquel: string | null } | null
  sucursales: { nombre: string } | null
}
type Troquel = {
  id: string; presentacion_id: string; remito_numero: string | null; cantidad: number | null
  enviado_at: string | null; foto_remito_url: string | null
  acuse_at: string | null; acuse_foto_url: string | null
}

const BUCKET = 'convenios-troqueles'

async function post(body: any) {
  const r = await fetch('/api/convenios/troqueles', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(j?.error ?? 'Error')
  return j
}

export function TroquelesClient({ presentaciones, troqueles, puedeCargar }: {
  presentaciones: Pres[]; troqueles: Troquel[]; puedeCargar: boolean
}) {
  const router = useRouter()

  // Las que no pidieron troquel no aparecen: un convenio que no lo pide no
  // debería debitar por eso, y mostrarlas sería ruido en una pantalla que se
  // usa de pie.
  const relevantes = presentaciones.filter((p) => p.convenios?.troquel !== 'ninguno')

  const deLa = (id: string) => troqueles.filter((t) => t.presentacion_id === id)
  const sinMandar = relevantes.filter((p) => deLa(p.id).every((t) => !t.enviado_at))
  const sinAcuse = relevantes.filter((p) =>
    deLa(p.id).some((t) => t.enviado_at) && deLa(p.id).every((t) => !t.acuse_at))
  const listas = relevantes.filter((p) => deLa(p.id).some((t) => t.acuse_at))

  if (!relevantes.length) {
    return (
      <div className="mx-auto max-w-md space-y-2 rounded-lg border border-dashed p-5">
        <h2 className="font-medium">No hay presentaciones esperando troqueles.</h2>
        <p className="text-sm leading-snug text-muted-foreground">
          Acá aparecen las presentaciones armadas o enviadas a las que les falta mandar los
          troqueles o guardar el acuse. Ninguna todavía.
        </p>
        <Button variant="outline" asChild className="mt-1">
          <Link href="/admin/convenios/presentaciones">Ver las presentaciones</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      {/* ── POR QUÉ IMPORTA, ARRIBA ─────────────────────────────────────── */}
      <div className="border-l-2 border-foreground/60 bg-muted/30 p-3">
        <p className="text-xs leading-snug text-muted-foreground">
          El acuse se consigue <b>al momento</b>. Cuando llegue el débito —semanas después— el
          acuse ya está o ya no está, y sin acuse un débito por troquel faltante no se puede
          reclamar. Es la única tarea del sector donde llegar tarde no se arregla.
        </p>
      </div>

      {sinMandar.length > 0 && (
        <Grupo titulo={`Falta mandarlos (${sinMandar.length})`}>
          {sinMandar.map((p) => (
            <Tarjeta key={p.id} p={p}>
              {puedeCargar && <FormEnvio presId={p.id} onHecho={() => router.refresh()} />}
            </Tarjeta>
          ))}
        </Grupo>
      )}

      {sinAcuse.length > 0 && (
        <Grupo titulo={`Mandados, falta el acuse (${sinAcuse.length})`}>
          {sinAcuse.map((p) => {
            const t = deLa(p.id).find((x) => x.enviado_at && !x.acuse_at)!
            return (
              <Tarjeta key={p.id} p={p}>
                <p className="text-xs text-muted-foreground">
                  Remito <code>{t.remito_numero ?? 'sin número'}</code>
                  {t.enviado_at && <> · salió el {t.enviado_at}</>}
                  {!t.foto_remito_url && <> · sin foto del remito</>}
                </p>
                {puedeCargar && <BotonAcuse troquelId={t.id} presId={p.id} onHecho={() => router.refresh()} />}
              </Tarjeta>
            )
          })}
        </Grupo>
      )}

      {listas.length > 0 && (
        <Grupo titulo={`Con acuse guardado (${listas.length})`}>
          {listas.map((p) => {
            const t = deLa(p.id).find((x) => x.acuse_at)!
            return (
              <Tarjeta key={p.id} p={p}>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Check className="size-3.5" /> Acuse del {t.acuse_at}
                  {t.acuse_foto_url ? ', con foto' : ', sin foto'}
                </p>
              </Tarjeta>
            )
          })}
        </Grupo>
      )}
    </div>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Tarjeta({ p, children }: { p: Pres; children?: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/convenios/presentaciones/${p.id}`} className="font-medium hover:underline">
            {p.convenios?.nombre ?? '—'}
          </Link>
          <span className="text-xs text-muted-foreground">{p.sucursales?.nombre}</span>
          {p.convenios?.troquel === 'fisico' && (
            <Badge variant="outline" className="text-[10px]">troquel físico</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {p.periodo_desde} → {p.periodo_hasta}
          {p.cantidad_comprobantes != null && <> · {p.cantidad_comprobantes} comprobantes</>}
          {p.total_declarado != null && <> · {formatARS(Number(p.total_declarado))}</>}
        </p>
      </div>
      {children}
    </div>
  )
}

function FormEnvio({ presId, onHecho }: { presId: string; onHecho: () => void }) {
  const sb = createClient()
  const [f, setF] = useState({ remito_numero: '', cantidad: '', transporte: '' })
  const [foto, setFoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function subir(file: File) {
    setBusy(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const { error } = await sb.storage.from(BUCKET)
        .upload(`${presId}/remito-${Date.now()}.${ext}`, file, { upsert: false })
      if (error) throw new Error(error.message)
      setFoto(`${presId}/remito-${Date.now()}.${ext}`)
      toast.success('Foto del remito lista.')
    } catch (e: any) { toast.error(e?.message ?? 'No se pudo subir.') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-2">
      <Input className="h-12 text-base" value={f.remito_numero} placeholder="N° de remito"
        onChange={(e) => setF({ ...f, remito_numero: e.target.value })} />
      <div className="flex gap-2">
        <Input className="h-12 w-24 text-base" type="number" inputMode="numeric" placeholder="cant."
          value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} />
        <Input className="h-12 flex-1 text-base" placeholder="Transporte"
          value={f.transporte} onChange={(e) => setF({ ...f, transporte: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <label className="flex-1">
          <input type="file" accept="image/*,.pdf" capture="environment" className="hidden"
            onChange={(e) => { const x = e.target.files?.[0]; if (x) subir(x) }} />
          <Button asChild size="lg" variant="outline" className="h-12 w-full">
            <span><Camera className="size-5" /> {foto ? 'Foto lista' : 'Foto del remito'}</span>
          </Button>
        </label>
        <Button size="lg" className="h-12 flex-1" disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const j = await post({ accion: 'enviar', presentacion_id: presId, ...f, foto_remito_url: foto })
              toast.success('Envío registrado.', { description: j?.aviso ?? undefined })
              onHecho()
            } catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
          }}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Ticket className="size-5" />}
          Mandé
        </Button>
      </div>
    </div>
  )
}

function BotonAcuse({ troquelId, presId, onHecho }: {
  troquelId: string; presId: string; onHecho: () => void
}) {
  const sb = createClient()
  const [busy, setBusy] = useState(false)

  async function conFoto(file: File) {
    setBusy(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${presId}/acuse-${Date.now()}.${ext}`
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (error) throw new Error(error.message)
      await post({ accion: 'acusar', id: troquelId, acuse_foto_url: path })
      toast.success('Acuse guardado con la foto.')
      onHecho()
    } catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
  }

  return (
    <div className="flex gap-2">
      <label className="flex-1">
        <input type="file" accept="image/*,.pdf" capture="environment" className="hidden"
          onChange={(e) => { const x = e.target.files?.[0]; if (x) conFoto(x) }} />
        <Button asChild size="lg" className="h-12 w-full">
          <span>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
            Foto del acuse
          </span>
        </Button>
      </label>
      <Button size="lg" variant="outline" className="h-12" disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const j = await post({ accion: 'acusar', id: troquelId })
            toast.success('Acuse registrado.', { description: j?.aviso ?? undefined })
            onHecho()
          } catch (e: any) { toast.error(e?.message ?? 'Falló.') } finally { setBusy(false) }
        }}>
        Sin foto
      </Button>
    </div>
  )
}
