/**
 * LAS BANDERAS DE NORA, EN UN SOLO LUGAR.
 *
 * Lo nuevo entra apagado. Una bandera se prende sólo con el valor exacto
 * `'true'` en su variable de entorno: vacío, `'1'` o `'yes'` la dejan apagada.
 * Es el mismo criterio que ya usaba la ingesta de Drive (`lib/drive/flag.ts`),
 * que sigue leyendo su variable como antes y queda registrada acá para que la
 * lista esté completa.
 *
 * Prender una bandera en producción es cambiar una variable en Vercel: lo hace
 * Facu, no un agente (docs/pendientes-humanos.md).
 *
 * Sólo servidor: las variables sin NEXT_PUBLIC_ no llegan al navegador. Una
 * pantalla que necesite saberlo lo recibe como prop desde su página.
 */

export interface Bandera {
  /** La variable de entorno que la prende. */
  env: string
  /** Qué cambia cuando se prende. */
  que_hace: string
  /** Ítem del backlog. */
  item: string
}

export const BANDERAS = {
  ingesta_drive: {
    env: 'DRIVE_INGESTA_ENABLED',
    que_hace: 'El cron de Drive baja y procesa archivos. Apagada, contesta 200 sin tocar nada.',
    item: 'B',
  },
  maestro_por_sucursal: {
    env: 'NORA_MAESTRO_POR_SUCURSAL',
    que_hace: 'En /admin/operaciones/sifaco aparece «Aplicar a esta sucursal» y «Deshacer» para el maestro.',
    item: 'C2',
  },
  fuente_find: {
    env: 'NORA_FUENTE_FIND',
    que_hace: 'La ingesta lee de FIND en vez de (o además de) Drive.',
    item: 'H2',
  },
  pantallas_en_construccion: {
    env: 'NORA_MOSTRAR_EN_CONSTRUCCION',
    que_hace: 'Se ven las entradas «Próximamente» / «En construcción» del menú. Apagada, no se muestran.',
    item: 'I2',
  },
} as const satisfies Record<string, Bandera>

export type NombreBandera = keyof typeof BANDERAS

/** ¿Está prendida? Sólo con el valor exacto `'true'`. */
export function bandera(nombre: NombreBandera, env: Record<string, string | undefined> = process.env): boolean {
  return env[BANDERAS[nombre].env] === 'true'
}

/** Todas, con su estado. Para una pantalla de diagnóstico o el log de arranque. */
export function estadoDeBanderas(env: Record<string, string | undefined> = process.env) {
  return (Object.keys(BANDERAS) as NombreBandera[]).map((n) => ({ nombre: n, ...BANDERAS[n], prendida: bandera(n, env) }))
}
