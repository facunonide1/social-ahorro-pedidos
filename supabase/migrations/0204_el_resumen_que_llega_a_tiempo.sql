-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0204 · EL RESUMEN QUE LLEGA A TIEMPO                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- ── LO QUE PASÓ ─────────────────────────────────────────────────────────────
--
-- La verificación de coherencia de la v0.99 (E.3) comparó lo que dice el
-- código de la pantalla de agentes contra la base, y en su PRIMERA corrida
-- encontró esto:
--
--   el código de la pantalla dice 0
--   las 2.909 filas de la vista, paginadas, dicen 1.687
--
-- `agentes_resumen(null)` tarda ~20 segundos. PostgREST lo cancela por
-- statement timeout, `lectura.ts` no mira el error, y `resumen ?? {}` deja
-- todos los números en cero. Abasto aparecía APAGADO diciendo «el plan de
-- compra no tiene nada urgente».
--
-- Es el mismo error de siempre con otra ropa: un número más chico que el
-- verdadero, sin ninguna señal de que falte algo. En la v0.98 el cero venía de
-- un corte de 1.000 filas; acá viene de un timeout. Desde la pantalla se leen
-- igual, y los dos dicen «lo miré y no hay» cuando lo que pasó es «no lo pude
-- saber».
--
-- ── DÓNDE SE VA EL TIEMPO ───────────────────────────────────────────────────
--
--   reco_compras_urgencia .......... 10,1 s   (sobre reco_compras, 48.206)
--   transferir_antes_de_comprar ..... 3,7 s   (sobre stock_items, 192.464)
--   canal_estado .................... 2,2 s
--   el resto ........................ 4   s
--
-- No hay un índice que arregle esto: son vistas que recalculan la demanda de
-- tres meses sobre 598.117 ventas cada vez que alguien abre una pantalla.
--
-- ── LA DECISIÓN ─────────────────────────────────────────────────────────────
--
-- Se calcula una vez por día y se guarda. La pantalla lee una fila.
--
-- Lo que se pierde es frescura, y se paga diciéndolo: el snapshot guarda
-- `calculado_at` y la pantalla lo muestra. Un número de ayer que dice que es
-- de ayer es honesto; un número de ayer que se presenta como de ahora, no.
--
-- Lo que NO se hace es devolver ceros cuando el snapshot no existe. Si nunca
-- se calculó, `agentes_resumen` devuelve NULL, y la pantalla dice «todavía no
-- se calculó» en vez de «no hay nada». Cero es «lo miré y no hay». Null es
-- «no lo puedo saber». Esta es exactamente la diferencia que se perdió.

-- ── EL SNAPSHOT ─────────────────────────────────────────────────────────────
--
-- Una fila por alcance: una por sucursal y una para la cadena. La cadena es
-- `sucursal_id is null`, que no entra en un unique normal — de ahí el índice
-- parcial doble, igual que en el resto del proyecto.

create table if not exists public.agentes_resumen_snapshot (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid references public.sucursales(id) on delete cascade,
  datos          jsonb not null,
  calculado_at   timestamptz not null default now(),
  tardo_ms       integer
);

create unique index if not exists agentes_resumen_snapshot_suc
  on public.agentes_resumen_snapshot (sucursal_id) where sucursal_id is not null;
create unique index if not exists agentes_resumen_snapshot_cadena
  on public.agentes_resumen_snapshot ((true)) where sucursal_id is null;

comment on table public.agentes_resumen_snapshot is
  'Lo que leen las pantallas de agentes. Se recalcula una vez por dia: las '
  'vistas de abajo tardan ~20s y PostgREST las cancela. calculado_at se '
  'muestra en pantalla.';

alter table public.agentes_resumen_snapshot enable row level security;

-- Lo lee cualquiera que esté adentro; el filtro por sucursal lo hace la
-- función, no la política, porque el resumen de la cadena no tiene sucursal.
drop policy if exists agentes_resumen_snapshot_leer on public.agentes_resumen_snapshot;
create policy agentes_resumen_snapshot_leer on public.agentes_resumen_snapshot
  for select to authenticated using (true);

-- Nadie escribe a mano. Lo escribe la función, que es security definer.
-- Sin políticas de insert/update/delete, `authenticated` no puede tocarlo.

-- ── EL CÁLCULO ──────────────────────────────────────────────────────────────
--
-- Es el cuerpo que antes estaba en `agentes_resumen`, movido acá sin cambios
-- de semántica. Volátil, porque escribe. El upsert va a mano: los índices son
-- parciales y `on conflict` pediría repetir el predicado, que para el caso de
-- la cadena (`sucursal_id is null`) no se puede expresar igual que para el de
-- una sucursal.

