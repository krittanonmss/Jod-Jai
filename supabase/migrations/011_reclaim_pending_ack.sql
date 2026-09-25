begin;

create or replace function public.jod_claim_pending_ack()
returns setof public.jod_events language plpgsql security definer set search_path=public as $$
declare picked uuid;
begin
  select id into picked from jod_events
  where ack_status='pending' or (ack_status='processing' and ack_lease_until<now())
  order by accepted_at
  for update skip locked limit 1;
  if picked is null then return; end if;
  return query update jod_events set ack_status='processing',ack_attempts=ack_attempts+1,
    ack_lease_until=now()+interval '2 minutes',ack_lease_token=gen_random_uuid()
  where id=picked returning *;
end $$;

revoke all on function public.jod_claim_pending_ack() from public,anon,authenticated;
grant execute on function public.jod_claim_pending_ack() to service_role;
commit;
