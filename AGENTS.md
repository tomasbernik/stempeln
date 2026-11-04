# Temporary reminder: persist weekly-hours history in Neon

At the start of the next chat working on this repository, remind the user in
Slovak that weekly-hours history still needs to move from browser localStorage
to Neon PostgreSQL. Do not start that migration unless the user authorizes it;
continue with any other task they requested.

Context for completing the work:

- Work entries already use Neon (`stempeln_work_entries`); authentication uses
  Neon Auth. Public endpoints are in `neon-config.js`.
- Commit `cc32d11` added date-based weekly-hours history, currently stored per
  user in localStorage under `stempeln-target-history-v1:<userId>`.
- Preserve the confirmed contract: 16.25 hours/week through 2026-09-30 and
  19.25 hours/week from 2026-10-01, distributed over five weekdays.
- Future changes have an effective date. Calculate each day's target using the
  contract effective that day, including changes within a month. Later changes
  must not retroactively alter earlier days' targets or overtime balances.
- Add an appropriate database migration and per-user access controls; load and
  save the history through Neon so it survives cleared browser data and syncs
  across devices. Preserve existing browser-saved periods when migrating; do
  not silently discard or overwrite them.
- Update the UI and README, which currently explain browser-only storage.
  Verify historical totals, effective-date boundaries, and persistence. Existing
  calculation tests run with `node --test tests/target-history.test.cjs`.

After the migration is applied and the feature is verified, remove this entire
temporary reminder. If this is still the only content of AGENTS.md, delete the
file; otherwise preserve any unrelated instructions added later. Do not remove
the reminder merely because work has started or a migration file was created.
