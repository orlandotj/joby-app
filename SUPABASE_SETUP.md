# Supabase setup — Profiles table and RLS

To allow users to register and save profile data, create a `profiles` table and enable RLS with a policy that allows authenticated users to insert/update only their own row.

Example SQL (run in Supabase SQL editor):

```sql
-- Create profiles table
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  profession text,
  bio text,
  avatar text,
  cover_image text,
  age int,
  location text,
  areas text,
  hourly_rate numeric,
  daily_rate numeric,
  event_rate numeric,
  emergency_rate numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table public.profiles enable row level security;

-- Policy: allow authenticated users to insert their own profile
create policy "Insert own profile" on public.profiles
  for insert
  with check (auth.role() = 'authenticated' and id = auth.uid());

-- Policy: allow authenticated users to update only their own profile
create policy "Update own profile" on public.profiles
  for update
  using (auth.role() = 'authenticated' and id = auth.uid())
  with check (auth.role() = 'authenticated' and id = auth.uid());

-- Policy: allow authenticated users to select own profile
create policy "Select own profile" on public.profiles
  for select
  using (auth.role() = 'authenticated' and id = auth.uid());
```

Notes:

- The app expects `profiles.id` to match the Supabase Auth `user.id`.
- When a user signs up, the client attempts an `upsert` into `profiles`. Ensure the `Insert own profile` policy allows that.
- Consider adding `updated_at` trigger to update timestamp on changes.

Security recommendation:

- Keep minimal public columns in `profiles`.
- Use RLS to restrict access and never expose admin-level keys to the client.
