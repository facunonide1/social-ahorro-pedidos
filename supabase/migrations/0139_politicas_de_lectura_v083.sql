-- 0139 · Las tablas de v0.83/v0.84 eran invisibles para la aplicación (v0.86)
--
-- ── EL SÍNTOMA ─────────────────────────────────────────────────────────────
--
-- La pantalla de stock decía «0 unidades es el stock TOTAL que declara SIFACO»
-- y «Valor de stock: $0», con 46.009 productos y 23.410 costos cargados.
--
-- ── LA CAUSA ───────────────────────────────────────────────────────────────
--
-- Siete tablas creadas en v0.83 y v0.84 tenían RLS activa y CERO políticas:
--
--   producto_stock_sifaco · producto_ventas_mensuales · producto_codigos_barras
--   proveedor_producto · producto_promedios_sifaco · anomalias · ofertas_sifaco
--
-- RLS activa sin políticas no es «acceso restringido»: es **nadie ve nada**,
-- salvo `service_role`. Los scripts de carga usan service_role y veían todo, así
-- que la carga se verificó bien. Las pantallas usan la sesión del usuario y
-- veían cero.
--
-- No fallaba: devolvía cero filas, y cero filas suman cero. Exactamente el
-- error que estas últimas sesiones vinieron a sacar, cometido por mí mismo al
-- crear las tablas.
--
-- ── Y EL LINTER LO DIJO ────────────────────────────────────────────────────
--
-- El advisor «RLS Enabled No Policy» apareció en v0.81, v0.83 y v0.84, y las
-- tres veces lo leí como estado seguro. Para una tabla que sólo toca el
-- importador, lo es. Para una que lee la aplicación, significa que el dato está
-- y no se ve. La diferencia no está en el advisor: está en quién la lee.

do $$
declare t text;
begin
  foreach t in array array[
    'producto_stock_sifaco', 'producto_ventas_mensuales', 'producto_codigos_barras',
    'proveedor_producto', 'producto_promedios_sifaco', 'anomalias', 'ofertas_sifaco',
    'sifaco_forma_descuento', 'sifaco_condicion_venta', 'sifaco_nivel_control',
    'sifaco_depto_categoria', 'sifaco_sucursales', 'sifaco_importaciones'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format($f$
      create policy %I on public.%I for select
      using (exists (select 1 from public.users_admin ua
                      where ua.id = auth.uid() and ua.activo))
    $f$, t || '_read', t);
  end loop;
end $$;

drop policy if exists anomalias_write on public.anomalias;
create policy anomalias_write on public.anomalias for update
  using (exists (select 1 from public.users_admin ua
                  where ua.id = auth.uid() and ua.activo
                    and ua.rol in ('super_admin','gerente','comprador','administrativo')));
