'use client'

import { useState } from 'react'
import { Lock, Loader2, ShieldAlert, Info } from 'lucide-react'
import { toast } from 'sonner'

import { createClient } from '@/lib/supabase/client'
import { NIVEL_TEXTO, type Agente, type Nivel } from '@/lib/agentes/elenco'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

export function AgentesConfigClient({ elenco, config, sucursales, constitucion, intentos }: {
  elenco: Agente[]; config: any[]; sucursales: any[]; constitucion: any[]; intentos: any[]
}) {
  const [filas, setFilas] = useState(config)
  const [guardando, setGuardando] = useState<string | null>(null)
  const [log, setLog] = useState(intentos)
  // B.4 · el alcance: la cadena, o una sucursal puntual.
  const [sucursal, setSucursal] = useState<string>('')

  const alcance = sucursal || null
  const buscar = (agente: string, accion: string) =>
    filas.find((f) => f.agente === agente && f.accion === accion
      && (alcance ? f.sucursal_id === alcance : f.sucursal_id === null))

  async function definir(agente: string, accion: string, nivel: Nivel, limite?: number | null) {
    const k = `${agente}:${accion}`
    setGuardando(k)
    try {
      const sb = createClient()
      const { data, error } = await sb.rpc('agente_definir_nivel', {
        p_agente: agente, p_accion: accion, p_nivel: nivel,
        p_sucursal: alcance, p_limite_monto: limite ?? null,
        p_limite_periodo: limite != null ? 'dia' : null,
      }).maybeSingle<{ ok: boolean; motivo: string }>()
      if (error) throw new Error(error.message)

      if (!data?.ok) {
        // B.5 · lo que la constitución prohíbe no se guarda y el intento queda.
        toast.error(data?.motivo ?? 'No se pudo.')
        const { data: nuevos } = await sb.from('intentos_bloqueados')
          .select('*').order('intento_at', { ascending: false }).limit(20)
        setLog(nuevos ?? [])
        return
      }

      setFilas((p) => {
        const otras = p.filter((f) => !(f.agente === agente && f.accion === accion
          && (alcance ? f.sucursal_id === alcance : f.sucursal_id === null)))
        return [...otras, { agente, accion, sucursal_id: alcance, nivel, limite_monto: limite ?? null }]
      })
      toast.success(data.motivo)
    } catch (e: any) {
      toast.error(e?.message ?? 'Falló.')
    } finally { setGuardando(null) }
  }

  return (
    <div className="space-y-6">
      {/* ── B.5 · LA CONSTITUCIÓN, PRIMERO Y CON CANDADO ────────────────── */}
      <section className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="size-4 text-destructive" />
          Lo que ningún agente puede hacer, en ningún nivel
        </div>
        <div className="space-y-1.5">
          {constitucion.map((c) => (
            <div key={c.accion} className="rounded border bg-background p-2.5 text-xs">
              <div className="flex items-center gap-2">
                <Lock className="size-3 text-destructive" />
                <span className="font-medium">{c.que_es}</span>
                <Badge variant="outline" className="ml-auto border-destructive/40 text-[10px] text-destructive">
                  trabado
                </Badge>
              </div>
              <p className="mt-1 leading-snug text-muted-foreground">{c.por_que}</p>
            </div>
          ))}
        </div>
        <p className="text-xs leading-snug text-muted-foreground">
          No es un aviso: la base lo rechaza. Y <b>cada intento de habilitarlo queda registrado</b>,
          con quién lo intentó y cuándo.
        </p>
      </section>

      {log.length > 0 && (
        <Alert variant="destructive">
          <ShieldAlert className="size-4" />
          <AlertDescription className="text-xs leading-snug">
            <b>{log.length} intento(s) de habilitar algo prohibido.</b>{' '}
            {log.slice(0, 3).map((i) => `${i.agente ?? '—'} → ${i.accion}`).join(' · ')}
            {log.length > 3 && ` y ${log.length - 3} más`}.
          </AlertDescription>
        </Alert>
      )}

      {/* ── B.4 · EL ALCANCE ────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-card p-4">
        <label className="text-xs">
          <div className="mb-1 font-medium">Para qué alcance</div>
          <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="">Toda la cadena</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          Lo que se configure acá vale {alcance ? 'sólo para esa sucursal' : 'para toda la cadena'}.
          Un agente puede estar en un nivel en Guzmán y en otro en Arabia: es lo que permite probar
          en un local antes de soltarlo en las cuatro.
        </p>
      </section>

      {/* ── B.1 y B.2 · LA MATRIZ, POR ACCIÓN ───────────────────────────── */}
      {elenco.map((a) => {
        const aplicaAca = alcance ? a.alcance === 'sucursal' : a.alcance === 'cadena'
        return (
          <section key={a.id} className={`space-y-2 rounded-lg border bg-card p-4 ${
            aplicaAca ? '' : 'opacity-50'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold">{a.nombre}</h2>
              <span className="text-xs text-muted-foreground">{a.queHace}</span>
              <Badge variant="outline" className="ml-auto text-[10px]">
                {a.alcance === 'cadena' ? 'de cadena' : 'por sucursal'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Lee de {a.deDondeLee}.</p>

            {!aplicaAca && (
              <p className="text-xs italic text-muted-foreground">
                {a.alcance === 'cadena'
                  ? 'Es de cadena: se configura eligiendo «toda la cadena», no una sucursal.'
                  : 'Trabaja por sucursal: elegí una para configurarlo.'}
              </p>
            )}

            {aplicaAca && (
              <div className="space-y-2">
                {a.acciones.map((ac) => {
                  const actual = buscar(a.id, ac.clave)
                  const k = `${a.id}:${ac.clave}`
                  return (
                    <div key={ac.clave} className="rounded border p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm">{ac.nombre}</span>
                        {guardando === k && <Loader2 className="size-3.5 animate-spin" />}
                        <div className="ml-auto flex flex-wrap gap-1">
                          {(['nunca', 'sugiere', 'prepara', 'hace_y_avisa'] as Nivel[]).map((n) => {
                            const puede = ac.niveles.includes(n)
                            const esActual = (actual?.nivel ?? 'sugiere') === n
                            return (
                              <button key={n} disabled={!puede || guardando === k}
                                onClick={() => definir(a.id, ac.clave, n, actual?.limite_monto)}
                                title={puede ? NIVEL_TEXTO[n].d : ac.techo}
                                className={`rounded border px-2 py-0.5 text-[11px] transition ${
                                  esActual ? 'border-primary bg-primary/10 font-medium'
                                  : puede ? 'hover:bg-muted' : 'cursor-not-allowed opacity-40'}`}>
                                {!puede && <Lock className="mr-0.5 inline size-2.5" />}
                                {NIVEL_TEXTO[n].t}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {ac.techo && (
                        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                          No llega a «hace y avisa»: {ac.techo}
                        </p>
                      )}

                      {/* B.3 · el límite de monto */}
                      {ac.pideLimite && (actual?.nivel === 'hace_y_avisa') && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">Hasta</span>
                          <Input type="number" defaultValue={actual?.limite_monto ?? ''}
                            placeholder="sin tope" className="h-7 w-32 text-xs"
                            onBlur={(e) => definir(a.id, ac.clave, 'hace_y_avisa',
                              e.target.value ? Number(e.target.value) : null)} />
                          <span className="text-[11px] text-muted-foreground">por día</span>
                          {actual?.limite_monto == null && (
                            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                              sin tope definido NO actúa solo
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}

      <Alert>
        <Info className="size-4" />
        <AlertDescription className="text-xs leading-snug">
          <b>Los agentes arrancan en «sugiere».</b> Facundo contestó que es más grave que el sistema
          se calle algo a que interrumpa de más, así que nacen hablando — pero nada que comprometa
          plata se ejecuta solo, en ningún nivel. Y un agente nunca tiene más permisos que quien lo
          configuró: lo que vos no podés ver, él tampoco.
        </AlertDescription>
      </Alert>
    </div>
  )
}
