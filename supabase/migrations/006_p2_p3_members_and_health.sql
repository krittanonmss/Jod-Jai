begin;
create table if not exists public.jod_members (
 user_id text primary key,
 invited_by text not null,
 status text not null default 'active' check(status in ('active','revoked')),
 created_at timestamptz not null default now(), revoked_at timestamptz
);
create table if not exists public.jod_invites (
 code_hash text primary key, created_by text not null,
 expires_at timestamptz not null, used_by text, used_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.jod_rate_limits (
 user_id text primary key, window_start timestamptz not null default now(), request_count integer not null default 0
);
create table if not exists public.jod_maintenance (
 singleton boolean primary key default true check(singleton), last_cleanup_at timestamptz
);
insert into public.jod_maintenance(singleton) values(true) on conflict do nothing;
alter table public.jod_members enable row level security;
alter table public.jod_invites enable row level security;
alter table public.jod_rate_limits enable row level security;
alter table public.jod_maintenance enable row level security;
revoke all on public.jod_members,public.jod_invites,public.jod_rate_limits,public.jod_maintenance from anon,authenticated;
grant all on public.jod_members,public.jod_invites,public.jod_rate_limits,public.jod_maintenance to service_role;

create or replace function public.jod_redeem_invite(p_hash text,p_user text)
returns boolean language plpgsql security definer set search_path=public as $$
declare claimed text;
begin
 update jod_invites set used_by=p_user,used_at=now()
 where code_hash=p_hash and used_by is null and expires_at>now()
 returning used_by into claimed;
 if claimed is null then return false; end if;
 insert into jod_members(user_id,invited_by,status,revoked_at)
 select p_user,created_by,'active',null from jod_invites where code_hash=p_hash
 on conflict(user_id) do update set invited_by=excluded.invited_by,status='active',revoked_at=null;
 return true;
end $$;

create or replace function public.jod_take_rate_limit(p_user text,p_limit integer default 30,p_seconds integer default 60)
returns boolean language plpgsql security definer set search_path=public as $$
declare allowed boolean;
begin
 if p_limit<1 or p_seconds<1 then return false; end if;
 insert into jod_rate_limits(user_id,window_start,request_count) values(p_user,now(),1)
 on conflict(user_id) do update set
  window_start=case when jod_rate_limits.window_start<=now()-make_interval(secs=>p_seconds) then now() else jod_rate_limits.window_start end,
  request_count=case when jod_rate_limits.window_start<=now()-make_interval(secs=>p_seconds) then 1 else jod_rate_limits.request_count+1 end
 returning request_count<=p_limit into allowed;
 return allowed;
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
 delete from jod_invites where expires_at<now() or used_at<now()-interval '7 days';
 delete from jod_rate_limits where window_start<now()-interval '1 day';
 update jod_maintenance set last_cleanup_at=now() where singleton=true;
 return jsonb_build_object('drafts',drafts_count,'events',events_count,'mutations',mutations_count,'exports',exports_count);
end $$;

revoke all on function public.jod_redeem_invite(text,text) from public,anon,authenticated;
revoke all on function public.jod_take_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.jod_redeem_invite(text,text) to service_role;
grant execute on function public.jod_take_rate_limit(text,integer,integer) to service_role;
commit;
