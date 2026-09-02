-- 0169 · v0.91-pedidos · BLOQUE B (lo usa el D)
--
-- CÓMO LLEGA, QUE NO ES LO MISMO QUE CUÁNDO.
--
-- `tipo_envio` ya existía con express / programado / retiro: eso mezcla urgencia
-- con forma de entrega. Se deja como está —urgencia— y se agrega la forma, que
-- es otra cosa: quién lo lleva.
--
--   reparto_propio  la moto de la casa, con zonas por sucursal
--   correo          transporte a todo el país, con peso y medidas
--   mercado_envios  declarado, SIN conectar
--   pedidosya       su repartidor retira del local; NORA no lo maneja
--   retiro_local    lo pasa a buscar el cliente
do $$ begin
  create type forma_entrega as enum
    ('reparto_propio', 'correo', 'mercado_envios', 'pedidosya', 'retiro_local');
exception when duplicate_object then null; end $$;

alter table orders add column if not exists forma_entrega forma_entrega;

comment on column orders.forma_entrega is
  'Quién lleva el pedido. Distinto de tipo_envio, que es la urgencia. Obligatorio al armar un pedido a mano.';

-- Los 21 pedidos que ya estaban: los de retiro son retiro, el resto reparto
-- propio, que es lo único que la casa hacía hasta ahora. No se inventa nada que
-- no estuviera dicho en `tipo_envio`.
update orders set forma_entrega =
  case when tipo_envio = 'retiro' then 'retiro_local'::forma_entrega
       else 'reparto_propio'::forma_entrega end
where forma_entrega is null;
