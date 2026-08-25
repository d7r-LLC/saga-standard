> **FlowState Document:** `docu_k9ltUUMlCI`

# Spec Alignment Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all issues identified in the code review comparing the implementation against the Encrypted Memory Replication & Messaging design spec.

**Architecture:** Six independent fixes across `packages/server` and `packages/saga-client-rt`. Each task targets a specific gap: test data bugs, EIP-191 signature verification, outbound federation signing, hub-side message dedup, per-sender sequence numbers, and envelope scope normalization.

**Tech Stack:** TypeScript, viem (verifyMessage/signMessage), Vitest, Cloudflare Workers (Durable Objects, KV)

---

## File Structure

| File                                                      | Responsibility                             | Task |
| --------------------------------------------------------- | ------------------------------------------ | ---- |
| `packages/server/src/__tests__/indexer.test.ts`           | Fix `hubUrl` → `homeHubUrl` in test data   | 1    |
| `packages/server/src/__tests__/nft-identity.test.ts`      | Fix `hubUrl` → `homeHubUrl` in test data   | 1    |
| `packages/server/src/relay/ws-auth.ts`                    | Real EIP-191 signature recovery            | 2    |
| `packages/server/src/relay/federation-auth.ts`            | Real EIP-191 signature recovery            | 2    |
| `packages/server/src/routes/auth.ts`                      | Real EIP-191 signature recovery            | 2    |
| `packages/server/src/__tests__/relay-auth.test.ts`        | Update tests for real signatures           | 2    |
| `packages/server/src/__tests__/federation-auth.test.ts`   | Update tests for real signatures           | 2    |
| `packages/server/src/bindings.ts`                         | Add `OPERATOR_PRIVATE_KEY` binding         | 3    |
| `packages/server/src/relay/relay-room.ts`                 | Wire operator signing to federation links  | 3    |
| `packages/server/src/relay/relay-room.ts`                 | Add message ID dedup before forwarding     | 4    |
| `packages/server/src/__tests__/relay-room.test.ts`        | Test hub-side dedup                        | 4    |
| `packages/saga-crypto/src/types.ts`                       | Add `seq` field to `SagaEncryptedEnvelope` | 5    |
| `packages/saga-client-rt/src/types.ts`                    | Add `seq` field to `SagaEncryptedEnvelope` | 5    |
| `packages/saga-client-rt/src/client.ts`                   | Per-sender sequence tracking + reordering  | 5    |
| `packages/server/src/relay/envelope-validator.ts`         | Remove `'self'` from VALID_SCOPES          | 6    |
| `packages/server/src/__tests__/relay-integration.test.ts` | Replace `scope: 'self'` → `'private'`      | 6    |
| `packages/server/src/__tests__/relay-room.test.ts`        | Replace `scope: 'self'` → `'private'`      | 6    |

---

### Task 1: Fix Server Test Failures (hubUrl → homeHubUrl)

Five tests fail because mock event data uses `hubUrl` but the `AgentRegisteredEvent` type expects `homeHubUrl`. The handler reads `event.homeHubUrl`, which is `undefined` on the test objects since the property is named differently.

**Files:**

- Modify: `packages/server/src/__tests__/indexer.test.ts:69,97,234`
- Modify: `packages/server/src/__tests__/nft-identity.test.ts:219,392`

- [ ] **Step 1: Fix indexer.test.ts — three locations**

In `packages/server/src/__tests__/indexer.test.ts`, change `hubUrl` to `homeHubUrl` in three places:

Line 69:

```typescript
// BEFORE:
        hubUrl: 'https://hub.example.com',
// AFTER:
        homeHubUrl: 'https://hub.example.com',
```

Line 97:

```typescript
// BEFORE:
        hubUrl: 'https://hub.example.com',
// AFTER:
        homeHubUrl: 'https://hub.example.com',
```

Line 234:

```typescript
// BEFORE:
        hubUrl: 'https://hub.test',
// AFTER:
        homeHubUrl: 'https://hub.test',
```

- [ ] **Step 2: Fix nft-identity.test.ts — two locations**

In `packages/server/src/__tests__/nft-identity.test.ts`, change `hubUrl` to `homeHubUrl` in two places:

Line 219:

