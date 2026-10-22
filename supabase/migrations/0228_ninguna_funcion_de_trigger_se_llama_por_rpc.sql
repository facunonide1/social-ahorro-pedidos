-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0228 · NINGUNA FUNCIÓN DE TRIGGER SE LLAMA POR RPC                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Es la **sexta vez** en este proyecto que una función nueva queda ejecutable
-- por `anon` porque `create or replace function` la crea con EXECUTE para
-- PUBLIC y el revoke se olvidó.
--
-- Las anteriores: `caja_controlar`, `puede_completar_tarea`,
-- `rls_escrituras_que_dan_lectura`, `tg_agente_config_constitucion`,
-- `tg_convenio_historico` y ahora `tg_demanda_invisible_norm`.
--
-- **Cuatro de las seis son funciones de TRIGGER**, que no se llaman por RPC
-- nunca. Eso es un patrón, y un patrón que se repite seis veces no se arregla
-- acordándose: se arregla con un chequeo.
--
-- ── LO QUE HACE ESTA MIGRACIÓN ──────────────────────────────────────────────
--
-- 1 · cierra la que está abierta;
-- 2 · cierra TODAS las funciones de trigger del esquema, de una;
-- 3 · deja una función que el build consulta para que no vuelva a pasar.

revoke all on function public.tg_demanda_invisible_norm() from public, anon, authenticated;

-- Y todas las demás, por si alguna otra quedó abierta sin que se note.
do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure as f
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace and ns.nspname = 'public'
     where p.prorettype = 'trigger'::regtype
       and (has_function_privilege('anon', p.oid, 'execute')
            or has_function_privilege('authenticated', p.oid, 'execute'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.f);
    n := n + 1;
  end loop;
  raise notice 'se cerraron % funciones de trigger', n;
end $$;

-- ── Y EL CHEQUEO ────────────────────────────────────────────────────────────
--
-- Una función de trigger la llama Postgres cuando se dispara el trigger. Que
-- sea ejecutable por `authenticated` significa que cualquiera puede invocarla
-- por `/rest/v1/rpc/` con los argumentos que quiera — y son SECURITY DEFINER,
-- así que corre con los permisos del dueño de la base.
--
-- No hay un caso donde eso sea lo que se quiso.

create or replace function public.triggers_ejecutables_por_rpc()
returns table (funcion text, quien text)
language sql stable security definer set search_path to 'public'
as $$
  select p.oid::regprocedure::text,
         case
           when has_function_privilege('anon', p.oid, 'execute')
                and has_function_privilege('authenticated', p.oid, 'execute')
             then 'anon y authenticated'
           when has_function_privilege('anon', p.oid, 'execute') then 'anon'
           else 'authenticated'
         end
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace and ns.nspname = 'public'
   where p.prorettype = 'trigger'::regtype
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'));
$$;

comment on function public.triggers_ejecutables_por_rpc() is
  'Funciones de trigger que se pueden llamar por RPC. Tiene que devolver cero filas: una funcion de trigger la llama Postgres, no una persona, y son SECURITY DEFINER. Es la sexta vez que pasa — ahora lo corre el build.';

revoke all on function public.triggers_ejecutables_por_rpc() from public, anon, authenticated;
grant execute on function public.triggers_ejecutables_por_rpc() to service_role;
