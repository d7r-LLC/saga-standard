**FlowState Task:** `task_UDoUTrRagu`
**FlowState Milestone:** `mile_Xv442v-fH8`
**FlowState Project:** `proj__3viGkPhXu`
**FlowState Spec:** `docu_13E_mSxrv3`

# Phase 7 — Code hygiene & test isolation

This is the final phase of the 8-phase remediation. The 5-way LLM audit
flagged a small set of hygiene items that don't change runtime behavior
but do reduce future-drift risk. Each finding is small; together they
close out the milestone.

## Findings closed in this PR

| #   | Severity | Source   | Action                                                                                                                                                                                                                     |
| --- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1 | Low      | G-Low#3  | Remove stale "TODO — full signature verification" comments in `relay/ws-auth.ts` and `relay/federation-auth.ts`. The signature verification is fully implemented (Phase 0 confirmed); the comments mislead future readers. |
| 7.2 | Low      | G-Low#4  | Tighten the four `(attachment as any)` casts in `relay/relay-room.ts` to explicit `Extract<WebSocketAttachment, ...>` narrowings. Logic is correct today; type narrowing prevents accidental future breakage.              |
| 7.3 | Low      | G-Low#5  | Add `afterEach` cleanup hook in `__tests__/chat.test.ts` to reset module-level `vi.mock(...)` state. Module mocks survive test failures without it.                                                                        |
| 7.4 | Low      | G-Low#6  | Standardize the rate-limit test in `__tests__/relay-room.test.ts` (currently uses `try/finally` for timer cleanup) to the `beforeEach`/`afterEach` pattern used elsewhere in the suite. Consistency, not behavior change.  |
| 7.5 | Info     | G-Info#2 | Final lint sweep: run repo-wide `pnpm lint`, capture baseline, fix any errors that have crept in since Phase 6 merged.                                                                                                     |

## Findings deferred / out of scope

| #                                   | Why deferred                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 8 (mobile audit)              | Deferred from the milestone per the original 8-phase plan. The React Native app (`packages/saga-app`) needs a focused audit pass with mobile-specific tooling (RN-specific lint, AsyncStorage encryption review, deep-link handling) — out of scope for this hub-side remediation. |
| `saga-app` lint integration         | Same. The app's jest config and lint plugin are different from the hub's vitest+ESLint setup; harmonizing is a Phase 8 concern.                                                                                                                                                    |
| Pre-existing collectors lint errors | sort-imports / unused-vars in `packages/collectors/src/...` predate this remediation. Fixing requires touching collector parsers; out of scope here. Tracked as a follow-up.                                                                                                       |

## Implementation

### 7.1 Stale TODO comments

Both files have JSDoc that says "TODO — full signature verification" but the verification IS implemented (Phase 0 wrote the regression test for it). Remove the misleading line and add a cross-reference to the verifyMessage call site instead.

### 7.2 `(attachment as any)` cast tightening

In `packages/server/src/relay/relay-room.ts`, four sites cast `attachment as any` to access fields that exist on a specific union member. Replace with:

```ts
type FederationAttachment = Extract<WebSocketAttachment, { federation: true }>
const fedAttachment = attachment as FederationAttachment
```

The runtime control flow already narrows correctly (the casts are inside `if (isFederationAttachment(attachment))` style branches); the explicit `Extract<...>` makes the narrowing visible to TypeScript so a future field addition can't silently break.

### 7.3 chat.test.ts afterEach

Add an `afterEach(() => { vi.resetAllMocks() })` so module-level `vi.mock()` calls reset cleanly between tests, even when a test throws before the next `beforeEach` runs.

`vi.resetAllMocks()` clears call history AND restores each `vi.fn()` to an empty implementation — the right primitive for module-level mocks where stale `.mockReturnValue` / `.mockReturnValueOnce` behavior would otherwise leak across tests. (`vi.clearAllMocks()` only clears history; `vi.restoreAllMocks()` is for `vi.spyOn`-style spies.)

### 7.4 relay-room.test.ts timer cleanup

Replace the inline `try { ... } finally { vi.useRealTimers() }` pattern with the `afterEach(() => { vi.useRealTimers() })` pattern used in `relay-memory-store.test.ts` and `relay-integration.test.ts`. Same end behavior; consistent across the file.

### 7.5 Lint baseline

After the above changes, run `pnpm --filter @epicdm/saga-server lint`, `pnpm --filter @epicdm/saga-sdk lint`, `pnpm --filter @epicdm/saga-cli lint`, and `pnpm --filter @epicdm/saga-directory lint`. Fix any new errors. Pre-existing `packages/collectors` errors (sort-imports, unused-vars in collector parsers) are documented as out of scope above.

## Acceptance criteria

- All 4 TODO/cast/afterEach edits applied
- `pnpm --filter @epicdm/saga-server test` green (340+ tests)
- `pnpm --filter @epicdm/saga-sdk test` green (135+ tests)
- `pnpm --filter @epicdm/saga-cli test` green (52 tests)
- `pnpm --filter @epicdm/saga-directory test` green (8 tests)
- `pnpm --filter @epicdm/saga-server lint` clean (no errors; warnings unchanged from Phase 6)
- `pnpm --filter @epicdm/saga-sdk lint` clean
- `pnpm --filter @epicdm/saga-cli lint` clean
- `pnpm --filter @epicdm/saga-directory lint` clean

## Out of scope

- Phase 8 mobile audit (deferred milestone)
- collectors package lint cleanup (separate task)
- Any new feature work or behavior change

## Commit plan

Single PR, multi-commit:

1. `chore(server): remove stale signature-verification TODO comments` (7.1)
2. `refactor(server): tighten relay-room WebSocketAttachment narrowings` (7.2)
3. `chore(server): standardize test timer + mock cleanup` (7.3 + 7.4)
4. `chore: final lint sweep for Phase 7` (7.5, only if needed)

Each commit ends with `Built with Epic Flowstate`.
