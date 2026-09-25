begin;

alter table public.jod_events
  add column if not exists accepted_at timestamptz not null default now(),
  add column if not exists result_saved_at timestamptz,
  add column if not exists result_delivered_at timestamptz,
  add column if not exists result_delivery_attempts integer not null default 0,
  add column if not exists renderer_version text not null default 'v1',
  add column if not exists ack_status text not null default 'not_required'
    check(ack_status in ('not_required','pending','processing','accepted')),
  add column if not exists ack_attempts integer not null default 0,
  add column if not exists ack_lease_until timestamptz,
  add column if not exists ack_lease_token uuid,
  add column if not exists ack_accepted_at timestamptz,
  add column if not exists ack_last_error text;

create index if not exists jod_events_ack_work
  on public.jod_events(ack_status,ack_lease_until)
  where ack_status in ('pending','processing');

-- Atomically deduplicate an inbound logical event before it affects either the
-- rate window or the business queue.  A limited event is retained with its
-- final response so the notice has the same durable delivery path as any other
-- response.  Only the first over-limit event receives a notice.
create or replace function public.jod_accept_event(
  p_event text,
  p_user text,
  p_occurred_ms bigint,
  p_payload jsonb,
  p_config_authorized boolean default false,
  p_limit integer default 30,
  p_seconds integer default 60
) returns table(id uuid, inserted boolean, authorized boolean, allowed boolean, request_count integer)
language plpgsql security definer set search_path=public as $$
declare existing_id uuid; rate jsonb; saved_response jsonb; image_event boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_event,0));
  select e.id into existing_id from jod_events e where e.event_id=p_event;
  if existing_id is not null then
    return query select existing_id,false,true,true,0;
    return;
  end if;

  if not p_config_authorized and not public.jod_is_authorized(p_user) then
    return query select null::uuid,false,false,false,0;
    return;
  end if;

  rate:=public.jod_take_rate_limit(p_user,p_limit,p_seconds);
  image_event:=p_payload#>>'{message,type}'='image';
  if not coalesce((rate->>'allowed')::boolean,false) then
    if (rate->>'count')::integer=p_limit+1 then
      saved_response:=jsonb_build_array(jsonb_build_object(
        'type','text',
        'text',format('⚠️ คุณส่งข้อความมากเกินไป (%s/%s ต่อนาที) กรุณารอสักครู่นะครับ',p_limit,p_limit)
      ));
    else
      saved_response:='[]'::jsonb;
    end if;
  end if;

  insert into jod_events(event_id,user_id,occurred_ms,payload,response,ack_status)
  values(p_event,p_user,p_occurred_ms,p_payload,saved_response,
    case when image_event and coalesce((rate->>'allowed')::boolean,false) then 'pending' else 'not_required' end)
  returning jod_events.id into existing_id;
  return query select existing_id,true,true,coalesce((rate->>'allowed')::boolean,false),coalesce((rate->>'count')::integer,0);
end $$;

-- A reply-token acknowledgement is best effort.  Claiming it first makes an
-- uncertain attempt visible; a later worker can reclaim and use a push message
-- with a stable retry key instead of silently losing the acknowledgement.
create or replace function public.jod_claim_ack(p_event_id uuid)
returns setof public.jod_events language plpgsql security definer set search_path=public as $$
declare picked uuid;
begin
  select id into picked from jod_events
  where id=p_event_id and (ack_status='pending' or (ack_status='processing' and ack_lease_until<now()))
  for update skip locked;
  if picked is null then return; end if;
  return query update jod_events set ack_status='processing',ack_attempts=ack_attempts+1,
    ack_lease_until=now()+interval '2 minutes',ack_lease_token=gen_random_uuid()
  where id=picked returning *;
end $$;

revoke all on function public.jod_accept_event(text,text,bigint,jsonb,boolean,integer,integer) from public,anon,authenticated;
revoke all on function public.jod_claim_ack(uuid) from public,anon,authenticated;
grant execute on function public.jod_accept_event(text,text,bigint,jsonb,boolean,integer,integer) to service_role;
grant execute on function public.jod_claim_ack(uuid) to service_role;
commit;
