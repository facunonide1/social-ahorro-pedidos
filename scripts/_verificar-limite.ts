/**
 * LA REGLA DE ORO 9 Y EL LIMITE DEL MOSTRADOR, VERIFICADOS EN EL BUILD.
 *
 * ── POR QUÉ ESTO EXISTE ─────────────────────────────────────────────────────
 *
 * NORA no registra al paciente, ni al médico, ni el contenido de la receta.
 * Es la constitución del sistema, no una preferencia.
 *
 * Y es la clase de regla que se rompe sin querer: la próxima persona que
 * trabaje en obras sociales va a necesitar «sólo el apellido, para poder
 * cruzar». Va a parecer razonable. Entonces no alcanza con haberlo escrito en
 * un comentario: se le pregunta al catálogo de Postgres y, si aparece una
 * columna así, el build se rompe.
 *
 * ── Y EL SEGUNDO CHEQUEO ────────────────────────────────────────────────────
 *
 * Que no haya forma de borrar un débito. Un débito es lo que la obra social te
 * sacó; borrarlo es taparlo, y la plata que se pierde es justamente la que
 * nadie cuenta. Se cierran como `perdido`, con el motivo.
 */
import { createClient } from '@supabase/supabase-js'

function env(n: string): string {
  const v = process.env[n]
  if (!v) throw new Error(`Falta ${n}`)
  return v
}

const adm = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

async function main() {
  let fallas = 0

  const { data: cols, error: e1 } = await adm.rpc('convenios_columnas_prohibidas')
  if (e1) throw new Error(`no se pudo revisar las columnas: ${e1.message}`)
  const prohibidas = (cols ?? []) as { tabla: string; columna: string; por_que: string }[]
  if (!prohibidas.length) {
    console.log('  ok    ninguna tabla convenio* tiene columna de paciente, médico, afiliado ni diagnóstico')
  } else {
    fallas += prohibidas.length
    for (const c of prohibidas) {
      console.log(`  FALLA ${c.tabla}.${c.columna}`)
      console.log(`        ${c.por_que}.`)
      console.log('        Una presentación es un hecho administrativo: número, fecha, obra social,')
      console.log('        sucursal e importe. Qué le recetaron a quién es terreno clínico y no entra')
      console.log('        al sistema, ni de paso. Si hace falta para «completar el circuito», no hace')
      console.log('        falta.')
    }
  }

  // v1.2 · El mismo chequeo, sobre el mostrador. «El sistema ayuda con el
  // producto. No ayuda con el tratamiento», y nunca guarda paciente,
  // diagnóstico, síntoma ni el motivo por el que alguien compra algo.
  //
  // Es la clase de regla que se rompe con buena intención: la frase que la
  // rompe —«para mejorar la sugerencia»— está escrita en el propio prompt.
  const { data: mos, error: eM } = await adm.rpc('mostrador_columnas_prohibidas')
  if (eM) throw new Error(`no se pudo revisar el mostrador: ${eM.message}`)
  const mostrador = (mos ?? []) as { tabla: string; columna: string; por_que: string }[]
  if (!mostrador.length) {
    console.log('  ok    ninguna tabla del mostrador guarda paciente, síntoma ni diagnóstico')
  } else {
    fallas += mostrador.length
    for (const c of mostrador) {
      console.log(`  FALLA ${c.tabla}.${c.columna}`)
      console.log(`        ${c.por_que}.`)
      console.log('        El mostrador contesta sobre el PRODUCTO. Si el empleado le pregunta a')
      console.log('        una pantalla qué darle a alguien, el responsable dejó de ser una')
      console.log('        persona. Y si hace falta «para mejorar la sugerencia», no hace falta.')
    }
  }

  // v1.2 · Y el patrón que se repitió seis veces: una función de trigger que
  // queda ejecutable por RPC porque `create or replace function` la crea con
  // EXECUTE para PUBLIC y el revoke se olvidó.
  //
  // Son SECURITY DEFINER: invocarlas por `/rest/v1/rpc/` las corre con los
  // permisos del dueño de la base. No hay un caso donde eso sea lo que se
  // quiso.
  const { data: trg, error: eT } = await adm.rpc('triggers_ejecutables_por_rpc')
  if (eT) throw new Error(`no se pudieron revisar los triggers: ${eT.message}`)
  const abiertos = (trg ?? []) as { funcion: string; quien: string }[]
  if (!abiertos.length) {
    console.log('  ok    ninguna función de trigger se puede llamar por RPC')
  } else {
    fallas += abiertos.length
    for (const t of abiertos) {
      console.log(`  FALLA ${t.funcion} la puede ejecutar ${t.quien}`)
      console.log('        Una función de trigger la llama Postgres, no una persona, y es SECURITY')
      console.log('        DEFINER. Agregá: revoke all on function … from public, anon, authenticated;')
    }
  }

  const { data: pols, error: e2 } = await adm.rpc('convenios_politicas_de_borrado')
  if (e2) throw new Error(`no se pudieron revisar las políticas: ${e2.message}`)
  const borrado = (pols ?? []) as { tabla: string; politica: string }[]
  if (!borrado.length) {
    console.log('  ok    no hay forma de borrar un débito ni el histórico de un convenio')
  } else {
    fallas += borrado.length
    for (const p of borrado) {
      console.log(`  FALLA la política ${p.politica} permite borrar filas de ${p.tabla}`)
      console.log('        Un débito es lo que la obra social te sacó: borrarlo es taparlo, y la plata')
      console.log('        que se pierde es la que nadie cuenta. Se cierra como «perdido», con el motivo.')
    }
  }

  console.log(fallas === 0 ? '\nTODO BIEN' : `\nFALLA · ${fallas} cosa(s) que violan el límite del sector`)
  if (fallas > 0) process.exit(1)
}

main().catch((e) => {
  console.error('FALLA · la verificación del límite no pudo correr:', e?.message ?? e)
  process.exit(1)
})
