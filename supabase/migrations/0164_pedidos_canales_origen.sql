-- 0164 · v0.91-pedidos · BLOQUE A
--
-- LOS CANALES QUE FALTABAN EN EL ENUM.
--
-- `order_origin` ya tenía woo, whatsapp, telefono, instagram y otro. Faltan los
-- dos que el negocio usa todos los días y no tenían dónde entrar: PedidosYa —que
-- hoy vive en su portal— y el mostrador.
--
-- Va en su propia migración porque un valor nuevo de enum no se puede USAR en la
-- misma transacción en que se agrega.
alter type order_origin add value if not exists 'pedidosya';
alter type order_origin add value if not exists 'mostrador';
