-- Upgrade work_sessions to support non-hourly payment types
-- Adds columns: payment_type, fixed_amount
-- Updates finalize_work_session to compute amount accordingly.

alter table if exists public.work_sessions
  add column if not exists payment_type text not null default 'hourly'
    check (payment_type in ('hourly', 'daily', 'event')),
  add column if not exists fixed_amount numeric null;

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
