begin;
alter table public.jod_events add column if not exists queue_order bigint generated always as identity;
create or replace function public.jod_claim_job()
returns setof public.jod_events language plpgsql security definer set search_path=public as $$
declare picked uuid;
begin
 select j.id into picked from jod_events j
 where ((j.status='pending' and j.available_at<=now()) or (j.status='processing' and j.lease_until<now()))
 and not exists(select 1 from jod_events earlier where earlier.user_id=j.user_id
  and earlier.status in ('pending','processing') and earlier.queue_order<j.queue_order)
 order by j.queue_order for update skip locked limit 1;
 if picked is null then return; end if;
 return query update jod_events set status='processing',attempts=attempts+1,
 lease_until=now()+interval '6 minutes',lease_token=gen_random_uuid() where id=picked returning *;
end $$;
create or replace function public.jod_summary(p_user text,p_from timestamptz,p_to timestamptz)
returns table(category text,total_satang bigint,entries bigint)
language sql security definer set search_path=public as $$
 select category,sum(amount_satang)::bigint,count(*) from jod_drafts
 where user_id=p_user and status='confirmed' and occurred_at>=p_from and occurred_at<p_to group by category;
$$;
revoke all on function public.jod_summary(text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.jod_summary(text,timestamptz,timestamptz) to service_role;
commit;
