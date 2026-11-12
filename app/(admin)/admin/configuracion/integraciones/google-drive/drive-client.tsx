'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Carpeta = { id: string; nombre: string; incluirSubcarpetas: boolean }
type Bandeja = {
  fileId: string
  nombre: string
  ruta: string | null
  clasificacion: string
  estado: string
  error: string | null
  link: string
  matchPct: number | null
  intentos: number
}

export function DriveClient(props: {
  habilitada: boolean
  autoAplicar: boolean
  aviso: string | null
  conexion: null | {
    email: string | null
    estado: string
    connectedAt: string
    vence: string | null
    plazo: 'ok' | 'por_vencer' | 'vencido'
    lastSync: string | null
    lastError: string | null
    listadoCompleto: boolean
  }
  carpetas: Carpeta[]
  progreso: { hechos: number; total: number; cuentas: Record<string, number> }
  bandeja: Bandeja[]
  pendientes: Bandeja[]
}) {
  const router = useRouter()
  const [q, setQ] = useState('compras farmacias')
  const [halladas, setHalladas] = useState<{ id: string; nombre: string }[]>([])
  const [elegidas, setElegidas] = useState<Carpeta[]>(props.carpetas)
  const [ocupado, setOcupado] = useState(false)

  async function post(body: unknown, ok: string) {
    setOcupado(true)
    try {
      const r = await fetch('/api/integraciones/google-drive/procesar', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'No se pudo')
      toast.success(ok)
      router.refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Error')
    } finally {
      setOcupado(false)
    }
  }

  if (!props.habilitada) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm">
        La ingesta de Google Drive está <b>deshabilitada</b>. Para prenderla, DRIVE_INGESTA_ENABLED tiene que ser true.
      </div>
    )
  }

  const avisoTexto: Record<string, string> = {
    deshabilitado: 'Sigue deshabilitada.',
    sin_credenciales: 'Faltan GOOGLE_OAUTH_CLIENT_ID o GOOGLE_OAUTH_CLIENT_SECRET en el servidor.',
    conectada: 'Cuenta conectada. Elegí las carpetas.',
    state: 'El enlace de Google no coincidió. Probá conectar de nuevo.',
    token: 'Google no entregó un token de refresco.',
    guardar: 'No pude guardar la conexión. ¿Está aplicada la migración?',
    sin_permiso: 'Solo el dueño puede conectar Drive.',
  }

  return (
    <div className="space-y-6">
      {props.aviso && avisoTexto[props.aviso] && (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">{avisoTexto[props.aviso]}</div>
      )}

      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-medium">Conexión</h2>
        {!props.conexion ? (
          <p className="text-sm text-muted-foreground">Todavía no hay una cuenta conectada.</p>
        ) : (
          <div className="space-y-1 text-sm">
            <div>Cuenta: <b>{props.conexion.email ?? 'sin email'}</b> · {props.conexion.estado}</div>
            <div className="text-muted-foreground">
              Conectada {props.conexion.connectedAt.slice(0, 16).replace('T', ' ')}
              {props.conexion.vence ? ` · vence (estimado) ${props.conexion.vence.slice(0, 16).replace('T', ' ')}` : ''}
            </div>
            {props.conexion.plazo === 'por_vencer' && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                Falta un día o menos para los 7 días del modo Testing. Reconectá antes de que deje de entrar.
              </div>
            )}
            {props.conexion.plazo === 'vencido' && props.conexion.estado !== 'vencida' && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                Ya pasaron 7 días. Si el próximo sync falla, hay que reconectar.
              </div>
            )}
            {props.conexion.estado === 'vencida' && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
                La conexión está vencida. Reconectar.
              </div>
            )}
            {props.conexion.lastError && <div className="text-destructive">{props.conexion.lastError}</div>}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href="/api/integraciones/google-drive/conectar">
              {props.conexion ? 'Reconectar' : 'Conectar Google Drive'}
            </a>
          </Button>
          {props.conexion && (
            <Button variant="outline" disabled={ocupado} onClick={async () => {
              setOcupado(true)
              try {
                const r = await fetch('/api/integraciones/google-drive/desconectar', { method: 'POST' })
                const j = await r.json()
                if (!r.ok) throw new Error(j?.error)
                toast.success(j.revocado ? 'Desconectado y token revocado.' : 'Saqué la conexión de acá. Google no confirmó la revocación.')
                router.refresh()
              } catch (e: any) { toast.error(e?.message ?? 'Error') }
              finally { setOcupado(false) }
            }}>
              Desconectar
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Solo lectura (drive.readonly). Las carpetas «compras farmacias» y «compras farmacias (privado)» están en otra cuenta y compartidas con el dueño: el buscador mira también lo compartido.
          {props.autoAplicar ? ' Una lista con droguería y match alto se aplica al comparador.' : ' Las listas quedan en previa: DRIVE_PRECIOS_AUTO_APLICAR está en false.'}
          {' '}El maestro de cada sucursal no se aplica.
        </p>
      </section>

      {props.conexion && props.conexion.estado !== 'vencida' && (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <h2 className="font-medium">Carpetas</h2>
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="compras farmacias" />
            <Button variant="outline" disabled={ocupado} onClick={async () => {
              setOcupado(true)
              try {
                const r = await fetch(`/api/integraciones/google-drive/carpetas?q=${encodeURIComponent(q)}`)
                const j = await r.json()
                if (!r.ok) throw new Error(j?.error)
                setHalladas(j.carpetas ?? [])
              } catch (e: any) { toast.error(e?.message ?? 'Error') }
              finally { setOcupado(false) }
            }}>Buscar</Button>
          </div>
          <ul className="space-y-1 text-sm">
            {halladas.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2">
                <span>{h.nombre}</span>
                <Button size="sm" variant="ghost" onClick={() => {
                  if (elegidas.some((e) => e.id === h.id)) return
                  setElegidas([...elegidas, { id: h.id, nombre: h.nombre, incluirSubcarpetas: true }])
                }}>Agregar</Button>
              </li>
            ))}
          </ul>
          <ul className="space-y-2 text-sm">
            {elegidas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
                <span className="font-medium">{c.nombre}</span>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={c.incluirSubcarpetas} onChange={(e) => {
                    setElegidas(elegidas.map((x) => x.id === c.id ? { ...x, incluirSubcarpetas: e.target.checked } : x))
                  }} />
                  Incluir subcarpetas
                </label>
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setElegidas(elegidas.filter((x) => x.id !== c.id))}>Quitar</Button>
              </li>
            ))}
          </ul>
          <Button disabled={ocupado} onClick={async () => {
            setOcupado(true)
            try {
              const r = await fetch('/api/integraciones/google-drive/carpetas', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  carpetas: elegidas.map((c) => ({ folderId: c.id, nombre: c.nombre, incluirSubcarpetas: c.incluirSubcarpetas })),
                }),
              })
              const j = await r.json()
              if (!r.ok) throw new Error(j?.error)
              toast.success(`Guardé ${j.guardadas} carpetas.`)
              router.refresh()
            } catch (e: any) { toast.error(e?.message ?? 'Error') }
            finally { setOcupado(false) }
          }}>Guardar carpetas</Button>
        </section>
      )}

      <section className="space-y-3 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-medium">Backfill</h2>
          <span className="text-sm text-muted-foreground">
            {props.progreso.hechos} de {props.progreso.total}
            {props.conexion?.listadoCompleto ? ' · listado al día' : ' · todavía listando'}
          </span>
          <Button className="ml-auto" disabled={ocupado || !props.conexion} onClick={() => post({}, 'Corrí un lote.')}>
            Procesar ahora
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          Pendientes {props.progreso.cuentas.pendiente ?? 0}
          {' · '}ok {props.progreso.cuentas.ok ?? 0}
          {' · '}previa {props.progreso.cuentas.previa ?? 0}
          {' · '}error {props.progreso.cuentas.error ?? 0}
          {' · '}sin clasificar {props.progreso.cuentas.sin_clasificar ?? 0}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-medium">Pendientes</h2>
        {props.pendientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay archivos esperando.</p>
        ) : (
          <ul className="space-y-3">
            {props.pendientes.map((b) => (
              <li key={b.fileId} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <a className="font-medium underline" href={b.link} target="_blank" rel="noreferrer">{b.nombre}</a>
                  <span className="text-xs text-muted-foreground">{b.clasificacion}{b.intentos ? ` · intento ${b.intentos}` : ''}</span>
                </div>
                {b.ruta && <div className="text-xs text-muted-foreground">{b.ruta}</div>}
                <div className="mt-2">
                  <Button size="sm" variant="outline" disabled={ocupado} onClick={() => post({ accion: 'clasificar', fileId: b.fileId, clasificacion: 'ignorar' }, 'Quedó ignorado.')}>
                    Ignorar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="font-medium">Sin clasificar, en previa o con error</h2>
        {props.bandeja.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada en la bandeja.</p>
        ) : (
          <ul className="space-y-3">
            {props.bandeja.map((b) => (
              <li key={b.fileId} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <a className="font-medium underline" href={b.link} target="_blank" rel="noreferrer">{b.nombre}</a>
                  <span className="text-xs text-muted-foreground">{b.estado} · {b.clasificacion}{b.matchPct != null ? ` · match ${b.matchPct}%` : ''}{b.intentos ? ` · intento ${b.intentos}` : ''}</span>
                </div>
                {b.ruta && <div className="text-xs text-muted-foreground">{b.ruta}</div>}
                {b.error && <div className="mt-1 text-xs">{b.error}</div>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {(['precios', 'factura', 'maestro', 'ignorar'] as const).map((c) => (
                    <Button key={c} size="sm" variant="outline" disabled={ocupado} onClick={() => post({ accion: 'clasificar', fileId: b.fileId, clasificacion: c }, 'Quedó para el próximo lote.')}>
                      {c === 'ignorar' ? 'Ignorar' : `Clasificar como ${c}`}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
