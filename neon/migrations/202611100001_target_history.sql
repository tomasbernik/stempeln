create table if not exists public.stempeln_target_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  effective_from date not null,
  weekly_hours numeric(6, 2) not null check (weekly_hours > 0 and weekly_hours <= 120),
  created_at timestamptz not null default now(),
  unique (user_id, effective_from)
);

alter table public.stempeln_target_history enable row level security;

create policy "Stempeln users can read own target history"
  on public.stempeln_target_history for select
  using (auth.uid() = user_id);

create policy "Stempeln users can insert own target history"
  on public.stempeln_target_history for insert
  with check (auth.uid() = user_id);

create policy "Stempeln users can update own target history"
  on public.stempeln_target_history for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Stempeln users can delete own target history"
  on public.stempeln_target_history for delete
  using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete
  on table public.stempeln_target_history
  to authenticated;
