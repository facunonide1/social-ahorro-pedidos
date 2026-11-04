-- ════════════════════════════════════════════════════════════════════════════
-- 0294 · EL COMPARADOR DE PRECIOS ENTRE DROGUERÍAS
--
-- Grok Bot lee los precios de las webs de las droguerías. Esta migración es
-- dónde caen y cómo se comparan. **Solo agrega**: dos tablas y tres funciones
-- nuevas. No toca nada que exista.
--
-- ── LAS REGLAS DE PLAUSIBILIDAD, EN UN SOLO LUGAR ───────────────────────────
--
-- `precios_plausibilidad` decide si una lectura se acepta, es sospechosa o se
-- rechaza, y dice por qué con el hecho, no con la sospecha: «es 4,2 veces el
-- costo promedio», no «parece un error». Un precio sospechoso se guarda pero
-- no entra a la comparación: no se descarta lo que puede ser una oferta real,
-- y no se recomienda comprar con un número que no cierra.
--
-- ── NULL NO ES CERO ─────────────────────────────────────────────────────────
--
-- `mejor_proveedor` con un solo proveedor no dice «el mejor» (`mejor: null`):
-- lo muestra en `todos` y dice que no hay con qué compararlo. Sin lecturas aceptadas recientes, devuelve
-- `mejor: null` con el motivo.
--
-- ── QUIÉN LA PUEDE LEER ─────────────────────────────────────────────────────
--
-- Nadie directo. Las tablas tienen RLS sin políticas: las escribe y las lee el
-- servidor con service_role, después de verificar la clave del bot o el rol de
-- la persona. Las políticas para leer desde una pantalla con la sesión quedan
-- para cuando Facundo decida quién ve precios de proveedores (PENDIENTE.md).
--
-- Todo detrás de la bandera NORA_BANDERA_COMPARADOR_PRECIOS, apagada.
-- El down está en supabase/down/0294_el_comparador_de_precios.down.sql.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.precios_ingestas (
  id            uuid primary key default gen_random_uuid(),
  fuente        text not null check (fuente in ('grok_bot', 'sheets')),
  origen        text,
  recibido_at   timestamptz not null default now(),
  filas         integer not null default 0,
  aceptadas     integer not null default 0,
  sospechosas   integer not null default 0,
  rechazadas    integer not null default 0,
  sin_reconocer integer not null default 0,
  creado_por    uuid references auth.users(id) on delete set null
);

create table if not exists public.precios_proveedores (
  id                     uuid primary key default gen_random_uuid(),
  ingesta_id             uuid not null references public.precios_ingestas(id) on delete cascade,
  proveedor_id           uuid references public.proveedores(id) on delete set null,
  proveedor_texto        text,
  producto_id            uuid references public.productos_catalogo(id) on delete set null,
  codigo_barras          text,
  sku_proveedor          text,
  descripcion_proveedor  text,
  -- Null cuando no se pudo leer sin adivinar: la fila queda rechazada con el motivo.
  precio                 numeric(14, 2),
  capturado_at           timestamptz,
  estado                 text not null check (estado in ('aceptado', 'sospechoso', 'rechazado', 'sin_reconocer')),
  motivos                text[] not null default '{}',
  created_at             timestamptz not null default now()
);

create index if not exists precios_proveedores_comparar
  on public.precios_proveedores (producto_id, proveedor_id, capturado_at desc)
  where estado = 'aceptado';

alter table public.precios_ingestas enable row level security;
alter table public.precios_proveedores enable row level security;

comment on table public.precios_proveedores is
  '0294 · cada precio leído de la web de una droguería, con el veredicto de plausibilidad y sus motivos. '
  'Solo los aceptados entran a mejor_proveedor().';

-- ── LAS REGLAS ──────────────────────────────────────────────────────────────

create or replace function public.precios_plausibilidad(
  p_precio numeric, p_capturado_at timestamptz,
  p_costo numeric, p_ultimo numeric, p_ahora timestamptz default now()
) returns table (estado text, motivos text[])
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_motivos text[] := '{}';
  v_dias numeric;
