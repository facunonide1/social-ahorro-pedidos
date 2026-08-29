-- 0116 · El bucket de importaciones de SIFACO (v0.83)
--
-- Privado, y con las mismas cuatro puertas de rol que el resto de Operaciones.
-- El archivo original queda guardado tal como vino: es la fuente de verdad de
-- ese día, y el catálogo es una interpretación suya (A.5).
--
-- La subida va DERECHO acá desde el navegador con una URL firmada. 41 MB no
-- pasan por una función serverless, y aunque pasaran, no tiene sentido gastar
-- el runtime en mover bytes que Storage sabe recibir solo.

insert into storage.buckets (id, name, public)
values ('sifaco-importaciones', 'sifaco-importaciones', false)
on conflict (id) do nothing;

drop policy if exists sifaco_import_insert on storage.objects;
create policy sifaco_import_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sifaco-importaciones'
    and exists (
      select 1 from public.users_admin ua
      where ua.id = auth.uid() and ua.activo
        and ua.rol in ('super_admin', 'gerente', 'comprador', 'administrativo')
    )
  );

drop policy if exists sifaco_import_select on storage.objects;
create policy sifaco_import_select on storage.objects for select to authenticated
  using (
    bucket_id = 'sifaco-importaciones'
    and exists (
      select 1 from public.users_admin ua
      where ua.id = auth.uid() and ua.activo
        and ua.rol in ('super_admin', 'gerente', 'comprador', 'administrativo')
    )
  );
