begin;
create table if not exists public.jod_drafts (
 id uuid primary key default gen_random_uuid(),
 short_code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
 user_id text not null, message_id text not null unique,
 image_hash text not null, provider text not null,
 status text not null default 'draft' check(status in ('draft','confirmed','cancelled')),
 version integer not null default 1,
 amount_satang bigint check(amount_satang > 0), gross_satang bigint, subsidy_satang bigint, fee_satang bigint,
 occurred_at timestamptz, recipient text, reference text, note text, description text,
 category text not null default 'อื่น ๆ', edit_field text,
 created_at timestamptz not null default now(), confirmed_at timestamptz
);
create unique index if not exists jod_draft_image_unique on public.jod_drafts(user_id,image_hash) where status <> 'cancelled';
create unique index if not exists jod_draft_ref_unique on public.jod_drafts(user_id,provider,reference) where reference is not null and status <> 'cancelled';
create index if not exists jod_drafts_user_status on public.jod_drafts(user_id,status,created_at);
create table if not exists public.jod_events (
 id uuid primary key default gen_random_uuid(), event_id text not null unique, user_id text not null,
 payload jsonb not null, occurred_ms bigint not null, created_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','processing','done','dead')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 lease_until timestamptz, lease_token uuid, response jsonb, last_error text
);
create index if not exists jod_events_work on public.jod_events(status,available_at);
create table if not exists public.jod_mutations (
 event_id text primary key, result jsonb not null, created_at timestamptz not null default now()
);
alter table public.jod_drafts enable row level security;
alter table public.jod_events enable row level security;
alter table public.jod_mutations enable row level security;
revoke all on public.jod_drafts, public.jod_events, public.jod_mutations from anon, authenticated;
grant all on public.jod_drafts, public.jod_events, public.jod_mutations to service_role;

-- FIFO per user, with a lease longer than the Vercel function timeout.
create or replace function public.jod_claim_job()
returns setof public.jod_events language plpgsql security definer set search_path = public as $$
declare picked uuid;
begin
 select j.id into picked from jod_events j
 where ((j.status='pending' and j.available_at<=now()) or (j.status='processing' and j.lease_until<now()))
 and not exists(select 1 from jod_events earlier where earlier.user_id=j.user_id
  and earlier.status in ('pending','processing')
  and (earlier.created_at,earlier.id)<(j.created_at,j.id))
 order by j.created_at,j.id for update skip locked limit 1;
 if picked is null then return; end if;
 return query update jod_events set status='processing', attempts=attempts+1,
  lease_until=now()+interval '6 minutes',lease_token=gen_random_uuid() where id=picked returning *;
end $$;

-- Mutations are atomic and replay-safe. Versioned buttons cannot confirm edited data.
create or replace function public.jod_change_draft(p_event text,p_user text,p_id uuid,p_version integer,p_action text,p_patch jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d jod_drafts; previous jsonb; outcome jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_event,0));
 select result into previous from jod_mutations where event_id=p_event;
 if previous is not null then return previous; end if;
 select * into d from jod_drafts where id=p_id and user_id=p_user for update;
 if not found then outcome=jsonb_build_object('code','not_found');
 elsif d.status<>'draft' then outcome=jsonb_build_object('code',d.status,'draft',to_jsonb(d));
 elsif d.version<>p_version then outcome=jsonb_build_object('code','stale','draft',to_jsonb(d));
 elsif p_action='confirm' then
  if d.amount_satang is null or d.amount_satang<=0 or d.occurred_at is null or nullif(trim(d.description),'') is null or d.edit_field is not null then
   outcome=jsonb_build_object('code','incomplete','draft',to_jsonb(d));
  else
   update jod_drafts set status='confirmed',confirmed_at=now(),version=version+1 where id=d.id returning * into d;
   outcome=jsonb_build_object('code','saved','draft',to_jsonb(d));
  end if;
 elsif p_action='cancel' then
  update jod_drafts set status='cancelled',version=version+1 where id=d.id returning * into d;
  outcome=jsonb_build_object('code','cancelled','draft',to_jsonb(d));
 elsif p_action='patch' then
  update jod_drafts set
   amount_satang=case when p_patch?'amount_satang' then (p_patch->>'amount_satang')::bigint else amount_satang end,
   occurred_at=case when p_patch?'occurred_at' then (p_patch->>'occurred_at')::timestamptz else occurred_at end,
   recipient=case when p_patch?'recipient' then p_patch->>'recipient' else recipient end,
   description=case when p_patch?'description' then p_patch->>'description' else description end,
   category=case when p_patch?'category' then p_patch->>'category' else category end,
   edit_field=case when p_patch?'edit_field' then p_patch->>'edit_field' else edit_field end,
   version=version+1 where id=d.id returning * into d;
  outcome=jsonb_build_object('code','updated','draft',to_jsonb(d));
 else raise exception 'Invalid action';
 end if;
 insert into jod_mutations(event_id,result) values(p_event,outcome);
 return outcome;
end $$;
revoke all on function public.jod_claim_job() from public,anon,authenticated;
revoke all on function public.jod_change_draft(text,text,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.jod_claim_job() to service_role;
grant execute on function public.jod_change_draft(text,text,uuid,integer,text,jsonb) to service_role;
commit;
