-- 0063 · Control del dinero: los cobros no se tocan después de registrados.
--
-- 1) Nadie con sesión (recepción, profes con «Cobros», admin) puede MODIFICAR un pago directamente.
--    Los únicos cambios posibles pasan por funciones controladas:
--      · void_payment (anular, con motivo)  · webhooks de Mercado Pago (service_role: devoluciones)
-- 2) "Quién cobró" lo fija siempre la base con la sesión real (no se puede poner a otra persona).
-- 3) La anulación guarda quién anuló y cuándo, y se ve en la Caja.

-- ---------------------------------------------------------------------
-- 1. Pagos de solo lectura para los usuarios
-- ---------------------------------------------------------------------
drop policy if exists payments_update on public.payments;
revoke update on public.payments from authenticated, anon;

-- ---------------------------------------------------------------------
-- 2. recorded_by = el usuario de la sesión (si hay sesión)
--    Webhooks y procesos automáticos (sin sesión) lo dejan vacío = "pago online"
-- ---------------------------------------------------------------------
create or replace function private.payments_force_recorder() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.recorded_by := auth.uid();
  return new;
end $$;

drop trigger if exists payments_force_recorder on public.payments;
create trigger payments_force_recorder before insert on public.payments
  for each row execute function private.payments_force_recorder();
revoke execute on function private.payments_force_recorder() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Quién anuló y cuándo
-- ---------------------------------------------------------------------
alter table public.payments
  add column if not exists voided_by uuid,
  add column if not exists voided_at timestamptz;

create or replace function public.void_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_p public.payments;
begin
  select * into v_p from public.payments where id = p_payment for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if not private.has_permission(v_p.org_id, 'billing.write') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_p.status <> 'succeeded' then raise exception 'PAYMENT_NOT_VOIDABLE'; end if;
  update public.payments
     set status    = 'canceled',
         note      = concat_ws(' · ', note, 'Anulado: ' || coalesce(nullif(btrim(p_reason), ''), 'sin motivo')),
         voided_by = auth.uid(),
         voided_at = now()
   where id = p_payment;
  update public.invoices set status = 'void' where id = v_p.invoice_id;
end $$;
revoke execute on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.void_payment(uuid, text) to authenticated;

-- Mismo listado de siempre + quién anuló y cuándo (columnas nuevas al final)
create or replace view public.payment_ledger with (security_invoker = true) as
select p.id, p.org_id, p.paid_at, p.created_at, p.amount_cents, p.currency, p.provider, p.status, p.note,
       p.billing_account_id,
       m.id  as payer_member_id,
       trim(m.first_name || ' ' || m.last_name) as payer_name,
       pl.name as plan_name,
       i.period_end,
       st.display_name as recorded_by_name,
       p.voided_at,
       sv.display_name as voided_by_name
  from public.payments p
  join public.billing_accounts ba on ba.id = p.billing_account_id
  join public.members m on m.id = ba.payer_member_id
  left join public.invoices i on i.id = p.invoice_id
  left join public.memberships ms on ms.id = i.membership_id
  left join public.membership_plans pl on pl.id = ms.plan_id
  left join public.staff st on st.user_id = p.recorded_by and st.org_id = p.org_id
  left join public.staff sv on sv.user_id = p.voided_by and sv.org_id = p.org_id;
grant select on public.payment_ledger to authenticated;
