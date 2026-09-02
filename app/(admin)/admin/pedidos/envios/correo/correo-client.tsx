'use client'

import { useTransition } from 'react'
import { Package, Scale, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'

import { formatARS } from '@/lib/utils/format'
import { KpiCard } from '@/components/cards/kpi-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { registrarCostoDeEnvio } from './actions'

type Bulto = {
  order_id: string; codigo: string; renglones: number; unidades: number
  peso_gramos: number | null; sin_peso: number; por_que_no_se_sabe: string | null
  envio_cobrado: number | null; envio_costo_real: number | null
}

export function CorreoClient({
  bultos, conPeso, conDiferencia,
}: { bultos: Bulto[]; conPeso: number; conDiferencia: number }) {
  const [pendiente, empezar] = useTransition()

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <KpiCard label="Pedidos por correo" value={bultos.length} icon={Package} />
        <KpiCard label="Con el bulto completo" value={conPeso} icon={Scale}
          footer={`de ${bultos.length} · el resto tiene productos sin peso`} />
        {/* Sin pedidos por correo no hay nada que comparar: cero diferencias
            diría "el transporte nunca cobró distinto", que no se sabe. */}
        <KpiCard label="Cobraron distinto" icon={TrendingDown}
          value={bultos.length === 0 ? null : conDiferencia}
          nota={bultos.length === 0 ? 'Todavía no hay pedidos por correo para comparar.' : undefined} />
      </div>

      {bultos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay pedidos con forma de entrega «correo o transporte».
        </p>
      ) : (
        <div className="space-y-2">
          {bultos.map((b) => (
            <form key={b.order_id} action={(fd) => empezar(async () => {
              const r = await registrarCostoDeEnvio(fd)
              if (r?.error) toast.error(r.error); else toast.success('Guardado')
            })} className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
              <input type="hidden" name="order_id" value={b.order_id} />
              <div className="min-w-[150px] flex-1">
                <div className="text-sm font-medium">{b.codigo}</div>
                <div className="text-xs text-muted-foreground">
                  {b.renglones} renglones · {Number(b.unidades)} unidades
                </div>
              </div>
              <div className="min-w-[150px]">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Peso del bulto</div>
                {b.peso_gramos === null ? (
                  <div className="text-xs leading-snug text-muted-foreground">
                    Sin datos todavía: {b.por_que_no_se_sabe}.
                  </div>
                ) : (
                  <div className="text-sm font-semibold tabular-nums">
                    {(Number(b.peso_gramos) / 1000).toFixed(2)} kg
                    <span className="ml-1 text-xs font-normal text-muted-foreground">estimado</span>
                  </div>
                )}
              </div>
              <div className="min-w-[110px]">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cobrado</div>
                <div className="text-sm tabular-nums">
                  {b.envio_cobrado === null ? '—' : formatARS(Number(b.envio_cobrado))}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Lo que cobró el transporte
                </Label>
                <Input name="envio_costo_real" type="number" placeholder="sin factura todavía"
                  defaultValue={b.envio_costo_real ?? ''} className="w-40" />
              </div>
              <div className="min-w-[160px] flex-1 space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Por qué difiere</Label>
                <Input name="envio_costo_motivo" placeholder="pesó más, zona distinta…" />
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={pendiente}>Guardar</Button>
            </form>
          ))}
        </div>
      )}
    </div>
  )
}
