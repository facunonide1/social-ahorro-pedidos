-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  0207 · EL ENCARGADO NO PODÍA PEDIR UNA TRANSFERENCIA                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- F.5 de la v0.99 pedía volver a verificar los diez pasos del día de un
-- encargado. La prueba (`scripts/prueba-dia-encargado.ts`) lo encontró en el
-- paso 6:
--
--   new row violates row-level security policy for table "transferencias_sucursal"
--
-- Las políticas de escritura listan `sucursal` pero no `encargado_sucursal`.
-- Son dos roles distintos, y el encargado es justamente el que está parado en
-- el mostrador viendo que le falta algo que sobra en otra sucursal. El manual
-- del encargado dice textualmente que eso «no se compra, se pide» — y no
-- podía pedirlo.
--
-- ── POR QUÉ UNA POLÍTICA NUEVA Y NO AGREGARLO A LA LISTA ────────────────────
--
-- Porque las políticas que ya están no miran la sucursal: un `comprador` puede
-- crear una transferencia entre dos sucursales cualesquiera, y para un rol de
-- cadena eso está bien. Para un encargado no: tiene que ser una de las suyas.
--
-- Agregarlo a la lista le habría dado alcance de cadena sin que se notara.
-- Una política aparte le da exactamente lo que necesita. Las permisivas se
-- suman con OR, así que los otros roles siguen igual.
--
-- NO se usa `FOR ALL`: en la v0.97 había 130 políticas `FOR ALL` que además
-- daban SELECT y anulaban el filtro por sucursal. Una política por operación.

drop policy if exists transferencias_encargado_pide on public.transferencias_sucursal;
create policy transferencias_encargado_pide on public.transferencias_sucursal
  for insert to authenticated
  with check (
    exists (
      select 1 from public.users_admin u
       where u.id = auth.uid() and u.activo
         and u.rol = 'encargado_sucursal'
         and u.sucursal_id is not null
         and u.sucursal_id in (sucursal_origen_id, sucursal_destino_id)
    )
  );

comment on policy transferencias_encargado_pide on public.transferencias_sucursal is
  'Un encargado pide o manda, pero solo transferencias donde su sucursal es una de las dos puntas.';

-- Y que pueda moverla por el circuito: marcar la salida, la recepción y la
-- diferencia. Mismo límite: una de las dos puntas tiene que ser la suya, antes
-- y después del cambio.
drop policy if exists transferencias_encargado_mueve on public.transferencias_sucursal;
create policy transferencias_encargado_mueve on public.transferencias_sucursal
  for update to authenticated
  using (
    exists (
      select 1 from public.users_admin u
       where u.id = auth.uid() and u.activo
         and u.rol = 'encargado_sucursal'
         and u.sucursal_id is not null
         and u.sucursal_id in (sucursal_origen_id, sucursal_destino_id)
    )
  )
  with check (
    exists (
      select 1 from public.users_admin u
       where u.id = auth.uid() and u.activo
         and u.rol = 'encargado_sucursal'
         and u.sucursal_id is not null
         and u.sucursal_id in (sucursal_origen_id, sucursal_destino_id)
    )
  );

comment on policy transferencias_encargado_mueve on public.transferencias_sucursal is
  'El encargado mueve por el circuito las transferencias de su sucursal. No borra: una transferencia pedida queda, aunque se cancele.';
