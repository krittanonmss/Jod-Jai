begin;
alter table public.jod_drafts add column if not exists qr_hash text;
create unique index if not exists jod_draft_qr_unique on public.jod_drafts(user_id,qr_hash) where qr_hash is not null and status<>'cancelled';
commit;
