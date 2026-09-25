begin;

create or replace function public.jod_summary(p_user text,p_from timestamptz,p_to timestamptz)
returns table(category text,total_satang bigint,entries bigint)
language sql security definer set search_path=public as $$
 select category,sum(amount_satang)::bigint,count(*) from jod_drafts
 where user_id=p_user and status='confirmed' and deleted_at is null
   and occurred_at>=p_from and occurred_at<p_to
 group by category order by category;
$$;
revoke all on function public.jod_summary(text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.jod_summary(text,timestamptz,timestamptz) to service_role;
commit;
