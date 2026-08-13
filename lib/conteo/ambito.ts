/**
 * EL ÁMBITO: contra qué se compara lo contado.
 *
 * Vive en su propio archivo, sin importar nada del servidor, porque lo usan las
 * dos puntas: el resolver del esperado y la pantalla que lo pregunta. Si viviera
 * en `esperado.ts` —que abre el cliente de administración— el importador se
 * llevaría código de servidor al navegador sólo para mostrar tres opciones.
 *
 * Y el texto sale de acá, del mismo lugar que la regla: la pantalla y el
 * cálculo no pueden decir cosas distintas sobre lo mismo.
 */

export type Ambito = 'total' | 'gondola' | 'deposito'

/**
 * Los tres ámbitos, con el nombre y la consecuencia de elegir cada uno.
 *
 * Vive acá, al lado del cálculo que los usa, para que la pantalla y el resolver
 * no puedan decir cosas distintas. Es el mismo criterio que la lista de
 * aspectos de la fábrica: el texto sale del lugar donde está la regla.
 */
export const AMBITOS: Ambito[] = ['gondola', 'deposito', 'total']

export const AMBITO_TEXTO: Record<Ambito, { titulo: string; corto: string; consecuencia: string }> = {
  gondola: {
    titulo: 'La góndola / el salón',
    corto: 'góndola',
    consecuencia:
      'Se compara contra lo que el sistema dice que hay EN GÓNDOLA. Lo que está en el depósito no entra en la cuenta.',
  },
  deposito: {
    titulo: 'El depósito',
    corto: 'depósito',
    consecuencia:
      'Se compara contra lo que el sistema dice que hay EN DEPÓSITO. Lo que está en el salón no entra en la cuenta.',
  },
  total: {
    titulo: 'Todo el punto: góndola + depósito',
    corto: 'todo el punto',
    consecuencia:
      'Se compara contra el total del punto. Sirve sólo si vas a contar las dos cosas: si contás nada más que la góndola, todo lo que está en el depósito va a aparecer como faltante.',
  },
}
