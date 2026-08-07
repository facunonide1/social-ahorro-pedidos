-- ============================================================================
-- 0086 · Confirmación transaccional de un documento (v0.55)
-- ============================================================================
-- Al confirmar hay que escribir cinco cosas que sólo tienen sentido juntas: el
-- documento, sus líneas, los eventos de precio, la cuenta por pagar y el
-- vínculo con la extracción. Hechas desde el cliente con cinco requests, un
-- corte de conexión a mitad deja el documento confirmado sin líneas, o líneas
-- sin histórico. Acá es una sola función: entra todo o no entra nada.
-- ============================================================================

-- Vínculo en las dos direcciones entre la captura y la cuenta por pagar.
alter table public.facturas_proveedor
  add column if not exists doc_documento_id uuid references public.doc_documentos(id) on delete set null,
  add column if not exists origen_captura text not null default 'manual';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'facturas_proveedor_origen_captura_check') then
    alter table public.facturas_proveedor
      add constraint facturas_proveedor_origen_captura_check
      check (origen_captura in ('manual','foto'));
  end if;
end $$;

create index if not exists facturas_proveedor_doc_idx
  on public.facturas_proveedor(doc_documento_id) where doc_documento_id is not null;

comment on column public.facturas_proveedor.origen_captura is
  'manual = la cargó una persona a mano. foto = salió de una captura leída por el motor de documentos.';

alter table public.doc_documentos
  add column if not exists factura_proveedor_id uuid references public.facturas_proveedor(id) on delete set null;

-- ============================================================================

