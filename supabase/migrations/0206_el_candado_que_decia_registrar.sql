-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0206 · EL CANDADO QUE DECÍA REGISTRAR Y NO REGISTRABA                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- E.5 de la v0.99 pedía verificar que ningún otro trigger tuviera el patrón
-- que se arregló en la v0.98: escribir el registro y después lanzar la
-- excepción que lo revierte.
--
-- Hay uno, y es el mismo. En la v0.98 se arregló la PUERTA
-- (`agente_definir_nivel`): devuelve el rechazo sin lanzar excepción, así el
-- intento queda escrito. La PARED —este trigger— quedó con el patrón viejo.
--
-- Probado, no supuesto. Se intentó la escritura directa que dispara el
-- candado y se contó antes y después:
--
--   antes=1 después=1 -> el registro SE PERDIÓ
--
-- Y el mensaje decía «El intento quedó registrado», que era falso.
--
-- No hay transacción autónoma en Postgres: una pared que rechaza no puede
-- dejar nada escrito. Entonces no lo promete. Lo que escribe el registro es la
-- puerta, que es por donde pasa la aplicación; la pared es para la escritura
-- directa a la tabla, y a esa se le dice la verdad.

create or replace function public.tg_agente_config_constitucion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if exists (select 1 from constitucion_acciones c where c.accion = new.accion) then
    -- NO se escribe nada acá. Un `raise exception` revierte la transacción
    -- entera, incluido cualquier registro que esta misma función hubiera
    -- insertado. Quien registra es `agente_definir_nivel`, que rechaza
    -- devolviendo ok=false en vez de lanzar.
    raise exception
      'La accion «%» esta protegida por la constitucion y no se puede asignar a ningun agente en ningun nivel. Esta escritura fue directa a la tabla: no queda registrada, porque el rechazo revierte todo. Para que el intento quede asentado, hacelo desde la pantalla de agentes.',
      new.accion;
  end if;
  return new;
end $function$;

-- ── Y QUE NO VUELVA ─────────────────────────────────────────────────────────
--
-- El patrón es fácil de reintroducir porque parece correcto al leerlo: la
-- línea que registra está ahí, arriba de la que rechaza. Esto lo busca en
-- todos los triggers vivos; lo corre el build con `verificar:coherencia`.

create or replace function public.triggers_que_registran_y_revierten()
returns table (
  funcion   text,
  tablas    text,
  por_que   text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select f.proname::text,
         string_agg(distinct c.relname, ', ')::text,
         'escribe un registro y despues lanza una excepcion: la excepcion revierte el registro'::text
    from pg_proc f
    join pg_namespace n on n.oid = f.pronamespace
    join pg_trigger t on t.tgfoid = f.oid and not t.tgisinternal
    join pg_class c on c.oid = t.tgrelid
   where n.nspname = 'public'
     and f.prorettype = 'trigger'::regtype
     and pg_get_functiondef(f.oid) ~* '\minsert\s+into\s+'
     and pg_get_functiondef(f.oid) ~* '\mraise\s+(exception|sqlstate)'
   group by f.proname;
$$;

comment on function public.triggers_que_registran_y_revierten() is
  'E.5 · Triggers que escriben un registro y despues lanzan la excepcion que '
  'lo revierte. Tiene que devolver cero filas. Lo corre el build.';

-- Los revokes, después del último `create or replace`: una función nueva nace
-- con EXECUTE para PUBLIC.
-- Sólo el service_role: lo corre el build. Una persona no tiene por qué poder
-- listar los triggers del sistema desde el navegador, y dejarlo abierto suma
-- un aviso de seguridad por nada.
revoke all on function public.triggers_que_registran_y_revierten() from public, anon, authenticated;
grant execute on function public.triggers_que_registran_y_revierten() to service_role;
