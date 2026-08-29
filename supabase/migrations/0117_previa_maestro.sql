-- 0117 · La vista previa del maestro (v0.83)
--
-- A.4: nada se guarda sin que alguien mire. Con 46.000 filas, «mirar» no puede
-- ser leer la lista: son cuatro números y una muestra.
--
-- El número que más importa es `no_vienen`: productos que están en el catálogo
-- y NO aparecen en el archivo. Eso NO es «hay que borrarlos» — es «SIFACO dejó
-- de listarlos», y qué hacer con eso lo decide una persona. Por eso se cuenta y
-- se muestra, y no se actúa.
--
-- `depto_sin_mapear` y `psi_sin_mapear` son la otra mitad: si SIFACO trae un
-- departamento o un nivel de control que no está declarado, se ve ANTES de
-- aplicar. Un nivel de control sin declarar es terreno legal (regla de oro 9) y
-- frena el aplicado.
--
-- Esta función NO escribe en el catálogo. Sólo cuenta.

create or replace function public.sifaco_previa_maestro(p_importacion uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'filas',            (select count(*) from sifaco_maestro_staging s where s.importacion_id = p_importacion),
    'codigos_unicos',   (select count(distinct s.codigo) from sifaco_maestro_staging s where s.importacion_id = p_importacion),
    'nuevos',           (select count(*) from (
                           select distinct s.codigo from sifaco_maestro_staging s
                           where s.importacion_id = p_importacion
                             and not exists (select 1 from productos_catalogo p where p.sku = s.codigo and not p.es_demo)
                         ) x),
    'ya_estan',         (select count(*) from (
                           select distinct s.codigo from sifaco_maestro_staging s
                           where s.importacion_id = p_importacion
                             and exists (select 1 from productos_catalogo p where p.sku = s.codigo and not p.es_demo)
                         ) x),
    'no_vienen',        (select count(*) from productos_catalogo p
                         where not p.es_demo and p.activo
                           and not exists (select 1 from sifaco_maestro_staging s
                                           where s.importacion_id = p_importacion and s.codigo = p.sku)),
    'con_stock',        (select count(*) from sifaco_maestro_staging s
                         where s.importacion_id = p_importacion and coalesce(s.stock,0) > 0),
    'unidades_stock',   (select coalesce(sum(s.stock),0) from sifaco_maestro_staging s where s.importacion_id = p_importacion),
    'con_costo',        (select count(*) from sifaco_maestro_staging s
                         where s.importacion_id = p_importacion and coalesce(s.costo,0) > 0),
    'controlados',      (select count(*) from sifaco_maestro_staging s
                         where s.importacion_id = p_importacion and s.psi is not null and s.psi <> ''),
    'controlados_por_nivel', (select coalesce(jsonb_object_agg(t.psi, t.n), '{}'::jsonb) from (
                           select s.psi, count(*) n from sifaco_maestro_staging s
                           where s.importacion_id = p_importacion and s.psi is not null and s.psi <> ''
                           group by s.psi) t),
    'depto_sin_mapear', (select coalesce(jsonb_object_agg(t.nom_depto, t.n), '{}'::jsonb) from (
                           select s.nom_depto, count(*) n from sifaco_maestro_staging s
                           where s.importacion_id = p_importacion
                             and s.nom_depto is not null
                             and not exists (select 1 from sifaco_depto_categoria d where d.nom_depto = s.nom_depto)
                           group by s.nom_depto) t),
    'psi_sin_mapear',   (select coalesce(jsonb_object_agg(t.psi, t.n), '{}'::jsonb) from (
                           select s.psi, count(*) n from sifaco_maestro_staging s
                           where s.importacion_id = p_importacion
                             and s.psi is not null and s.psi <> ''
                             and not exists (select 1 from sifaco_nivel_control c where c.psi_sifaco = s.psi)
                           group by s.psi) t),
    'muestra',          (select coalesce(jsonb_agg(m), '[]'::jsonb) from (
                           select jsonb_build_object(
                             'codigo', s.codigo, 'descrip', s.descrip, 'stock', s.stock,
                             'prec_vta', s.prec_vta, 'costo', s.costo, 'nom_lab', s.nom_lab,
                             'nom_depto', s.nom_depto, 'psi', s.psi) m
                           from sifaco_maestro_staging s
                           where s.importacion_id = p_importacion
                           order by s.fila limit 12) t)
  ) into v;
  return v;
end $$;

revoke execute on function public.sifaco_previa_maestro(uuid) from public, anon, authenticated;
grant execute on function public.sifaco_previa_maestro(uuid) to service_role;
