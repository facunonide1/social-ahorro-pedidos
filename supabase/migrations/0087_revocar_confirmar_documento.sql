-- ============================================================================
-- 0087 · Cerrar el acceso a doc_confirmar_documento (v0.55)
-- ============================================================================
-- 0086 hacía `revoke ... from anon, authenticated`, y no alcanzaba: en Postgres
-- el privilegio EXECUTE se concede a PUBLIC por defecto al crear la función, y
-- anon/authenticated lo heredan de ahí. Revocarles a ellos no toca la concesión
-- a PUBLIC, así que la función seguía siendo llamable por RPC.
--
-- Eso era un agujero real: la función es SECURITY DEFINER y escribe documentos,
-- líneas, histórico de precios y cuentas por pagar. Llamada directo desde el
-- cliente se saltea el gate de permisos del endpoint.
--
-- Sólo la debe llamar el backend con service_role, que ignora estos grants.
-- ============================================================================

revoke all on function public.doc_confirmar_documento(uuid, jsonb, jsonb, uuid)
  from public, anon, authenticated;

-- Las otras funciones del motor sí se llaman por RPC desde el cliente
-- autenticado (normalización y búsqueda de alias) y no son SECURITY DEFINER,
-- así que no hace falta tocarlas.
