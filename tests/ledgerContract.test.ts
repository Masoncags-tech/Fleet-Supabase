import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LEDGER_ACTIONS,
  LEDGER_STATUSES,
  LEDGER_TABLE,
  assertNoCredentialShape,
  isLedgerAction,
  isLedgerStatus,
} from '../src/ledgerContract'

const root = new URL('..', import.meta.url).pathname
const migration = readFileSync(join(root, 'migrations/0001_fleet_migration_ledger.sql'), 'utf8')
const rollback = readFileSync(join(root, 'migrations/0001_fleet_migration_ledger.rollback.sql'), 'utf8')

describe('ledger SQL contract', () => {
  it('creates the expected ledger table with RLS and service-role-only policy', () => {
    expect(LEDGER_TABLE).toBe('fleet_migration_ledger')
    expect(migration).toContain(`create table if not exists public.${LEDGER_TABLE}`)
    expect(migration).toContain(`alter table public.${LEDGER_TABLE} enable row level security`)
    expect(migration).toContain("auth.role() = 'service_role'")
  })

  it('contains every runtime action and status in the SQL check constraints', () => {
    for (const action of LEDGER_ACTIONS) expect(migration).toContain(`'${action}'`)
    for (const status of LEDGER_STATUSES) expect(migration).toContain(`'${status}'`)
  })

  it('ships a rollback that removes the policy and table', () => {
    expect(rollback).toContain(`drop policy if exists "service role manages fleet migration ledger" on public.${LEDGER_TABLE}`)
    expect(rollback).toContain(`drop table if exists public.${LEDGER_TABLE}`)
  })

  it('does not include obvious credential-shaped content or hardcoded project refs', () => {
    expect(assertNoCredentialShape(migration)).toEqual([])
    expect(migration).not.toMatch(/[a-z]{20}supabase|abcdefghijklmnopqrst/i)
  })
})

describe('ledger contract helpers', () => {
  it('recognizes valid and invalid actions', () => {
    expect(isLedgerAction('manual_review')).toBe(true)
    expect(isLedgerAction('delete_everything')).toBe(false)
  })

  it('recognizes valid and invalid statuses', () => {
    expect(isLedgerStatus('verified')).toBe(true)
    expect(isLedgerStatus('done')).toBe(false)
  })

  it('detects likely secret-shaped values in executable helpers', () => {
    const fake = ['Bearer', 'abc.def.ghi123456789'].join(' ')
    expect(assertNoCredentialShape(fake)).not.toEqual([])
  })
})
