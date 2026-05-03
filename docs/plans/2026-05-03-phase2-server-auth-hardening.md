**FlowState Task:** `task_mA_LIKeXEs`
**FlowState Milestone:** `mile_Xv442v-fH8`
**FlowState Project:** `proj__3viGkPhXu`
**FlowState Spec:** `docu_13E_mSxrv3`

# Phase 2 — Server auth & session hardening

## Context

Phase 2 of the 2026-05-03 security remediation. Tightens the session/auth boundary on the SAGA reference server. Blocks production agent provisioning until shipped.

## Findings resolved (this PR)

| #    | Severity | Source   | Action                                                                      |
| ---- | -------- | -------- | --------------------------------------------------------------------------- |
| 2.1  | High     | G-High#1 | `/admin/reindex` fail-closed when `ADMIN_SECRET` unset (regression test)    |
| 2.2  | High     | A-High#5 | `DELETE /v1/auth/sessions/:token` for self-revocation                       |
| 2.3  | High     | A-High#5 | `DELETE /v1/auth/sessions` for revoke-all (post-rotation)                   |
| 2.4  | High     | A-High#5 | Per-wallet revocation list in KV; `requireAuth` checks before granting      |
| 2.5a | High     | A-High#5 | Reduce session TTL 1h → 15 min                                              |
| 2.7  | Medium   | O-Med#3  | `publicKey` input validation (32-byte base64) on agent + org register       |
| 2.8  | Medium   | O-Med#2  | WebSocket `relay:send` auth-state race — hoist auth check to top of handler |

## Deferred to a follow-up task

| #    | Severity   | Why deferred                                                                                                                                                                                                                                             |
| ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.5b | High       | Refresh-token flow (rotating refresh tokens) — touches every authenticated client; needs separate spec + migration story. Tracked as a follow-up under the same milestone.                                                                               |
| 2.6  | High (O#1) | Cross-table handle TOCTOU — requires a unified `handles` registry table + SQL migration + dual-write in agents.ts + orgs.ts. Substantive architectural change; needs its own design + migration review. Tracked as a follow-up under the same milestone. |

## Implementation

### 2.1 `/admin/reindex` fail-closed

`packages/server/src/index.ts:80-88` already returns 403 if `ADMIN_SECRET` is unset (the prior fix landed). What's missing is a **regression test** that pins the behavior so it can't drift back.

Add a test in `packages/server/src/__tests__/server.test.ts` that posts to `/admin/reindex` without setting `ADMIN_SECRET` on the env, asserts 403, and verifies that providing any `X-Admin-Secret` header value still returns 403.

### 2.2 + 2.3 Session revocation endpoints

Add to `packages/server/src/routes/auth.ts`:

- `DELETE /v1/auth/sessions/:token` (auth required) — delete the matching token from `SESSIONS` KV. Caller must own the session (token must match the bearer token OR token must belong to the same wallet).
- `DELETE /v1/auth/sessions` (auth required) — revoke ALL sessions for the authenticated wallet. Marks the wallet in a per-wallet revocation entry (`session:revoked:<wallet>` in KV) with a timestamp. Existing tokens for that wallet remain valid up to TTL but the middleware (2.4) checks the revocation entry on every request and rejects.

The "revoke all" path doesn't enumerate KV keys (KV doesn't support efficient prefix listing for tokens). Instead it sets a per-wallet sentinel; the middleware compares each session's `issuedAt` against the sentinel and rejects sessions issued before the revocation timestamp.

To support this, the session payload now includes `issuedAt` alongside `expiresAt`.

### 2.4 Per-wallet revocation check in middleware

`requireAuth` in `packages/server/src/middleware/auth.ts` now:

1. Reads bearer token, looks up KV (existing behavior).
2. If session found, also reads `session:revoked:<wallet>` from KV.
3. If a revocation timestamp exists AND `revocationTs >= session.issuedAt`, rejects with 401 `SESSION_REVOKED`. The comparison is `>=` (not `>`) to close a same-millisecond timing edge case where two ISO 8601 strings could be equal at ms precision.
4. If a revocation timestamp exists AND the session has no `issuedAt` (legacy pre-Phase-2 session), reject as well — there's no way to prove the session was issued after the revocation.
5. Otherwise allows.

The revocation entry has a TTL ≥ session TTL so it auto-expires once all sessions issued before it are guaranteed dead.

### 2.5a Reduce session TTL

`SESSION_TTL_SECONDS` in `auth.ts`: `3600 → 900` (15 minutes). Existing tests that depend on session lifetime continue to work (they don't sleep past 15 minutes).

A short doc comment notes that a refresh-token flow is the planned follow-up so callers should expect to re-authenticate via challenge/verify.

### 2.7 PublicKey validation

New helper `packages/server/src/utils.ts` (extending the file): `isValidEd25519PublicKey(input: string): boolean`. Accepts only base64-encoded 32-byte payloads (i.e. 44 chars, ending with `=`, no whitespace). Rejects empty strings, malformed base64, wrong-length keys.

Apply at:

- `POST /v1/agents` — in `agents.ts`, validate `body.publicKey` if present.
- `POST /v1/orgs` (if it accepts publicKey) — same.
- `POST /v1/keys` (if exists) — same.

### 2.8 Relay:send auth-state race

`packages/server/src/relay/relay-room.ts handleRelaySend()`: the existing flow can begin processing the envelope (size checks, recipient resolution) before reading `senderState`. Hoist:

```ts
const senderState = this.getAttachedState(ws)
if (!senderState || !senderState.handle) {
  return this.sendError(ws, 'AUTH_REQUIRED', 'Cannot send: not authenticated')
}
```

…to the top of the handler. Add a `senderState.authComplete` boolean set to `true` only after the full auth handshake; reject sends if it's false. Same pattern for any other authenticated handler.

## Acceptance criteria

- `pnpm --filter @epicdm/saga-server test` green (existing 310 + new tests for each of 2.1, 2.2, 2.3, 2.4, 2.7, 2.8)
- New tests:
  - `/admin/reindex` returns 403 when `ADMIN_SECRET` unset, regardless of header
  - DELETE `/v1/auth/sessions/:token` removes the token from KV; subsequent requests return 401
  - DELETE `/v1/auth/sessions` causes all sessions for that wallet (including currently-active) to be rejected on next request
  - Session TTL is now 15 minutes (assert `expiresAt - issuedAt === 900_000` ms)
  - PublicKey rejection: empty, too-short, non-base64, valid 32-byte all assert correctly
  - relay:send rejected when sent before auth:success
- `pnpm --filter @epicdm/saga-server typecheck` green

## Out of scope

- Refresh-token flow (2.5b) — follow-up task
- Cross-table handle uniqueness migration (2.6) — follow-up task
- Phase 3+ findings

## Commit plan

Single commit:

```
feat(server): Phase 2 — auth & session hardening

Built with Epic Flowstate
```
