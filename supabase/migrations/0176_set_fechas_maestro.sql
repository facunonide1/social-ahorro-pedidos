-- 0176 · v0.92-deuda-cerrada · BLOQUE A
--
-- Escribe las cuatro fechas del maestro de a tandas. Las llama
-- `scripts/recuperar-fechas-del-maestro.ts`, que las lee del archivo: NO están
-- en staging porque se perdieron al importar (ver 0175).
--
-- Sólo completa nulos. Una fecha corregida a mano no se pisa.
create or replace function catalogo_set_fechas(p_filas jsonb)
returns integer
language sql volatile security invoker set search_path to 'public'
as $$
  with f as (
    select x->>'sku' as sku,
           nullif(x->>'ult_vta','')::date  as ult_vta,
           nullif(x->>'ult_cpa','')::date  as ult_cpa,
           nullif(x->>'fec_alta','')::date as fec_alta,
           nullif(x->>'fec_actu','')::date as fec_actu
      from jsonb_array_elements(p_filas) x
  ), u as (
    update productos_catalogo p
       set ult_venta          = coalesce(p.ult_venta, f.ult_vta),
           ult_compra         = coalesce(p.ult_compra, f.ult_cpa),
           fecha_alta         = coalesce(p.fecha_alta, f.fec_alta),
           precio_actualizado = coalesce(p.precio_actualizado, f.fec_actu),
           updated_at         = now()
      from f
     where p.sku = f.sku and not p.es_demo
    returning 1
  ) select count(*)::int from u;
$$;

comment on function catalogo_set_fechas(jsonb) is
  'Completa las cuatro fechas del maestro. Solo nulos: no pisa lo corregido a mano.';
