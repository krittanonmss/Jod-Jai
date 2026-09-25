begin;

create or replace function public.jod_is_authorized(p_user text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from jod_owner where user_id=p_user)
     or exists(select 1 from jod_members where user_id=p_user and status='active');
$$;

create or replace function public.jod_authorize_and_rate(p_user text,p_limit integer default 30,p_seconds integer default 60)
returns jsonb language plpgsql security definer set search_path=public as $$
declare allowed_user boolean;
begin
 allowed_user := public.jod_is_authorized(p_user);
 if not allowed_user then
  return jsonb_build_object('authorized',false,'allowed',false,'count',0,'limit',p_limit);
 end if;
 return public.jod_take_rate_limit(p_user,p_limit,p_seconds) || jsonb_build_object('authorized',true);
end $$;

revoke all on function public.jod_is_authorized(text) from public,anon,authenticated;
revoke all on function public.jod_authorize_and_rate(text,integer,integer) from public,anon,authenticated;
grant execute on function public.jod_is_authorized(text) to service_role;
grant execute on function public.jod_authorize_and_rate(text,integer,integer) to service_role;

commit;
