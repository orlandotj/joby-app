-- Work sessions (Realtime-friendly)
-- Goal: client sees live timer/value via Realtime events (start/pause/resume/finish)

-- Required extension for gen_random_uuid()
create extension if not exists pgcrypto;

create table if not exists public.work_sessions (
  id uuid primary key default gen_random_uuid(),

  -- Links
  booking_id uuid not null references public.bookings(id) on delete cascade,
  service_id uuid null references public.services(id) on delete set null,
  client_id uuid null,
  professional_id uuid not null,

  -- State
  status text not null check (status in ('running', 'paused', 'finished')),
  started_at timestamptz not null,
  paused_at timestamptz null,
  total_paused_seconds integer not null default 0,
  rate_per_hour numeric not null default 25,

  -- Pricing model
  payment_type text not null default 'hourly' check (payment_type in ('hourly', 'daily', 'event')),
  fixed_amount numeric null,

  -- Finalization (server-side source of truth)
  finished_at timestamptz null,
  elapsed_seconds_final integer null,
  amount_final numeric null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_work_sessions_updated_at on public.work_sessions;
create trigger trg_work_sessions_updated_at
before update on public.work_sessions
for each row execute function public.set_updated_at();

-- Only 1 active session per booking
create unique index if not exists work_sessions_one_active_per_booking
  on public.work_sessions (booking_id)
  where status in ('running', 'paused');

create index if not exists work_sessions_booking_id_idx
  on public.work_sessions (booking_id);

create index if not exists work_sessions_professional_id_idx
  on public.work_sessions (professional_id);

create index if not exists work_sessions_client_id_idx
  on public.work_sessions (client_id);

-- RLS
alter table public.work_sessions enable row level security;

-- Read: client or professional involved
drop policy if exists "work_sessions_select_involved" on public.work_sessions;
create policy "work_sessions_select_involved"
  on public.work_sessions
  for select
  to authenticated
  using (
    auth.uid() = professional_id
    or (client_id is not null and auth.uid() = client_id)
  );

-- Insert: only professional creates their session
drop policy if exists "work_sessions_insert_professional" on public.work_sessions;
create policy "work_sessions_insert_professional"
  on public.work_sessions
  for insert
  to authenticated
  with check (auth.uid() = professional_id);

-- Update: only professional updates their session
drop policy if exists "work_sessions_update_professional" on public.work_sessions;
create policy "work_sessions_update_professional"
  on public.work_sessions
  for update
  to authenticated
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);

-- Optional: server-side finalize.
-- Computes elapsed_seconds from timestamps, and amount based on payment_type.
create or replace function public.finalize_work_session(p_session_id uuid)
returns table (
  session_id uuid,
  elapsed_seconds integer,
  amount numeric
)
language plpgsql
as $$
declare
  s public.work_sessions%rowtype;
  now_ts timestamptz := now();
  end_ts timestamptz;
  total_pause integer;
  paused_extra integer := 0;
  elapsed integer;
  amt numeric;
  pay_type text;
begin
  select * into s
  from public.work_sessions
  where id = p_session_id
  limit 1;

  if not found then
    raise exception 'work_session not found';
  end if;

  -- If currently paused, count the pause segment until now.
  if s.status = 'paused' and s.paused_at is not null then
    paused_extra := greatest(0, floor(extract(epoch from (now_ts - s.paused_at))));
  end if;

  end_ts := coalesce(s.finished_at, now_ts);
  total_pause := greatest(0, coalesce(s.total_paused_seconds, 0) + paused_extra);

  elapsed := greatest(0, floor(extract(epoch from (end_ts - s.started_at))) - total_pause);

  pay_type := coalesce(s.payment_type, 'hourly');
  if pay_type = 'hourly' then
    amt := (elapsed::numeric / 3600) * coalesce(s.rate_per_hour, 25);
  else
    amt := coalesce(s.fixed_amount, s.amount_final, 0);
  end if;

  update public.work_sessions
  set
    status = 'finished',
    finished_at = now_ts,
    paused_at = null,
    total_paused_seconds = total_pause,
    elapsed_seconds_final = elapsed,
    amount_final = amt
  where id = s.id;

  session_id := s.id;
  elapsed_seconds := elapsed;
  amount := amt;
  return next;
end;
$$;
