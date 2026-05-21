-- ============================================================================
-- 0032_inventario_cerrar.sql · F3.4 — conteo + cierre de inventario físico
--
-- Completa el flujo de inventario: el conteo se persiste con upsert (requiere
-- unicidad por inventario+producto) y el cierre ajusta el stock real de la
-- sucursal de forma atómica, dejando rastro en movimientos_stock.
-- ============================================================================

-- upsert de conteos: un row por producto dentro del inventario
create unique index if not exists inventario_items_inv_prod_uq
  on public.inventario_items(inventario_id, producto_id);

create or replace function public.cerrar_inventario_fisico(p_inventario uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sucursal  uuid;
  v_estado    public.estado_inventario;
  v_uid       uuid := auth.uid();
  v_contados  integer;
  v_difs      integer;
  rec         record;
begin
  if not exists (
    select 1 from public.users_admin
    where id = v_uid and activo
      and rol in ('super_admin','gerente','administrativo','sucursal')
  ) then
    raise exception 'No autorizado para cerrar inventarios';
  end if;

  select sucursal_id, estado into v_sucursal, v_estado
  from public.inventarios_fisicos
  where id = p_inventario
  for update;

  if not found then
    raise exception 'Inventario inexistente';
  end if;
  if v_estado <> 'en_curso' then
    raise exception 'El inventario ya está cerrado';
  end if;

  for rec in
    select producto_id, stock_contado, diferencia
    from public.inventario_items
    where inventario_id = p_inventario
      and stock_contado is not null
  loop
    -- fija el stock de la sucursal al valor contado
    insert into public.stock_sucursal
      (producto_id, sucursal_id, cantidad_actual, ultima_actualizacion)
    values (rec.producto_id, v_sucursal, rec.stock_contado, now())
    on conflict (producto_id, sucursal_id)
    do update set cantidad_actual      = excluded.cantidad_actual,
                  ultima_actualizacion = now();

    -- deja rastro del ajuste solo si hubo diferencia
    if coalesce(rec.diferencia, 0) <> 0 then
      insert into public.movimientos_stock
        (producto_id, sucursal_id, tipo, cantidad, motivo,
         referencia_tipo, referencia_id, created_by)
      values (
        rec.producto_id,
        v_sucursal,
        case when rec.diferencia > 0
             then 'inventario_alta'::public.tipo_movimiento_stock
             else 'inventario_baja'::public.tipo_movimiento_stock end,
        abs(rec.diferencia),
        'Ajuste por inventario físico',
        'inventario'::public.referencia_movimiento_stock,
        p_inventario,
        v_uid
      );
    end if;
  end loop;

  select count(*) filter (where stock_contado is not null),
         count(*) filter (where coalesce(diferencia, 0) <> 0)
    into v_contados, v_difs
  from public.inventario_items
  where inventario_id = p_inventario;

  update public.inventarios_fisicos
  set estado               = 'cerrado',
      closed_at            = now(),
      total_items_contados = v_contados,
      diferencias_detectadas = v_difs,
      responsable_id       = coalesce(responsable_id, v_uid)
  where id = p_inventario;
end $$;

grant execute on function public.cerrar_inventario_fisico(uuid) to authenticated;
