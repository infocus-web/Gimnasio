-- El padrón ya no responde "OK" en silencio cuando el email ya es del equipo o
-- ya tiene una solicitud pendiente: confundía (parecía enviado y no aparecía nada).
do $$
declare def text;
begin
  def := pg_get_functiondef('public.submit_staff_request(text,text,text,text,text,text,text,text)'::regprocedure);
  def := replace(def,
$o$  if exists (select 1 from public.staff s join auth.users u on u.id = s.user_id where s.org_id = v_org and lower(u.email) = v_email)
     or exists (select 1 from public.staff_requests where org_id = v_org and email = v_email and status = 'pending') then
    return 'OK';
  end if;$o$,
$n$  if exists (select 1 from public.staff s join auth.users u on u.id = s.user_id where s.org_id = v_org and lower(u.email) = v_email) then
    raise exception 'ALREADY_STAFF';
  end if;
  if exists (select 1 from public.staff_requests where org_id = v_org and email = v_email and status = 'pending') then
    raise exception 'ALREADY_PENDING';
  end if;$n$);
  if position('ALREADY_STAFF' in def) = 0 then raise exception 'patch submit_staff_request failed'; end if;
  execute def;
end $$;
