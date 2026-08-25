**FlowState Task:** `task_9O8Y4Z2hcH`
**FlowState Milestone:** `mile_Xv442v-fH8`
**FlowState Project:** `proj__3viGkPhXu`
**FlowState Spec:** `docu_13E_mSxrv3`

# Phase 5 — Indexer, DB, defense-in-depth

## Findings closed in this PR

| #   | Severity | Source          | Action                                                                                                                                                                                                                                                                                |
| --- | -------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | High     | A-High#7        | Enable `PRAGMA foreign_keys = ON` on every D1 connection. Drizzle declares FK constraints but D1 silently ignores them without the per-connection pragma. Add a `getDb(d1)` factory in `db/index.ts` that wraps `drizzle()` and runs the pragma on first use. Convert all call sites. |
| 5.2 | Medium   | A-Med#11        | Make `handleAgentTransfer` resilient to out-of-order / replayed events: only update `walletAddress` if the current row's `walletAddress` matches `event.from` (case-insensitive). Apply the same guard to `handleDirectoryTransfer` and `handleOrgTransfer`.                          |
| 5.3 | Medium   | A-Med (auth)    | Add Cloudflare Rate Limiting binding `RATE_LIMITER_AUTH` (10 req / 60s / IP) on `POST /v1/auth/challenge` and `POST /v1/auth/verify`. Returns 429 + `Retry-After` on limit.                                                                                                           |
| 5.4 | Medium   | A-Med (auth)    | Per-wallet KV rate limit in `requireAuth`: 60 req / 60s general (`api`) and 10 req / 60s for chat-class routes (`chat`). Re-uses the minute-bucket pattern from Phase 3 memory-sync.                                                                                                  |
| 5.5 | High     | O-High#2        | Document upload size cap: hard limit of 50 MB enforced via `Content-Length` pre-check in `POST /v1/documents`. Reject with 413 before reading body.                                                                                                                                   |
| 5.6 | High     | O-Med#1+A-Low#5 | `.saga` container hardening in `sdk/src/container/extractor.ts`: reject entry filenames that contain `..` or start with `/`, cap per-file at 10 MB, cap total extracted at 100 MB, cap entry count at 1000. Throws `SagaContainerError` before any data is materialized.              |

## Findings deferred to follow-up tasks

| #                             | Severity | Why deferred                                                                                                                                                                                     |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reorg replay detection        | A-Med    | Per-txHash dedup table needs schema change + migration; out of scope here. The from-guard in 5.2 is sufficient for the swap-vector audit finding; reorg-resilience is a separate hardening task. |
| Cumulative cross-route quotas | Low      | Per-wallet KV quotas (storage, daily upload bytes) — needs product input on tier limits.                                                                                                         |

## Implementation

### 5.1 D1 PRAGMA foreign_keys = ON

**Problem.** Drizzle's `sqliteTable(...).references(...)` emits `FOREIGN KEY` clauses in the generated DDL, but **SQLite (and therefore D1) ignores those clauses unless `PRAGMA foreign_keys = ON` has run on the current connection**. Cloudflare D1 does not pre-enable foreign keys; every fresh connection starts with `foreign_keys = OFF`.

**Fix.** A `getDb(d1: D1Database)` factory in `packages/server/src/db/index.ts`:

