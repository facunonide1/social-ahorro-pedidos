-- ════════════════════════════════════════════════════════════════════════════
-- v1.5-cerebro · E · LA VOZ, CON TOPE Y CON CACHÉ
--
-- ── E.4 · EL TOPE ───────────────────────────────────────────────────────────
--
-- ElevenLabs cobra por carácter. Si algo entra en bucle —un aviso que se
-- repite, una respuesta que se vuelve a pedir— se consume el crédito del mes
-- solo. El tope es por mes, en caracteres (que es lo que se cobra), y se
-- verifica ANTES de generar: `voz_gasto_reservar` suma y compara en la misma
-- transacción, así dos pedidos a la vez no pasan los dos por el mismo hueco.
--
-- Cuando se acerca (por defecto al 80%), la pantalla lo avisa. Cuando se
-- llega, no hay más audio: el texto sigue (E.7).
--
-- ── E.5 · LA CACHÉ ──────────────────────────────────────────────────────────
--
-- Lo que ya se dijo no se vuelve a generar. El audio se guarda en un bucket
-- privado con la huella del texto, la voz y el modelo. Un acierto de caché no
-- consume tope: no se le pidió nada a ElevenLabs.
--
-- Las políticas del bucket son del dueño: la ruta de voz lee y escribe con la
-- sesión, no con el cliente de servicio.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.voz_config (
  id                    boolean primary key default true check (id),
  tope_caracteres_mes   integer not null default 100000 check (tope_caracteres_mes >= 0),
  aviso_pct             integer not null default 80 check (aviso_pct between 1 and 100),
  definido_por          uuid references auth.users(id) on delete set null,
  definido_at           timestamptz not null default now()
);

insert into public.voz_config (id) values (true) on conflict (id) do nothing;

comment on table public.voz_config is
  'v1.5-cerebro · E.4 · el tope de gasto de ElevenLabs, en caracteres por mes. '
  '100.000 es el crédito mensual del plan Creator; se cambia desde el cerebro.';

