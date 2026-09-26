begin;

-- A token is a snapshot promise. New confirmations are excluded by snapshot_at;
-- changes/deletions to rows already in the snapshot invalidate all of that user's
-- short-lived tokens so the route never returns a mixed-version CSV.
create or replace function public.jod_invalidate_exports_on_ledger_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.status='confirmed' and old.deleted_at is null and
   (new.status is distinct from old.status or new.deleted_at is distinct from old.deleted_at
    or new.amount_satang is distinct from old.amount_satang or new.occurred_at is distinct from old.occurred_at
    or new.category is distinct from old.category or new.description is distinct from old.description
    or new.recipient is distinct from old.recipient or new.provider is distinct from old.provider
    or new.reference is distinct from old.reference) then
  delete from jod_exports where user_id=old.user_id;
 end if;
 return new;
end $$;

drop trigger if exists jod_drafts_invalidate_exports on public.jod_drafts;
create trigger jod_drafts_invalidate_exports after update on public.jod_drafts
for each row execute function public.jod_invalidate_exports_on_ledger_change();

revoke all on function public.jod_invalidate_exports_on_ledger_change() from public,anon,authenticated;

commit;
