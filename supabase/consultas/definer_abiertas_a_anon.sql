-- FUNCIONES SECURITY DEFINER QUE anon PUEDE EJECUTAR · SÓLO LECTURA.
--
-- Los advisors marcan 9. Una SECURITY DEFINER corre con los permisos de su
-- dueño; si anon la ejecuta, cualquiera con la URL y la anon key (que está en
-- el navegador) la llama por /rest/v1/rpc.
--
-- Por cada una devuelve el revoke, su rollback y, lo más importante antes de
-- firmar, en qué políticas RLS aparece: si una política que anon evalúa usa la
-- función, quitarle EXECUTE cambia «cero filas» por «permission denied».
-- Con eso se arma la migración de F2 (no a ciegas).

with fn as (
  select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args,
         p.prorettype = 'trigger'::regtype as es_trigger
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute')
)
select
  fn.proname as funcion,
  fn.args,
  fn.es_trigger,
  coalesce((
    select string_agg(distinct pol.tablename || '.' || pol.policyname || ' (' || array_to_string(pol.roles, ',') || ')', '; ')
    from pg_policies pol
    where pol.schemaname = 'public'
      and (pol.qual ~ ('\m' || fn.proname || '\(') or pol.with_check ~ ('\m' || fn.proname || '\('))
  ), '') as usada_en_politicas,
  format('revoke execute on function public.%I(%s) from public, anon;', fn.proname, fn.args) as revocar,
  format('grant execute on function public.%I(%s) to anon;', fn.proname, fn.args) as rollback
from fn
order by (select count(*) from pg_policies pol where pol.qual ~ ('\m' || fn.proname || '\(')) desc, fn.proname;
