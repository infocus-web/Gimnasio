-- Los profes pueden mandarle el link de pago de Mercado Pago a SUS alumnos (los de trainer_members):
-- solo del plan que el alumno ya tiene (no eligen plan ni monto) y sin acceso a cobros ni caja.

create or replace function public.trainer_payment_intent_create(p_org uuid, p_member uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_m       public.members;
  v_payer   public.members;
  v_account uuid;
  v_cur     uuid;
  v_plan    public.membership_plans;
  v_id      uuid;
  v_org     public.organizations;
  v_pct     int;
  v_amount  bigint;
begin
  if not exists (select 1 from public.staff s where s.org_id = p_org and s.user_id = auth.uid() and s.active) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  -- solo alumnos del profe (anotados a sus clases o asignados)
  if not exists (select 1 from public.trainer_members(p_org, 180) t where t.member_id = p_member) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_m from public.members where id = p_member and org_id = p_org and status <> 'archived';
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  v_account := v_m.billing_account_id;
  if v_account is null then raise exception 'PLAN_REQUIRED'; end if;
  select m.* into v_payer from public.billing_accounts ba join public.members m on m.id = ba.payer_member_id
   where ba.id = v_account;

  select plan_id into v_cur from public.memberships
   where billing_account_id = v_account and status in ('active', 'trialing', 'past_due', 'paused', 'expired')
   order by (status = 'expired'), current_period_end desc limit 1;
  if v_cur is null then raise exception 'PLAN_REQUIRED'; end if;
  select * into v_plan from public.membership_plans where id = v_cur and org_id = p_org and active;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  if v_plan.price_cents <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  v_pct := private.duo_discount_pct(v_payer.id);
  v_amount := case when v_pct > 0 then round(v_plan.price_cents * (100 - v_pct) / 100.0)::bigint else v_plan.price_cents end;
  select * into v_org from public.organizations where id = p_org;

  insert into public.payment_intents (org_id, kind, billing_account_id, member_id, plan_id, description, amount_cents,
                                      currency, source, buyer_email, buyer_name)
  values (p_org, 'membership', v_account, v_payer.id, v_plan.id,
          left(v_plan.name || case when v_pct > 0 then ' (promo de a dos -' || v_pct || '%)' else '' end || ' · ' || v_org.name, 200),
          v_amount, v_plan.currency, 'admin_link', v_payer.email, trim(v_payer.first_name || ' ' || v_payer.last_name))
  returning id into v_id;

  return jsonb_build_object(
    'intent_id', v_id, 'amount_cents', v_amount, 'discount_pct', v_pct, 'currency', v_plan.currency,
    'plan_id', v_plan.id, 'plan_name', v_plan.name, 'org_name', v_org.name, 'org_slug', v_org.slug,
    'payer_id', v_payer.id, 'payer_first_name', v_payer.first_name, 'payer_last_name', v_payer.last_name,
    'payer_email', v_payer.email, 'payer_phone', v_payer.phone);
end $$;

revoke all on function public.trainer_payment_intent_create(uuid, uuid) from public, anon;
grant execute on function public.trainer_payment_intent_create(uuid, uuid) to authenticated;
