-- ════════════════════════════════════════════════════════════════════════════
-- v1.5 · B · UNA FUNCIÓN CON `FROM` NO SE INLINEA
--
-- `canal_queda_por_unidad` nació buscando el canal adentro, con un LEFT JOIN
-- contra `canales_venta`. Para las 1.790 filas de los apagados no se nota;
-- `canal_producto_no_conviene` la llama 49.576 veces y el planner dejó de
-- inlinearla: `canceling statement due to statement timeout`.
--
-- Esta migración la volvió PURA —recibe los tres parámetros del canal y los
-- dos del producto, no toca ninguna tabla, `immutable parallel safe`— y
-- reescribió a los dos que la usan para que busquen el canal ellos. Los dos ya
-- lo tenían en su propio CTE.
--
-- **No alcanzó.** Devolvía jsonb, y leer cinco campos del jsonb volvía a
-- evaluar la función cinco veces por fila: 10,8 segundos, todavía por encima
-- del tope de 8 que corta PostgREST. La corrección que sí funcionó está en
-- 0283, que cambia el tipo de retorno a un registro y la llama con
-- `cross join lateral`.
--
-- Queda anotada porque el error vale: una función SQL con `FROM` adentro puede
-- parecer idéntica a la expresión que reemplaza y no serlo, y la diferencia
-- recién aparece cuando algo la llama cincuenta mil veces. El cuerpo final de
-- las tres funciones vive en 0283 — acá sólo está lo que esta migración
-- intentó.
-- ════════════════════════════════════════════════════════════════════════════

-- El paso intermedio: pura, pero devolviendo jsonb. Superada por 0283.
drop function if exists public.canal_queda_por_unidad(text, numeric, numeric);

create or replace function public.canal_queda_por_unidad(
  p_comision_pct numeric,
  p_recargo_pct numeric,
  p_costo_envio_del_negocio numeric,
  p_mostrador numeric,
  p_costo numeric
) returns jsonb
language sql immutable parallel safe
as $$
  select case
    when p_mostrador is null or p_costo is null or p_comision_pct is null then
      jsonb_build_object(
        'se_puede', false,
        'por_que_no', case
          when p_costo is null then 'el producto no tiene costo cargado: sin costo no hay margen que calcular'
          when p_mostrador is null then 'el producto no tiene precio sugerido en el maestro'
          else 'el canal no existe o no está activo' end)
    else jsonb_build_object(
      'se_puede', true,
      'precio_en_el_canal', round(p_mostrador * (1 + coalesce(p_recargo_pct, 0) / 100.0), 2),
      'queda_para_el_negocio', round(
        p_mostrador * (1 + coalesce(p_recargo_pct, 0) / 100.0) * (1 - p_comision_pct / 100.0)
        - p_costo - coalesce(p_costo_envio_del_negocio, 0), 2),
      'resultado_mostrador', round(p_mostrador - p_costo, 2),
      'diferencia', round(
        (p_mostrador * (1 + coalesce(p_recargo_pct, 0) / 100.0) * (1 - p_comision_pct / 100.0)
         - p_costo - coalesce(p_costo_envio_del_negocio, 0))
        - (p_mostrador - p_costo), 2))
  end;
$$;

revoke all on function public.canal_queda_por_unidad(numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;
