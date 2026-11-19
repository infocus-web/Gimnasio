-- 0062 · Profes que cobran cuotas (sin pasar a recepción).
-- El administrador habilita a un profe desde Panel → Equipo → interruptor "Cobros".
-- Eso guarda dos excepciones en staff_permission_overrides (granted = true):
--   · billing.write → registrar cobros (efectivo, transferencia, posnet) y asignar/renovar planes
--   · members.read  → buscar y abrir la ficha de cualquier socio (donde está "Registrar cobro")
-- No le da billing.read: sigue sin ver la caja, el cierre ni los pagos online.
--
-- Ajuste: quien cobra tiene que ver TODOS los planes activos (no solo los públicos)
-- para poder renovar a un socio que tiene un plan no publicado.
drop policy if exists plans_select on public.membership_plans;
create policy plans_select on public.membership_plans for select to authenticated
  using ((org_id in (select private.my_org_ids()) and active and is_public)
         or (select private.has_permission(org_id, 'billing.read'))
         or (select private.has_permission(org_id, 'billing.write')));
