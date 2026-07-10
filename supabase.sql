create extension if not exists "pgcrypto";

create table if not exists public.work_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  break_minutes integer not null default 30 check (break_minutes >= 0 and break_minutes <= 240),
  type text not null default 'work' check (type in ('work', 'vacation', 'sick', 'holiday')),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, work_date)
);

alter table public.work_entries enable row level security;

create policy "Users can read own entries"
  on public.work_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert own entries"
  on public.work_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can update own entries"
  on public.work_entries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own entries"
  on public.work_entries for delete
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_work_entries_updated_at on public.work_entries;
create trigger set_work_entries_updated_at
before update on public.work_entries
for each row execute function public.set_updated_at();