```ts
export function getDb(d1: D1Database) {
  // PRAGMA must run BEFORE the first FK-sensitive write. D1 reuses the
  // underlying connection across requests in the same isolate, so we run
  // this once per drizzle() handle creation. The pragma is cheap (≤1ms).
  d1.exec('PRAGMA foreign_keys = ON').catch(() => {
    // The pragma fails silently on D1's prepared-statement path in some
    // cases; a follow-up `db.run(sql\`PRAGMA foreign_keys = ON\`)` covers it.
  })
  const db = drizzle(d1, { schema })
  // Belt-and-suspenders: also issue via drizzle so it lands on the same
  // prepared-statement queue as subsequent queries.
  db.run(sql`PRAGMA foreign_keys = ON`).catch(() => {})
  return db
}
```

All call sites — `routes/*.ts`, `indexer/chain-indexer.ts`, `__tests__/*` — switch from `drizzle(env.DB, { schema })` to `getDb(env.DB)`.

A regression test (`db-foreign-keys.test.ts`) inserts an agent + a document referencing it, deletes the agent (with `ON DELETE CASCADE` in the existing schema), and asserts the document is gone. Runs against `better-sqlite3` in-memory with the same pragma path.

### 5.2 Idempotent transfer-handler from-guard

**Problem.** `handleAgentTransfer` blindly updates `walletAddress = event.to` whenever a Transfer event lands for `tokenId`. If two Transfer events arrive out-of-order (reorg, indexer replay, federation re-broadcast), an older event can overwrite a newer ownership state.

**Fix.** Guard the update on `walletAddress = event.from` (stored values are already lowercase-normalized in `handleAgentRegistered` / `handleOrgRegistered` / `handleDirectoryRegistered`, so direct `eq` is safe):

```ts
await db
  .update(agents)
  .set({ walletAddress: event.to.toLowerCase(), updatedAt: ... })
  .where(and(
    eq(agents.tokenId, id),
    eq(agents.walletAddress, event.from.toLowerCase())
  ))
// When the row's current walletAddress no longer matches event.from
// (replay, out-of-order, reorg), the WHERE matches zero rows and the
// UPDATE is a safe no-op.
```

Apply to `handleAgentTransfer`, `handleDirectoryTransfer`, `handleOrgTransfer`. Add unit tests that:

- Apply a Transfer A→B then a stale Transfer A→C; assert state remains B.
- Apply the same Transfer A→B twice; assert exactly one effective update (no error).

### 5.3 Auth-endpoint Cloudflare Rate Limiting

**Problem.** `/v1/auth/challenge` and `/v1/auth/verify` are unprotected; an attacker can grind nonces or signature attempts.

**Fix.** Bind a Cloudflare Rate Limiting namespace `RATE_LIMITER_AUTH` (10 req / 60s, key = client IP via `cf-connecting-ip` header). Add a small middleware:

```ts
export function authRateLimit(c: Context, ip: string) {
  return c.env.RATE_LIMITER_AUTH.limit({ key: ip })
}
```

Wire into challenge/verify handlers; return 429 + `Retry-After: 60` on limit.

`wrangler.toml`:

```toml
[[unsafe.bindings]]
name = "RATE_LIMITER_AUTH"
type = "ratelimit"
namespace_id = "<allocated by CF>"
simple = { limit = 10, period = 60 }
```

For local dev / unit tests, supply a stub `RATE_LIMITER_AUTH` in `bindings.ts` test helpers that always allows.

### 5.4 Per-wallet KV rate limit in requireAuth

**Problem.** Authenticated session has no per-wallet quota; one wallet can flood the API.

**Fix.** Inside `requireAuth`, after the session is verified, increment a KV counter `rl:<wallet>:<minute>:<class>` with `expirationTtl = 65`. Reject with 429 if it exceeds the class limit:

| Class  | Limit (req/min) | Routes                       |
| ------ | --------------- | ---------------------------- |
| `api`  | 60              | default                      |
| `chat` | 10              | `/v1/chat/*`, relay outbound |

Re-use the bucket helper added in Phase 3 (`bucketKey(handle, 'mem-sync')`); add a small dispatcher that picks `class` from the route path. Make `RATE_LIMIT_API` / `RATE_LIMIT_CHAT` env-overridable for ops tuning.

### 5.5 Document upload size cap

**Problem.** `POST /v1/documents` reads the full body before checking size; an attacker can upload arbitrarily large `.saga` files.

**Fix.** Pre-check `Content-Length`:

```ts
const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024 // 50 MB
const len = Number(c.req.header('content-length') ?? '0')
if (!Number.isFinite(len) || len <= 0 || len > MAX_DOCUMENT_SIZE) {
  return c.json({ error: 'Document exceeds 50MB limit' }, 413)
}
```

Apply to both binary and JSON upload paths. Add a regression test that posts a 51 MB body and asserts 413 + no R2 write.

### 5.6 .saga container hardening (path-traversal + zip-bomb)

**Problem.** `extractor.ts` accepts arbitrary entry filenames and unbounded sizes. Malicious archives can:

- Path-traverse: `../../etc/passwd`
- Absolute-path: `/etc/passwd`
- Zip-bomb: 10 MB → 10 GB on extract
- Entry-count bomb: 100k tiny files

**Fix.** In the `unzip` function:

```ts
const MAX_PER_FILE = 10 * 1024 * 1024
const MAX_TOTAL = 100 * 1024 * 1024
const MAX_ENTRIES = 1000

let totalBytes = 0
let entryCount = 0

zipfile.on('entry', entry => {
  entryCount += 1
  if (entryCount > MAX_ENTRIES) throw new SagaContainerError('Too many entries')

  const name = entry.fileName
  if (name.includes('..') || name.startsWith('/') || name.includes('\\')) {
    throw new SagaContainerError(`Invalid filename: ${name}`)
  }
  if (entry.uncompressedSize > MAX_PER_FILE) {
    throw new SagaContainerError(`Entry ${name} exceeds 10MB`)
  }
  totalBytes += entry.uncompressedSize
  if (totalBytes > MAX_TOTAL) {
    throw new SagaContainerError('Container exceeds 100MB total')
  }
  // ... existing read path ...
})
```

Add `extractor.test.ts` with three malicious-archive fixtures (programmatically built):

- Path-traversal entry → throws.
- Absolute-path entry → throws.
- Highly-compressed bomb (`uncompressedSize > 10 MB`) → throws **before** any read.
- Entry count > 1000 → throws.

## Acceptance criteria

- `pnpm --filter @d7r/saga-server test` green
- `pnpm --filter @d7r/saga-cli test` green
- `pnpm --filter @d7r/saga-sdk test` green
- New tests:
  - `db-foreign-keys.test.ts`: cascade delete works; FK insert fails with PRAGMA on
  - `transfer-from-guard.test.ts`: stale Transfer no-ops; idempotent replay; correct from→to advances
  - `auth-rate-limit.test.ts`: 11th request in 60s returns 429 + Retry-After
  - `requireAuth-rate-limit.test.ts`: 61st `api` request returns 429; 11th `chat` returns 429
  - `documents-size-cap.test.ts`: Content-Length > 50MB returns 413; ≤ 50MB succeeds
  - `extractor.test.ts`: path-traversal, absolute-path, zip-bomb, entry-bomb all throw

## Out of scope

- Reorg replay detection via per-txHash dedup table (own task)
- Cumulative cross-route storage quotas (own task)
- Phase 6+ findings

## Commit plan

Single PR, multi-commit:

1. `feat(server): enable D1 PRAGMA foreign_keys via getDb factory` (5.1)
2. `feat(server): from-guard on Transfer event handlers` (5.2)
3. `feat(server): rate-limit auth endpoints + per-wallet KV quotas` (5.3 + 5.4)
4. `feat(server): document upload Content-Length pre-check` (5.5)
5. `feat(sdk): .saga container path-traversal + size caps` (5.6)

Each commit ends with `Built with d7r FlowState`.
