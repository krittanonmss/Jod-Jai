begin;

-- Export tokens describe a stable snapshot. Rows confirmed after token creation are
-- intentionally excluded; deletions remain deletions and invalidate tokens on a
-- full history clear or member revocation.
alter table public.jod_exports
  add column if not exists snapshot_at timestamptz not null default now(),
  add column if not exists expected_count bigint not null default 0,
  add column if not exists expected_total_satang bigint not null default 0;

create index if not exists jod_drafts_export_cursor
  on public.jod_drafts(user_id,occurred_at desc,id desc)
  where status='confirmed' and deleted_at is null;

create or replace function public.jod_create_export(p_hash text,p_user text,p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare snap timestamptz:=clock_timestamp(); row_count bigint; total bigint;
begin
 if p_expires_at<=snap or p_expires_at>snap+interval '15 minutes' then raise exception 'Invalid export expiry'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user,0));
 select count(*),coalesce(sum(amount_satang),0) into row_count,total from jod_drafts
  where user_id=p_user and status='confirmed' and deleted_at is null and confirmed_at<=snap;
 insert into jod_exports(token_hash,user_id,expires_at,snapshot_at,expected_count,expected_total_satang)
 values(p_hash,p_user,p_expires_at,snap,row_count,total);
 return jsonb_build_object('count',row_count,'total_satang',total,'snapshot_at',snap);
end $$;

create or replace function public.jod_export_token_valid(p_hash text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from jod_exports x where x.token_hash=p_hash and x.expires_at>now())
$$;

