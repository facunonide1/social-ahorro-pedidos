import { createAdminClient } from '@/lib/supabase/server'

/**
 * LA GUARDA DE LOS CRONS QUE CALCULAN.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 *
 * En v0.80 se descubrió que el middleware mandaba todos los crons a /login y
 * que ninguno había corrido nunca. Al corregirlo, cuatro de ellos quedaron a
 * punto de arrancar a producir métricas, rotación, alertas y avisos sobre 7.620
 * ventas que no existen.
 *
 * Un número mal calculado que se muestra en pantalla se corrige cuando alguien
 * lo mira. Un número mal calculado que se GUARDA por fecha se queda: tres meses
 * después nadie sabe qué filas del histórico eran reales.
 *
 * ── LO QUE ESTA GUARDA NO ES ────────────────────────────────────────────────
 *
 * No es un interruptor general de automatizaciones —ese vive en la fábrica— ni
 * apaga el agendado. Es una condición: la declaración de qué fuentes mira cada
 * cron está en la tabla `crons_calculo`, y la evaluación corre en cada
 * ejecución. El día que las fuentes queden limpias, se encienden solos, sin que
 * nadie tenga que acordarse.
 *
 * Para forzar uno sin sesión de código:
 *   update crons_calculo set forzar_encendido = true where cron = 'metricas-stock';
 *
 * Para ver cómo quedó la última evaluación de cada uno:
 *   select cron, ultima_evaluacion, ultimo_resultado from crons_calculo;
 */

export interface Veredicto {
  puede: boolean
  motivo: string
}

/**
 * ¿Puede correr este cron?
 *
 * Ante un error de la base contesta que SÍ, con el motivo escrito. Es la misma
 * decisión que toma `automatizacionActiva`: una guarda que falla no debe
 * apagar el sistema en silencio, porque un cron que dejó de correr sin que
 * nadie se entere es indistinguible de uno que corre y no encuentra nada.
 */
export async function puedeCalcular(cron: string): Promise<Veredicto> {
  try {
    const adm = createAdminClient()
    const { data, error } = await adm
      .rpc('cron_calculo_puede_correr', { p_cron: cron })
      .maybeSingle<{ puede: boolean; motivo: string }>()

    if (error || !data) {
      return { puede: true, motivo: 'no se pudo evaluar la guarda: corre igual' }
    }
    return { puede: data.puede, motivo: data.motivo }
  } catch {
    return { puede: true, motivo: 'no se pudo evaluar la guarda: corre igual' }
  }
}