begin
  -- Rechazos: no hay número o no hay fecha creíble.
  if p_precio is null then
    return query select 'rechazado'::text, array['el precio no se pudo leer sin adivinar (por ejemplo «3.210»)'];
    return;
  end if;
  if p_precio <= 0 then
    return query select 'rechazado'::text, array['el precio no es positivo'];
    return;
  end if;
  if p_capturado_at is null then
    return query select 'rechazado'::text, array['no dice cuándo se leyó'];
    return;
  end if;
  if p_capturado_at > p_ahora + interval '1 hour' then
    return query select 'rechazado'::text, array['dice que se leyó en el futuro'];
    return;
  end if;

  -- Sospechas: el número existe pero no cierra con lo que ya se sabe.
  v_dias := extract(epoch from p_ahora - p_capturado_at) / 86400;
  if v_dias > 7 then
    v_motivos := v_motivos || format('se leyó hace %s días', floor(v_dias));
  end if;
  if p_costo is not null and p_costo > 0 then
    if p_precio > p_costo * 3 then
      v_motivos := v_motivos || format('es %s veces el costo promedio', round(p_precio / p_costo, 1));
    elsif p_precio < p_costo / 3 then
      v_motivos := v_motivos || format('es menos de un tercio del costo promedio (%s veces)', round(p_precio / p_costo, 2));
    end if;
  end if;
  if p_ultimo is not null and p_ultimo > 0 and abs(p_precio / p_ultimo - 1) > 0.4 then
    v_motivos := v_motivos || format('cambió %s%% contra la última lectura aceptada de este proveedor',
                                     round((p_precio / p_ultimo - 1) * 100));
  end if;

  return query select case when cardinality(v_motivos) = 0 then 'aceptado' else 'sospechoso' end, v_motivos;
end;
$$;

-- ── LA INGESTA ──────────────────────────────────────────────────────────────

create or replace function public.precios_ingestar(
  p_fuente text, p_origen text, p_filas jsonb, p_por uuid default null
) returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_ingesta uuid;
  f jsonb;
  v_prov uuid;
  v_prod uuid;
  v_costo numeric;
  v_ultimo numeric;
  v_precio numeric;
  v_cap timestamptz;
  v_estado text;
  v_motivos text[];
  v_fuera boolean;
begin
  insert into precios_ingestas (fuente, origen, creado_por)
  values (p_fuente, p_origen, p_por) returning id into v_ingesta;

  for f in select * from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) loop
    -- El proveedor: por CUIT, y si no viene, por nombre entre las droguerías activas.
    select p.id into v_prov from proveedores p
     where not coalesce(p.es_demo, false) and p.activo and p.es_drogueria
       and ((nullif(f ->> 'cuit', '') is not null and regexp_replace(coalesce(p.cuit, ''), '\D', '', 'g') = f ->> 'cuit')
         or (nullif(f ->> 'cuit', '') is null and nullif(f ->> 'proveedor', '') is not null
             and (lower(p.nombre_comercial) = lower(f ->> 'proveedor') or lower(p.razon_social) = lower(f ->> 'proveedor'))))
     limit 1;

    -- El producto: por código de barras contra el catálogo.
    select c.id, c.precio_costo_promedio into v_prod, v_costo from productos_catalogo c
     where not coalesce(c.es_demo, false) and nullif(f ->> 'codigo_barras', '') is not null
       and c.codigo_barras = f ->> 'codigo_barras'
     limit 1;

    -- Se evalúa el mismo número que se guarda: redondeado a centavos, y dentro de lo que entra en
    -- numeric(14,2). Un 0,001 que se guardaría como 0,00 es «no positivo»; uno de un billón no entra
    -- y se rechaza esa fila sola, sin tirar abajo el lote.
    v_fuera := false;
    begin
      v_precio := round(nullif(f ->> 'precio', '')::numeric, 2);
    exception when others then
      v_precio := null;
    end;
    if v_precio is not null and abs(v_precio) >= 1000000000000 then
      v_precio := null;
      v_fuera := true;
    end if;
    begin
      v_cap := nullif(f ->> 'capturado_at', '')::timestamptz;
    exception when others then
      v_cap := null;
    end;

    if v_prov is null or v_prod is null then
      v_estado := 'sin_reconocer';
      v_motivos := array_remove(array[
        case when v_prov is null then 'no reconozco al proveedor: no coincide el CUIT ni el nombre con una droguería activa' end,
        case when v_prod is null then 'no reconozco el producto: el código de barras no está en el catálogo' end], null);
    else
      select pp.precio into v_ultimo from precios_proveedores pp
       where pp.producto_id = v_prod and pp.proveedor_id = v_prov and pp.estado = 'aceptado'
       order by pp.capturado_at desc, pp.created_at desc, pp.id desc limit 1;
      select r.estado, r.motivos into v_estado, v_motivos
        from precios_plausibilidad(v_precio, v_cap, v_costo, v_ultimo) r;
      if v_fuera then
        v_estado := 'rechazado';
        v_motivos := array['el precio es de un billón o más: no entra en lo que se guarda'];
      end if;
    end if;

    insert into precios_proveedores (ingesta_id, proveedor_id, proveedor_texto, producto_id, codigo_barras,
      sku_proveedor, descripcion_proveedor, precio, capturado_at, estado, motivos)
    values (v_ingesta, v_prov, nullif(f ->> 'proveedor', ''), v_prod, nullif(f ->> 'codigo_barras', ''),
      nullif(f ->> 'sku_proveedor', ''), nullif(f ->> 'descripcion', ''), v_precio, v_cap, v_estado, v_motivos);

    v_prov := null; v_prod := null; v_costo := null; v_ultimo := null;
  end loop;

  update precios_ingestas i set
    filas = s.n, aceptadas = s.a, sospechosas = s.s, rechazadas = s.r, sin_reconocer = s.x
  from (select count(*) n,
               count(*) filter (where estado = 'aceptado') a,
               count(*) filter (where estado = 'sospechoso') s,
               count(*) filter (where estado = 'rechazado') r,
               count(*) filter (where estado = 'sin_reconocer') x
          from precios_proveedores where ingesta_id = v_ingesta) s
  where i.id = v_ingesta;

  return (select to_jsonb(i) from precios_ingestas i where i.id = v_ingesta);
