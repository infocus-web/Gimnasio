\set ON_ERROR_STOP 1
-- usuarios
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a','admin@x.com'),('00000000-0000-0000-0000-00000000000b','staff@x.com');
select email, role from public.profiles order by email;

-- anon: ve planes y actividades, no ve socios
set role anon; set request.jwt.claims = '{"role":"anon"}';
select count(*) as planes_publicos from public.plans;
select count(*) as actividades from public.activities;
select count(*) as horarios from public.activity_schedule;
do $$ begin perform count(*) from public.members; raise exception 'anon NO debería ver socios'; exception when insufficient_privilege then raise notice 'OK anon sin acceso a members'; end $$;
reset role;

-- pending: no ve nada
set role authenticated; set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select count(*) as socios_visibles_pending from public.members;
do $$ begin perform public.check_in('x'); raise exception 'pending NO debería'; exception when others then raise notice 'OK pending: %', sqlerrm; end $$;
do $$ begin update public.profiles set role='admin' where id = auth.uid(); exception when others then raise notice 'OK auto-promocion bloqueada: %', sqlerrm; end $$;
reset role;
select email, role from public.profiles order by email;

-- admin
set role authenticated; set request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
update public.profiles set role='staff' where email='staff@x.com';
insert into public.members (first_name, last_name, dni, email, plan_id) select 'Juan','Pérez','30111222','juan@x.com', id from public.plans where name='Mensual libre';
insert into public.members (first_name, last_name, dni) values ('Ana','Gómez','28999888');
select first_name, status, days_left from public.members_view order by first_name;
select amount, method, period_from, period_to from public.record_payment((select id from members where dni='30111222'));
select amount, period_from, period_to from public.record_payment((select id from members where dni='30111222'), p_method=>'transferencia', p_months=>2);
select first_name, paid_until, status, days_left from public.members_view order by first_name;
select public.check_in(p_token => (select qr_token from members where dni='30111222'));
select public.check_in(p_token => (select qr_token from members where dni='30111222')) ->> 'duplicate' as dup;
select public.check_in(p_token => (select qr_token from members where dni='28999888')) ->> 'reason' as ana;
select public.check_in(p_token => 'noexiste');
insert into public.member_routines (member_id, routine_id) select m.id, r.id from members m, routines r where m.dni='30111222';
select jsonb_pretty(public.dashboard_stats()) as dash;
-- borrar el último pago vuelve el vencimiento atrás
delete from public.payments where id = (select id from payments order by created_at desc, period_to desc limit 1);
select paid_until from members where dni='30111222';
reset role;

-- service role (webhook MP) idempotente
set role service_role; set request.jwt.claims = '{"role":"service_role"}';
select period_to from public.record_payment((select id from public.members where dni='30111222'), p_method=>'mercadopago', p_mp_id=>'MP123');
select period_to from public.record_payment((select id from public.members where dni='30111222'), p_method=>'mercadopago', p_mp_id=>'MP123');
select count(*) as pagos_mp from public.payments where mp_payment_id='MP123';
reset role;

-- portal anónimo
set role anon; set request.jwt.claims = '{"role":"anon"}';
select jsonb_pretty(public.member_portal((select portal_token from public.members where dni='30111222'))) as portal \gset
reset role;
