-- Work session events (audit log)
-- Stores all timestamps (start/pause/resume/finish) and optional payloads.
-- This complements work_sessions (current state) with a full history.

create extension if not exists pgcrypto;

create table if not exists public.work_session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.work_sessions(id) on delete cascade,

  -- Derived from work_sessions via trigger (keeps data consistent)
  booking_id uuid null,
  client_id uuid null,
  professional_id uuid null,

  actor_id uuid not null default auth.uid(),

  event_type text not null check (event_type in ('start', 'pause', 'resume', 'finish')),
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists work_session_events_session_id_idx
  on public.work_session_events (session_id);

create index if not exists work_session_events_booking_id_idx
  on public.work_session_events (booking_id);

create index if not exists work_session_events_occurred_at_idx
  on public.work_session_events (occurred_at);

-- Populate booking/client/professional from the parent session
create or replace function public.populate_work_session_event_refs()
returns trigger
language plpgsql
as $$
declare
  s public.work_sessions%rowtype;
begin
  select * into s from public.work_sessions where id = new.session_id limit 1;
  if not found then
    raise exception 'work_session not found';
  end if;

  new.booking_id := s.booking_id;
  new.client_id := s.client_id;
  new.professional_id := s.professional_id;

  if new.actor_id is null then
    new.actor_id := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_work_session_events_refs on public.work_session_events;
create trigger trg_work_session_events_refs
before insert on public.work_session_events
for each row execute function public.populate_work_session_event_refs();

-- RLS
alter table public.work_session_events enable row level security;

-- Read: anyone involved in the session can read its events
drop policy if exists "work_session_events_select_involved" on public.work_session_events;
create policy "work_session_events_select_involved"
  on public.work_session_events
  for select
  to authenticated
  using (
    auth.uid() = professional_id
    or (client_id is not null and auth.uid() = client_id)
    or auth.uid() = actor_id
  );

-- Insert: only involved users can log events for a session
drop policy if exists "work_session_events_insert_involved" on public.work_session_events;
create policy "work_session_events_insert_involved"
  on public.work_session_events
  for insert
  to authenticated
  with check (
    actor_id = auth.uid()
    and exists (
      select 1
      from public.work_sessions s
      where s.id = session_id
        and (auth.uid() = s.professional_id or (s.client_id is not null and auth.uid() = s.client_id))
    )
  );