create or replace function public.doc_confirmar_documento(
  p_extraccion_id uuid,
  p_cabecera      jsonb,
  p_lineas        jsonb,
  p_usuario       uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc_id     uuid;
  v_factura_id uuid;
  v_linea      jsonb;
  v_linea_id   uuid;
  v_tercero    uuid  := nullif(p_cabecera->>'tercero_id','')::uuid;
  v_tipo       text  := coalesce(p_cabecera->>'tipo','factura');
  v_letra      text  := upper(coalesce(nullif(p_cabecera->>'letra',''),'A'));
  v_fecha      date  := coalesce(nullif(p_cabecera->>'fecha_emision','')::date, current_date);
  v_venc       date;
  v_numero     text  := coalesce(nullif(p_cabecera->>'numero',''),'s/n');
  v_pv         text  := coalesce(nullif(p_cabecera->>'punto_venta',''),'0000');
  v_total      numeric := coalesce(nullif(p_cabecera->>'total','')::numeric, 0);
  v_subtotal   numeric := coalesce(nullif(p_cabecera->>'subtotal','')::numeric, v_total);
  v_origen     text;
  v_existente  uuid;
begin
  v_venc := coalesce(nullif(p_cabecera->>'fecha_vencimiento','')::date, v_fecha);
  if v_letra not in ('A','B','C','M') then v_letra := 'A'; end if;

  -- ¿Ya existe esta factura cargada a mano? Mismo proveedor, punto de venta y
  -- número. Si existe, se vincula: NO se duplica la deuda.
  if v_tipo in ('factura','nota_credito') and v_tercero is not null then
    select f.id into v_existente
    from public.facturas_proveedor f
    where f.proveedor_id = v_tercero
      and f.numero_factura = v_numero
      and f.punto_venta = v_pv
    limit 1;
  end if;

  -- 1 · El documento.
  insert into public.doc_documentos (
    tipo, estado, tercero_id, tercero_ident_fiscal, tercero_nombre_leido,
    numero, punto_venta, fecha_emision, fecha_vencimiento, unidad_negocio_id,
    moneda, subtotal, descuentos, impuestos, percepciones, total, observaciones,
    confirmado_por, confirmado_at, created_by
  ) values (
    v_tipo, 'confirmado', v_tercero,
    nullif(p_cabecera->>'tercero_ident_fiscal',''),
    nullif(p_cabecera->>'tercero_nombre_leido',''),
    v_numero, v_pv, v_fecha,
    nullif(p_cabecera->>'fecha_vencimiento','')::date,
    nullif(p_cabecera->>'unidad_negocio_id','')::uuid,
    coalesce(nullif(p_cabecera->>'moneda',''),'ARS'),
    nullif(p_cabecera->>'subtotal','')::numeric,
    nullif(p_cabecera->>'descuentos','')::numeric,
    nullif(p_cabecera->>'impuestos','')::numeric,
    nullif(p_cabecera->>'percepciones','')::numeric,
    nullif(p_cabecera->>'total','')::numeric,
    nullif(p_cabecera->>'observaciones',''),
    p_usuario, now(), p_usuario
  )
  returning id into v_doc_id;

  -- La factura es la autoridad del precio; el remito sólo lo adelanta.
  v_origen := case when v_tipo = 'remito' then 'remito' else 'factura' end;

  -- 2 · Las líneas + 3 · los eventos de precio.
  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    insert into public.doc_lineas (
      documento_id, nro_linea, codigo_tercero, descripcion_leida, cantidad,
      unidad, precio_unitario, descuento_pct, precio_neto, alicuota_iva,
      precio_con_iva, total_linea, item_id, match_estado, match_confianza, created_by
    ) values (
      v_doc_id,
      coalesce((v_linea->>'nro_linea')::int, 1),
      nullif(v_linea->>'codigo_tercero',''),
      coalesce(nullif(v_linea->>'descripcion_leida',''),'(sin descripción)'),
      nullif(v_linea->>'cantidad','')::numeric,
      nullif(v_linea->>'unidad',''),
      nullif(v_linea->>'precio_unitario','')::numeric,
      nullif(v_linea->>'descuento_pct','')::numeric,
      nullif(v_linea->>'precio_neto','')::numeric,
      nullif(v_linea->>'alicuota_iva','')::numeric,
      nullif(v_linea->>'precio_con_iva','')::numeric,
      nullif(v_linea->>'total_linea','')::numeric,
      nullif(v_linea->>'item_id','')::uuid,
      coalesce(nullif(v_linea->>'match_estado',''),'manual'),
      nullif(v_linea->>'match_confianza','')::numeric,
      p_usuario
    )
    returning id into v_linea_id;

    -- Sólo de líneas matcheadas y con precio: las ignoradas (fletes, envases,
    -- redondeos) no tienen por qué ensuciar el histórico de compras.
    if nullif(v_linea->>'item_id','') is not null
       and coalesce(v_linea->>'match_estado','') <> 'ignorado'
       and nullif(v_linea->>'precio_unitario','') is not null then
      insert into public.doc_precios_historial (
        item_id, tercero_id, documento_id, linea_id, fecha, cantidad, unidad,
        precio_unitario, precio_neto, precio_con_iva, descuento_pct, moneda,
        unidad_negocio_id, origen, created_by
      ) values (
        (v_linea->>'item_id')::uuid, v_tercero, v_doc_id, v_linea_id, v_fecha,
        nullif(v_linea->>'cantidad','')::numeric,
        nullif(v_linea->>'unidad',''),
        (v_linea->>'precio_unitario')::numeric,
        nullif(v_linea->>'precio_neto','')::numeric,
        nullif(v_linea->>'precio_con_iva','')::numeric,
        nullif(v_linea->>'descuento_pct','')::numeric,
        coalesce(nullif(p_cabecera->>'moneda',''),'ARS'),
        nullif(p_cabecera->>'unidad_negocio_id','')::uuid,
        v_origen, p_usuario
      );
    end if;
  end loop;

  -- 4 · La cuenta por pagar. UNA SOLA DIRECCIÓN: la captura genera la factura,
  --     nunca al revés.
  if v_tipo in ('factura','nota_credito') and v_tercero is not null then
    if v_existente is not null then
      v_factura_id := v_existente;
      update public.facturas_proveedor
         set doc_documento_id = v_doc_id
       where id = v_existente;
    else
      insert into public.facturas_proveedor (
        proveedor_id, tipo_factura, tipo_documento, punto_venta, numero_factura,
        fecha_emision, fecha_vencimiento, subtotal, percepciones, total,
        estado, sucursal_id, observaciones, doc_documento_id, origen_captura, created_by
      ) values (
        v_tercero,
        v_letra::public.tipo_factura,
        -- El enum no tiene 'factura_m': una M cae a factura_a. La letra real
        -- queda en doc_documentos, que es la captura fiel del papel.
        (case when v_tipo = 'nota_credito' then 'nota_credito'
              when v_letra in ('A','B','C') then 'factura_' || lower(v_letra)
              else 'factura_a' end)::public.tipo_documento_financiero,
        v_pv, v_numero, v_fecha, v_venc,
        v_subtotal,
        coalesce(nullif(p_cabecera->>'percepciones','')::numeric, 0),
        v_total,
        'pendiente_aprobacion'::public.factura_estado,
        nullif(p_cabecera->>'unidad_negocio_id','')::uuid,
        nullif(p_cabecera->>'observaciones',''),
        v_doc_id, 'foto', p_usuario
      )
      returning id into v_factura_id;
    end if;

    update public.doc_documentos set factura_proveedor_id = v_factura_id where id = v_doc_id;
  end if;

  -- 5 · La extracción queda apuntando al documento que salió de ella.
  update public.doc_extracciones set documento_id = v_doc_id where id = p_extraccion_id;

  return jsonb_build_object(
    'documento_id', v_doc_id,
    'factura_id', v_factura_id,
    'vinculada_existente', v_existente is not null
  );
end
$$;

comment on function public.doc_confirmar_documento(uuid, jsonb, jsonb, uuid) is
  'Confirma una captura en una sola transacción: documento + líneas + eventos de precio + cuenta por pagar. Los alias aprendidos los escribe el backend aparte, porque no son parte de la deuda.';

revoke all on function public.doc_confirmar_documento(uuid, jsonb, jsonb, uuid) from anon, authenticated;

-- Nota: `tipo_documento_financiero` no tiene 'factura_m'. Una M cae a factura_a
-- en la cuenta por pagar; la letra real queda en doc_documentos, que es la
-- captura fiel del papel.
