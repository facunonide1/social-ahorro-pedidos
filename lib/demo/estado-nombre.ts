/**
 * EL NOMBRE DE LA COOKIE, SOLO.
 *
 * Vive aparte de `estado.ts` porque ese archivo importa `next/headers` y no se
 * puede tocar desde un componente de cliente. El nombre lo necesitan los tres:
 * el que lee en el servidor, el que lee en el navegador y el que la escribe.
 *
 * Hasta v0.81 estaba escrito a mano en dos lugares.
 */
export const COOKIE_SIN_DEMO = 'nora_sin_demo'
