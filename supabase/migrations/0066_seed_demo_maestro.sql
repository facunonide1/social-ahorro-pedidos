-- ============================================================================
-- 0066 · SEED DEMO MAESTRO — datos ficticios coherentes e interconectados
-- ----------------------------------------------------------------------------
-- Función seed_demo_maestro(): puebla TODO con demo (es_demo / sku DEMO-) ligado
-- por los mismos IDs: ~120 productos, stock por sucursal (góndola/depósito),
-- 45 días de ventas diarias (rotación variada: rápidos/normales/dormidos),
-- ~150 clientes, arqueos de caja (con descuadres para el control), ofertas.
-- Enciende: recomendaciones de compra, dinero dormido, control de caja, análisis
-- de ventas, segmentos de CRM, auditor de NORA. Idempotente (skip si ya hay demo).
-- ============================================================================

create or replace function public.seed_demo_maestro()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sucs uuid[];
  v_n_prod int; v_n_vd int; v_n_cli int; v_n_arq int;
begin
  -- idempotente
  if exists (select 1 from productos_catalogo where sku like 'DEMO-%' limit 1) then
    return jsonb_build_object('skipped', true, 'motivo', 'ya hay datos demo');
  end if;

  select array(select id from sucursales where activa order by nombre limit 4) into v_sucs;
  if array_length(v_sucs,1) is null then
    return jsonb_build_object('error', 'no hay sucursales activas');
  end if;

  -- ===== 120 productos DEMO =====
  insert into productos_catalogo (sku, codigo_barras, nombre, categoria, laboratorio, droga_principal, rubro, precio_sugerido, precio_costo_promedio, ventas_mensuales, activo)
  select
    'DEMO-'||lpad(g::text,4,'0'),
    '779'||lpad(((1000000+g*37)%9999999999)::text,10,'0'),
    (array['Ibuprofeno 400','Paracetamol 500','Amoxicilina 875','Omeprazol 20','Loratadina 10','Vitamina C','Shampoo Anticaspa','Crema Hidratante','Protector Solar FPS50','Pañales','Alcohol en gel','Barbijo x50','Termómetro','Algodón','Suero fisiológico','Aspirineta','Enalapril 10','Metformina 850','Losartan 50','Atorvastatina 20'])[1+(g%20)]
      || ' ' || (array['x10','x20','x30','250ml','500ml','x1','x100'])[1+(g%7)],
    (array['medicamento','medicamento','medicamento','perfumeria','cuidado_personal','dermocosmetica','otros']::producto_catalogo_categoria[])[1+(g%7)],
    (array['Bayer','Roemmers','Bagó','Elea','Gador','Raffo','Casasco'])[1+(g%7)],
    (array['ibuprofeno','paracetamol','amoxicilina','omeprazol','loratadina',null])[1+(g%6)],
    (array['farmacia','farmacia','farmacia','perfumeria','super'])[1+(g%5)],
    round((500 + (g*137)%18000)::numeric,2),
    round(((500 + (g*137)%18000)*0.6)::numeric,2),
    jsonb_build_object('mes_act',(g*7)%300,'ant_1',(g*5)%280,'ant_2',(g*6)%260,'ant_3',(g*4)%250,'ant_4',(g*3)%240,'ant_5',(g*8)%230,'ant_6',(g*2)%220,'actualizado',current_date::text),
    true
  from generate_series(1,120) g;
  get diagnostics v_n_prod = row_count;

  -- ===== stock por sucursal (góndola/depósito) con variedad por bucket =====
  -- bucket b = hashtext(sku)%100:  <18 rápido/bajo · 18-34 dormido/alto · resto normal
  insert into stock_items (producto_id, sucursal_id, cantidad_gondola, cantidad_deposito, stock_minimo, es_demo)
  select pc.id, s.sid,
    case when (abs(hashtext(pc.sku))%100) < 18 then 2 + (abs(hashtext(pc.sku||s.sid::text))%6)
         when (abs(hashtext(pc.sku))%100) < 35 then 25 + (abs(hashtext(pc.sku))%20)
         else 10 + (abs(hashtext(pc.sku||s.sid::text))%25) end,
    case when (abs(hashtext(pc.sku))%100) < 18 then 0
         when (abs(hashtext(pc.sku))%100) < 35 then 40 + (abs(hashtext(pc.sku))%30)
         else 15 + (abs(hashtext(pc.sku||s.sid::text))%40) end,
    8, true
  from productos_catalogo pc
  cross join (select unnest(v_sucs) as sid) s
  where pc.sku like 'DEMO-%';

  -- ===== ventas diarias (45 días, activos = no dormidos) =====
  insert into ventas_diarias (fecha, sucursal_id, producto_id, sku, descripcion, cantidad, monto, es_demo)
  select d.fecha, s.sid, pc.id, pc.sku, pc.nombre,
    (1 + (abs(hashtext(pc.sku||s.sid::text||d.gs::text))%6))::numeric,
    round(((1 + (abs(hashtext(pc.sku||s.sid::text||d.gs::text))%6)) * pc.precio_sugerido)::numeric,2),
    true
  from productos_catalogo pc
  cross join (select unnest(v_sucs) as sid) s
  cross join (select (current_date - gs) as fecha, gs from generate_series(0,44) gs) d
  where pc.sku like 'DEMO-%'
    and (abs(hashtext(pc.sku))%100) not between 18 and 34
    and ((d.gs + (abs(hashtext(pc.sku))%7)) % (case when (abs(hashtext(pc.sku))%100) < 18 then 1 else 3 end) = 0);
  get diagnostics v_n_vd = row_count;

  -- ===== ~150 clientes B2C =====
  insert into clientes (tipo, nombre, dni, telefono, email, fecha_nacimiento, sucursal_habitual_id, fuentes, nivel, puntos, total_gastado_12m, n_compras_12m, ultima_compra, frecuencia_compra_dias, riesgo_churn, es_demo)
  select 'b2c',
    (array['María','Juan','Ana','Carlos','Lucía','Pedro','Sofía','Diego','Valentina','Jorge','Camila','Roberto','Florencia','Marcos','Gabriela'])[1+(g%15)]
      ||' '||(array['González','Rodríguez','Fernández','López','Martínez','Pérez','García','Sánchez','Romero','Torres'])[1+((g*3)%10)],
    (30000000+g*131)::text,
    '11'||lpad(((40000000+g*211)%99999999)::text,8,'0'),
    'demo'||g||'@mail.com',
    ('19'||(60+(g%39))::text||'-'||lpad((1+(g%12))::text,2,'0')||'-'||lpad((1+(g*7)%27)::text,2,'0'))::date,
    v_sucs[1+(g%array_length(v_sucs,1))],
    (case g%5 when 0 then array['cuponera'] when 1 then array['crm_pedidos'] when 2 then array['tickets','cuponera'] when 3 then array['sifaco'] else array['web','cuponera'] end),
    (case when g%2=0 then (array['socio','plus','premium'])[1+(g%3)]::cliente_nivel else null end),
    (case when g%2=0 then (g*53)%8000 else 0 end),
    (2000+(g*997)%90000)::numeric,
    1+(g%18),
    (current_date - (case when g%7=0 then 3 when g%5=0 then 62 when g%3=0 then 38 else 12 end)),
    (case when g%4=0 then 30 else 90 end),
    (case when (case when g%7=0 then 3 when g%5=0 then 62 when g%3=0 then 38 else 12 end) > 45 then 'alto'
          when (case when g%7=0 then 3 when g%5=0 then 62 when g%3=0 then 38 else 12 end) > 25 then 'medio' else 'bajo' end)::cliente_riesgo,
    true
  from generate_series(1,150) g;
  get diagnostics v_n_cli = row_count;

  -- ===== arqueos de caja (12 días × sucursales, ~30% con descuadre) =====
  insert into arqueos_caja (sucursal_id, fecha, cajero_nombre, inicio_caja, total_efectivo, total_mercadopago, total_tarjetas, total_sistema, diferencia_cierre, efectivo_a_general, estado, es_demo)
  select s.sid, (current_date - d),
    (array['Lucía Pérez','Diego Romero','Ana Torres','Carlos Díaz'])[1+(d%4)],
    5000,
    (30000 + (abs(hashtext(s.sid::text||d::text))%40000))::numeric,
    (12000 + (abs(hashtext(s.sid::text||d::text||'mp'))%20000))::numeric,
    (8000 + (abs(hashtext(s.sid::text||d::text||'tj'))%15000))::numeric,
    0,
    (case when (abs(hashtext(s.sid::text||d::text))%10) < 3 then ((abs(hashtext(s.sid::text||d::text))%5000) - 2500) else 0 end)::numeric,
    (25000 + (abs(hashtext(s.sid::text||d::text))%40000))::numeric,
    (case when (abs(hashtext(s.sid::text||d::text))%10) < 3 then 'observada' else 'cerrada' end)::arqueo_estado,
    true
  from (select unnest(v_sucs) as sid) s
  cross join generate_series(1,12) d;
  get diagnostics v_n_arq = row_count;

  -- ===== ofertas (3, dos activas por vencer) =====
  insert into ofertas (codigo, nombre, tipo, valor, productos_ids, rubro, vigencia_tipo, fecha_inicio, fecha_fin, estado, es_demo)
  select 'DEMO-OF-'||g,
    (array['2x1 en perfumería','20% en protección solar','Combo cuidado personal'])[g],
    (array['2x1','porcentaje_descuento','combo'])[g]::oferta_tipo,
    (array[0,20,0])[g]::numeric,
    array(select id from productos_catalogo where sku like 'DEMO-%' order by sku limit 5 offset g*5),
    'perfumeria','con_fecha'::oferta_vigencia, current_date - 5, current_date + (array[2,3,20])[g], 'activa'::oferta_estado, true
  from generate_series(1,3) g;

  return jsonb_build_object('productos', v_n_prod, 'ventas_diarias', v_n_vd, 'clientes', v_n_cli, 'arqueos', v_n_arq);
end $$;

-- Solo la API (service_role) puede sembrar; nunca un usuario autenticado por RPC.
revoke execute on function public.seed_demo_maestro() from public;
grant execute on function public.seed_demo_maestro() to service_role;
