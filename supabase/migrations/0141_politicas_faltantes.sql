-- 0141 · Tres tablas más que la aplicación no podía ver (v0.86)
--
-- Al buscar el resto del mismo error quedaron doce tablas con RLS activa y sin
-- políticas. Nueve son de importadores y respaldos, que sólo toca el
-- `service_role`: ahí RLS sin políticas SÍ es el estado seguro.
--
-- Tres las lee la aplicación con la sesión del usuario, y estaban invisibles:
--
--   oferta_items (21)            la peor: la ficha de una oferta mostraba la
--                                oferta SIN sus productos. Una oferta vacía.
--   ofertas_exports_sifaco (3)
--   compliance_sops (1)
--
-- La regla que sale de esto: RLS sin políticas es correcto para una tabla que
-- sólo escribe un importador, y es un dato invisible para una que lee una
-- pantalla. El advisor no distingue: hay que mirar quién la lee.

do $$
declare t text;
begin
  foreach t in array array['oferta_items', 'ofertas_exports_sifaco', 'compliance_sops'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format($f$
      create policy %I on public.%I for select
      using (exists (select 1 from public.users_admin ua
                      where ua.id = auth.uid() and ua.activo))
    $f$, t || '_read', t);
  end loop;
end $$;

drop policy if exists oferta_items_write on public.oferta_items;
create policy oferta_items_write on public.oferta_items for all
  using (exists (select 1 from public.users_admin ua
                  where ua.id = auth.uid() and ua.activo
                    and ua.rol in ('super_admin','gerente','comprador','administrativo')));
