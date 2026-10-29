-- ════════════════════════════════════════════════════════════════════════════
-- v1.5-cerebro · D · LA BITÁCORA DE LA VOZ
--
-- Límite e: todo lo que hace queda en la bitácora. Qué se le pidió —con el
-- texto original, tal como llegó—, qué entendió y qué ejecutó. Es auditable
-- como cualquier agente.
--
-- El texto original es lo que importa: cuando entienda mal, la única forma
-- de saberlo es poner lo que se dijo al lado de lo que entendió.
--
-- ── NADIE ESCRIBE A MANO ────────────────────────────────────────────────────
--
-- La tabla no tiene políticas de escritura. Se escribe por `voz_registrar`,
-- que mira el rol con auth.uid() y guarda quién habló. Una bitácora que se
-- puede editar desde el navegador no es una bitácora.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.voz_bitacora (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null default auth.uid(),
  texto_original  text not null,
  via             text not null default 'texto' check (via in ('texto', 'voz')),
  -- Qué entendió: la intención y sus partes, como las devolvió la gramática.
  entendido       jsonb not null,
  -- Lo que contestó, la frase corta.
  respuesta       text,
  -- Lo que se ejecutaría si una persona lo confirma. Se guarda ACÁ, al
  -- proponer, para que al confirmar se ejecute exactamente lo que se mostró
  -- y no lo que mande el navegador después.
  propuesta       jsonb,
  estado          text not null check (estado in (
                    'respondido', 'no_entendido', 'negado',
                    'propuesto', 'confirmado', 'descartado', 'fallo')),
  -- Lo que hizo de verdad al confirmar, con los ids de lo que creó.
  ejecutado       jsonb,
  created_at      timestamptz not null default now(),
  resuelto_at     timestamptz,
  resuelto_por    uuid references auth.users(id) on delete set null
);

create index if not exists voz_bitacora_created on public.voz_bitacora (created_at desc);

comment on table public.voz_bitacora is
  'v1.5-cerebro · límite e · qué se le pidió a la voz (texto original), qué '
  'entendió, qué contestó y qué ejecutó. Solo se escribe por voz_registrar y '
  'las funciones de confirmación.';

alter table public.voz_bitacora enable row level security;

drop policy if exists voz_bitacora_leer on public.voz_bitacora;
create policy voz_bitacora_leer on public.voz_bitacora
  for select to authenticated
  using (exists (select 1 from public.users_admin u
                  where u.id = auth.uid() and u.activo and u.rol = 'super_admin'));

-- ── LA CONSTITUCIÓN, PARA LA VOZ ────────────────────────────────────────────
--
-- Pagar y cambiar precios ya estaban. Se agregan las tres que el enunciado
-- nombra para la voz: firmar, publicar y tocar personal. Quedan en la misma
-- tabla para que la pantalla de intentos bloqueados las muestre igual.

insert into public.constitucion_acciones (accion, que_es, por_que) values
  ('firmar_por_voz', 'Firmar, aprobar o emitir algo hablando',
   'Por voz se prepara, nunca se firma. Un error de transcripción en un monto no se ve hasta que pasó: la confirmación es un toque en pantalla con el monto a la vista.'),
  ('publicar_en_canal', 'Publicar o despublicar en un canal de venta',
   'Publicar se ve desde afuera y no se corrige con un deshacer. Además NORA no tiene credenciales de ningún canal.'),
  ('tocar_personal', 'Contratar, despedir o cambiar sueldos',
   'Las decisiones sobre personas las toma una persona, y no de pasada en una conversación.')
on conflict (accion) do nothing;

-- ── REGISTRAR ───────────────────────────────────────────────────────────────

create or replace function public.voz_registrar(
  p_texto text, p_via text, p_entendido jsonb, p_respuesta text,
  p_estado text, p_propuesta jsonb default null
) returns uuid
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_rol text;
  v_id uuid;
begin
  select u.rol::text into v_rol from users_admin u where u.id = auth.uid() and u.activo;
  if v_rol is distinct from 'super_admin' then
    raise exception 'la voz es solo del dueño';
  end if;

  insert into voz_bitacora (user_id, texto_original, via, entendido, respuesta, estado, propuesta)
  values (auth.uid(), p_texto, coalesce(p_via, 'texto'), coalesce(p_entendido, '{}'::jsonb),
          p_respuesta, p_estado, p_propuesta)
  returning id into v_id;

  -- Límite d · la constitución vale igual: si dijo que no, queda registrado
  -- el intento, igual que cuando lo intenta un agente.
  -- (jsonb_exists y no el operador ?: el ? lo toma el cliente como parámetro.)
  if p_estado = 'negado' and jsonb_exists(p_entendido, 'accion') then
    insert into intentos_bloqueados (accion, agente, quien, detalle)
    values (p_entendido ->> 'accion', 'voz', auth.uid(),
            jsonb_build_object('texto_original', p_texto, 'via', p_via, 'voz_bitacora_id', v_id));
  end if;

  return v_id;
