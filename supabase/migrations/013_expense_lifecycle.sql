begin;

-- Legacy drafts must never wait forever on a field which is optional now.
update public.jod_drafts set edit_field=null where edit_field='description';

create or replace function public.jod_change_draft(p_event text,p_user text,p_id uuid,p_version integer,p_action text,p_patch jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d jod_drafts; previous jsonb; outcome jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_event,0));
 select result into previous from jod_mutations where event_id=p_event;
 if previous is not null then return previous; end if;
 select * into d from jod_drafts where id=p_id and user_id=p_user and deleted_at is null for update;
 if not found then outcome=jsonb_build_object('code','not_found');
 elsif d.status<>'draft' then outcome=jsonb_build_object('code',d.status,'draft',to_jsonb(d));
 elsif d.version<>p_version then outcome=jsonb_build_object('code','stale','draft',to_jsonb(d));
 elsif p_action='confirm' then
  if d.amount_satang is null or d.amount_satang<=0 or d.occurred_at is null or nullif(trim(d.recipient),'') is null or d.edit_field is not null then
   outcome=jsonb_build_object('code','incomplete','draft',to_jsonb(d));
  else
   update jod_drafts set status='confirmed',confirmed_at=now(),version=version+1 where id=d.id returning * into d;
   outcome=jsonb_build_object('code','saved','draft',to_jsonb(d));
  end if;
 elsif p_action='cancel' then
  update jod_drafts set status='cancelled',version=version+1 where id=d.id returning * into d;
  outcome=jsonb_build_object('code','cancelled','draft',to_jsonb(d));
 elsif p_action='patch' then
  update jod_drafts set amount_satang=case when p_patch?'amount_satang' then (p_patch->>'amount_satang')::bigint else amount_satang end,
   occurred_at=case when p_patch?'occurred_at' then (p_patch->>'occurred_at')::timestamptz else occurred_at end,
   recipient=case when p_patch?'recipient' then p_patch->>'recipient' else recipient end,
   description=case when p_patch?'description' then p_patch->>'description' else description end,
   category=case when p_patch?'category' then p_patch->>'category' else category end,
   edit_field=case when p_patch?'edit_field' then p_patch->>'edit_field' else edit_field end,version=version+1 where id=d.id returning * into d;
  outcome=jsonb_build_object('code','updated','draft',to_jsonb(d));
 else raise exception 'Invalid action'; end if;
 insert into jod_mutations(event_id,result) values(p_event,outcome); return outcome;
end $$;

drop function if exists public.jod_change_confirmed(text,text,uuid,integer,text);
create or replace function public.jod_change_confirmed(p_event text,p_user text,p_id uuid,p_version integer,p_action text,p_patch jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d jod_drafts; previous jsonb; outcome jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_event,0)); select result into previous from jod_mutations where event_id=p_event;
 if previous is not null then return previous; end if;
 select * into d from jod_drafts where id=p_id and user_id=p_user and deleted_at is null for update;
 if not found then outcome=jsonb_build_object('code','not_found');
 elsif d.status<>'confirmed' then outcome=jsonb_build_object('code',d.status,'draft',to_jsonb(d));
 elsif d.version<>p_version then outcome=jsonb_build_object('code','stale','draft',to_jsonb(d));
 elsif p_action='delete' then update jod_drafts set deleted_at=now(),status='cancelled',version=version+1 where id=d.id returning * into d; outcome=jsonb_build_object('code','deleted','draft',to_jsonb(d));
 elsif p_action='patch' then
  update jod_drafts set amount_satang=case when p_patch?'amount_satang' then (p_patch->>'amount_satang')::bigint else amount_satang end,
   occurred_at=case when p_patch?'occurred_at' then (p_patch->>'occurred_at')::timestamptz else occurred_at end,
   recipient=case when p_patch?'recipient' then p_patch->>'recipient' else recipient end,
   description=case when p_patch?'description' then p_patch->>'description' else description end,
   category=case when p_patch?'category' then p_patch->>'category' else category end,
   edit_field=case when p_patch?'edit_field' then p_patch->>'edit_field' else edit_field end,version=version+1 where id=d.id returning * into d;
  outcome=jsonb_build_object('code','updated','draft',to_jsonb(d));
 else raise exception 'Invalid action'; end if;
 insert into jod_mutations(event_id,result) values(p_event,outcome); return outcome;
end $$;

revoke all on function public.jod_change_draft(text,text,uuid,integer,text,jsonb) from public,anon,authenticated;
revoke all on function public.jod_change_confirmed(text,text,uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.jod_change_draft(text,text,uuid,integer,text,jsonb) to service_role;
grant execute on function public.jod_change_confirmed(text,text,uuid,integer,text,jsonb) to service_role;
commit;
