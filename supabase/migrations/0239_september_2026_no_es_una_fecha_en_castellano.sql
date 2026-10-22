-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0239 · «SEPTEMBER 2026» NO ES UNA FECHA EN CASTELLANO                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- El primer hallazgo de la lista decia:
--
--   «AME facturo $26.890.919 en September 2026, contra $83.299.940 por mes
--    en los 6 meses anteriores.»
--
-- `to_char(fecha, 'TMMonth YYYY')` deberia dar el mes en el idioma de la
-- base, pero `lc_time` esta en C y devuelve el ingles. Es el mismo tipo de
-- problema que la coma de los miles en 0232: el hecho se lee tal como esta
-- escrito y el informe semanal lo copia, asi que la base lo tiene que
-- escribir bien.
--
-- Un arreglo de un renglon en vez de tocar la configuracion del servidor:
-- doce nombres no se van a mover.

create or replace function public.mes_texto(p date)
returns text
language sql
immutable
as $$
  select (array['enero','febrero','marzo','abril','mayo','junio','julio',
                'agosto','septiembre','octubre','noviembre','diciembre']
          )[extract(month from p)::int] || ' de ' || extract(year from p)::text;
$$;

comment on function public.mes_texto(date) is
  'El mes en castellano. to_char con TM devuelve el ingles porque lc_time '
  'esta en C, y el hecho se lee tal como esta escrito.';

revoke all on function public.mes_texto(date) from public, anon;
grant execute on function public.mes_texto(date) to authenticated, service_role;

create or replace function public.detectar_proveedor_cambio(
  p_meses integer default 6,
  p_veces numeric default 2.0
)
returns table (
  clave text, sucursal_id uuid, producto_id uuid,
  hecho text, plata numeric, como_se_calculo text, evidencia jsonb
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with cerrado as (
    select max(date_trunc('month', fecha_emision))::date as mes
      from facturas_proveedor
     where not es_demo
       and fecha_emision < date_trunc('month', current_date)
       and fecha_emision <= current_date
  ),
  por_mes as (
    select f.proveedor_id, p.razon_social,
           date_trunc('month', f.fecha_emision)::date as mes,
           count(*) as facturas, sum(f.total)::numeric as total
      from facturas_proveedor f
      join proveedores p on p.id = f.proveedor_id
      cross join cerrado c
     where not f.es_demo
       and f.fecha_emision > (c.mes - make_interval(months => p_meses))
       and f.fecha_emision < (c.mes + interval '1 month')
     group by 1, 2, 3
  ),
  hist as (
    select pm.proveedor_id, pm.razon_social,
           (select mes from cerrado) as mes_cerrado,
           count(*) filter (where pm.mes < (select mes from cerrado)) as meses_con_factura,
           avg(pm.total) filter (where pm.mes < (select mes from cerrado)) as promedio,
           sum(pm.total) filter (where pm.mes = (select mes from cerrado)) as ultimo,
           sum(pm.facturas) filter (where pm.mes = (select mes from cerrado)) as facturas_ultimo
      from por_mes pm
     group by 1, 2
    having count(*) filter (where pm.mes < (select mes from cerrado)) >= 4
  )
  select
    'prov_cambio:' || proveedor_id::text || ':' || to_char(mes_cerrado, 'YYYY-MM'),
    null::uuid, null::uuid,
    case when ultimo is null then
      format('%s facturo en %s de los %s meses anteriores y en %s no facturo nada. Venia facturando $%s por mes.',
             razon_social, meses_con_factura, p_meses - 1,
             mes_texto(mes_cerrado), plata_texto(promedio))
    when ultimo > promedio * p_veces then
      format('%s facturo $%s en %s, contra $%s por mes en los %s meses anteriores: %s veces mas, en %s comprobantes.',
             razon_social, plata_texto(ultimo), mes_texto(mes_cerrado),
             plata_texto(promedio), meses_con_factura,
             round(ultimo / promedio, 1), facturas_ultimo)
    else
      format('%s facturo $%s en %s, contra $%s por mes en los %s meses anteriores: un %s%% menos.',
             razon_social, plata_texto(ultimo), mes_texto(mes_cerrado),
             plata_texto(promedio), meses_con_factura,
             round((1 - ultimo / promedio) * 100))
    end,
    round(abs(coalesce(ultimo, 0) - promedio), 2),
    format('la diferencia entre los $%s del mes y los $%s que facturaba por mes en los %s meses anteriores. Es cuanto se movio el total del proveedor, no un cambio de precio: no hay precios de compra por producto cargados para poder decir eso.',
           plata_texto(coalesce(ultimo, 0)), plata_texto(promedio), meses_con_factura),
    jsonb_build_object(
      'proveedor', razon_social, 'mes', to_char(mes_cerrado, 'YYYY-MM'),
      'total_mes', coalesce(ultimo, 0), 'promedio_anterior', round(promedio, 2),
      'meses_con_factura', meses_con_factura, 'facturas_del_mes', coalesce(facturas_ultimo, 0),
      'ventana_meses', p_meses)
  from hist
  where ultimo is null
     or ultimo > promedio * p_veces
     or ultimo < promedio / p_veces;
$$;

revoke all on function public.detectar_proveedor_cambio(integer, numeric) from public, anon;
grant execute on function public.detectar_proveedor_cambio(integer, numeric) to service_role;