```typescript
// BEFORE:
        hubUrl: 'https://hub.example.com',
// AFTER:
        homeHubUrl: 'https://hub.example.com',
```

Line 392:

```typescript
// BEFORE:
        hubUrl: 'https://hub.example.com',
// AFTER:
        homeHubUrl: 'https://hub.example.com',
```

- [ ] **Step 3: Run tests to verify all 5 failures are fixed**

Run: `cd packages/server && npx vitest run src/__tests__/indexer.test.ts src/__tests__/nft-identity.test.ts`
Expected: All tests PASS (0 failures)

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/__tests__/indexer.test.ts packages/server/src/__tests__/nft-identity.test.ts
git commit -m "$(cat <<'EOF'
fix(server): correct hubUrl → homeHubUrl in test mock data

Five tests passed hubUrl in AgentRegisteredEvent mock data but
the type expects homeHubUrl. The handler read event.homeHubUrl
which was undefined.

Built with d7r FlowState
EOF
)"
```

---

### Task 2: Implement EIP-191 Signature Verification

Three files stub out signature verification with a length check. Replace with real EIP-191 recovery using viem's `verifyMessage`. This is the core authentication gate: without it, the NFT-gated access system has no teeth.

**Files:**

- Modify: `packages/server/src/relay/ws-auth.ts:50-53`
- Modify: `packages/server/src/relay/federation-auth.ts:51-54`
- Modify: `packages/server/src/routes/auth.ts:137-157`
- Modify: `packages/server/src/__tests__/relay-auth.test.ts`
- Modify: `packages/server/src/__tests__/federation-auth.test.ts`

- [ ] **Step 1: Replace stubbed signature verification in ws-auth.ts**

In `packages/server/src/relay/ws-auth.ts`, add the viem import at the top (after existing imports):

```typescript
import { verifyMessage } from 'viem'
```

Replace the stub at lines 50-53:

```typescript
// BEFORE (lines 50-53):
// TODO: Full EIP-191 signature verification with viem (same pattern as routes/auth.ts)
if (!signature || signature.length < 10) {
  return { ok: false, error: 'Invalid signature' }
}

// AFTER:
if (!signature || !signature.startsWith('0x')) {
  return { ok: false, error: 'Invalid signature format' }
}
let signatureValid: boolean
try {
  signatureValid = await verifyMessage({
    address: walletAddress as `0x${string}`,
    message: challenge,
    signature: signature as `0x${string}`,
  })
} catch {
  signatureValid = false
}
if (!signatureValid) {
  return { ok: false, error: 'Signature verification failed' }
}
```

Add the viem import at the top of ws-auth.ts (after existing imports):

```typescript
import { verifyMessage } from 'viem'
```

- [ ] **Step 2: Run relay auth tests to see which break**

Run: `cd packages/server && npx vitest run src/__tests__/relay-auth.test.ts`
Expected: Tests that use fake signatures like `'valid-signature-1234567890'` will fail because viem will reject them.

- [ ] **Step 3: Update relay-auth tests to use real signatures**

The tests need real EIP-191 signatures. In `packages/server/src/__tests__/relay-auth.test.ts`, add a signing helper at the top (after existing imports):

```typescript
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

// Deterministic test keypair (NOT a real wallet — test-only)
const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const testAccount = privateKeyToAccount(TEST_PRIVATE_KEY)
const TEST_WALLET = testAccount.address // 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

async function signChallenge(challenge: string): Promise<string> {
  return testAccount.signMessage({ message: challenge })
}
```

Then update all test cases that create fake signatures:

- Replace the hardcoded `OWNER` address with `TEST_WALLET`
- Replace `'valid-signature-1234567890'` with `await signChallenge(challenge)`
- The wallet address in the database seed must match `TEST_WALLET`

For each test that seeds an agent/org into the mock DB, use `TEST_WALLET.toLowerCase()` as the wallet address.

For each test that passes `signature: 'valid-signature-1234567890'`, replace with:

```typescript
signature: await signChallenge(challenge),
```

For rejection tests (wallet mismatch, etc.), keep using a different address but sign with the test account to produce a valid signature that doesn't match the claimed address. Or for "weak signature" tests, keep the short string to test format validation.

- [ ] **Step 4: Run relay auth tests to verify all pass**

Run: `cd packages/server && npx vitest run src/__tests__/relay-auth.test.ts`
Expected: All PASS

- [ ] **Step 5: Apply same fix to federation-auth.ts**

In `packages/server/src/relay/federation-auth.ts`, add viem import and replace the stub (lines 51-54):

```typescript
// Add import at top:
import { verifyMessage } from 'viem'

