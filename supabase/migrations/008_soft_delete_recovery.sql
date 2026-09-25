begin;
alter table public.jod_drafts add column if not exists deleted_at timestamptz;
create index if not exists jod_drafts_deleted_at on public.jod_drafts(deleted_at) where deleted_at is not null;

create or replace function public.jod_clear_user_history(p_user text,p_keep_event text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare drafts_count bigint; events_count bigint; mutations_count bigint; exports_count bigint;
begin
  update jod_drafts set deleted_at=now(),status='cancelled' where user_id=p_user and deleted_at is null; get diagnostics drafts_count=row_count;
  delete from jod_events where user_id=p_user and event_id<>p_keep_event; get diagnostics events_count=row_count;
  delete from jod_mutations where result#>>'{draft,user_id}'=p_user; get diagnostics mutations_count=row_count;
  delete from jod_exports where user_id=p_user; get diagnostics exports_count=row_count;
  return jsonb_build_object('drafts',drafts_count,'events',events_count,'mutations',mutations_count,'exports',exports_count);
end $$;

create or replace function public.jod_recover_user_history(p_user text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare recovered_count bigint;
begin
  update jod_drafts set deleted_at=null,status='draft' where user_id=p_user and deleted_at is not null and deleted_at>now()-interval '7 days'; get diagnostics recovered_count=row_count;
  return jsonb_build_object('recovered',recovered_count);
end $$;

create or replace function public.jod_cleanup_old_data(p_months integer default 6)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cutoff timestamptz; drafts_count bigint; events_count bigint; mutations_count bigint; exports_count bigint; permanently_deleted bigint;
begin
  if p_months<1 or p_months>120 then raise exception 'Invalid retention window'; end if;
  cutoff=now()-make_interval(months=>p_months);
  delete from jod_drafts where coalesce(confirmed_at,occurred_at,created_at)<cutoff and deleted_at is null; get diagnostics drafts_count=row_count;
  delete from jod_drafts where deleted_at is not null and deleted_at<now()-interval '7 days'; get diagnostics permanently_deleted=row_count;
  delete from jod_events where status in ('done','dead') and created_at<cutoff; get diagnostics events_count=row_count;
  delete from jod_mutations where created_at<cutoff; get diagnostics mutations_count=row_count;
  delete from jod_exports where expires_at<now(); get diagnostics exports_count=row_count;
  delete from jod_invites where expires_at<now() or used_at<now()-interval '7 days';
  delete from jod_rate_limits where window_start<now()-interval '1 day';
  update jod_maintenance set last_cleanup_at=now() where singleton=true;
  return jsonb_build_object('drafts',drafts_count,'events',events_count,'mutations',mutations_count,'exports',exports_count,'permanently_deleted',permanently_deleted);
end $$;

revoke all on function public.jod_clear_user_history(text,text) from public,anon,authenticated;
revoke all on function public.jod_recover_user_history(text) from public,anon,authenticated;
revoke all on function public.jod_cleanup_old_data(integer) from public,anon,authenticated;
grant execute on function public.jod_clear_user_history(text,text) to service_role;
grant execute on function public.jod_recover_user_history(text) to service_role;
grant execute on function public.jod_cleanup_old_data(integer) to service_role;
commit;