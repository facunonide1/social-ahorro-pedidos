-- ═══════════════════════════════════════════════════════════════
-- FÁBRICA NORA · el carril verde se aplica solo
-- ═══════════════════════════════════════════════════════════════
--
-- Hasta v0.68 el verde era una CLASIFICACIÓN y no una automatización: una
-- propuesta que caía en verde se insertaba como `pendiente` y esperaba firma
-- igual que una amarilla. La etiqueta prometía algo que el mecanismo no hacía.
--
-- ── POR QUÉ UNA COLUMNA Y NO UN VALOR MÁS EN `origen` ───────────────────────
--
-- `origen` dice quién PROPUSO (humano | verificador). Esto dice quién APLICÓ, y
-- son preguntas distintas: una propuesta humana puede aplicarse sola, y una del
-- verificador puede terminar firmada a mano.
--
-- ── POR QUÉ HAY QUE PODER CONTARLO ─────────────────────────────────────────
--
-- La evidencia que hace falta para encender el verde es "cuántos cambios aprobó
-- una PERSONA sin incidentes". Si un cambio aplicado solo y uno firmado se ven
-- iguales en la tabla, esa evidencia es incontable — y se justificaría encender
-- el verde con los cambios que el propio verde aplicó, que es un círculo.

alter table fab_propuestas
  add column if not exists aplicada_automaticamente boolean not null default false;

comment on column fab_propuestas.aplicada_automaticamente is
  'true = la aplicó el carril verde, no una persona. Se cuenta aparte: la evidencia para encender el verde son las que firmó alguien.';

-- Quién firmó puede ser NULL cuando aplicó el carril verde: no hay persona
-- detrás. Antes era implícito porque nunca pasaba.
comment on column fab_propuestas.decidida_por is
  'Quién decidió. NULL cuando la aplicó el carril verde: no hubo persona.';
