/**
 * ¿ESTO LO ESTÁ ESCRIBIENDO UNA PRUEBA?
 *
 * Va una sola variable de entorno, `FABRICA_PRUEBA=1`, que prenden los scripts
 * de prueba antes de escribir nada. Todo lo que la fábrica inserte mientras esté
 * prendida nace marcado.
 *
 * ── POR QUÉ AL CREAR Y NO AL TERMINAR ───────────────────────────────────────
 *
 * Porque las corridas que ensucian son las que se mueren a la mitad. Una prueba
 * que termina bien puede limpiar lo suyo con los ids que fue juntando; una que
 * se cae en el paso 3 nunca llega a esa línea, y lo que dejó no tiene forma de
 * distinguirse de un dato real. Ya pasó dos veces: los 14 eventos 'FALLBACK' de
 * v0.70 y las propuestas rechazadas de v0.74, que además bloquearon el cambio
 * real por la regla de dos rechazos con la misma huella.
 *
 * ── POR QUÉ UNA VARIABLE DE ENTORNO Y NO UN PARÁMETRO ───────────────────────
 *
 * Porque tendría que atravesar quince firmas —propuestas, escritor, procedencia,
 * verificador, lector— y cada una es una oportunidad de olvidarlo en una. La
 * variable la lee el punto de escritura, que es el único lugar donde importa.
 *
 * El default es `false` y la lectura es explícita: en producción la variable no
 * existe, así que nada queda marcado por accidente. El riesgo inverso —que una
 * prueba escriba sin marcar porque olvidó prender la variable— lo cubre
 * `scripts/fabrica-limpiar-pruebas.ts`, que busca huérfanos sin marca.
 */
export function enPrueba(): boolean {
  return process.env.FABRICA_PRUEBA === '1'
}

/**
 * Qué valores de `es_prueba` se ven.
 *
 * Se usa como `.in('es_prueba', artefactosVisibles())` en cada lectura que
 * alimenta un indicador. Va acá y no escrito a mano en cada `select` porque la
 * lista de lugares donde leer sería una segunda lista que hay que mover junto
 * con la de lugares donde escribir, y de esas ya hubo dos en v0.74.
 *
 * La regla en una línea: **en producción no se ven; adentro de una prueba, sí.**
 * Si una corrida no viera lo que ella misma acaba de escribir, no podría
 * verificar nada — y un test que no puede verse es peor que no tenerlo.
 *
 * Es `.in()` y no `.eq()` a propósito: la forma de la llamada no cambia entre
 * los dos casos, así que no hay una rama que sólo corra en producción.
 */
export function artefactosVisibles(): boolean[] {
  return enPrueba() ? [true, false] : [false]
}
