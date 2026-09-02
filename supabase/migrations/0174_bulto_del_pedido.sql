-- 0174 · v0.91-pedidos · BLOQUE D.4
--
-- EL BULTO, PARA PODER COTIZAR UN ENVÍO POR CORREO.
--
-- Suma el peso de los productos del pedido por su cantidad. Si **alguno** no
-- tiene peso cargado, el total es `null` con el motivo: un bulto a medio pesar no
-- sirve para cotizar, y un peso de menos hace que el transporte cobre más de lo
-- que se le cobró al cliente.
--
-- Y los pesos son ESTIMADOS —vienen de WooCommerce, ninguno está pesado—. Por eso
-- el pedido tiene `envio_costo_real`: cuando el transporte pesa el bulto y cobra
-- distinto, se registra y se compara. Ya pasó.
create or replace view pedido_bulto as
  select o.id as order_id,
         o.codigo,
         o.forma_entrega,
         o.envio_cobrado,
         o.envio_costo_real,
         b.renglones,
         b.unidades,
         b.peso_gramos,
         b.sin_peso,
         case
           when b.renglones = 0 then 'el pedido no tiene renglones'
           when b.sin_peso > 0 then b.sin_peso || ' productos del pedido no tienen peso cargado'
           else null
         end as por_que_no_se_sabe
    from orders o
    left join lateral (
      select count(*)::int                                   as renglones,
             coalesce(sum((i->>'qty')::numeric), 0)          as unidades,
             case when count(*) filter (where p.peso_gramos is null) > 0 then null
                  else sum(p.peso_gramos * (i->>'qty')::numeric) end as peso_gramos,
             count(*) filter (where p.peso_gramos is null)::int as sin_peso
        from jsonb_array_elements(o.items) i
        left join productos_catalogo p on p.id = nullif(i->>'producto_id','')::uuid
    ) b on true;

alter view pedido_bulto set (security_invoker = true);