create table if not exists public.voz_gasto (
  id          uuid primary key default gen_random_uuid(),
  mes         date not null,
  caracteres  integer not null check (caracteres > 0),
  huella      text not null,
  user_id     uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists voz_gasto_mes on public.voz_gasto (mes);

comment on table public.voz_gasto is
  'v1.5-cerebro · E.4 · cada pedido de audio a ElevenLabs, con los caracteres '
  'que cuesta. Los aciertos de caché no entran: no costaron nada.';

alter table public.voz_config enable row level security;
alter table public.voz_gasto enable row level security;

drop policy if exists voz_config_leer on public.voz_config;
create policy voz_config_leer on public.voz_config for select to authenticated
  using (exists (select 1 from public.users_admin u where u.id = auth.uid() and u.activo and u.rol = 'super_admin'));

drop policy if exists voz_gasto_leer on public.voz_gasto;
create policy voz_gasto_leer on public.voz_gasto for select to authenticated
  using (exists (select 1 from public.users_admin u where u.id = auth.uid() and u.activo and u.rol = 'super_admin'));

-- ── CUÁNTO VA DEL MES ───────────────────────────────────────────────────────

create or replace function public.voz_gasto_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_rol text;
  v_mes date := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_usados integer;
  c record;
begin
  select u.rol::text into v_rol from users_admin u where u.id = auth.uid() and u.activo;
  if v_rol is distinct from 'super_admin' then
    return jsonb_build_object('autorizado', false);
  end if;
  select * into c from voz_config where id;
  select coalesce(sum(caracteres), 0) into v_usados from voz_gasto where mes = v_mes;
  return jsonb_build_object(
    'autorizado', true, 'mes', v_mes, 'usados', v_usados,
    'tope', c.tope_caracteres_mes, 'aviso_pct', c.aviso_pct,
    'pct', case when c.tope_caracteres_mes > 0 then round(100.0 * v_usados / c.tope_caracteres_mes, 1) end,
    'cerca', v_usados >= c.tope_caracteres_mes * c.aviso_pct / 100.0,
    'agotado', v_usados >= c.tope_caracteres_mes);
end;
$$;

-- ── RESERVAR ANTES DE GENERAR ───────────────────────────────────────────────

create or replace function public.voz_gasto_reservar(p_caracteres integer, p_huella text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_rol text;
  v_mes date := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_usados integer;
  c record;
begin
  select u.rol::text into v_rol from users_admin u where u.id = auth.uid() and u.activo;
  if v_rol is distinct from 'super_admin' then
    return jsonb_build_object('ok', false, 'por_que', 'la voz es solo del dueño');
  end if;
  if p_caracteres is null or p_caracteres <= 0 then
    return jsonb_build_object('ok', false, 'por_que', 'no hay nada que decir');
  end if;

  -- Se bloquea la configuración para que dos pedidos simultáneos no lean el
  -- mismo saldo y pasen los dos.
  select * into c from voz_config where id for update;
  select coalesce(sum(caracteres), 0) into v_usados from voz_gasto where mes = v_mes;

  if v_usados + p_caracteres > c.tope_caracteres_mes then
    return jsonb_build_object('ok', false, 'usados', v_usados, 'tope', c.tope_caracteres_mes,
      'por_que', format('se llegó al tope de voz del mes (%s de %s caracteres). El texto sigue igual.',
                        v_usados, c.tope_caracteres_mes));
  end if;

  insert into voz_gasto (mes, caracteres, huella, user_id) values (v_mes, p_caracteres, p_huella, auth.uid());
  v_usados := v_usados + p_caracteres;
  return jsonb_build_object('ok', true, 'usados', v_usados, 'tope', c.tope_caracteres_mes,
    'cerca', v_usados >= c.tope_caracteres_mes * c.aviso_pct / 100.0,
    'pct', case when c.tope_caracteres_mes > 0 then round(100.0 * v_usados / c.tope_caracteres_mes, 1) end);
end;
$$;

-- ── CAMBIAR EL TOPE ─────────────────────────────────────────────────────────

create or replace function public.voz_tope_definir(p_tope integer, p_aviso_pct integer default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_rol text;
begin
  select u.rol::text into v_rol from users_admin u where u.id = auth.uid() and u.activo;
  if v_rol is distinct from 'super_admin' then
    return jsonb_build_object('ok', false, 'por_que', 'el tope lo define el dueño');
  end if;
  if p_tope is null or p_tope < 0 then
    return jsonb_build_object('ok', false, 'por_que', 'el tope tiene que ser un número de caracteres');
  end if;
  update voz_config
     set tope_caracteres_mes = p_tope,
         aviso_pct = coalesce(p_aviso_pct, aviso_pct),
         definido_por = auth.uid(), definido_at = now()
   where id;
  return jsonb_build_object('ok', true, 'tope', p_tope);
end;
$$;

-- ── EL BUCKET DE LA CACHÉ ───────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voz-cache', 'voz-cache', false, 2097152, array['audio/mpeg'])
on conflict (id) do nothing;

drop policy if exists voz_cache_leer on storage.objects;
create policy voz_cache_leer on storage.objects for select to authenticated
  using (bucket_id = 'voz-cache' and exists (
    select 1 from public.users_admin u where u.id = auth.uid() and u.activo and u.rol = 'super_admin'));

drop policy if exists voz_cache_guardar on storage.objects;
create policy voz_cache_guardar on storage.objects for insert to authenticated
  with check (bucket_id = 'voz-cache' and exists (
    select 1 from public.users_admin u where u.id = auth.uid() and u.activo and u.rol = 'super_admin'));

-- ── PERMISOS ────────────────────────────────────────────────────────────────

revoke all on function public.voz_gasto_estado() from public, anon;
revoke all on function public.voz_gasto_reservar(integer, text) from public, anon;
revoke all on function public.voz_tope_definir(integer, integer) from public, anon;
grant execute on function public.voz_gasto_estado() to authenticated, service_role;
grant execute on function public.voz_gasto_reservar(integer, text) to authenticated, service_role;
grant execute on function public.voz_tope_definir(integer, integer) to authenticated, service_role;

-- Las tres son excepciones declaradas: usan auth.uid() y consultan users_admin.
CREATE OR REPLACE FUNCTION public.deteccion_reglas_violadas()
 RETURNS TABLE(regla text, donde text, por_que text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with excepciones(nombre) as (values
    ('deteccion_descartar'), ('descripciones_aprobar_lote'),
    ('canal_error_resolver'), ('canal_cerrar'), ('canal_reabrir'),
    ('canal_lote_armar'), ('canal_lote_firmar'),
    ('canal_error_no_se_puede'), ('canal_tablero_responsable'), ('canal_alta'),
    ('cerebro_estado'), ('voz_registrar'), ('voz_descartar'),
    ('voz_gasto_estado'), ('voz_gasto_reservar'), ('voz_tope_definir')
  )
  select 'un detector no declara lo que NO dice', d.clave,
         'Sin lo que NO dice, el hecho se lee como una acusacion'
    from detectores d where d.activo and (d.que_no_dice is null or btrim(d.que_no_dice) = '')
  union all
  select 'un detector no declara cuanta historia necesita', d.clave,
         'C.7: sin historia minima puede afirmar un cambio con dos meses de datos'
    from detectores d where d.activo and (d.historia_minima is null or btrim(d.historia_minima) = '')
  union all
  select 'un detector corre y no tiene tipo de aviso', d.clave,
         'La corrida castea aviso_tipo al enum: con null se cae entera'
    from detectores d where d.activo and d.funcion is not null
     and (d.aviso_tipo is null or not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = 'nora_aviso_tipo' and e.enumlabel = d.aviso_tipo))
  union all
  select 'un hallazgo publicado no tiene plata estimada', an.clave,
         'D.1: la unica excepcion es `siempre_arriba`'
    from anomalias an join detectores d on d.clave = an.detector
   where an.publicado_at is not null and an.plata_en_juego is null
     and d.funcion is not null and not d.siempre_arriba
  union all
  select 'mas de un detector se saltea el presupuesto', d.clave,
         'Si la usan varios, el presupuesto de interrupcion deja de existir'
    from detectores d where d.siempre_arriba and d.activo
     and (select count(*) from detectores x where x.siempre_arriba and x.activo) > 1
  union all
  select 'la evidencia de un hallazgo de caja nombra al cajero', an.clave,
         'B.2 de la v1.3: el dato existe pero no va en un listado'
    from anomalias an where an.detector = 'caja_diferencias_repetidas'
     and (an.evidencia::text ilike '%cajero%' or an.evidencia::text ilike '%cajer%')
  union all
  select 'una funcion de servicio la puede ejecutar cualquier usuario logueado',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         'revoke from public y anon NO alcanza: `authenticated` tiene EXECUTE por default privileges'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where (p.proname like 'detectar\_%' or p.proname like 'deteccion\_%'
          or p.proname like 'descripciones\_%' or p.proname like 'canal\_%'
          or p.proname like 'canales\_%' or p.proname like 'archivo\_%'
          or p.proname like 'cerebro\_%' or p.proname like 'voz\_%'
          or p.proname = 'informe_semanal' or p.proname = 'producto_canales')
     and p.proname not in (select nombre from excepciones)
     and p.proname <> 'archivo_huella'
     and has_function_privilege('authenticated', p.oid, 'execute')
  union all
  select 'una excepcion no cumple la condicion que la justifica',
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         case when p.prosrc not like '%auth.uid()%' then
                'esta en la lista y no usa auth.uid(): la excepcion existe para que la accion tenga dueno'
              else 'esta en la lista y no consulta users_admin: no verifica el rol adentro' end
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    join excepciones e on e.nombre = p.proname
   where p.prosrc not like '%auth.uid()%'
      or (p.prosrc not like '%users_admin%' and p.proname <> 'canal_tablero_responsable');
$function$;

revoke all on function public.deteccion_reglas_violadas() from public, anon, authenticated;
grant execute on function public.deteccion_reglas_violadas() to service_role;
