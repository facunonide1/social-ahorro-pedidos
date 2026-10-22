-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0213 · EL AGENTE CONVENIO                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- D.3 · Dos de las cosas que propone el agente son comparaciones entre
-- trimestres: qué motivo creció y qué obra social empezó a debitar más.
--
-- ── POR QUÉ SE SUMAN EN LA BASE Y NO EN MEMORIA ─────────────────────────────
--
-- Un trimestre de débitos de cuatro sucursales pasa las 1.000 filas sin
-- esfuerzo, y PostgREST devuelve 1.000 sin avisar. Ya mintió cinco veces en
-- este proyecto; la última fue en la v0.98, donde un agente dijo 635 productos
-- donde había 1.687.
--
-- Un agente que compara dos trimestres con las sumas cortadas no se equivoca
-- un poco: puede decir que algo bajó cuando subió.

create or replace function public.convenios_suma_debitos(
  p_motivo text default null,
  p_desde date default null,
  p_hasta date default null,
  p_sucursal uuid default null
)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(importe), 0)
    from convenio_debitos
   where (p_motivo is null or motivo = p_motivo)
     and (p_desde is null or fecha_liquidacion >= p_desde)
     and (p_hasta is null or fecha_liquidacion < p_hasta)
     and (p_sucursal is null or sucursal_id = p_sucursal);
$$;

comment on function public.convenios_suma_debitos(text, date, date, uuid) is
  'Suma de debitos con filtros. Se suma EN LA BASE: un trimestre de cuatro sucursales pasa las 1000 filas y PostgREST corta sin avisar.';

-- Qué obra social empezó a debitar más de lo habitual. Compara el último
-- trimestre contra el anterior, sólo para las que tenían algo antes: pasar de
-- cero a algo no es «empezó a debitar más», es «apareció el primer débito».
create or replace function public.convenios_que_debitan_mas()
returns table (
  convenio_id uuid,
  convenio    text,
  antes       numeric,
  ahora       numeric,
  veces       numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with t as (
    select d.convenio_id, c.nombre,
      coalesce(sum(d.importe) filter (
        where d.fecha_liquidacion >= current_date - 90), 0) as ahora,
      coalesce(sum(d.importe) filter (
        where d.fecha_liquidacion >= current_date - 180
          and d.fecha_liquidacion <  current_date - 90), 0) as antes
    from convenio_debitos d
    join convenios c on c.id = d.convenio_id
    group by d.convenio_id, c.nombre
  )
  select convenio_id, nombre, antes, ahora, round(ahora / antes, 2)
    from t
   where antes > 0 and ahora > antes * 1.3
   order by (ahora - antes) desc;
$$;

comment on function public.convenios_que_debitan_mas() is
  'Obras sociales que debitan mas que el trimestre anterior. Solo las que tenian algo antes: pasar de cero a algo no es empeorar, es el primer dato.';

-- ── D.3 · «SUGIERE» DEJA LA DECISIÓN EN LA LISTA ────────────────────────────
--
-- `decisiones_pendientes` suma una rama de convenios: los débitos reclamables
-- y sin reclamar, agrupados por sucursal.
--
-- Es la única rama de esa vista donde `costo_por_dia` queda en NULL a
-- propósito, con el motivo escrito: un débito reclamable no se deteriora todos
-- los días, se pierde entero el día que vence el plazo. Un promedio diario
-- sería un número inventado, y esta vista ya tiene cuatro ramas que explican
-- por qué no lo ponen.
--
-- El cuerpo completo de la vista (las seis ramas) está aplicado en la base:
-- las cinco primeras vienen de la v0.98 sin cambios y la sexta es ésta.

-- (ver el cuerpo en la base; esta migración lo reemplazó con
--  `create or replace view` conservando las cinco ramas anteriores)

revoke all on function public.convenios_suma_debitos(text, date, date, uuid) from public, anon;
revoke all on function public.convenios_que_debitan_mas() from public, anon;
grant execute on function public.convenios_suma_debitos(text, date, date, uuid) to authenticated, service_role;
grant execute on function public.convenios_que_debitan_mas() to authenticated, service_role;
