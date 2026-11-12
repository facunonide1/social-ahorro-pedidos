/**
 * La home de /admin a veces recibe null: la vista `decisiones_pendientes`
 * falla (timeout) y PostgREST devuelve `data: null`. Filtrar eso tira
 * "Cannot read properties of null (reading 'filter')".
 */
export function normalizarListas<A, D>(
  equipo: readonly A[] | null | undefined,
  decisiones: readonly D[] | null | undefined,
): { equipo: A[]; decisiones: D[] } {
  return {
    equipo: [...(equipo ?? [])],
    decisiones: [...(decisiones ?? [])],
  }
}