create or replace function public.agentes_resumen_calcular(p_sucursal uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_datos jsonb;
  v_inicio timestamptz := clock_timestamp();
begin
  select jsonb_build_object(
    'abasto', jsonb_build_object(
      'items_urgentes', (select coalesce(sum(items), 0) from reco_compras_urgencia
                          where urgencia in ('ya','esta_semana')),
      'monto_urgente',  (select coalesce(sum(monto), 0) from reco_compras_urgencia
                          where urgencia in ('ya','esta_semana')),
      'productos_a_transferir', (select count(distinct producto_id) from transferir_antes_de_comprar),
      'plata_a_transferir', (select coalesce(sum(plata_que_no_hay_que_gastar), 0)
                               from transferir_antes_de_comprar)
    ),
    'tesoro', jsonb_build_object(
      'impagas',       (select count(*) from deuda_proveedores where situacion = 'impaga'),
      'monto_impago',  (select coalesce(sum(saldo), 0) from deuda_proveedores where situacion = 'impaga'),
      'credito',       (select coalesce(sum(saldo), 0) from deuda_proveedores where situacion = 'credito'),
      'dif_caja',      (select count(*) from caja_diferencias where estado = 'abierta')
    ),
    'reparto', jsonb_build_object(
      'quietos',       (select count(*) from stock_mal_repartido
                         where p_sucursal is null or donde_esta_id = p_sucursal),
      'plata_quieta',  (select coalesce(sum(plata_quieta), 0) from stock_mal_repartido
                         where p_sucursal is null or donde_esta_id = p_sucursal),
      'dif_transfer',  (select count(*) from transferencias_diferencias where abierta)
    ),
    'margen', jsonb_build_object(
      'vigentes',      (select count(*) from ofertas_sifaco where estado = 'vigente'),
      'bajo_costo',    (select count(*) from canal_estado where problema = 'no_cubre_costo')
    ),
    'despacho', jsonb_build_object(
      'abiertos',      (select count(*) from orders
                         where status not in ('entregado','cancelado')
                           and (p_sucursal is null or sucursal_id = p_sucursal))
    ),
    'vigia', jsonb_build_object(
      'lotes_con_fecha', (select count(*) from lotes_productos
                           where fecha_vencimiento is not null
                             and (p_sucursal is null or sucursal_id = p_sucursal)),
      'vencen_30',       (select count(*) from lotes_productos
                           where fecha_vencimiento is not null and estado = 'activo'
                             and fecha_vencimiento <= current_date + 30
                             and (p_sucursal is null or sucursal_id = p_sucursal)),
      'productos',       (select count(*) from productos_catalogo where not es_demo),
      'productos_mirados', (select count(distinct producto_id) from lotes_productos
                             where fecha_vencimiento is not null
                               and (p_sucursal is null or sucursal_id = p_sucursal)),
      'productos_con_stock', (select count(*) from producto_stock_sifaco
                               where sucursal_id is not null and stock > 0
                                 and (p_sucursal is null or sucursal_id = p_sucursal))
    ),
    'documentos', jsonb_build_object(
      'recepciones',   (select count(*) from recepciones_mercaderia),
      'sin_costo',     (select count(*) from productos_catalogo
                         where not es_demo and precio_costo_promedio is null)
    )
  ) into v_datos;

  -- Upsert a mano: los índices son parciales y `on conflict` querría que le
  -- repitamos el predicado, que acá no se puede expresar para los dos casos.
  update public.agentes_resumen_snapshot
     set datos = v_datos, calculado_at = now(),
         tardo_ms = extract(milliseconds from clock_timestamp() - v_inicio)::int
   where sucursal_id is not distinct from p_sucursal;

  if not found then
    insert into public.agentes_resumen_snapshot (sucursal_id, datos, tardo_ms)
    values (p_sucursal, v_datos,
            extract(milliseconds from clock_timestamp() - v_inicio)::int);
  end if;

  return v_datos;
end;
$$;

comment on function public.agentes_resumen_calcular(uuid) is
  'Calcula el resumen de agentes y lo guarda. Tarda ~20s: NO se llama desde '
  'una pantalla. Lo llama el cron y el importador de SIFACO.';

-- ── TODAS LAS SUCURSALES DE UNA ─────────────────────────────────────────────

create or replace function public.agentes_resumen_refrescar()
returns table (alcance text, tardo_ms integer)
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  perform public.agentes_resumen_calcular(null);
  for r in select id, nombre from public.sucursales where activa loop
    perform public.agentes_resumen_calcular(r.id);
  end loop;

  return query
    select coalesce(s.nombre, 'la cadena'), sn.tardo_ms
      from public.agentes_resumen_snapshot sn
      left join public.sucursales s on s.id = sn.sucursal_id
     order by sn.sucursal_id nulls first;
end;
$$;

-- ── LO QUE LEE LA PANTALLA ──────────────────────────────────────────────────
--
-- Devuelve NULL si nunca se calculó. Eso es deliberado: ver el encabezado.

create or replace function public.agentes_resumen(p_sucursal uuid default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_set(datos, '{calculado_at}', to_jsonb(calculado_at))
    from public.agentes_resumen_snapshot
   where sucursal_id is not distinct from p_sucursal;
$$;

comment on function public.agentes_resumen(uuid) is
  'Lee el snapshot. NULL = nunca se calculo, que no es lo mismo que cero. '
  'Trae calculado_at adentro para que la pantalla pueda decir de cuando es.';

-- ── LOS PERMISOS, DESPUÉS DE LA ÚLTIMA VERSIÓN ──────────────────────────────
--
-- `create or replace function` conserva la ACL vieja, y una función nueva nace
-- con EXECUTE para PUBLIC. Los revokes van acá abajo, después del último
-- `create`, o no sirven de nada. Ya pasó cuatro veces en este proyecto.

revoke all on function public.agentes_resumen_calcular(uuid) from public, anon, authenticated;
revoke all on function public.agentes_resumen_refrescar() from public, anon, authenticated;
grant execute on function public.agentes_resumen_calcular(uuid) to service_role;
grant execute on function public.agentes_resumen_refrescar() to service_role;

revoke all on function public.agentes_resumen(uuid) from public, anon;
grant execute on function public.agentes_resumen(uuid) to authenticated, service_role;
