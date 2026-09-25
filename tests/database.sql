begin;
do $$
declare d uuid; confirmed_d uuid; other_d uuid; r jsonb; total bigint; claim public.jod_events;
begin
 insert into public.jod_drafts(user_id,message_id,image_hash,provider,amount_satang,occurred_at,description,category,reference)
 values('__jod_test_owner__','__jod_test_message__','__jod_test_hash__','scb',200000,'2026-09-22T12:40:00Z','ทดสอบ','อื่น ๆ','__jod_ref__') returning id into d;
 select coalesce(sum(total_satang),0) into total from public.jod_summary('__jod_test_owner__','2026-09-01','2026-10-01');
 if total<>0 then raise exception 'Draft counted in summary';end if;
 r:=public.jod_change_draft('__jod_wrong_user__','another_user',d,1,'confirm');
 if r->>'code'<>'not_found' then raise exception 'Cross-user mutation allowed';end if;
 r:=public.jod_change_draft('__jod_edit__','__jod_test_owner__',d,1,'patch','{"description":"แก้ไขแล้ว"}');
 if r->>'code'<>'updated' then raise exception 'Edit failed';end if;
 r:=public.jod_change_draft('__jod_stale__','__jod_test_owner__',d,1,'confirm');
 if r->>'code'<>'stale' then raise exception 'Stale button confirmed';end if;
 r:=public.jod_change_draft('__jod_confirm__','__jod_test_owner__',d,2,'confirm');
 if r->>'code'<>'saved' then raise exception 'Confirmation failed';end if;
 confirmed_d:=d;
 r:=public.jod_change_draft('__jod_confirm__','__jod_test_owner__',d,2,'confirm');
 if r->>'code'<>'saved' then raise exception 'Event replay is not idempotent';end if;
 r:=public.jod_change_draft('__jod_confirm_again__','__jod_test_owner__',d,2,'confirm');
 if r->>'code'<>'confirmed' then raise exception 'Double confirmation changed state';end if;
 select coalesce(sum(total_satang),0) into total from public.jod_summary('__jod_test_owner__','2026-09-01','2026-10-01');
 if total<>200000 then raise exception 'Incorrect confirmed total';end if;
 select coalesce(sum(total_satang),0) into total from public.jod_summary('another_user','2026-09-01','2026-10-01');
 if total<>0 then raise exception 'Cross-user summary';end if;
 r:=public.jod_change_confirmed('__jod_confirmed_wrong__','another_user',confirmed_d,3,'delete');
 if r->>'code'<>'not_found' then raise exception 'Cross-user confirmed deletion allowed';end if;
 r:=public.jod_change_confirmed('__jod_reopen__','__jod_test_owner__',confirmed_d,3,'reopen');
 if r->>'code'<>'reopened' then raise exception 'Confirmed record cannot be reopened';end if;
 r:=public.jod_change_draft('__jod_reconfirm__','__jod_test_owner__',confirmed_d,4,'confirm');
 if r->>'code'<>'saved' then raise exception 'Reopened record cannot be confirmed';end if;
 begin
  insert into public.jod_drafts(user_id,message_id,image_hash,provider,reference) values('__jod_test_owner__','__duplicate__','different_hash','scb','__jod_ref__');
  raise exception 'Duplicate slip reference accepted';
 exception when unique_violation then null;end;
 insert into public.jod_drafts(user_id,message_id,image_hash,provider) values('__jod_test_owner__','__incomplete__','different_hash','scb') returning id into d;
 r:=public.jod_change_draft('__jod_incomplete__','__jod_test_owner__',d,1,'confirm');
 if r->>'code'<>'incomplete' then raise exception 'Incomplete confirmation';end if;
 r:=public.jod_change_draft('__jod_cancel__','__jod_test_owner__',d,1,'cancel');
 if r->>'code'<>'cancelled' then raise exception 'Cancellation failed';end if;
 insert into public.jod_drafts(user_id,message_id,image_hash,provider,amount_satang,occurred_at,description,status)
 values('__jod_clear_other__','__jod_clear_other_message__','__jod_clear_other_hash__','manual',100,'2026-09-01','keep','confirmed') returning id into other_d;
 r:=public.jod_clear_user_history('__jod_test_owner__','__keep_current_event__');
 if (r->>'drafts')::bigint<2 then raise exception 'User history was not cleared';end if;
 if not exists(select 1 from public.jod_drafts where id=other_d) then raise exception 'Clear history crossed users';end if;
 insert into public.jod_drafts(user_id,message_id,image_hash,provider,amount_satang,occurred_at,description,status,created_at)
 values('__jod_retention__','__jod_old_message__','__jod_old_hash__','manual',100,'2000-01-01','old','confirmed','2000-01-01'),
 ('__jod_retention__','__jod_recent_message__','__jod_recent_hash__','manual',100,now(),'recent','confirmed',now());
 perform public.jod_cleanup_old_data(120);
 if exists(select 1 from public.jod_drafts where message_id='__jod_old_message__') then raise exception 'Old data retained';end if;
 if not exists(select 1 from public.jod_drafts where message_id='__jod_recent_message__') then raise exception 'Recent data deleted';end if;
 if has_table_privilege('anon','public.jod_drafts','SELECT') or has_table_privilege('authenticated','public.jod_drafts','SELECT') then raise exception 'Public table grant';end if;
 if has_function_privilege('anon','public.jod_change_draft(text,text,uuid,integer,text,jsonb)','EXECUTE') then raise exception 'Public mutation RPC';end if;
 if exists(select 1 from pg_class where relname in ('jod_drafts','jod_events','jod_mutations','jod_exports','jod_members','jod_invites','jod_rate_limits','jod_maintenance') and not relrowsecurity) then raise exception 'RLS disabled';end if;
 insert into public.jod_invites(code_hash,created_by,expires_at) values(repeat('a',64),'__jod_owner__',now()+interval '1 hour');
 if not public.jod_redeem_invite(repeat('a',64),'__jod_member__') then raise exception 'Invite redemption failed';end if;
 if public.jod_redeem_invite(repeat('a',64),'__jod_attacker__') then raise exception 'Invite reused';end if;
 if not exists(select 1 from public.jod_members where user_id='__jod_member__' and status='active') then raise exception 'Member not activated';end if;
 if not public.jod_is_authorized('__jod_member__') then raise exception 'Member authorization failed';end if;
 r:=public.jod_authorize_and_rate('__jod_rate_attacker__',2,60);
 if (r->>'authorized')::boolean or exists(select 1 from public.jod_rate_limits where user_id='__jod_rate_attacker__') then raise exception 'Unauthorized user consumed rate limit';end if;
 r:=public.jod_authorize_and_rate('__jod_member__',2,60);
 if not (r->>'authorized')::boolean or not (r->>'allowed')::boolean then raise exception 'Authorized member rejected';end if;
 if not (public.jod_take_rate_limit('__jod_rate__',2,60)->>'allowed')::boolean or not (public.jod_take_rate_limit('__jod_rate__',2,60)->>'allowed')::boolean then raise exception 'Rate limit rejected early';end if;
 if (public.jod_take_rate_limit('__jod_rate__',2,60)->>'allowed')::boolean then raise exception 'Rate limit did not stop burst';end if;
 if not exists(select 1 from public.jod_owner) then
  if not public.jod_pair_owner('__pair_owner__') then raise exception 'Owner pairing failed';end if;
  if public.jod_pair_owner('__attacker__') then raise exception 'Owner pairing can be stolen';end if;
  if not public.jod_pair_owner('__pair_owner__') then raise exception 'Owner pairing replay failed';end if;
 end if;
 insert into public.jod_events(event_id,user_id,occurred_ms,payload) values('__job_one__','__queue_owner__',1,'{}'),('__job_two__','__queue_owner__',2,'{}');
 select * into claim from public.jod_claim_job();
 if claim.event_id<>'__job_one__' then raise exception 'Queue order incorrect';end if;
 if exists(select 1 from public.jod_claim_job()) then raise exception 'Same user runs concurrently';end if;
 update public.jod_events set lease_until=now()-interval '1 second' where id=claim.id;
 select * into claim from public.jod_claim_job();
 if claim.event_id<>'__job_one__' or claim.attempts<>2 then raise exception 'Crash lease recovery failed';end if;
end $$;
rollback;
