import { requireAdminHubAccess } from '@/lib/admin-hub/auth'
import { createClient } from '@/lib/supabase/server'
import { formatARS } from '@/lib/utils/format'
import { PageHeader } from '@/components/shared/page-header'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Bitácora de decisiones' }

/**
 * C.5 · LA BITÁCORA.
 *
 * Qué propuso cada agente, quién decidió y qué eligió.
 *
 * ── POR QUÉ ESTA PANTALLA NO ES UN ADORNO ───────────────────────────────────
 *
 * Es lo único que puede llenar el marcador de aciertos. Un agente que propone
 * y nadie registra qué pasó nunca va a poder decir si acierta: el marcador va
 * a decir «sin antecedentes» para siempre, y la capa de dirección no se va a
 * poder evaluar nunca.
 *
 * Por eso guarda tres cosas separadas: lo que el agente dijo que iba a pasar
 * (`esperado`), lo que la persona decidió, y lo que pasó después
 * (`resultado`). Comparar la primera con la tercera es lo único que permite
 * decir si el agente tenía razón.
 */
export default async function BitacoraPage() {
  await requireAdminHubAccess({})
  const sb = createClient()

  // La RLS la filtra por sucursal: un encargado ve las suyas (C.6).
  const { data: filas } = await sb
    .from('agente_bitacora')
    .select('*')
    .order('propuesta_at', { ascending: false })
    .limit(200)

  const b = (filas ?? []) as any[]
  const decididas = b.filter((x) => x.decidio_at)
  const medidas = b.filter((x) => x.acerto !== null)

  return (
    <>
      <PageHeader
        title="Bitácora de decisiones"
        description="Qué propuso cada agente, quién decidió y qué eligió. Es lo que después llena el marcador."
        breadcrumbs={[{ label: 'Decisiones' }]}
      />
      <div className="space-y-4 p-4 md:p-6">
        <div className="grid grid-cols-3 gap-3">
          <Dato n={b.length} t="propuestas" />
          <Dato n={decididas.length} t="decididas" />
          <Dato n={medidas.length} t="medidas" nota={medidas.length === 0 ? 'todavía ninguna' : undefined} />
        </div>

        {!b.length ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm font-medium">Todavía no se decidió nada.</p>
            <p className="mx-auto mt-1 max-w-xl text-xs leading-snug text-muted-foreground">
              Por eso los agentes dicen «sin antecedentes». No es un error ni un dato que falte
              cargar: es que nadie aceptó ni rechazó una propuesta todavía. En cuanto alguien
              decida desde la pantalla de inicio, aparece acá — y el marcador deja de estar vacío.
            </p>
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {b.map((x) => (
              <div key={x.id} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{x.agente}</Badge>
                  <span className="font-medium">{x.propuso}</span>
                  <Badge variant={x.estado === 'aceptada' ? 'default' : 'outline'}
                    className="ml-auto text-[10px]">{x.estado}</Badge>
                </div>
                {x.por_que && <p className="text-xs leading-snug text-muted-foreground">{x.por_que}</p>}
                <div className="text-xs text-muted-foreground">
                  {x.costo_por_dia != null
                    ? <>Costaba {formatARS(Number(x.costo_por_dia))} por día. </>
                    : <>Sin costo calculable. </>}
                  {x.decidio_at
                    ? <>Decidido el {new Date(x.decidio_at).toLocaleString('es-AR')}: «{x.decidio_que}».</>
                    : <>Sin decidir.</>}
                  {' '}
                  {x.acerto === null
                    ? <b>Todavía no se midió si acertó.</b>
                    : x.acerto ? <b>Acertó.</b> : <b>No dio el resultado calculado.</b>}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs leading-snug text-muted-foreground">
          «Todavía no se midió» no es «no acertó»: son dos cosas distintas y el sistema no las
          mezcla. Medir el resultado de una decisión necesita que pase el tiempo y que haya un
          archivo nuevo con qué compararla.
        </p>
      </div>
    </>
  )
}

function Dato({ n, t, nota }: { n: number; t: string; nota?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-2xl font-semibold tabular-nums">{n.toLocaleString('es-AR')}</div>
      <div className="text-xs text-muted-foreground">{t}</div>
      {nota && <div className="mt-0.5 text-[10px] text-muted-foreground">{nota}</div>}
    </div>
  )
}
