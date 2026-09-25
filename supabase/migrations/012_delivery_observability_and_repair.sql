begin;

alter table public.jod_events
  add column if not exists received_at timestamptz not null default now(),
  add column if not exists claimed_at timestamptz,
  add column if not exists response_original jsonb,
  add column if not exists timing_ms jsonb not null default '{}'::jsonb;

create index if not exists jod_events_response_repair
  on public.jod_events(renderer_version,status)
  where renderer_version like '%fallback%' or status='dead';

commit;
