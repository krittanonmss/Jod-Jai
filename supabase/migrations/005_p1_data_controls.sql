begin;
create table if not exists public.jod_exports (
 token_hash text primary key,
 user_id text not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index if not exists jod_exports_expiry on public.jod_exports(expires_at);
alter table public.jod_exports enable row level security;
revoke all on public.jod_exports from anon,authenticated;
grant all on public.jod_exports to service_role;

create or replace function public.jod_change_confirmed(
 p_event text,p_user text,p_id uuid,p_version integer,p_action text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare d jod_drafts; previous jsonb; outcome jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_event,0));
 select result into previous from jod_mutations where event_id=p_event;
 if previous is not null then return previous; end if;
 select * into d from jod_drafts where id=p_id and user_id=p_user for update;
 if not found then outcome=jsonb_build_object('code','not_found');
 elsif d.status<>'confirmed' then outcome=jsonb_build_object('code',d.status,'draft',to_jsonb(d));
 elsif d.version<>p_version then outcome=jsonb_build_object('code','stale','draft',to_jsonb(d));
 elsif p_action='reopen' then
  update jod_drafts set status='draft',confirmed_at=null,edit_field=null,version=version+1 where id=d.id returning * into d;
  outcome=jsonb_build_object('code','reopened','draft',to_jsonb(d));
 elsif p_action='delete' then
  delete from jod_drafts where id=d.id;
  outcome=jsonb_build_object('code','deleted','draft',to_jsonb(d));
 else raise exception 'Invalid action';
 end if;
 insert into jod_mutations(event_id,result) values(p_event,outcome);
 return outcome;
end $$;

create or replace function public.jod_clear_user_history(p_user text,p_keep_event text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare drafts_count bigint; events_count bigint; mutations_count bigint; exports_count bigint;
begin
 delete from jod_drafts where user_id=p_user; get diagnostics drafts_count=row_count;
 delete from jod_events where user_id=p_user and event_id<>p_keep_event; get diagnostics events_count=row_count;
 delete from jod_mutations where result#>>'{draft,user_id}'=p_user; get diagnostics mutations_count=row_count;
 delete from jod_exports where user_id=p_user; get diagnostics exports_count=row_count;
 return jsonb_build_object('drafts',drafts_count,'events',events_count,'mutations',mutations_count,'exports',exports_count);
end $$;

create or replace function public.jod_cleanup_old_data(p_months integer default 6)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cutoff timestamptz; drafts_count bigint; events_count bigint; mutations_count bigint; exports_count bigint;
begin
 if p_months<1 or p_months>120 then raise exception 'Invalid retention window'; end if;
 cutoff=now()-make_interval(months=>p_months);
 delete from jod_drafts where coalesce(confirmed_at,occurred_at,created_at)<cutoff; get diagnostics drafts_count=row_count;
 delete from jod_events where status in ('done','dead') and created_at<cutoff; get diagnostics events_count=row_count;
 delete from jod_mutations where created_at<cutoff; get diagnostics mutations_count=row_count;
 delete from jod_exports where expires_at<now(); get diagnostics exports_count=row_count;
 return jsonb_build_object('drafts',drafts_count,'events',events_count,'mutations',mutations_count,'exports',exports_count);
end $$;

revoke all on function public.jod_change_confirmed(text,text,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.jod_clear_user_history(text,text) from public,anon,authenticated;
revoke all on function public.jod_cleanup_old_data(integer) from public,anon,authenticated;
grant execute on function public.jod_change_confirmed(text,text,uuid,integer,text) to service_role;
grant execute on function public.jod_clear_user_history(text,text) to service_role;
grant execute on function public.jod_cleanup_old_data(integer) to service_role;
commit;
