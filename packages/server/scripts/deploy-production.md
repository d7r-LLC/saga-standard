# Production deploy runbook — `saga-server`

The standing greenfield-against-production policy requires every D1
migration on the production database to be preceded by a manual backup.
There is no staging copy of production data; mistakes are not recoverable
without the backup file.

The package's `deploy:staging` script auto-chains
`db:migrate:staging && wrangler deploy --env staging` because staging
has no real data — re-running migrations is safe.

The `deploy:production` script INTENTIONALLY does NOT auto-chain
`db:migrate:production`. Migrations must be a deliberate, audited step.

## Steps

### 1. Verify migration list

```bash
pnpm exec wrangler d1 migrations list saga-hub --env production --remote
```

If the output says `No migrations to apply.` — skip to step 4 (worker-
only deploy).

If migrations are listed, continue.

### 2. Backup production D1

```bash
pnpm run db:backup:production
```

Writes a timestamped `.sql` file under `packages/server/backups/`. Do
NOT commit this file. Archive it for at least 30 days off-machine
(1Password Documents item, S3 bucket with versioning, etc.).

### 3. Apply migrations

```bash
pnpm run db:migrate:production
```

If a migration fails partway through, the migration table will reflect
which ones succeeded and which one threw. You can re-run this command
to retry the failed one — Wrangler resumes from the next pending
migration automatically. If a migration cannot be retried (e.g. a
column was partially added and the next attempt errors), restore from
the backup file produced in step 2:

```bash
pnpm exec wrangler d1 execute saga-hub --env production --remote \
  --file ./backups/saga-hub-production-<timestamp>.sql
```

### 4. Deploy the worker

```bash
pnpm run deploy:production
```

This is the same command `deploy:staging` runs in its second step —
just `wrangler deploy --env production` with no migration chained.

### 5. Smoke test

```bash
curl -s https://saga-server.d7r.workers.dev/v1/info | jq .
curl -s -o /dev/null -w "%{http_code}\n" https://saga-server.d7r.workers.dev/health
# Verify ADMIN_SECRET is configured (returns 401, not 403):
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://saga-server.d7r.workers.dev/admin/reindex
```

Expected: `/v1/info` returns the production `SERVER_NAME` JSON,
`/health` returns 200, `/admin/reindex` returns 401 (auth required;
would be 403 if the secret were missing).

### 6. Trigger an indexer pass

```bash
SECRET=$(op read "op://saga-prod/saga-server-production-admin-secret/value")
curl -s -X POST -H "X-Admin-Secret: $SECRET" \
  https://saga-server.d7r.workers.dev/admin/reindex | jq .
```

The response includes `prevCursor` and `cursor`. If `cursor` is the
same as `prevCursor`, the indexer hit a failure and didn't advance —
investigate via `wrangler tail`.

## Rollback

If a deploy fails post-migration, the worker code can be rolled back
via `wrangler rollback --env production`. The migration cannot be
auto-rolled-back; if the schema change is incompatible with the prior
worker code, restore D1 from the backup (step 3 fallback) and then
roll back the worker.

## Why this isn't automated

The D1 backup step writes a file that needs to be archived
out-of-band. Auto-chaining it into `deploy:production` would either
leave the file un-archived (defeats the purpose) or require a flag /
prompt that defeats the "deliberate, audited step" requirement of the
standing rule.
