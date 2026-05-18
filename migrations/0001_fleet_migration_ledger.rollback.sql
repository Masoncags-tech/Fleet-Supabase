-- Rollback for the initial Fleet migration ledger foundation.
-- Export any ledger rows before running this in an environment that has real cleanup history.

drop policy if exists "service role manages fleet migration ledger" on public.fleet_migration_ledger;
drop table if exists public.fleet_migration_ledger;
