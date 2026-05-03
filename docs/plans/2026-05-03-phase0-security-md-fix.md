**FlowState Task:** `task_TVKRI2V9QA`
**FlowState Milestone:** `mile_Xv442v-fH8`
**FlowState Project:** `proj__3viGkPhXu`
**FlowState Spec:** `docu_13E_mSxrv3`

# Phase 0 — Documentation accuracy

## Context

The 5-way LLM security audit on 2026-05-03 had three providers (gpt-4.1, gemini-2.5, gemini-3.1) flag a Critical "auth signature verification is a stub." Direct code reading proved this is **false** — `auth.ts:140`, `ws-auth.ts:56`, and `federation-auth.ts:57` all call `viem.verifyMessage` correctly. The misleading source was a stale `packages/server/SECURITY.md` that explicitly says verification is a placeholder.

Anthropic Opus 4.7 caught this contradiction (audit response, finding A-Crit#2). The real fix is documentation, not code.

## Requirements

From the parent task `task_TVKRI2V9QA`:

- 0.1 Rewrite `packages/server/SECURITY.md` to describe the actual signature flow.
- 0.2 Add a regression test that submits a signed-by-different-wallet challenge and asserts `401`.
- 0.3 Add a comment in `verifySignature` (`auth.ts:131`) referencing SECURITY.md so future drift is visible.

## Acceptance criteria

- `pnpm test --filter @epicdm/saga-server -- server.test` green
- `SECURITY.md` matches `auth.ts` behavior verbatim
- Regression test fails when `verifyMessage` is replaced with `() => true`

## Implementation

### Step 1 — Rewrite `packages/server/SECURITY.md`

Replace the misleading "Signature Verification" section. The new content:

- States that `viem.verifyMessage` IS called in three places: `packages/server/src/routes/auth.ts`, `relay/ws-auth.ts`, `relay/federation-auth.ts` (no line numbers — they drift; refer to the function name).
- Explains the EIP-191 `personal_sign` flow.
- Lists the three layered checks (challenge lookup → expiry → signature verification) and clarifies that the challenge is marked `used = 1` BEFORE signature verification (prevents multi-attempt attacks against one challenge).
- Notes that `verifyMessage` may either return `false` or throw on malformed input, and that `verifySignature` catches both paths to fail closed.
- Explicitly cross-references the regression test added in Step 2.

The **CORS** section is preserved verbatim. The **Session Tokens** section is updated with a brief note that revocation is tracked for Phase 2 of the same remediation plan.

### Step 2 — Add regression test in `packages/server/src/__tests__/server.test.ts`

In the existing `describe('auth flow', ...)` block, add a new `it('rejects signature from wrong wallet', ...)` test that:

1. Generates a second wallet via `privateKeyToAccount(0x...other...)`.
2. Requests a challenge for `WALLET` (the original test account).
3. Signs that challenge with the **second** wallet.
4. Posts to `/v1/auth/verify` with `walletAddress: WALLET` (mismatched).
5. Asserts `verifyRes.status === 401`.
6. Asserts the error code is `INVALID_SIGNATURE`.

This test fails immediately if anyone replaces `viem.verifyMessage` with `() => true`.

### Step 3 — Add a comment block in `auth.ts:131`

Above the `verifySignature` function definition:

```ts
/**
 * Verify an EIP-191 personal_sign signature using viem.
 *
 * Behavior is documented in `packages/server/SECURITY.md`. If you change
 * what this function does, update SECURITY.md in the same commit. The
 * regression test "rejects signature from wrong wallet" in
 * `__tests__/server.test.ts` is the executable check on this contract.
 */
```

## File-by-file changes

| File                                           | Change                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `packages/server/SECURITY.md`                  | Rewrite Signature Verification section to match real behavior                    |
| `packages/server/src/routes/auth.ts`           | Expand JSDoc on `verifySignature` to reference SECURITY.md + the regression test |
| `packages/server/src/__tests__/server.test.ts` | Add `it('rejects signature from wrong wallet', ...)` in the `auth flow` block    |

## Test strategy

- Run `pnpm test --filter @epicdm/saga-server` after changes; expect all existing tests + 1 new passing.
- Mutation check: temporarily replace `verifyMessage` with `async () => true` in `auth.ts` and confirm the new test fails. Revert before commit.

## Commit plan

Single commit:

```
docs(server): correct stale SECURITY.md signature verification claims

Rewrites SECURITY.md to match actual code (viem.verifyMessage IS called
in auth.ts, ws-auth.ts, federation-auth.ts). Adds a regression test that
proves verification is real, and a JSDoc comment on verifySignature
linking back to the doc and test.

Resolves the Critical-flagged "auth stub" finding from the 2026-05-03
five-way LLM security audit (A-Crit#2 / O-Crit#1 / G-Crit#1).

Built with Epic Flowstate
```

## Out of scope

- No changes to `verifySignature` behavior — it's already correct.
- No changes to `ws-auth.ts` or `federation-auth.ts` — same correct pattern.
- Phase 1+ findings deferred to their own tasks.
