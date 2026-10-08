-- Neon Data API requires explicit grants in addition to row-level policies.
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on table public.stempeln_work_entries
  to authenticated;
