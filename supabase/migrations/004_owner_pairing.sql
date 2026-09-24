begin;
create table if not exists public.jod_owner (
 singleton boolean primary key default true check(singleton),
 user_id text not null unique, created_at timestamptz not null default now()
);
alter table public.jod_owner enable row level security;
revoke all on public.jod_owner from anon,authenticated;
grant all on public.jod_owner to service_role;
create or replace function public.jod_pair_owner(p_user text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 insert into jod_owner(singleton,user_id) values(true,p_user) on conflict(singleton) do nothing;
 return exists(select 1 from jod_owner where user_id=p_user);
end $$;
revoke all on function public.jod_pair_owner(text) from public,anon,authenticated;
grant execute on function public.jod_pair_owner(text) to service_role;
commit;
