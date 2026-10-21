-- 0194 · v0.96-sucursales · CIERRE · aplicada vía MCP
--
-- DOS COSAS QUE ESTA VERSIÓN DEJÓ ABIERTAS.
--
-- Las encontró el linter de Supabase después de aplicar los cinco bloques. Las
-- dos son mías y ninguna habría fallado: una devuelve cero y la otra deja una
-- puerta.
--
-- ── 1 · `producto_ventas_sucursal` CON RLS Y SIN POLÍTICA ────────────────────
--
-- La tabla se creó sin declarar RLS y el event trigger del proyecto
-- (`rls_auto_enable`) se la prendió solo, que es lo correcto. Pero sin política,
-- RLS prendida quiere decir que NADIE lee — y todas las vistas que la usan son
-- `security_invoker`, así que con la sesión de un usuario real
-- `demanda_por_sucursal` devolvía cero filas.
--
-- Consecuencia: los quiebres, las transferencias y los dormidos se veían
-- VACÍOS para cualquiera que no sea service_role. Vacíos, no en error. Cero
-- quiebres se lee como «no hay quiebres»: el cero falso de siempre, esta vez
-- producido por una tabla que creé en el bloque A y probé con service_role.
--
-- Probado después con un usuario de rol comprador: 30.127 filas de ventas,
-- 2.765 quiebres, 2.909 pares para transferir, 693 mal repartidos.

create policy producto_ventas_sucursal_lee on public.producto_ventas_sucursal
  for select using ((select public.hub_puede_ver('operaciones')));

-- ── 2 · LAS FUNCIONES QUE REESCRIBEN EL STOCK, LLAMABLES POR CUALQUIERA ─────
--
-- `revoke execute ... from anon, authenticated` no alcanza: Postgres le da
-- EXECUTE a PUBLIC por defecto en cada función nueva, y `anon` y `authenticated`
-- heredan de ahí. Hay que quitárselo a PUBLIC.
--
-- `sifaco_aplicar_sucursales` reescribe el stock de las cuatro sucursales, las
-- ventas de cuatro meses y la condición de venta del catálogo. Cualquier usuario
-- con sesión podía llamarla por `/rest/v1/rpc/`. La ruta de API que la usa va
-- con el cliente de servicio: no necesita este permiso.
--
-- Verificado después: un comprador recibe 42501 al intentarlo.

revoke execute on function public.sifaco_aplicar_sucursales(uuid) from public;
revoke execute on function public.sifaco_cerrar_lo_que_sifaco_cerro(uuid) from public;

-- Estas dos SÍ las llaman las pantallas con la sesión del usuario, así que
-- `authenticated` las conserva. Lo que se les quita es `anon`: sin sesión no hay
-- nada que preguntar acá.
revoke execute on function public.maestro_estado() from public;
grant execute on function public.maestro_estado() to authenticated, service_role;

revoke execute on function public.despacho_sugerido(uuid, numeric) from public;
grant execute on function public.despacho_sugerido(uuid, numeric) to authenticated, service_role;
