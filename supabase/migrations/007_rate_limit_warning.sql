begin;
drop function if exists public.jod_take_rate_limit(text,integer,integer);
create or replace function public.jod_take_rate_limit(p_user text,p_limit integer default 30,p_seconds integer default 60)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  current_count integer;
  allowed boolean;
begin
  if p_limit<1 or p_seconds<1 then return jsonb_build_object('allowed',false,'count',0); end if;
  insert into jod_rate_limits(user_id,window_start,request_count) values(p_user,now(),1)
  on conflict(user_id) do update set
   window_start=case when jod_rate_limits.window_start<=now()-make_interval(secs=>p_seconds) then now() else jod_rate_limits.window_start end,
   request_count=case when jod_rate_limits.window_start<=now()-make_interval(secs=>p_seconds) then 1 else jod_rate_limits.request_count+1 end
  returning request_count into current_count;
  allowed := current_count <= p_limit;
  return jsonb_build_object('allowed',allowed,'count',current_count,'limit',p_limit);
end $$;
revoke all on function public.jod_take_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.jod_take_rate_limit(text,integer,integer) to service_role;
commit;