create or replace function public.jod_export_page(
 p_hash text,p_cursor_occurred timestamptz default null,p_cursor_id uuid default null,p_limit integer default 1000
) returns table(id uuid,occurred_at timestamptz,amount_satang bigint,category text,description text,
 recipient text,provider text,reference text,created_at timestamptz,confirmed_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
declare owner_id text; snap timestamptz;
begin
 if p_limit<1 or p_limit>1000 then raise exception 'Invalid export page size'; end if;
 select x.user_id,x.snapshot_at into owner_id,snap from jod_exports x
  where x.token_hash=p_hash and x.expires_at>now();
 if owner_id is null then return; end if;
 return query select d.id,d.occurred_at,d.amount_satang,d.category,d.description,d.recipient,d.provider,d.reference,d.created_at,d.confirmed_at
  from jod_drafts d where d.user_id=owner_id and d.status='confirmed' and d.deleted_at is null
   and d.confirmed_at<=snap
   and (p_cursor_occurred is null or (d.occurred_at,d.id)<(p_cursor_occurred,p_cursor_id))
  order by d.occurred_at desc,d.id desc limit p_limit;
end $$;

-- Revocation and queue/export fencing are one transaction. Work already executing
-- may finish its current database call, but cannot deliver after the worker's
-- authorization recheck.
create or replace function public.jod_revoke_member(p_owner text,p_user text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare member_count bigint; event_count bigint; export_count bigint;
begin
 update jod_members set status='revoked',revoked_at=now() where user_id=p_user and status='active'; get diagnostics member_count=row_count;
 update jod_events set status='done',payload='{}'::jsonb,lease_until=null,last_error='authorization_revoked'
  where user_id=p_user and status in ('pending','processing'); get diagnostics event_count=row_count;
 delete from jod_exports where user_id=p_user; get diagnostics export_count=row_count;
 return jsonb_build_object('members',member_count,'events',event_count,'exports',export_count);
end $$;

-- A cleared event receipt is removed while an in-flight worker may still hold it.
-- Delete only artifacts whose stable source identifiers prove they came from that
-- stale event; never touch unrelated ledger rows.
create or replace function public.jod_discard_stale_event_artifacts(p_user text,p_event text,p_message text default null)
returns bigint language plpgsql security definer set search_path=public as $$
declare removed bigint;
begin
 delete from jod_drafts where user_id=p_user and (message_id=p_message or message_id='manual:'||p_event);
 get diagnostics removed=row_count;
 delete from jod_mutations where event_id=p_event or event_id like p_event||':%';
 return removed;
end $$;

create or replace function public.jod_clear_user_history(p_user text,p_keep_event text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare drafts_count bigint; events_count bigint; mutations_count bigint; exports_count bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user,0));
 update jod_drafts set deleted_at=now(),status='cancelled',version=version+1 where user_id=p_user and deleted_at is null;
 get diagnostics drafts_count=row_count;
 update jod_events set status='done',payload='{}'::jsonb,lease_until=null,last_error='history_cleared'
  where user_id=p_user and event_id<>p_keep_event and status in ('pending','processing');
 delete from jod_events where user_id=p_user and event_id<>p_keep_event; get diagnostics events_count=row_count;
 delete from jod_mutations where result#>>'{draft,user_id}'=p_user; get diagnostics mutations_count=row_count;
 delete from jod_exports where user_id=p_user; get diagnostics exports_count=row_count;
 return jsonb_build_object('drafts',drafts_count,'events',events_count,'mutations',mutations_count,'exports',exports_count);
end $$;

-- Operational records have short, explicit horizons; confirmed ledger retention
-- remains configurable. Dry-run and real cleanup use exactly the same predicates.
create or replace function public.jod_cleanup_old_data_v2(p_ledger_months integer default 6,p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ledger_cutoff timestamptz; drafts_count bigint; events_count bigint; mutations_count bigint;
 exports_count bigint; invites_count bigint; rates_count bigint; deleted_count bigint;
begin
 if p_ledger_months<1 or p_ledger_months>120 then raise exception 'Invalid retention window'; end if;
 ledger_cutoff=now()-make_interval(months=>p_ledger_months);
 select count(*) into drafts_count from jod_drafts where deleted_at is null and coalesce(confirmed_at,occurred_at,created_at)<ledger_cutoff;
 select count(*) into deleted_count from jod_drafts where deleted_at<now()-interval '7 days';
 select count(*) into events_count from jod_events where status in ('done','dead') and created_at<now()-interval '30 days';
 select count(*) into mutations_count from jod_mutations where created_at<now()-interval '30 days';
 select count(*) into exports_count from jod_exports where expires_at<now();
 select count(*) into invites_count from jod_invites where expires_at<now() or used_at<now()-interval '7 days';
 select count(*) into rates_count from jod_rate_limits where window_start<now()-interval '1 day';
 if not p_dry_run then
  delete from jod_drafts where deleted_at is null and coalesce(confirmed_at,occurred_at,created_at)<ledger_cutoff;
  delete from jod_drafts where deleted_at<now()-interval '7 days';
  delete from jod_events where status in ('done','dead') and created_at<now()-interval '30 days';
  delete from jod_mutations where created_at<now()-interval '30 days';
  delete from jod_exports where expires_at<now();
  delete from jod_invites where expires_at<now() or used_at<now()-interval '7 days';
  delete from jod_rate_limits where window_start<now()-interval '1 day';
  update jod_maintenance set last_cleanup_at=now() where singleton=true;
 end if;
 return jsonb_build_object('ledger',drafts_count,'soft_deleted',deleted_count,'events',events_count,
  'mutations',mutations_count,'exports',exports_count,'invites',invites_count,'rate_counters',rates_count,
  'ledger_months',p_ledger_months,'dry_run',p_dry_run);
end $$;

revoke all on function public.jod_create_export(text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.jod_export_token_valid(text) from public,anon,authenticated;
revoke all on function public.jod_export_page(text,timestamptz,uuid,integer) from public,anon,authenticated;
revoke all on function public.jod_revoke_member(text,text) from public,anon,authenticated;
revoke all on function public.jod_discard_stale_event_artifacts(text,text,text) from public,anon,authenticated;
revoke all on function public.jod_cleanup_old_data_v2(integer,boolean) from public,anon,authenticated;
revoke all on function public.jod_clear_user_history(text,text) from public,anon,authenticated;
grant execute on function public.jod_create_export(text,text,timestamptz) to service_role;
grant execute on function public.jod_export_token_valid(text) to service_role;
grant execute on function public.jod_export_page(text,timestamptz,uuid,integer) to service_role;
grant execute on function public.jod_revoke_member(text,text) to service_role;
grant execute on function public.jod_discard_stale_event_artifacts(text,text,text) to service_role;
grant execute on function public.jod_cleanup_old_data_v2(integer,boolean) to service_role;
grant execute on function public.jod_clear_user_history(text,text) to service_role;

commit;
