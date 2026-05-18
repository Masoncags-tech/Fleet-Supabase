# Fleet Supabase

Schema, migrations, and safety tests for the Prairie Fleet control-plane Supabase project.

## Rules

- No secrets in this repo.
- No hardcoded project refs, service-role keys, anon keys, or DB passwords.
- SQL migrations must be reversible or paired with rollback notes.
- Executable migration helpers must maintain 100% coverage.
- Raw production applies require explicit Mason approval.

## Local checks

```bash
npm install
npm test
npm run coverage
```

## Apply pattern

Use Supabase CLI from a linked local workspace after approval:

```bash
supabase link --project-ref <fleet-project-ref>
supabase db query --linked -f migrations/0001_fleet_migration_ledger.sql
```