// BEFORE (lines 51-54):
// TODO: Full EIP-191 signature verification
if (!signature || signature.length < 10) {
  return { ok: false, error: 'Invalid signature' }
}

// AFTER:
if (!signature || !signature.startsWith('0x')) {
  return { ok: false, error: 'Invalid signature format' }
}
let signatureValid: boolean
try {
  signatureValid = await verifyMessage({
    address: operatorWallet as `0x${string}`,
    message: challenge,
    signature: signature as `0x${string}`,
  })
} catch {
  signatureValid = false
}
if (!signatureValid) {
  return { ok: false, error: 'Signature verification failed' }
}
```

- [ ] **Step 6: Update federation-auth tests with real signatures**

In `packages/server/src/__tests__/federation-auth.test.ts`, use the same pattern as Step 3:

```typescript
import { privateKeyToAccount } from 'viem/accounts'

const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const testAccount = privateKeyToAccount(TEST_PRIVATE_KEY)
const TEST_OPERATOR_WALLET = testAccount.address

async function signChallenge(challenge: string): Promise<string> {
  return testAccount.signMessage({ message: challenge })
}
```

Update tests to seed directories with `TEST_OPERATOR_WALLET.toLowerCase()` as `operator_wallet`, and use `await signChallenge(challenge)` for signature values.

- [ ] **Step 7: Run federation auth tests**

Run: `cd packages/server && npx vitest run src/__tests__/federation-auth.test.ts`
Expected: All PASS

- [ ] **Step 8: Apply same fix to routes/auth.ts**

In `packages/server/src/routes/auth.ts`, replace the `verifySignature` function (around lines 137-157):

```typescript
// Add import at top (if not already present):
import { verifyMessage } from 'viem'

// BEFORE:
async function verifySignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  // ... stubbed implementation ...
}

// AFTER:
async function verifySignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  if (!signature || !signature.startsWith('0x')) return false
  try {
    return await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    })
  } catch {
    return false
  }
}
```

- [ ] **Step 9: Update relay integration tests**

The relay integration tests in `packages/server/src/__tests__/relay-integration.test.ts` use a `connectAndAuth` helper that passes fake signatures. Update it to use real signing:

Add at the top:

```typescript
import { privateKeyToAccount } from 'viem/accounts'

const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const testAccount = privateKeyToAccount(TEST_PRIVATE_KEY)
const TEST_WALLET = testAccount.address
```

Update the `connectAndAuth` helper's signature line:

```typescript
// BEFORE:
    signature: 'valid-signature-1234567890',
// AFTER:
    signature: await testAccount.signMessage({ message: challenge }),
```

Update agent/org seed data to use `TEST_WALLET.toLowerCase()` as the wallet address.

- [ ] **Step 10: Run full server test suite**

Run: `cd packages/server && npx vitest run`
Expected: All tests PASS (0 failures)

- [ ] **Step 11: Commit**

```bash
git add packages/server/src/relay/ws-auth.ts packages/server/src/relay/federation-auth.ts packages/server/src/routes/auth.ts packages/server/src/__tests__/relay-auth.test.ts packages/server/src/__tests__/federation-auth.test.ts packages/server/src/__tests__/relay-integration.test.ts
git commit -m "$(cat <<'EOF'
feat(server): implement EIP-191 signature verification for relay auth

Replaced stubbed length-check signature verification with real
EIP-191 recovery using viem verifyMessage in ws-auth, federation-auth,
and routes/auth. Updated all tests to use real wallet signatures.

Built with d7r FlowState
EOF
)"
```

---

### Task 3: Add Outbound Federation Signing with Operator Wallet

The relay-room.ts creates outbound federation links but uses a placeholder signature. Add `OPERATOR_PRIVATE_KEY` as a secret binding and wire real signing.

**Files:**

- Modify: `packages/server/src/bindings.ts`
- Modify: `packages/server/src/relay/relay-room.ts:684-701`
- Modify: `docs/deploy/wrangler.template.toml`

- [ ] **Step 1: Add OPERATOR_PRIVATE_KEY to Env bindings**

In `packages/server/src/bindings.ts`, add the new binding to the `Env` interface:

```typescript
  /** Operator wallet private key (Wrangler secret) — used for outbound federation signing */
  OPERATOR_PRIVATE_KEY?: string
