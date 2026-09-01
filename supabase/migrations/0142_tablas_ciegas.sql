-- 0142 · Nueve tablas ciegas más (v0.87)
--
-- Al censar las 203 tablas aparecieron veinte con RLS activa y cero políticas.
-- Diez son intencionales —sólo las toca un importador con `service_role`, o son
-- respaldos que no lee nadie— y quedan declaradas en scripts/rls-intencional.json.
--
-- Las otras nueve eran CIEGAS: el dato está y la pantalla no lo ve. Tres son de
-- compliance y están VACÍAS, que es el caso peor: el día que carguen el primer
-- recall no se iba a ver, y nadie sospecha de una pantalla que dice cero. En
-- terreno legal (regla de oro 9) eso es lo más grave que puede pasar.
--
-- La diferencia entre «intencional» y «ciega» no está en la tabla: está en
-- quién la lee. El advisor de Supabase marca las dos igual.

do $$
declare t text;
begin
  foreach t in array array[
    'compliance_recalls', 'compliance_documentos', 'compliance_despachos',
    'compliance_config', 'cobertura_config', 'demanda_invisible',
    'mostrador_destacados', 'ofertas_briefs', 'sifaco_import_lotes',
    'empleado_documentos'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format($f$
      create policy %I on public.%I for select
      using (exists (select 1 from public.users_admin ua
                      where ua.id = auth.uid() and ua.activo))
    $f$, t || '_read', t);
  end loop;
end $$;

drop policy if exists compliance_recalls_write on public.compliance_recalls;
create policy compliance_recalls_write on public.compliance_recalls for all
  using (exists (select 1 from public.users_admin ua
                  where ua.id = auth.uid() and ua.activo
                    and ua.rol in ('super_admin','gerente','administrativo')));

drop policy if exists compliance_documentos_write on public.compliance_documentos;
create policy compliance_documentos_write on public.compliance_documentos for all
  using (exists (select 1 from public.users_admin ua
                  where ua.id = auth.uid() and ua.activo
                    and ua.rol in ('super_admin','gerente','administrativo')));
