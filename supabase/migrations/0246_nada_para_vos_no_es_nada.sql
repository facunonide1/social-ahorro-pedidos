-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0246 · «NADA PARA VOS» NO ES «NADA»                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- El informe de un cajero decia:
--
--   «El sistema miro y no encontro nada esta semana. No es que no haya
--    corrido: corrio y no hay.»
--
-- Y era falso. El sistema encontro 1.235 cosas; ninguna la lee un cajero.
--
-- Es la misma confusion que los dos criterios de este proyecto evitan en
-- otro lugar: cero no es lo mismo que null, y «no hay nada» no es lo mismo
-- que «no hay nada tuyo». La diferencia importa porque la primera frase le
-- dice a la persona que el negocio esta tranquilo, y eso no se sabe desde su
-- rol.
--
-- Este es el cuerpo final de `informe_semanal`.

create or replace function public.informe_semanal(
  p_sucursal uuid default null,
  p_rol text default 'gerente'
)
returns table (orden integer, seccion text, texto text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with mios as (
    select an.*, d.nombre as detector_nombre, d.familia, d.que_no_dice
      from anomalias an
      join detectores d on d.clave = an.detector
     where d.funcion is not null
       and an.estado in ('abierta', 'reaparecio')
       and (d.roles is null or p_rol = any(d.roles))
       and (p_sucursal is null or an.sucursal_id = p_sucursal or an.sucursal_id is null)
  ),
  arriba as (select * from mios where publicado_at is not null),
  -- Lo que el sistema encontro en total, sin filtrar por rol. Sirve para una
  -- sola cosa: poder distinguir «no hay nada» de «no hay nada tuyo».
  todo_el_sistema as (
    select count(*) as n from anomalias an
     join detectores d on d.clave = an.detector
    where d.funcion is not null and an.estado in ('abierta', 'reaparecio')
  ),
  -- Y cuantos detectores le toca leer a este rol. Si son cero, el informe lo
  -- dice: no es que el negocio este tranquilo, es que desde este rol no se
  -- mira nada de esto.
  mis_detectores as (
    select count(*) as n from detectores d
     where d.activo and d.funcion is not null
       and (d.roles is null or p_rol = any(d.roles))
  ),
  resumen as (
    select count(*) as n_arriba,
           sum(plata_en_juego) as plata_arriba,
           (select count(*) from mios) as n_todos,
           (select count(*) from mios where plata_en_juego is null) as sin_plata,
           (select n from todo_el_sistema) as n_sistema,
           (select n from mis_detectores) as n_detectores
      from arriba
  ),
  cabeza as (
    select 1 as orden, 'La semana' as seccion,
      case
      when r.n_detectores = 0 then
        format('Ninguno de los detectores del sistema reporta a este rol, así que este informe no tiene nada que contarte. El sistema encontró %s cosas esta semana y las lee otra gente. Esto no dice que el negocio esté tranquilo: dice que desde acá no se mira eso.',
               r.n_sistema)
      when r.n_todos = 0 and r.n_sistema > 0 then
        format('No hay nada tuyo esta semana. El sistema encontró %s cosas en total y ninguna la lee tu rol%s. Que no haya nada tuyo no quiere decir que no haya nada.',
               r.n_sistema,
               case when p_sucursal is not null then ' en esta sucursal' else '' end)
      when r.n_todos = 0 then
        'El sistema miró y no encontró nada esta semana. No es que no haya corrido: corrió y no hay.'
      when r.n_arriba = 0 then
        format('El sistema encontró %s cosas esta semana y ninguna se pudo poner arriba, porque ninguna se pudo costear. Están todas en la lista larga.',
               r.n_todos)
      else
        format('El sistema encontró %s cosas esta semana. %s están arriba, por $%s en juego. Las otras %s quedaron en la lista larga%s.',
               r.n_todos, r.n_arriba, plata_texto(r.plata_arriba),
               r.n_todos - r.n_arriba,
               case when r.sin_plata > 0
                    then format(', e incluyen %s que no se pueden costear', r.sin_plata)
                    else '' end)
      end as texto
    from resumen r
  ),
  no_cuadra as (
    select 2 as orden, 'Lo que no cuadra' as seccion,
      case when (select n_detectores from resumen) = 0 then null
      when count(*) = 0 then
        'Nada. Los detectores de stock, caja, comprobantes y precios que te tocan corrieron y no encontraron nada que no cierre.'
      else string_agg(hecho || ' Son $' || plata_texto(plata_en_juego) || '.',
                      E'\n\n' order by plata_en_juego desc)
      end as texto
    from (select * from arriba where familia = 'no_cuadra'
           order by plata_en_juego desc limit 6) z
  ),
  cambio as (
    select 3 as orden, 'Lo que cambió' as seccion,
      case when (select n_detectores from resumen) = 0 then null
      when count(*) = 0 then
        'Nada que se pueda afirmar con la historia que hay.'
      else string_agg(hecho || ' Son $' || plata_texto(plata_en_juego) || '.',
                      E'\n\n' order by plata_en_juego desc)
      end as texto
    from (select * from arriba where familia = 'cambio'
           order by plata_en_juego desc limit 6) z
  ),
  -- ── «NO ENCUENTRO EL MOTIVO», Y LA DIFERENCIA QUE IMPORTA ──────────────
  --
  -- La version anterior decia «no encuentro el motivo de ninguno», y eso
  -- suena a que lo busco. No lo busco: **no tiene con que buscarlo.** Lo que
  -- llega de SIFACO son unidades por mes y por sucursal, y ahi no hay ningun
  -- campo que diga por que. Decirlo asi es mas honesto que una frase que
  -- insinua un intento.
  no_se_sabe as (
    select 4 as orden, 'Lo que no puedo explicar' as seccion,
      nullif(trim(
        coalesce(
          case when (select count(*) from arriba where familia = 'cambio') > 0 then
            format('De los %s cambios de acá arriba no puedo decir el motivo de ninguno, y no es que lo haya buscado y no lo encuentre: no tengo con qué buscarlo. Lo que llega de SIFACO son unidades por mes y por sucursal, y ahí no hay ningún dato que diga por qué. Un producto que dejó de venderse puede ser un competidor, un faltante que nadie registró o una moda que pasó, y los tres se ven igual.',
                   (select count(*) from arriba where familia = 'cambio')) || E'\n\n'
          end, '') ||
        coalesce((select string_agg(
            format('%s: no puedo correrlo todavía porque %s.', e.nombre, e.por_que_no),
            E'\n' order by e.nombre)
          from deteccion_estado() e
         where not e.puede_correr
           and exists (select 1 from detectores d where d.clave = e.clave
                        and (d.roles is null or p_rol = any(d.roles)))), '')
      ), '') as texto
  ),
  volvieron as (
    select 5 as orden, 'Lo que se descartó y después pasó' as seccion,
      case when count(*) = 0 then null
      else string_agg(format('Se descartó el %s y volvió a aparecer el %s: %s',
                             dd.descartado_at::date, dd.volvio_at::date, dd.hecho),
                      E'\n\n' order by dd.volvio_at desc)
      end as texto
    from deteccion_descartes dd
    join detectores d on d.clave = dd.detector
   where dd.volvio_at is not null
     and (d.roles is null or p_rol = any(d.roles))
     and (p_sucursal is null or dd.sucursal_id = p_sucursal or dd.sucursal_id is null)
  )
  select * from cabeza
  union all select * from no_cuadra where texto is not null
  union all select * from cambio where texto is not null
  union all select * from no_se_sabe where texto is not null
  union all select * from volvieron where texto is not null
  order by orden;
$$;

comment on function public.informe_semanal(uuid, text) is
  'E · El informe escrito. Se arma en la base y no con un modelo: «sin '
  'adjetivos» es el requisito, un modelo escribe «preocupante» porque así se '
  'escribe un informe, y los hechos ya están escritos por los detectores. '
  'Distingue «no hay nada» de «no hay nada tuyo»: la primera frase le dice a '
  'la persona que el negocio está tranquilo, y eso no se sabe desde su rol.';

revoke all on function public.informe_semanal(uuid, text) from public, anon;
grant execute on function public.informe_semanal(uuid, text) to authenticated, service_role;
