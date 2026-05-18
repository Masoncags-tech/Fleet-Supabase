export const LEDGER_TABLE = 'fleet_migration_ledger' as const

export const LEDGER_ACTIONS = [
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
  'purge_after_retention',
] as const

export const LEDGER_STATUSES = [
  'planned',
  'approved',
  'applied',
  'verified',
  'rolled_back',
  'failed',
] as const

export type LedgerAction = (typeof LEDGER_ACTIONS)[number]
export type LedgerStatus = (typeof LEDGER_STATUSES)[number]

export function isLedgerAction(value: string): value is LedgerAction {
  return (LEDGER_ACTIONS as readonly string[]).includes(value)
}

export function isLedgerStatus(value: string): value is LedgerStatus {
  return (LEDGER_STATUSES as readonly string[]).includes(value)
}

export function assertNoCredentialShape(text: string): string[] {
  const patterns = [
    /service[_-]?role\s*=/i,
    /anon[_-]?key\s*=/i,
    /password\s*=/i,
    /bearer\s+[a-z0-9._-]{12,}/i,
    /sk-[a-z0-9_-]{12,}/i,
    /gh[pousr]_[a-z0-9_]{12,}/i,
  ]
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source)
}
