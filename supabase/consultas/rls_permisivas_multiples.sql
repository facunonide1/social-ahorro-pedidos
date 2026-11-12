-- TABLAS CON VARIAS POLÍTICAS PERMISIVAS PARA EL MISMO ROL Y ACCIÓN · SÓLO LECTURA.
--
-- El advisor «multiple_permissive_policies» marca 259. Las políticas
-- permisivas se combinan con OR: Postgres evalúa TODAS en cada fila. Además,
-- una política de más puede abrir lo que otra cerraba (en la v0.97 había 130
-- tablas donde un `for all` de escritura daba SELECT de arrastre y anulaba la
-- lectura por rol; ver `rls_escrituras_que_dan_lectura`).
--
-- Esta consulta NO cambia nada: lista, por tabla × rol × acción, las
-- políticas permisivas que se suman, con su `using`, para decidir a mano cuál
-- sobra o cómo se combinan en una sola. No genera sentencias: fusionar
-- políticas es una decisión de permisos, no un reemplazo mecánico.

with expandidas as (
  select p.tablename, p.policyname, p.qual, p.with_check,
         r.rol,
         case when p.cmd = 'ALL' then a.accion else p.cmd end as accion
  from pg_policies p
  cross join lateral unnest(p.roles) as r(rol)
  cross join lateral unnest(case when p.cmd = 'ALL'
                                 then array['SELECT','INSERT','UPDATE','DELETE']
                                 else array[p.cmd] end) as a(accion)
  where p.schemaname = 'public' and p.permissive = 'PERMISSIVE'
)
select tablename as tabla, rol, accion,
       count(*) as cuantas,
       array_agg(policyname order by policyname) as politicas,
       jsonb_object_agg(policyname, coalesce(qual, with_check)) as condiciones
from expandidas
group by tablename, rol, accion
having count(*) > 1
order by cuantas desc, tabla, rol, accion;
