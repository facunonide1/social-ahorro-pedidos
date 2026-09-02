-- 0173 · v0.91-pedidos · BLOQUE E
--
-- LO QUE SE LE DICE AL CLIENTE, Y QUIÉN LO AUTORIZÓ.
--
-- ── LA REGLA QUE YA EXISTE EN EL SISTEMA ────────────────────────────────────
--
-- Lo reversible sale solo; lo que compromete algo con un tercero se prepara y
-- una persona confirma. Un aviso al cliente es exactamente eso:
--
--   «Salió tu pedido»            → es un hecho. Sale solo.
--   «Llega en 10 minutos»        → es una promesa. Firma.
--   «Hubo una demora»            → compromete a la casa. Firma.
--
-- `whatsapp_messages` ya guardaba el mensaje, el estado que lo disparó, quién lo
-- mandó y cuándo. Le faltaba la parte de la firma: si compromete algo, quién se
-- hizo cargo.
alter table whatsapp_messages add column if not exists requiere_firma boolean not null default false;
alter table whatsapp_messages add column if not exists firmado_por uuid;
alter table whatsapp_messages add column if not exists firmado_nombre text;
alter table whatsapp_messages add column if not exists firmado_at timestamptz;
alter table whatsapp_messages add column if not exists tipo text;

comment on column whatsapp_messages.requiere_firma is
  'true = el mensaje promete algo (una hora de llegada, una disculpa por demora). No se manda sin que alguien lo confirme.';
comment on column whatsapp_messages.tipo is
  'Qué clase de aviso es. Los de estado usan status_trigger; los que no salen de un cambio de estado —demora, por llegar— usan esto.';

-- ── LA BITÁCORA ─────────────────────────────────────────────────────────────
--
-- Qué se le dijo al cliente, cuándo y quién. Es lo que permite saber qué se le
-- prometió cuando llama enojado.
create or replace view avisos_al_cliente as
  select w.id,
         w.order_id,
         o.codigo        as pedido,
         o.origin        as canal,
         o.sucursal_id,
         coalesce(w.tipo, w.status_trigger::text) as aviso,
         w.message,
         w.phone,
         w.status,
         w.requiere_firma,
         w.firmado_nombre,
         w.firmado_at,
         w.sent_at,
         w.sent_by,
         w.created_at
    from whatsapp_messages w
    join orders o on o.id = w.order_id;

alter view avisos_al_cliente set (security_invoker = true);

comment on view avisos_al_cliente is
  'La bitácora de lo que se le dijo al cliente. WhatsApp es la app común, sin API: el mensaje se prepara acá y una persona lo copia y lo manda.';

-- Los mensajes que ya existían no requerían firma y no la piden ahora: no se
-- puede firmar hacia atrás algo que ya se mandó.
update whatsapp_messages
   set requiere_firma = true
 where status = 'pending'
   and status_trigger in ('en_camino')
   and requiere_firma = false;
