-- Adds/ensures fields used for live work progress sync (WorkTimer)
-- Safe to run multiple times.

alter table public.bookings
  add column if not exists worked_seconds integer,
  add column if not exists worked_minutes_total integer,
  add column if not exists worked_minutes integer,
  add column if not exists worked_hours numeric,
  add column if not exists total_amount numeric,
  add column if not exists started_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists work_started_at timestamptz,
  add column if not exists work_paused_at timestamptz,
  add column if not exists work_ended_at timestamptz;

-- Notes:
-- 1) Ensure RLS policies allow the professional to UPDATE these fields on their own booking.
-- 2) Ensure the client can SELECT the booking (to view progress).
-- 3) For realtime updates: enable Realtime replication/publication for table "bookings" in Supabase.
