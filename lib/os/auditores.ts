/**
 * LOS CUATRO AUDITORES, DECLARADOS.
 *
 * Corren en cada `npm run build` y el build falla si alguno encuentra algo
 * nuevo sin aceptar. Están acá para poder mostrarlos en pantalla: un mecanismo
 * de seguridad que nadie ve es un mecanismo que nadie sabe si sigue puesto.
 */

export interface Auditor {
  id: string
  nombre: string
  comando: string
  /** Qué verifica, en una frase. */
  verifica: string
  /** Qué pasó la vez que faltó. Es lo que explica por qué existe. */
  porQueExiste: string
  archivo: string
}

export const AUDITORES: Auditor[] = [
  {
    id: 'cortes',
    nombre: 'Cortes de consulta',
    comando: 'npm run auditar:cortes',
    verifica: 'Consultas que pueden traer más de 1000 filas sin paginar ni contar en la base.',
    porQueExiste:
      'PostgREST corta en 1000 y no avisa. Mintió cuatro veces: «4.836 productos no cruzan» (eran 3), «1000 de 1000 productos» con 46.009 cargados, y dos más.',
    archivo: 'scripts/auditar-cortes.mjs',
  },
  {
    id: 'lente',
    nombre: 'Lente de demostración',
    comando: 'npm run auditar:lente',
    verifica: 'Pantallas que leen tablas con datos de demostración sin filtrarlos ni aclararlo.',
    porQueExiste:
      'El panel de Operaciones decía «56 quiebres» leyendo 480 filas inventadas, y NORA escribía un párrafo afirmándolo.',
    archivo: 'scripts/auditar-lente.mjs',
  },
  {
    id: 'rls',
    nombre: 'Tablas ciegas',
    comando: 'npm run auditar:rls',
    verifica: 'Tablas con RLS activa y sin política que igual lee una pantalla: el dato está y nadie lo ve.',
    porQueExiste:
      'La ficha de una oferta mostraba la oferta sin sus productos. Cero filas suman cero, sin ningún error.',
    archivo: 'scripts/auditar-rls.mjs',
  },
  {
    id: 'permisos',
    nombre: 'Permisos de NORA',
    comando: 'npm run probar:permisos',
    verifica: 'Que cada rol reciba sólo las herramientas que puede ejecutar, y que las negativas se expliquen.',
    porQueExiste:
      'NORA recibía las 30 herramientas sin importar el rol: el mostrador podía pedirle el flujo de caja.',
    archivo: 'scripts/probar-permisos-nora.ts',
  },
]
