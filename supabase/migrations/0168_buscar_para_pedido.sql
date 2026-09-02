-- 0168 · v0.91-pedidos · BLOQUE B
--
-- BUSCAR PRODUCTOS PARA ARMAR UN PEDIDO, EN LA BASE.
--
-- ── POR QUÉ ES UNA FUNCIÓN Y NO UNA CONSULTA DESDE LA PANTALLA ──────────────
--
-- Son 46.009 productos. Traerlos al navegador para filtrar es exactamente lo que
-- docs/CONSULTAS-QUE-NO-MIENTEN.md prohíbe, y PostgREST corta en 1000 sin
-- avisar. Acá el filtro, el join con la condición de venta, el stock y la oferta
-- pasan una sola vez, en la base, y vuelven 25 filas.
--
-- ── LO QUE DEVUELVE Y POR QUÉ ───────────────────────────────────────────────
--
--   precio          El de SIFACO. NULL si SIFACO no lo declara — y null no es
--                   cero: cero sería «vale nada».
--   stock           El total de las cuatro sucursales. NO abierto por local:
--                   falta el archivo tabla3e completo.
--   se_puede_vender Regla de oro 9. Sale de `producto_condicion_efectiva`, que
--                   ya tiene en cuenta las excepciones firmadas de v0.90. Acá NO
--                   se reimplementa el criterio.
--   por_que         Por qué sí o por qué no. El buscador no esconde lo que no se
--                   puede vender: lo muestra y lo explica.
--   oferta_*        La oferta de SIFACO vigente, si hay. NORA no crea ni
--                   modifica ofertas acá: sólo aplica las que ya están.
create or replace function pedidos_buscar_productos(
  p_q text,
  p_limite int default 25
)
returns table (
  producto_id uuid,
  sku text,
  nombre text,
  laboratorio text,
  precio numeric,
  costo numeric,
  stock numeric,
  se_puede_vender boolean,
  condicion text,
  por_que text,
  oferta_precio numeric,
  oferta_descuento_pct numeric,
  oferta_hasta date
)
language sql stable security invoker
set search_path to 'public'
as $$
  with q as (select trim(coalesce(p_q, '')) as t)
  select p.id,
         p.sku,
         p.nombre,
         p.laboratorio,
         p.precio_sugerido,
         p.precio_costo_promedio,
         st.stock,
         ce.canal_abierto_efectivo,
         p.condicion_venta,
         ce.por_que,
         o.precio_con_descuento,
         o.descuento_efectivo_pct,
         o.hasta
    from productos_catalogo p
    join q on true
    left join producto_condicion_efectiva ce on ce.producto_id = p.id
    left join lateral (
      select sum(s.stock) as stock
        from producto_stock_sifaco s
       where s.producto_id = p.id
    ) st on true
    left join lateral (
      select os.precio_con_descuento, os.descuento_efectivo_pct, os.hasta
        from ofertas_sifaco os
       where os.producto_id = p.id
         and os.estado in ('vigente', 'sin_vencimiento')
         and (os.hasta is null or os.hasta >= current_date)
         and os.precio_con_descuento is not null
       order by os.descuento_efectivo_pct desc nulls last
       limit 1
    ) o on true
   where not p.es_demo
     and p.es_producto
     and p.activo
     and length(q.t) >= 2
     and (
       p.sku = q.t
       or p.nombre ilike '%' || q.t || '%'
       or exists (
            select 1 from producto_codigos_barras b
             where b.producto_id = p.id and b.codigo = q.t
          )
     )
   order by (p.sku = q.t) desc,
            (st.stock > 0) desc nulls last,
            p.nombre
   limit greatest(1, least(coalesce(p_limite, 25), 50));
$$;

comment on function pedidos_buscar_productos(text, int) is
  'Busca por nombre, SKU o código de barras EN LA BASE. Devuelve precio, stock consolidado, si se puede vender por canal (regla 9) y la oferta de SIFACO vigente.';