end;
$$;

-- ── LA CONSULTA ─────────────────────────────────────────────────────────────

create or replace function public.mejor_proveedor(p_producto uuid, p_dias integer default 7)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with ultimas as (
    -- La última lectura aceptada de cada proveedor, dentro de la ventana.
    select distinct on (pp.proveedor_id)
           pp.proveedor_id, coalesce(p.nombre_comercial, p.razon_social) as proveedor,
           pp.precio, pp.capturado_at
      from precios_proveedores pp
      join proveedores p on p.id = pp.proveedor_id
                       and p.activo and p.es_drogueria and not coalesce(p.es_demo, false)
     where pp.producto_id = p_producto and pp.estado = 'aceptado'
       and pp.capturado_at > now() - make_interval(days => p_dias)
     -- Si dos lecturas tienen la misma hora, gana la que entró último: es la corrección.
     order by pp.proveedor_id, pp.capturado_at desc, pp.created_at desc, pp.id desc
  ), orden as (
    select u.*, row_number() over (order by u.precio asc, u.capturado_at desc, u.proveedor_id) as n from ultimas u
  )
  select jsonb_build_object(
    'producto_id', p_producto,
    'ventana_dias', p_dias,
    'comparados', (select count(*) from orden),
    -- Con un solo proveedor no hay «mejor»: está en `todos`, y `por_que_no` dice por qué.
    'mejor', (select jsonb_build_object('proveedor_id', proveedor_id, 'proveedor', proveedor,
                                         'precio', precio, 'capturado_at', capturado_at)
                from orden where n = 1 and (select count(*) from orden) >= 2),
    'segundo', (select jsonb_build_object('proveedor_id', proveedor_id, 'proveedor', proveedor,
                                           'precio', precio, 'capturado_at', capturado_at)
                  from orden where n = 2),
    'ahorro_contra_el_segundo', (select b.precio - a.precio from orden a, orden b where a.n = 1 and b.n = 2),
    'todos', coalesce((select jsonb_agg(jsonb_build_object('proveedor', proveedor, 'precio', precio,
                                                            'capturado_at', capturado_at) order by n)
                         from orden), '[]'::jsonb),
    'por_que_no', case (select count(*) from orden)
                    when 0 then format('no hay precios aceptados de este producto en los últimos %s días', p_dias)
                    when 1 then 'hay un solo proveedor con precio aceptado: no hay con qué compararlo'
                  end
  );
$$;

-- ── PERMISOS ────────────────────────────────────────────────────────────────
--
-- `revoke from public, anon` no alcanza: este proyecto le da EXECUTE a
-- `authenticated` por default privileges. Las tres son de servicio.

revoke all on function public.precios_plausibilidad(numeric, timestamptz, numeric, numeric, timestamptz) from public, anon, authenticated;
revoke all on function public.precios_ingestar(text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.mejor_proveedor(uuid, integer) from public, anon, authenticated;
grant execute on function public.precios_plausibilidad(numeric, timestamptz, numeric, numeric, timestamptz) to service_role;
grant execute on function public.precios_ingestar(text, text, jsonb, uuid) to service_role;
grant execute on function public.mejor_proveedor(uuid, integer) to service_role;
