-- ============================================================================
-- 0060 · USUARIOS + PERMISOS — catálogo de roles base
-- ----------------------------------------------------------------------------
-- Extiende el enum admin_role con los roles reales del negocio. Aditivo y
-- conservador: NO toca los roles legacy (super_admin, gerente, comprador,
-- administrativo, tesoreria, auditor, sucursal) — se mapean a presets en
-- lib/types/permisos.ts y se documentan en docs/PERMISOS.md.
--
-- ADD VALUE va en su PROPIA migración (no se puede usar un valor de enum nuevo
-- en la misma transacción en que se agrega).
-- ============================================================================

do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='admin_role' and e.enumlabel='encargado_sucursal') then
    alter type public.admin_role add value 'encargado_sucursal';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='admin_role' and e.enumlabel='cajero') then
    alter type public.admin_role add value 'cajero';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='admin_role' and e.enumlabel='repartidor') then
    alter type public.admin_role add value 'repartidor';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='admin_role' and e.enumlabel='empleado_general') then
    alter type public.admin_role add value 'empleado_general';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='admin_role' and e.enumlabel='rrhh') then
    alter type public.admin_role add value 'rrhh';
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='admin_role' and e.enumlabel='marketing') then
    alter type public.admin_role add value 'marketing';
  end if;
end $$;