```

- [ ] **Step 2: Wire real signing in relay-room.ts**

In `packages/server/src/relay/relay-room.ts`, add import at the top:

```typescript
import { privateKeyToAccount } from 'viem/accounts'
```

Replace the federation link setup (around lines 684-701):

```typescript
// BEFORE:
this.federationLinks = createFederationLinkManager({
  db: this.env.DB,
  localDirectoryId: this.env.LOCAL_DIRECTORY_ID!,
  localOperatorWallet: '', // TODO: configure OPERATOR_WALLET from env
  signChallenge: async (challenge: string) => {
    // TODO: Sign with operator wallet. Placeholder for now.
    return `placeholder-sig-${challenge}`
  },
})

// AFTER:
const operatorKey = this.env.OPERATOR_PRIVATE_KEY
const operatorAccount = operatorKey ? privateKeyToAccount(operatorKey as `0x${string}`) : null

this.federationLinks = createFederationLinkManager({
  db: this.env.DB,
  localDirectoryId: this.env.LOCAL_DIRECTORY_ID!,
  localOperatorWallet: operatorAccount?.address.toLowerCase() ?? '',
  signChallenge: async (challenge: string) => {
    if (!operatorAccount) {
      throw new Error('OPERATOR_PRIVATE_KEY not configured — cannot sign federation challenges')
    }
    return operatorAccount.signMessage({ message: challenge })
  },
})
```

- [ ] **Step 3: Add OPERATOR_PRIVATE_KEY to wrangler template**

In `docs/deploy/wrangler.template.toml`, add a comment in both dev and production sections (after the `ADMIN_SECRET` line):

```toml
# Operator wallet (set as Wrangler secret, NOT as plain env var)
# wrangler secret put OPERATOR_PRIVATE_KEY --env dev
# This is the private key for the wallet that minted your Directory NFT.
# Required for outbound federation authentication.
```

- [ ] **Step 4: Add documentation note to fork-and-deploy guide**

In `docs/deploy/fork-and-deploy-guide.md`, after the "Deploy the Server" section (step 8), add before the "Trigger the indexer" subsection:

````markdown
### Set the operator secret

Federation requires your directory's operator wallet to sign authentication challenges. Set the private key as a Wrangler secret (never a plain environment variable):

\```bash
wrangler secret put OPERATOR_PRIVATE_KEY --env dev
\```

Paste the private key (hex format with 0x prefix) when prompted. This must be the private key for the wallet that minted your Directory NFT.
````

- [ ] **Step 5: Run server tests (should not break anything)**

Run: `cd packages/server && npx vitest run`
Expected: All PASS (the change only affects runtime behavior with a real secret configured)

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/bindings.ts packages/server/src/relay/relay-room.ts docs/deploy/wrangler.template.toml docs/deploy/fork-and-deploy-guide.md
git commit -m "$(cat <<'EOF'
feat(server): add OPERATOR_PRIVATE_KEY for outbound federation signing

Replaced placeholder federation challenge signing with real EIP-191
signatures via viem privateKeyToAccount. The operator private key is
stored as a Wrangler secret, not a plain env var.

Built with d7r FlowState
EOF
)"
```

---

### Task 4: Add Hub-Side Message Dedup

The relay room forwards every envelope without checking for duplicates. The spec requires "Hub rejects duplicate IDs" to prevent replay attacks. Add an in-memory dedup set with TTL to the RelayRoom Durable Object.

**Files:**

- Modify: `packages/server/src/relay/relay-room.ts`
- Modify: `packages/server/src/__tests__/relay-room.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/server/src/__tests__/relay-room.test.ts`, add a new test (find the describe block for relay message handling):

