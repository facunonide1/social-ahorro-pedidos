-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0220 · LA COBERTURA, EN EL MOSTRADOR                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- B.5 y E.5 · Qué cubre cada convenio de ESTE producto y cuánto queda de
-- bolsillo. Sale del padrón de la v1.1.
--
-- ── SIN TOCAR AL PACIENTE ───────────────────────────────────────────────────
--
-- Esta función recibe un producto y devuelve una fila por convenio. **No
-- recibe una persona.** No hay parámetro de afiliado, de DNI ni de plan, y no
-- lo va a haber: es información del convenio y del producto, cruzada.
--
-- El empleado mira la lista, ve cuál coincide con la credencial que tiene
-- delante, y le dice el precio. Quién es el afiliado no entra al sistema.
--
-- ── Y LA COBERTURA REAL NO LA DECIDE ESTO ───────────────────────────────────
--
-- SIFACO es la autoridad de precio y facturación (regla de oro 1). Lo que sale
-- de acá es lo que dice el padrón, que es lo que el convenio declaró. Lo que
-- termina pagando la obra social se sabe cuando llega la liquidación — y si no
-- coincide, eso es un débito de la v1.1.

create or replace function public.mostrador_cobertura(p_producto uuid)
returns table (
  convenio_id      uuid,
  convenio         text,
  sigla            text,
  cobertura_pct    numeric,
  -- De dónde salió el porcentaje. Se muestra: un número sin procedencia es un
  -- oráculo.
  de_donde         text,
  precio           numeric,
  -- Lo que paga el que se lleva el remedio. Null si no se sabe el porcentaje o
  -- no hay precio: un cero diría que es gratis.
  de_bolsillo      numeric,
  cubre_pct_texto  text,
  -- Lo que el convenio exige, para que el empleado lo sepa ANTES de despachar
  -- y no cuando llega el débito.
  exige            text[]
)
language sql
stable
security definer
set search_path to 'public'
as $$
with prod as (
  select p.id, p.condicion_venta, p.categoria::text as categoria,
         coalesce(o.precio_con_descuento, p.precio_sugerido) as precio
    from productos_catalogo p
    left join lateral (
      select precio_con_descuento from ofertas_sifaco of
       where of.producto_id = p.id and of.estado in ('vigente', 'sin_vencimiento')
       order by of.descuento_efectivo_pct desc nulls last limit 1
    ) o on true
   where p.id = p_producto
)
select
  c.id, c.nombre, c.sigla,
  coalesce(fina.cobertura_pct, c.cobertura_general_pct),
  case
    when fina.cobertura_pct is not null then 'regla propia de este tipo de producto'
    when c.cobertura_general_pct is not null then 'el porcentaje general del convenio'
    else 'no hay ningun porcentaje cargado para este convenio'
  end,
  pr.precio,
  case when pr.precio is not null
            and coalesce(fina.cobertura_pct, c.cobertura_general_pct) is not null
       then round(pr.precio * (100 - coalesce(fina.cobertura_pct, c.cobertura_general_pct)) / 100, 2)
  end,
  case
    when coalesce(fina.cobertura_pct, c.cobertura_general_pct) is null
      then 'no se sabe cuanto cubre: falta cargarlo en el padron'
    else 'cubre ' || coalesce(fina.cobertura_pct, c.cobertura_general_pct)::text || '%'
  end,
  (select array_agg(r.exigencia::text order by r.exigencia)
     from convenio_requisitos r where r.convenio_id = c.id and r.obligatorio)
from convenios c
cross join prod pr
left join lateral (
  -- La regla más fina que aplique. Si hay una por condición de venta y otra
  -- por categoría, gana la que nombra las dos.
  select cc.cobertura_pct
    from convenio_cobertura cc
   where cc.convenio_id = c.id
     and (cc.condicion_venta is null or cc.condicion_venta = pr.condicion_venta)
     and (cc.categoria is null or cc.categoria = pr.categoria)
     and (cc.condicion_venta is not null or cc.categoria is not null)
   order by (cc.condicion_venta is not null)::int + (cc.categoria is not null)::int desc
   limit 1
) fina on true
where c.activo
order by coalesce(fina.cobertura_pct, c.cobertura_general_pct) desc nulls last, c.nombre;
$$;

comment on function public.mostrador_cobertura(uuid) is
  'B.5 / E.5 · Que cubre cada convenio de este producto y cuanto queda de bolsillo. NO recibe una persona: es informacion del convenio y del producto. de_bolsillo en null cuando no se sabe el porcentaje — un cero diria gratis.';

revoke all on function public.mostrador_cobertura(uuid) from public, anon;
grant execute on function public.mostrador_cobertura(uuid) to authenticated, service_role;
