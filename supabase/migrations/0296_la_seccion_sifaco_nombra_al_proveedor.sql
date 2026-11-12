-- 0296 · La sección del maestro SIFACO puede nombrar a la droguería.
--
-- Z45, MIC, CEO y el resto viven en la columna seccion. Esta tabla dice a qué
-- proveedor corresponde cada código. No se carga ningún mapeo acá: Facu lo
-- completa. Hasta entonces el código sigue siendo el nombre.
--
-- No se aplica desde el agente. Va en el paquete de firma.
--
-- La lectura es la de proveedores_read: cualquier admin activo.
-- La escritura es la de proveedores_write (super_admin, gerente, comprador,
-- administrativo), partida en insert/update/delete. Un FOR ALL también da
-- SELECT, y rls_escrituras_que_dan_lectura lo marca como fuga.
--
-- (select current_admin_role()) es un InitPlan: se evalúa una vez por
-- sentencia, no una vez por fila.

create table if not exists public.sifaco_seccion_proveedor (
  seccion text primary key,
  proveedor_id uuid references public.proveedores (id) on delete set null,
  nota text,
  created_at timestamptz not null default now(),
  constraint sifaco_seccion_proveedor_codigo check (seccion = upper(trim(seccion)) and seccion <> '')
);

alter table public.sifaco_seccion_proveedor enable row level security;

revoke all on table public.sifaco_seccion_proveedor from public, anon;
grant all on table public.sifaco_seccion_proveedor to service_role;
grant select, insert, update, delete on table public.sifaco_seccion_proveedor to authenticated;

drop policy if exists sifaco_seccion_proveedor_read on public.sifaco_seccion_proveedor;
create policy sifaco_seccion_proveedor_read
  on public.sifaco_seccion_proveedor
  for select
  using ((select public.current_admin_role()) is not null);

drop policy if exists sifaco_seccion_proveedor_insert on public.sifaco_seccion_proveedor;
create policy sifaco_seccion_proveedor_insert
  on public.sifaco_seccion_proveedor
  for insert
  with check ((select public.current_admin_role()) in ('super_admin', 'gerente', 'comprador', 'administrativo'));

drop policy if exists sifaco_seccion_proveedor_update on public.sifaco_seccion_proveedor;
create policy sifaco_seccion_proveedor_update
  on public.sifaco_seccion_proveedor
  for update
  using ((select public.current_admin_role()) in ('super_admin', 'gerente', 'comprador', 'administrativo'))
  with check ((select public.current_admin_role()) in ('super_admin', 'gerente', 'comprador', 'administrativo'));

drop policy if exists sifaco_seccion_proveedor_delete on public.sifaco_seccion_proveedor;
create policy sifaco_seccion_proveedor_delete
  on public.sifaco_seccion_proveedor
  for delete
  using ((select public.current_admin_role()) in ('super_admin', 'gerente', 'comprador', 'administrativo'));

comment on table public.sifaco_seccion_proveedor is
  'Código de sección SIFACO (Z45, MIC, CEO) y el proveedor al que corresponde. Vacía hasta que se cargue el mapeo.';