```typescript
it('rejects duplicate message IDs', async () => {
  const ws = await connectAndAuth('sender', TEST_WALLET)
  // Seed a second agent as recipient
  // ... (use existing seed pattern for 'recipient' agent)
  const ws2 = await connectAndAuth('recipient', RECIPIENT_WALLET)

  const envelope = {
    v: 1,
    type: 'direct-message',
    scope: 'mutual',
    from: 'sender@test-dir',
    to: 'recipient@test-dir',
    ct: 'encrypted-content',
    ts: new Date().toISOString(),
    id: 'msg-dedup-test-001',
  }

  // First send — should succeed
  await room.webSocketMessage(ws, JSON.stringify({ type: 'relay:send', envelope }))
  const firstMessages = parseSent(ws2)
  const delivered = firstMessages.filter(m => m.type === 'relay:deliver')
  expect(delivered).toHaveLength(1)

  // Clear recipient's sent buffer
  ws2._sent.length = 0

  // Second send with same ID — should be rejected
  await room.webSocketMessage(ws, JSON.stringify({ type: 'relay:send', envelope }))
  const secondMessages = parseSent(ws2)
  const duplicateDelivered = secondMessages.filter(m => m.type === 'relay:deliver')
  expect(duplicateDelivered).toHaveLength(0)

  // Sender should get a relay:ack (not an error) for deduped messages
  const senderMessages = parseSent(ws)
  const ack = senderMessages.find(
    m => m.type === 'relay:ack' && m.messageId === 'msg-dedup-test-001'
  )
  expect(ack).toBeDefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/relay-room.test.ts -t "rejects duplicate"`
Expected: FAIL (duplicate message is delivered)

- [ ] **Step 3: Implement hub-side dedup in relay-room.ts**

Add a dedup set as a private property of the `RelayRoom` class (around the existing property declarations):

```typescript
  /** Recent message IDs for dedup (prevents relay of duplicate/replayed envelopes) */
  private recentMessageIds = new Map<string, number>()
  private static readonly DEDUP_TTL_MS = 60 * 60 * 1000 // 1 hour
  private static readonly DEDUP_CLEANUP_THRESHOLD = 10000
```

Add a dedup check method:

```typescript
  /**
   * Check if a message ID has been seen recently.
   * Returns true if duplicate (should be rejected), false if new.
   */
  private isDuplicate(messageId: string): boolean {
    const now = Date.now()

    // Periodic cleanup of expired entries
    if (this.recentMessageIds.size > RelayRoom.DEDUP_CLEANUP_THRESHOLD) {
      for (const [id, ts] of this.recentMessageIds) {
        if (now - ts > RelayRoom.DEDUP_TTL_MS) {
          this.recentMessageIds.delete(id)
        }
      }
    }

    if (this.recentMessageIds.has(messageId)) {
      const seenAt = this.recentMessageIds.get(messageId)!
      if (now - seenAt < RelayRoom.DEDUP_TTL_MS) {
        return true
      }
    }

    this.recentMessageIds.set(messageId, now)
    return false
  }
```

In the `handleRelaySend` method (around line 293, after envelope validation passes), add the dedup check:

```typescript
// Dedup: reject messages the hub has already seen
if (this.isDuplicate(envelope.id)) {
  this.sendJson(ws, { type: 'relay:ack', messageId: envelope.id })
  return
}
```

- [ ] **Step 4: Run tests to verify dedup works**

Run: `cd packages/server && npx vitest run src/__tests__/relay-room.test.ts`
Expected: All PASS including new dedup test

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/relay/relay-room.ts packages/server/src/__tests__/relay-room.test.ts
git commit -m "$(cat <<'EOF'
feat(server): add hub-side message ID dedup to prevent replay attacks

RelayRoom now tracks recent message IDs (1-hour TTL) and silently
acks duplicate envelopes without forwarding. Prevents replayed
messages from reaching recipients.

Built with d7r FlowState
EOF
)"
```

---

### Task 5: Add Sequence Numbers to Envelope

The spec requires "timestamps + sequence numbers per sender" for message ordering. Add an optional `seq` field to the envelope type, implement per-sender sequence tracking in the client, and add client-side reordering for out-of-order delivery.

**Files:**

- Modify: `packages/saga-crypto/src/types.ts:147-178`
- Modify: `packages/saga-client-rt/src/types.ts` (SagaEncryptedEnvelope re-export)
- Modify: `packages/saga-client-rt/src/client.ts`
- Create: `packages/saga-client-rt/src/__tests__/sequence.test.ts`

- [ ] **Step 1: Add `seq` field to SagaEncryptedEnvelope**

In `packages/saga-crypto/src/types.ts`, add a new field to the `SagaEncryptedEnvelope` interface (after the `id` field, around line 177):

```typescript
  /** Per-sender sequence number for ordering (monotonically increasing per sender) */
  seq?: number
