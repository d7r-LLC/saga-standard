**FlowState Task:** `task_gklHMM9fv6`
**FlowState Milestone:** `mile_Xv442v-fH8`
**FlowState Project:** `proj__3viGkPhXu`
**FlowState Spec:** `docu_13E_mSxrv3`

# Phase 3 — Federation & relay integrity (scoped)

## Context

Phase 3 of the 2026-05-03 security remediation. The full spec lists 5 sub-items spanning federation integrity, memory-sync provenance, and DO-alarm-driven re-auth. Three of those sub-items are architectural changes (per-envelope sender signature, session-tied provenance, periodic re-auth) that touch both the saga-client-rt React Native runtime and the relay server, and need their own design pass.

This PR ships the two contained, server-side-only sub-items that close concrete attack vectors today, and explicitly tracks the remaining three as follow-up tasks under the same milestone.

## Findings closed in this PR

| #   | Severity | Source   | Action                                                                                                                                                                        |
| --- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.3 | Medium   | A-Med#12 | Indexer Transfer event sets a per-directory rotation sentinel; federation forwards reject envelopes from a directory whose operator rotated AFTER the federation link authed. |
| 3.5 | High     | A-High#4 | Per-handle rate limit on memory-sync envelopes (60 envelopes per 60s window via KV counter). Returns `relay:error` MEMORY_SYNC_RATE_LIMIT when exceeded.                      |

## Findings deferred to follow-up tasks under same milestone

| #   | Severity              | Why deferred                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | **Critical** A-Crit#1 | Per-envelope sender signature in federation forwarding. Requires (a) wire-format change to add `senderSig` to RelayEnvelope, (b) client-side signing in saga-client-rt React Native runtime (wallet access pattern), (c) server-side public-key cache + verify, (d) coordinated client+server release. Architectural — needs its own design pass + spec update. |
| 3.2 | High A-High#4         | Memory-sync envelope provenance via originating-session timestamp binding. Requires per-handle `latestSessionAt` tracking in KV/DO state, threaded through every memory-sync handler, plus careful semantics around multi-DERP simultaneous sessions. Substantial.                                                                                              |
| 3.4 | Medium A-Med#12       | Periodic federation re-auth (every 1h, new challenge over WS). Requires DO alarm wiring + WS challenge protocol extension. Smaller than 3.1/3.2 but still wants its own focused PR.                                                                                                                                                                             |

## Implementation

### 3.3 Federation link drop on operator-wallet rotation

When `handleDirectoryTransfer` (in `indexer/event-handlers.ts`) processes an ERC-721 Transfer event for a SAGADirectoryIdentity NFT, it now also writes a per-directory rotation sentinel to the SESSIONS KV namespace:

```
fed:rotated:<directoryId> = <ISO timestamp of the Transfer>
```

The federation forward handler (`relay-room.ts handleFederationForward`) reads this sentinel before processing each envelope. If the sentinel exists AND the rotation timestamp is newer than the federation link's `authedAt` attachment field, the handler closes the WS with code 4003 ("Operator rotated, please re-authenticate"). The peer must re-establish the link by re-running the federation auth handshake — at which point the sentinel becomes older than the new `authedAt` and forwards resume.

The `WebSocketAttachment` shape gains an `authedAt: string` field on the federation variant so the comparison is meaningful. The federation auth handler stamps it on success.

Sentinel TTL is 24 hours so it long-outlives any reasonable WS link duration.

### 3.5 Memory-sync rate limit per handle

In `relay-room.ts`, before processing a `memory-sync` envelope, increment a per-handle counter in the SESSIONS KV namespace keyed `mem-sync:<handle>:<minute-bucket>`. Each minute is a separate bucket (60-second granularity is enough).

If the counter exceeds 60 in the current bucket, reply with:

```
{ type: 'relay:error', messageId: envelope.id, code: 'MEMORY_SYNC_RATE_LIMIT', error: '...' }
```

…and skip storage / fan-out.

Buckets auto-expire via KV TTL = 90 seconds (covers the bucket + a small grace).

The threshold (60/min/handle) is generous for normal use and tight enough to catch the attack pattern in the audit (sudden burst from a never-seen connection). Operators can tune via env var `MEMORY_SYNC_RATE_LIMIT` if needed.

## Acceptance criteria

- `pnpm --filter @d7r/saga-server test` green (existing 317 + new tests for 3.3, 3.5)
- New tests shipped (3 total):
  - `directory-indexer`: writes `fed:rotated:<directoryId>` sentinel when KV is provided
  - `directory-indexer`: omits sentinel when KV is not provided (back-compat)
  - `relay-room`: 4th memory-sync envelope past the configured limit (in the same fake-timer-pinned minute bucket) returns `relay:error` with code `MEMORY_SYNC_RATE_LIMIT`

  Federation-side sentinel-against-`authedAt` integration tests (forward closes WS when sentinel post-dates auth, succeeds when older, resets after re-auth) are not in this PR — they require a fuller relay-test harness for the `relay:forward` path that we don't have today. Tracked alongside the deferred 3.4 follow-up.

## Out of scope

- 3.1, 3.2, 3.4 — see deferred table above
- Phase 4+ findings

## Commit plan

Single commit:

```
feat(server): Phase 3 (scoped) — federation link drop on rotation + memory-sync rate limit

Built with d7r FlowState
```
