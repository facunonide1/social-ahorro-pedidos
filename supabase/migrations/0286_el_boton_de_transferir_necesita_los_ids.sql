-- ════════════════════════════════════════════════════════════════════════════
-- v1.5 · D.4 · EL BOTÓN DE TRANSFERIR NECESITA LOS IDS
--
-- `sucursales_mal_repartido` devolvía los nombres de origen y destino, que
-- alcanzan para mostrar la fila y no alcanzan para armar la transferencia. Una
-- pantalla que muestra «mover 12 de Guzmán a Tesei» y no puede hacerlo es
-- exactamente el informe caro que esta sesión existe para no construir.
-- ════════════════════════════════════════════════════════════════════════════

drop function if exists public.sucursales_mal_repartido(integer);

create or replace function public.sucursales_mal_repartido(p_limite integer default 200)
returns table(
  producto_id uuid, sku text, nombre text,
  destino_id uuid, destino text, faltan_en_destino numeric,
  origen_id uuid, origen text, sobran_en_origen numeric,
  transferir numeric, plata_que_no_hay_que_gastar numeric,
  sin_costo boolean, el_origen_no_lo_vende boolean,
  de_cuantos_es_este integer, cuanta_plata_en_total numeric
)
language sql stable security definer set search_path to 'public'
as $$
  select t.producto_id, t.sku, t.nombre,
         t.destino_id, t.destino_nombre, t.faltan_en_destino,
         t.origen_id, t.origen_nombre, t.sobran_en_origen,
         t.transferir, t.plata_que_no_hay_que_gastar,
         t.sin_costo, t.el_origen_no_lo_vende,
         (select count(*)::integer from transferir_antes_de_comprar),
         (select round(coalesce(sum(plata_que_no_hay_que_gastar), 0))
            from transferir_antes_de_comprar)
    from transferir_antes_de_comprar t
   -- Por plata. Los que no tienen costo al final: no son «cero plata», son
   -- «no se sabe cuanta», y arriba taparian a los que si se pueden valuar.
   order by t.sin_costo asc,
            t.plata_que_no_hay_que_gastar desc nulls last
   limit p_limite;
$$;

comment on function public.sucursales_mal_repartido(integer) is
  'v1.5 · D.4 · lo que conviene mover antes de comprarlo, con los ids para poder armar la transferencia. Reusa transferir_antes_de_comprar de la v0.96.';

revoke all on function public.sucursales_mal_repartido(integer) from public, anon, authenticated;
