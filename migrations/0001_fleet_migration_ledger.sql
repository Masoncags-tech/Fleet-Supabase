-- Fleet migration ledger foundation.
-- No project refs or credentials belong in this file.

create table if not exists public.fleet_migration_ledger (
  id uuid primary key default gen_random_uuid(),
  migration_batch_id text not null,
  source_project text not null,
  source_table text not null,
  source_id text not null,
  source_identity_fingerprint text not null,
  semantic_fingerprint text,
  target_project text,
  target_table text,
  target_id text,
  action text not null check (
    action in (
      'insert',
      'update_candidate',
      'skip_duplicate',
      'skip_stale',
      'skip_unsafe',
      'manual_review',
      'archive_reference',
      'supersede',
      'freeze_write_path',
      'hide_from_active_view',
      'purge_after_retention'
    )
  ),
  status text not null check (
    status in ('planned', 'approved', 'applied', 'verified', 'rolled_back', 'failed')
  ),
  stale_reason text,
  duplicate_target_id text,
  approved_by text,
  approved_at timestamptz,
  applied_by text,
  applied_at timestamptz,
  verified_by text,
  verified_at timestamptz,
  verification_ref text,
  pre_image_ref text,
  pre_image_hash text,
  target_before_hash text,
  target_after_hash text,
  rollback_action text,
  rollback_ref text,
  error_code text,
  error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists fleet_migration_ledger_source_action_idx
  on public.fleet_migration_ledger (source_project, source_table, source_id, target_table, action);

create index if not exists fleet_migration_ledger_batch_idx
  on public.fleet_migration_ledger (migration_batch_id, status, action);

create index if not exists fleet_migration_ledger_created_idx
  on public.fleet_migration_ledger (created_at desc);

alter table public.fleet_migration_ledger enable row level security;

drop policy if exists "service role manages fleet migration ledger" on public.fleet_migration_ledger;
create policy "service role manages fleet migration ledger"
  on public.fleet_migration_ledger
  for all
  to public
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.fleet_migration_ledger is
  'Append-only audit ledger for Fleet database cleanup, migration, source-of-truth freezes, and retention-gated purge operations.';