end;
$$;

comment on function public.voz_registrar(text, text, jsonb, text, text, jsonb) is
  'v1.5-cerebro · límite e · registra cada cosa que se le dice a la voz. Si la '
  'respuesta fue que no, registra además el intento bloqueado (límite d).';

-- ── DESCARTAR LO PROPUESTO ──────────────────────────────────────────────────

create or replace function public.voz_descartar(p_id uuid)
returns boolean
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
    raise exception 'la voz es solo del dueño';
  end if;
  update voz_bitacora set estado = 'descartado', resuelto_at = now(), resuelto_por = auth.uid()
   where id = p_id and estado = 'propuesto';
  return found;
end;
$$;

-- La bitácora entra en la actividad del cerebro (C.3): lo que hizo la voz
-- también es algo que pasó.
create or replace function public.cerebro_actividad(p_limite integer default 40)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with ev as (
    select c.ultima_evaluacion as at, 'cron'::text as fuente,
           case c.cron
             when 'metricas-stock' then 'reparto'
             when 'alertas-stock' then 'vigia'
             when 'nora-auditor' then 'tesoro'
             else null end as nodo,
           format('Cron %s: %s', c.cron, c.ultimo_resultado) as texto
      from crons_calculo c
     where c.ultima_evaluacion is not null

    union all
    select s.calculado_at, 'agentes', null,
           format('Recalculé lo que dice cada agente%s (%s s)',
                  case when s.sucursal_id is null then ' para la cadena' else ' para ' || su.nombre end,
                  round(coalesce(s.tardo_ms, 0) / 1000.0))
      from agentes_resumen_snapshot s
      left join sucursales su on su.id = s.sucursal_id

    union all
    select a.publicado_at, 'detector',
           case when d.familia = 'canal' then 'canal' else coalesce(a.sucursal_id::text, null) end,
           format('%s: %s', d.nombre, left(coalesce(a.hecho, a.clave), 140))
      from anomalias a
      join detectores d on d.clave = a.detector
     where a.publicado_at is not null
       and a.publicado_at > now() - interval '30 days'

    union all
    select coalesce(i.aplicado_at, i.cargado_at, i.created_at), 'importacion', null,
           format('Importación de SIFACO (%s): %s', i.tipo, i.estado)
      from sifaco_importaciones i

    union all
    select b.propuesta_at, 'agente', b.agente,
           format('%s propuso: %s', initcap(b.agente), left(coalesce(b.propuso, b.accion), 140))
      from agente_bitacora b

    union all
    select coalesce(t.fecha_completada, t.created_at), 'tarea', t.sucursal_id::text,
           case when t.fecha_completada is not null
                then format('Se completó la tarea %s: %s', t.codigo, t.titulo)
                else format('Se creó la tarea %s: %s', t.codigo, t.titulo) end
      from tareas t
     where not coalesce(t.es_demo, false)
       and coalesce(t.fecha_completada, t.created_at) > now() - interval '30 days'

    union all
    select ib.intento_at, 'bloqueo', ib.agente,
           format('Se bloqueó un intento de «%s»', ib.accion)
      from intentos_bloqueados ib

    union all
    select coalesce(v.resuelto_at, v.created_at), 'voz', v.propuesta ->> 'nodo',
           case v.estado
             when 'confirmado' then format('Confirmaste: %s', coalesce(v.ejecutado ->> 'texto', v.respuesta))
             when 'propuesto' then format('Preparé: %s', v.respuesta)
             when 'negado' then format('Dije que no: «%s»', left(v.texto_original, 80))
             else null end
      from voz_bitacora v
     where v.estado in ('confirmado', 'propuesto', 'negado')
  )
  select coalesce(jsonb_agg(jsonb_build_object('at', at, 'fuente', fuente, 'nodo', nodo, 'texto', texto)
                            order by at desc), '[]'::jsonb)
    from (select * from ev where at is not null and texto is not null order by at desc limit p_limite) x;
$$;

-- ── PERMISOS ────────────────────────────────────────────────────────────────

revoke all on function public.cerebro_actividad(integer) from public, anon, authenticated;
grant execute on function public.cerebro_actividad(integer) to service_role;

-- Excepciones declaradas: usan auth.uid() y consultan users_admin.
revoke all on function public.voz_registrar(text, text, jsonb, text, text, jsonb) from public, anon;
revoke all on function public.voz_descartar(uuid) from public, anon;
grant execute on function public.voz_registrar(text, text, jsonb, text, text, jsonb) to authenticated, service_role;
grant execute on function public.voz_descartar(uuid) to authenticated, service_role;

-- Y en la lista del auditor, donde se verifican.
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
    ('cerebro_estado'), ('voz_registrar'), ('voz_descartar')
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