```

- [ ] **Step 2: Mirror the type in saga-client-rt**

Check if `packages/saga-client-rt/src/types.ts` re-exports from saga-crypto or defines its own `SagaEncryptedEnvelope`. If it defines its own copy, add the same `seq?: number` field. If it re-exports, no change needed.

- [ ] **Step 3: Write failing test for sequence tracking**

Create `packages/saga-client-rt/src/__tests__/sequence.test.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { createSequenceTracker } from '../sequence'

describe('createSequenceTracker', () => {
  it('returns incrementing sequence numbers per sender', () => {
    const tracker = createSequenceTracker()
    expect(tracker.next('alice@hub')).toBe(1)
    expect(tracker.next('alice@hub')).toBe(2)
    expect(tracker.next('alice@hub')).toBe(3)
  })

  it('tracks separate sequences per sender', () => {
    const tracker = createSequenceTracker()
    expect(tracker.next('alice@hub')).toBe(1)
    expect(tracker.next('bob@hub')).toBe(1)
    expect(tracker.next('alice@hub')).toBe(2)
    expect(tracker.next('bob@hub')).toBe(2)
  })

  it('reorders out-of-order messages by seq', () => {
    const tracker = createSequenceTracker()
    const messages = [
      { from: 'alice@hub', seq: 3, id: 'c' },
      { from: 'alice@hub', seq: 1, id: 'a' },
      { from: 'alice@hub', seq: 2, id: 'b' },
    ]
    const ordered = tracker.reorder(messages)
    expect(ordered.map(m => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('reorders messages from mixed senders independently', () => {
    const tracker = createSequenceTracker()
    const messages = [
      { from: 'bob@hub', seq: 2, id: 'b2' },
      { from: 'alice@hub', seq: 2, id: 'a2' },
      { from: 'alice@hub', seq: 1, id: 'a1' },
      { from: 'bob@hub', seq: 1, id: 'b1' },
    ]
    const ordered = tracker.reorder(messages)
    // Stable sort: alice messages before bob (preserve relative insertion order between senders)
    // Then within each sender, ordered by seq
    expect(ordered.map(m => m.id)).toEqual(['a1', 'a2', 'b1', 'b2'])
  })

  it('handles messages without seq (sorts by timestamp fallback)', () => {
    const tracker = createSequenceTracker()
    const messages = [
      { from: 'alice@hub', seq: undefined, id: 'a', ts: '2026-03-27T14:02:00Z' },
      { from: 'alice@hub', seq: undefined, id: 'b', ts: '2026-03-27T14:01:00Z' },
    ]
    const ordered = tracker.reorder(messages)
    expect(ordered.map(m => m.id)).toEqual(['b', 'a'])
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/sequence.test.ts`
Expected: FAIL (module `../sequence` does not exist)

- [ ] **Step 5: Implement sequence tracker**

Create `packages/saga-client-rt/src/sequence.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

interface Sequenceable {
  from: string
  seq?: number
  id: string
  ts?: string
}

export interface SequenceTracker {
  /** Get the next sequence number for a sender identity */
  next(sender: string): number
  /** Reorder messages by per-sender sequence number (stable, groups by sender) */
  reorder<T extends Sequenceable>(messages: T[]): T[]
}

/**
 * Per-sender monotonic sequence tracker.
 * Used for outbound envelope numbering and inbound reordering.
 */
export function createSequenceTracker(): SequenceTracker {
  const counters = new Map<string, number>()

  return {
    next(sender: string): number {
      const current = counters.get(sender) ?? 0
      const next = current + 1
      counters.set(sender, next)
      return next
    },

    reorder<T extends Sequenceable>(messages: T[]): T[] {
      return [...messages].sort((a, b) => {
        // Primary: sort by sender (stable grouping)
        const senderCmp = a.from.localeCompare(b.from)
        if (senderCmp !== 0) return senderCmp

        // Secondary: sort by sequence number if both have one
        if (a.seq != null && b.seq != null) {
          return a.seq - b.seq
        }

        // Fallback: sort by timestamp
        if (a.ts && b.ts) {
          return a.ts.localeCompare(b.ts)
        }

        return 0
      })
    },
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/saga-client-rt && npx vitest run src/__tests__/sequence.test.ts`
Expected: All PASS

- [ ] **Step 7: Wire sequence tracking into client.ts**

In `packages/saga-client-rt/src/client.ts`, add the sequence tracker:

1. Import at top:

```typescript
import { createSequenceTracker } from './sequence'
```

2. Add tracker as a property in the client constructor/factory (where other state is initialized):

```typescript
const sequenceTracker = createSequenceTracker()
```

3. In `sendMessage()` (around line 335, where the envelope is constructed), add the seq field:

```typescript
    seq: sequenceTracker.next(identity),
```

4. In `sendGroupMessage()` (around line 362, where the envelope is constructed), add the seq field:

```typescript
    seq: sequenceTracker.next(identity),
```

5. In the memory-sync envelope construction (around line 240), add the seq field:

```typescript
    seq: sequenceTracker.next(identity),
```

- [ ] **Step 8: Run all saga-client-rt tests**

Run: `cd packages/saga-client-rt && npx vitest run`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add packages/saga-crypto/src/types.ts packages/saga-client-rt/src/types.ts packages/saga-client-rt/src/sequence.ts packages/saga-client-rt/src/__tests__/sequence.test.ts packages/saga-client-rt/src/client.ts
git commit -m "$(cat <<'EOF'
feat: add per-sender sequence numbers to encrypted envelope

Added optional seq field to SagaEncryptedEnvelope for message ordering.
Client tracks per-sender monotonic sequences and stamps outbound
envelopes. Includes reorder utility for client-side delivery ordering.

Built with d7r FlowState
EOF
)"
```

---

### Task 6: Normalize Envelope Scope Values

The envelope validator accepts `'self'` as a scope, but the spec and TypeScript types define only `'private'`, `'mutual'`, and `'group'`. Remove `'self'` from the validator and update tests to use `'private'`.

**Files:**

- Modify: `packages/server/src/relay/envelope-validator.ts:6`
- Modify: `packages/server/src/__tests__/relay-integration.test.ts`
- Modify: `packages/server/src/__tests__/relay-room.test.ts`

- [ ] **Step 1: Remove 'self' from VALID_SCOPES**

In `packages/server/src/relay/envelope-validator.ts`, line 6:

```typescript
// BEFORE:
const VALID_SCOPES = new Set(['private', 'mutual', 'group', 'self'])

// AFTER:
const VALID_SCOPES = new Set(['private', 'mutual', 'group'])
```

- [ ] **Step 2: Run tests to find failures**

Run: `cd packages/server && npx vitest run`
Expected: Tests using `scope: 'self'` will fail with "Invalid or missing envelope scope"

- [ ] **Step 3: Replace 'self' with 'private' in relay-integration.test.ts**

In `packages/server/src/__tests__/relay-integration.test.ts`, find all occurrences of `scope: 'self'` and replace with `scope: 'private'`:

```typescript
// Every occurrence of:
      scope: 'self',
// Replace with:
      scope: 'private',
```

Based on the grep results, there are 6 occurrences at lines 133, 364, 401, 425, 455, 485.

- [ ] **Step 4: Replace 'self' with 'private' in relay-room.test.ts**

In `packages/server/src/__tests__/relay-room.test.ts`, find all occurrences of `scope: 'self'` and replace with `scope: 'private'`:

Based on the grep results, there are 3 occurrences at lines 339, 364, 435.

- [ ] **Step 5: Run full server test suite**

Run: `cd packages/server && npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/relay/envelope-validator.ts packages/server/src/__tests__/relay-integration.test.ts packages/server/src/__tests__/relay-room.test.ts
git commit -m "$(cat <<'EOF'
fix(server): remove non-spec 'self' scope from envelope validator

The design spec defines three encryption scopes: private, mutual,
and group. Removed 'self' from the validator and updated tests to
use 'private' which is the correct scope for self-addressed envelopes.

Built with d7r FlowState
EOF
)"
```
