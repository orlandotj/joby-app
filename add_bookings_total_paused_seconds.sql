-- Adds total pause accumulation for the minimal WorkTimer model.
-- Run this in Supabase SQL Editor once.

alter table public.bookings
add column if not exists total_paused_seconds int not null default 0;
