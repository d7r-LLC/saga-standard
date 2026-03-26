# Phase 1: Crypto Foundation & Encrypted Store — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@epicdm/saga-crypto` — the cryptographic primitives and local encrypted storage that all subsequent SAGA replication phases depend on.

**Architecture:** New package `packages/saga-crypto` in the saga-standard monorepo. Depends on `@epicdm/flowstate-crypto` (AES-256-GCM, HKDF, base64 encoding) and `tweetnacl` (NaCl box/x25519). Provides a `SagaKeyRing` opaque crypto oracle, `SagaEncryptedEnvelope` seal/open, and an `EncryptedStore` with pluggable storage backends. Web Crypto API only — edge-runtime compatible.

**Tech Stack:** TypeScript, tweetnacl, @epicdm/flowstate-crypto, vitest, tsup

**Parent spec:** [SAGA Encrypted Replication Design](../specs/2026-03-25-saga-encrypted-replication-design.md)
**Phases doc:** [Implementation Phases](../specs/2026-03-25-saga-encrypted-replication-design-phases.md)

**Prerequisite:** `@epicdm/flowstate-crypto` must be published to npm (or linked locally via `pnpm link`). The user has confirmed they will handle this.

**Dependency on `@epicdm/flowstate-crypto`:** This plan imports the following functions with these exact signatures (verified against source at `epic-flowstate/packages/flowstate-crypto/src/`):

- `hkdfDeriveKey(ikm: Uint8Array, salt: Uint8Array, info: string): Promise<Uint8Array>` — 32-byte output
- `aesGcmEncrypt(key: Uint8Array, plaintext: Uint8Array): Promise<{ ciphertext: Uint8Array, iv: Uint8Array, authTag: Uint8Array }>` — the return type maps directly to our `AesGcmResult`
- `aesGcmDecrypt(key: Uint8Array, result: { ciphertext, iv, authTag }): Promise<Uint8Array>`
- `generateDEK(): Uint8Array` — 32 random bytes
- `toBase64(bytes: Uint8Array): string` / `fromBase64(str: string): Uint8Array`

**API divergences from phases spec (intentional):**

- `seal()`: Phases spec shows `seal(payload, keyRing, scope, to)`. Plan uses `seal(payload: SealPayload, keyRing)` with `scope` and `to` folded into the payload object — cleaner ergonomics, avoids parameter sprawl.
- `open()`: Phases spec shows `open(envelope, keyRing)`. Plan adds an optional third parameter `senderPublicKey?` required for mutual scope — NaCl box.open needs the sender's public key to derive the shared secret.
- `addGroupKey()`: Phases spec shows 2 params. Plan uses 3 params `(groupKeyId, wrappedKey, senderPublicKey)` — required because NaCl box unwrapping needs the sender's public key (unlike RSA which only needs the recipient's private key).

**Wallet key compatibility:** Both secp256k1 (EVM) and ed25519 (Solana) private keys are 32-byte scalars. HKDF treats them as opaque high-entropy input key material — no preprocessing needed. The derivation is wallet-type-agnostic by design.

**Storage backends:** Phase 1 delivers the `StorageBackend` interface and a `MemoryBackend` for testing. Production backends (filesystem for Docker DERPs, Cloudflare KV for Worker DERPs) are implemented in Phase 3 (DERP SAGA Client) when the client library integrates with actual DERP workspaces.

---

## File Structure

```
packages/saga-crypto/
├── package.json              # Package manifest with deps
├── tsconfig.json             # Extends ../../tsconfig.base.json
├── vitest.config.ts          # Test config (matches SDK pattern)
├── tsup.config.ts            # Build config (matches SDK pattern)
└── src/
    ├── index.ts              # Public exports
    ├── types.ts              # Type definitions (SagaKeyRing interface, envelope, encryption results, StorageBackend)
    ├── key-derivation.ts     # Wallet private key → x25519 keypair + AES-256 storage key
    ├── key-derivation.test.ts
    ├── nacl.ts               # NaCl mutual encrypt/decrypt, sealedbox encrypt/decrypt
    ├── nacl.test.ts
    ├── keyring.ts            # createSagaKeyRing() — opaque crypto oracle
    ├── keyring.test.ts
    ├── envelope.ts           # SagaEncryptedEnvelope seal() / open()
    ├── envelope.test.ts
    ├── store.ts              # EncryptedStore interface, MemoryBackend, createEncryptedStore()
    ├── store.test.ts
    └── integration.test.ts   # E2E: two agents, all three scopes, store round-trips
```

Each file has one clear responsibility. Tests live alongside source files (matches `packages/sdk` convention).

---

### Task 1: Package Scaffold & Core Types

**Files:**

- Create: `packages/saga-crypto/package.json`
- Create: `packages/saga-crypto/tsconfig.json`
- Create: `packages/saga-crypto/vitest.config.ts`
- Create: `packages/saga-crypto/tsup.config.ts`
- Create: `packages/saga-crypto/src/types.ts`
- Create: `packages/saga-crypto/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@epicdm/saga-crypto",
  "version": "0.1.0",
  "description": "SAGA cryptographic primitives — KeyRing, NaCl encryption, encrypted store",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist", "src"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist",
    "lint": "eslint src/ --ext .ts,.tsx,.js"
  },
  "dependencies": {
    "@epicdm/flowstate-crypto": "^1.0.0",
    "tweetnacl": "^1.0.3"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "^8.3.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  },
  "author": "d7r LLC",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/d7r-LLC/saga-standard.git",
    "directory": "packages/saga-crypto"
  }
}
```

- [ ] **Step 2: Create tsconfig.json, vitest.config.ts, tsup.config.ts**

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "composite": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "coverage", "src/**/*.test.ts"]
}
```

`vitest.config.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
    },
  },
})
```

`tsup.config.ts`:

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'es2022',
})
```

- [ ] **Step 3: Create src/types.ts with all type definitions**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

// ── Encryption result types ──────────────────────────────────────

/** AES-256-GCM encryption result */
export interface AesGcmResult {
  readonly ciphertext: Uint8Array
  readonly iv: Uint8Array
  readonly authTag: Uint8Array
}

/** NaCl box encryption result (mutual scope — static keys on both sides) */
export interface MutualEncryptionResult {
  readonly ciphertext: Uint8Array
  readonly nonce: Uint8Array
}

/** NaCl sealedbox encryption result (private scope — ephemeral sender) */
export interface SealedBoxResult {
  readonly ciphertext: Uint8Array
  readonly nonce: Uint8Array
  readonly ephemeralPublicKey: Uint8Array
}

/** Private scope: AES-GCM payload + sealedbox-wrapped DEK */
export interface PrivateEncryptionResult {
  readonly ciphertext: Uint8Array
  readonly iv: Uint8Array
  readonly authTag: Uint8Array
  readonly wrappedDek: SealedBoxResult
}

/** Group scope: AES-GCM payload + AES-GCM-wrapped DEK */
export interface GroupEncryptionResult {
  readonly ciphertext: Uint8Array
  readonly iv: Uint8Array
  readonly authTag: Uint8Array
  readonly wrappedDek: AesGcmResult
}

/** x25519 keypair derived from wallet */
export interface DerivedKeyPair {
  readonly publicKey: Uint8Array
  readonly secretKey: Uint8Array
}

// ── SagaKeyRing interface ────────────────────────────────────────

/**
 * Opaque crypto oracle for SAGA agents.
 *
 * Wallet-derived x25519 keys, group keys, and storage keys are held
 * internally. Raw private keys and symmetric keys are NEVER exposed
 * through this interface. Callers pass data in and get encrypted/decrypted
 * data out.
 *
 * Same pattern as FlowState ZK KeyRing, but uses NaCl (x25519) instead
 * of RSA for asymmetric operations, and unlocks from wallet private key
 * instead of password/service token.
 */
export interface SagaKeyRing {
  /** Whether the KeyRing has been unlocked with a wallet key */
  readonly isUnlocked: boolean

  /**
   * Unlock with a wallet private key.
   * Derives x25519 keypair (HKDF) and AES-256 storage key (HKDF).
   */
  unlockWallet(walletPrivateKey: Uint8Array): Promise<void>

  /** Lock — zeroes all key material in memory */
  lock(): void

  // ── Private scope (agent-only, sealedbox DEK wrapping) ──

  /** Encrypt for agent-private scope. AES-GCM payload + sealedbox DEK. */
  encryptPrivate(plaintext: Uint8Array): Promise<PrivateEncryptionResult>

  /** Decrypt agent-private scope. */
  decryptPrivate(encrypted: PrivateEncryptionResult): Promise<Uint8Array>

  // ── Mutual scope (NaCl box with static keys) ──

  /** Encrypt for mutual scope. NaCl box(plaintext, recipient pub, sender sec). */
  encryptMutual(plaintext: Uint8Array, recipientPublicKey: Uint8Array): MutualEncryptionResult

  /** Decrypt mutual scope. NaCl box.open(ciphertext, sender pub, recipient sec). */
  decryptMutual(encrypted: MutualEncryptionResult, senderPublicKey: Uint8Array): Uint8Array

  // ── Group scope (AES-256-GCM with shared group key) ──

  /** Encrypt for group scope. AES-GCM payload + AES-GCM-wrapped DEK. */
  encryptGroup(plaintext: Uint8Array, groupKeyId: string): Promise<GroupEncryptionResult>

  /** Decrypt group scope. */
  decryptGroup(encrypted: GroupEncryptionResult, groupKeyId: string): Promise<Uint8Array>

  // ── Group key management ──

  /**
   * Add a group key received from another agent.
   * The key is NaCl-box-wrapped by the sender for this agent's x25519 key.
   */
  addGroupKey(
    groupKeyId: string,
    wrappedKey: MutualEncryptionResult,
    senderPublicKey: Uint8Array
  ): void

  /** Wrap a group key for distribution to another agent. */
  wrapGroupKeyFor(groupKeyId: string, recipientPublicKey: Uint8Array): MutualEncryptionResult

  /** Inject a raw group key directly (for the group creator). */
  injectGroupKey(groupKeyId: string, rawKey: Uint8Array): void

  /** Check if a group key is loaded. */
  hasGroupKey(groupKeyId: string): boolean

  // ── Storage encryption (AES-256-GCM with wallet-derived key) ──

  /** Encrypt data for local storage. */
  encryptStorage(plaintext: Uint8Array): Promise<AesGcmResult>

  /** Decrypt data from local storage. */
  decryptStorage(encrypted: AesGcmResult): Promise<Uint8Array>

  // ── Identity ──

  /** Get the agent's x25519 public key (for publishing to directory). */
  getPublicKey(): Uint8Array
}

// ── SagaEncryptedEnvelope ────────────────────────────────────────

/** Message type for the relay */
export type SagaMessageType = 'memory-sync' | 'direct-message' | 'group-message'

/** Encryption scope */
export type SagaEncryptionScope = 'private' | 'mutual' | 'group'

/**
 * Unified encrypted message envelope for SAGA relay.
 * The hub sees `from`, `to`, `type`, `ts`, `id` for routing.
 * Everything in `ct` is opaque ciphertext.
 */
export interface SagaEncryptedEnvelope {
  /** Format version — fail closed on unrecognized values */
  v: 1
  /** Message type */
  type: SagaMessageType
  /** Encryption scope */
  scope: SagaEncryptionScope
  /** Sender identity (handle@directoryId) */
  from: string
  /** Recipient(s) (handle@directoryId or groupId) */
  to: string | string[]
  /** Base64 ciphertext */
  ct: string
  /** Base64 nonce — for NaCl box (mutual scope) */
  nonce?: string
  /** Base64 IV — for AES-GCM (private/group scope payload) */
  iv?: string
  /** Base64 auth tag — for AES-GCM (private/group scope payload) */
  authTag?: string
  /**
   * Base64 wrapped DEK.
   * Private scope: ephemeralPubKey(32) + nonce(24) + ciphertext (concatenated, then base64)
   * Group scope: base64(iv):base64(ct):base64(authTag) (colon-delimited)
   */
  wrappedDek?: string
  /** Group key ID — for group scope */
  groupKeyId?: string
  /** Timestamp (ISO 8601) */
  ts: string
  /** Message ID (UUID for dedup) */
  id: string
}

/** Payload to seal into an envelope */
export interface SealPayload {
  type: SagaMessageType
  scope: SagaEncryptionScope
  from: string
  to: string | string[]
  plaintext: Uint8Array
  /** Required for mutual scope */
  recipientPublicKey?: Uint8Array
  /** Required for group scope */
  groupKeyId?: string
}

// ── Encrypted Store ──────────────────────────────────────────────

/**
 * Pluggable storage backend for the encrypted store.
 * Implementations: MemoryBackend (testing), filesystem (Docker DERPs), KV (Worker DERPs).
 */
export interface StorageBackend {
  get(key: string): Promise<Uint8Array | null>
  put(key: string, value: Uint8Array): Promise<void>
  delete(key: string): Promise<void>
  list(prefix?: string): Promise<string[]>
}
```

- [ ] **Step 4: Create minimal src/index.ts**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

// Types
export type {
  AesGcmResult,
  MutualEncryptionResult,
  SealedBoxResult,
  PrivateEncryptionResult,
  GroupEncryptionResult,
  DerivedKeyPair,
  SagaKeyRing,
  SagaMessageType,
  SagaEncryptionScope,
  SagaEncryptedEnvelope,
  SealPayload,
  StorageBackend,
} from './types'
```

- [ ] **Step 5: Install dependencies and verify typecheck**

Run from monorepo root (the `pnpm-workspace.yaml` glob `packages/*` auto-discovers new packages):

```bash
pnpm install
```

Then verify types:

```bash
cd packages/saga-crypto && pnpm typecheck
```

Expected: No errors (types-only package at this point)

- [ ] **Step 6: Commit**

```bash
git add packages/saga-crypto/
git commit -m "feat(saga-crypto): scaffold package with core type definitions"
```

---

### Task 2: Wallet Key Derivation

**Files:**

- Create: `packages/saga-crypto/src/key-derivation.ts`
- Create: `packages/saga-crypto/src/key-derivation.test.ts`

**Context:** Wallet private keys (secp256k1 for EVM, ed25519 for Solana) are 32-byte high-entropy secrets. We derive two separate keys via HKDF-SHA256 with different `info` strings: an x25519 keypair for encryption and an AES-256 key for local storage. The fixed salt `"saga-encryption-v1"` provides domain separation (not entropy — the wallet key is already high-entropy). HKDF from `@epicdm/flowstate-crypto` uses the Web Crypto API (`crypto.subtle.deriveBits`).

- [ ] **Step 1: Write failing tests**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it, expect } from 'vitest'
import nacl from 'tweetnacl'
import { deriveX25519KeyPair, deriveStorageKey } from './key-derivation'

describe('key-derivation', () => {
  const fakeWalletKey = nacl.randomBytes(32)

  describe('deriveX25519KeyPair', () => {
    it('returns a 32-byte public key and 32-byte secret key', async () => {
      const kp = await deriveX25519KeyPair(fakeWalletKey)
      expect(kp.publicKey).toBeInstanceOf(Uint8Array)
      expect(kp.secretKey).toBeInstanceOf(Uint8Array)
      expect(kp.publicKey.length).toBe(32)
      expect(kp.secretKey.length).toBe(32)
    })

    it('is deterministic — same wallet key produces same keypair', async () => {
      const kp1 = await deriveX25519KeyPair(fakeWalletKey)
      const kp2 = await deriveX25519KeyPair(fakeWalletKey)
      expect(kp1.publicKey).toEqual(kp2.publicKey)
      expect(kp1.secretKey).toEqual(kp2.secretKey)
    })

    it('different wallet keys produce different keypairs', async () => {
      const otherKey = nacl.randomBytes(32)
      const kp1 = await deriveX25519KeyPair(fakeWalletKey)
      const kp2 = await deriveX25519KeyPair(otherKey)
      expect(kp1.publicKey).not.toEqual(kp2.publicKey)
    })

    it('derived keypair is a valid NaCl box keypair', async () => {
      const kp = await deriveX25519KeyPair(fakeWalletKey)
      // Verify by encrypting and decrypting with it
      const msg = new TextEncoder().encode('test')
      const nonce = nacl.randomBytes(24)
      const ct = nacl.box(msg, nonce, kp.publicKey, kp.secretKey)
      expect(ct).not.toBeNull()
    })
  })

  describe('deriveStorageKey', () => {
    it('returns a 32-byte key', async () => {
      const key = await deriveStorageKey(fakeWalletKey)
      expect(key).toBeInstanceOf(Uint8Array)
      expect(key.length).toBe(32)
    })

    it('is deterministic', async () => {
      const k1 = await deriveStorageKey(fakeWalletKey)
      const k2 = await deriveStorageKey(fakeWalletKey)
      expect(k1).toEqual(k2)
    })

    it('differs from x25519 secret key (different info string)', async () => {
      const kp = await deriveX25519KeyPair(fakeWalletKey)
      const storageKey = await deriveStorageKey(fakeWalletKey)
      expect(storageKey).not.toEqual(kp.secretKey)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/saga-crypto && pnpm test -- src/key-derivation.test.ts`
Expected: FAIL — `Cannot find module './key-derivation'`

- [ ] **Step 3: Implement key derivation**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { hkdfDeriveKey } from '@epicdm/flowstate-crypto'
import nacl from 'tweetnacl'
import type { DerivedKeyPair } from './types'

/** Fixed salt for SAGA encryption key derivation (domain separation, not entropy) */
const SAGA_SALT = new TextEncoder().encode('saga-encryption-v1')

/**
 * Derive an x25519 keypair from a wallet private key via HKDF-SHA256.
 *
 * The wallet key (secp256k1 or ed25519, 32 bytes) is high-entropy IKM.
 * HKDF extracts a 32-byte x25519 secret key, from which the public key
 * is derived using tweetnacl's Curve25519 scalar multiplication.
 *
 * @param walletPrivateKey - 32-byte wallet private key
 * @returns x25519 keypair for NaCl box encryption
 */
export async function deriveX25519KeyPair(walletPrivateKey: Uint8Array): Promise<DerivedKeyPair> {
  const secretKey = await hkdfDeriveKey(walletPrivateKey, SAGA_SALT, 'x25519')
  const { publicKey } = nacl.box.keyPair.fromSecretKey(secretKey)
  return { publicKey, secretKey }
}

/**
 * Derive an AES-256 key for local encrypted storage via HKDF-SHA256.
 *
 * Uses a different `info` string than x25519 derivation, ensuring the
 * storage key and encryption key are cryptographically independent.
 *
 * @param walletPrivateKey - 32-byte wallet private key
 * @returns 32-byte AES-256 key for local storage encryption
 */
export async function deriveStorageKey(walletPrivateKey: Uint8Array): Promise<Uint8Array> {
  return hkdfDeriveKey(walletPrivateKey, SAGA_SALT, 'local-storage')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/saga-crypto && pnpm test -- src/key-derivation.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/saga-crypto/src/key-derivation.ts packages/saga-crypto/src/key-derivation.test.ts
git commit -m "feat(saga-crypto): wallet key derivation via HKDF"
```

---

### Task 3: NaCl Encryption Primitives

**Files:**

- Create: `packages/saga-crypto/src/nacl.ts`
- Create: `packages/saga-crypto/src/nacl.test.ts`

**Context:** Two NaCl patterns serve different SAGA scopes:

1. **Mutual encryption** (NaCl box with static keys) — both sender and recipient use their long-lived x25519 keys. Both parties can derive the same shared secret, so both can decrypt. Used for agent↔company "mutual" scope.

2. **Sealedbox encryption** (NaCl box with ephemeral sender key) — sender generates a one-time keypair, encrypts, then discards the secret key. Only the recipient can decrypt. Used for DEK wrapping in agent-private scope.

The existing SDK (`packages/sdk/src/encrypt/nacl-box.ts`) implements the sealedbox pattern for layer encryption. This module provides both patterns as standalone primitives for the KeyRing.

- [ ] **Step 1: Write failing tests**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it, expect } from 'vitest'
import nacl from 'tweetnacl'
import { mutualEncrypt, mutualDecrypt, sealedBoxEncrypt, sealedBoxDecrypt } from './nacl'

describe('nacl', () => {
  const alice = nacl.box.keyPair()
  const bob = nacl.box.keyPair()

  describe('mutualEncrypt / mutualDecrypt', () => {
    it('round-trips plaintext between two parties', () => {
      const plaintext = new TextEncoder().encode('hello from alice')
      const encrypted = mutualEncrypt(plaintext, bob.publicKey, alice.secretKey)
      const decrypted = mutualDecrypt(encrypted, alice.publicKey, bob.secretKey)
      expect(decrypted).toEqual(plaintext)
    })

    it('either party can decrypt (shared secret is symmetric)', () => {
      const plaintext = new TextEncoder().encode('shared secret')
      // Alice encrypts to Bob
      const encrypted = mutualEncrypt(plaintext, bob.publicKey, alice.secretKey)
      // Bob decrypts using Alice's public key
      const decrypted = mutualDecrypt(encrypted, alice.publicKey, bob.secretKey)
      expect(decrypted).toEqual(plaintext)
    })

    it('wrong key fails to decrypt', () => {
      const eve = nacl.box.keyPair()
      const plaintext = new TextEncoder().encode('secret')
      const encrypted = mutualEncrypt(plaintext, bob.publicKey, alice.secretKey)
      expect(() => mutualDecrypt(encrypted, alice.publicKey, eve.secretKey)).toThrow(
        'decryption failed'
      )
    })

    it('produces different ciphertext each call (random nonce)', () => {
      const plaintext = new TextEncoder().encode('same message')
      const e1 = mutualEncrypt(plaintext, bob.publicKey, alice.secretKey)
      const e2 = mutualEncrypt(plaintext, bob.publicKey, alice.secretKey)
      expect(e1.ciphertext).not.toEqual(e2.ciphertext)
      expect(e1.nonce).not.toEqual(e2.nonce)
    })

    it('nonce is 24 bytes', () => {
      const encrypted = mutualEncrypt(new Uint8Array(1), bob.publicKey, alice.secretKey)
      expect(encrypted.nonce.length).toBe(24)
    })
  })

  describe('sealedBoxEncrypt / sealedBoxDecrypt', () => {
    it('round-trips plaintext — only recipient can decrypt', () => {
      const plaintext = new TextEncoder().encode('private data')
      const sealed = sealedBoxEncrypt(plaintext, bob.publicKey)
      const decrypted = sealedBoxDecrypt(sealed, bob.secretKey)
      expect(decrypted).toEqual(plaintext)
    })

    it('includes ephemeral public key (32 bytes)', () => {
      const sealed = sealedBoxEncrypt(new Uint8Array(1), bob.publicKey)
      expect(sealed.ephemeralPublicKey.length).toBe(32)
    })

    it('ephemeral key differs per encryption', () => {
      const s1 = sealedBoxEncrypt(new Uint8Array(1), bob.publicKey)
      const s2 = sealedBoxEncrypt(new Uint8Array(1), bob.publicKey)
      expect(s1.ephemeralPublicKey).not.toEqual(s2.ephemeralPublicKey)
    })

    it('wrong recipient key fails to decrypt', () => {
      const eve = nacl.box.keyPair()
      const sealed = sealedBoxEncrypt(new TextEncoder().encode('secret'), bob.publicKey)
      expect(() => sealedBoxDecrypt(sealed, eve.secretKey)).toThrow('decryption failed')
    })

    it('handles empty plaintext', () => {
      const sealed = sealedBoxEncrypt(new Uint8Array(0), bob.publicKey)
      const decrypted = sealedBoxDecrypt(sealed, bob.secretKey)
      expect(decrypted).toEqual(new Uint8Array(0))
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/saga-crypto && pnpm test -- src/nacl.test.ts`
Expected: FAIL — `Cannot find module './nacl'`

- [ ] **Step 3: Implement NaCl primitives**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import nacl from 'tweetnacl'
import type { MutualEncryptionResult, SealedBoxResult } from './types'

/**
 * Encrypt plaintext using NaCl box with both parties' static x25519 keys.
 *
 * Both sender and recipient can derive the same shared secret (Diffie-Hellman),
 * so both can decrypt. This is the "mutual" encryption scope in SAGA —
 * used for agent↔company work products both parties keep.
 *
 * @param plaintext - Data to encrypt
 * @param recipientPublicKey - Recipient's x25519 public key (32 bytes)
 * @param senderSecretKey - Sender's x25519 secret key (32 bytes)
 */
export function mutualEncrypt(
  plaintext: Uint8Array,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array
): MutualEncryptionResult {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const ciphertext = nacl.box(plaintext, nonce, recipientPublicKey, senderSecretKey)
  if (!ciphertext) {
    throw new Error('NaCl box encryption failed')
  }
  return { ciphertext, nonce }
}

/**
 * Decrypt NaCl box ciphertext using both parties' static x25519 keys.
 *
 * @param encrypted - Ciphertext and nonce from mutualEncrypt
 * @param senderPublicKey - Sender's x25519 public key (32 bytes)
 * @param recipientSecretKey - Recipient's x25519 secret key (32 bytes)
 */
export function mutualDecrypt(
  encrypted: MutualEncryptionResult,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array
): Uint8Array {
  const plaintext = nacl.box.open(
    encrypted.ciphertext,
    encrypted.nonce,
    senderPublicKey,
    recipientSecretKey
  )
  if (!plaintext) {
    throw new Error('NaCl box decryption failed: invalid key or corrupted data')
  }
  return plaintext
}

/**
 * Encrypt plaintext using sealedbox pattern (ephemeral sender key).
 *
 * Generates a one-time keypair, encrypts using NaCl box, then discards the
 * ephemeral secret key. Only the recipient can decrypt. The ephemeral public
 * key is included in the result so the recipient can reconstruct the shared secret.
 *
 * Used for DEK wrapping in agent-private scope — the agent encrypts a DEK
 * to their own x25519 public key so only their own private key can unwrap it.
 *
 * @param plaintext - Data to encrypt
 * @param recipientPublicKey - Recipient's x25519 public key (32 bytes)
 */
export function sealedBoxEncrypt(
  plaintext: Uint8Array,
  recipientPublicKey: Uint8Array
): SealedBoxResult {
  const ephemeral = nacl.box.keyPair()
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const ciphertext = nacl.box(plaintext, nonce, recipientPublicKey, ephemeral.secretKey)
  if (!ciphertext) {
    throw new Error('NaCl sealedbox encryption failed')
  }
  // Zero the ephemeral secret key — it must not be retained
  ephemeral.secretKey.fill(0)
  return { ciphertext, nonce, ephemeralPublicKey: ephemeral.publicKey }
}

/**
 * Decrypt sealedbox ciphertext using the recipient's x25519 secret key.
 *
 * @param encrypted - Ciphertext, nonce, and ephemeral public key from sealedBoxEncrypt
 * @param recipientSecretKey - Recipient's x25519 secret key (32 bytes)
 */
export function sealedBoxDecrypt(
  encrypted: SealedBoxResult,
  recipientSecretKey: Uint8Array
): Uint8Array {
  const plaintext = nacl.box.open(
    encrypted.ciphertext,
    encrypted.nonce,
    encrypted.ephemeralPublicKey,
    recipientSecretKey
  )
  if (!plaintext) {
    throw new Error('NaCl sealedbox decryption failed: invalid key or corrupted data')
  }
  return plaintext
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/saga-crypto && pnpm test -- src/nacl.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/saga-crypto/src/nacl.ts packages/saga-crypto/src/nacl.test.ts
git commit -m "feat(saga-crypto): NaCl mutual and sealedbox encryption primitives"
```

---

### Task 4: SagaKeyRing — Lifecycle, Private & Mutual Scope

**Files:**

- Create: `packages/saga-crypto/src/keyring.ts`
- Create: `packages/saga-crypto/src/keyring.test.ts`

**Context:** The SagaKeyRing is the central crypto oracle. It holds wallet-derived keys internally and exposes only encrypt/decrypt operations. This task implements the core lifecycle (`unlockWallet`/`lock`) plus private and mutual scope operations. Group scope is Task 5.

Key differences from FlowState KeyRing (`packages/flowstate-crypto/src/keyring.ts`):

- Unlocks from wallet private key (not password/service token)
- Uses NaCl (x25519) for asymmetric ops (not RSA-4096)
- No server-side key fetching (`KeyDataProvider`) — keys derived locally from wallet
- Storage encryption uses wallet-derived AES key (not PBKDF2-derived KEK)

- [ ] **Step 1: Write failing tests for lifecycle, private, and mutual**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it, expect, beforeEach } from 'vitest'
import nacl from 'tweetnacl'
import { createSagaKeyRing } from './keyring'

describe('SagaKeyRing', () => {
  const walletKey = nacl.randomBytes(32)
  const walletKey2 = nacl.randomBytes(32)

  describe('lifecycle', () => {
    it('starts locked', () => {
      const kr = createSagaKeyRing()
      expect(kr.isUnlocked).toBe(false)
    })

    it('unlocks with wallet private key', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey)
      expect(kr.isUnlocked).toBe(true)
    })

    it('getPublicKey returns 32-byte x25519 public key after unlock', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey)
      const pub = kr.getPublicKey()
      expect(pub).toBeInstanceOf(Uint8Array)
      expect(pub.length).toBe(32)
    })

    it('getPublicKey is deterministic for same wallet key', async () => {
      const kr1 = createSagaKeyRing()
      await kr1.unlockWallet(walletKey)
      const kr2 = createSagaKeyRing()
      await kr2.unlockWallet(walletKey)
      expect(kr1.getPublicKey()).toEqual(kr2.getPublicKey())
    })

    it('lock clears key material', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey)
      kr.lock()
      expect(kr.isUnlocked).toBe(false)
    })

    it('throws on operations when locked', () => {
      const kr = createSagaKeyRing()
      expect(() => kr.getPublicKey()).toThrow('locked')
    })
  })

  describe('private scope', () => {
    let kr: ReturnType<typeof createSagaKeyRing>

    beforeEach(async () => {
      kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey)
    })

    it('encrypts and decrypts round-trip', async () => {
      const plaintext = new TextEncoder().encode('agent private memory')
      const encrypted = await kr.encryptPrivate(plaintext)
      const decrypted = await kr.decryptPrivate(encrypted)
      expect(decrypted).toEqual(plaintext)
    })

    it('produces different ciphertext each call', async () => {
      const plaintext = new TextEncoder().encode('same data')
      const e1 = await kr.encryptPrivate(plaintext)
      const e2 = await kr.encryptPrivate(plaintext)
      expect(e1.ciphertext).not.toEqual(e2.ciphertext)
    })

    it('cannot be decrypted by a different wallet', async () => {
      const plaintext = new TextEncoder().encode('secret')
      const encrypted = await kr.encryptPrivate(plaintext)

      const otherKr = createSagaKeyRing()
      await otherKr.unlockWallet(walletKey2)
      await expect(otherKr.decryptPrivate(encrypted)).rejects.toThrow()
    })
  })

  describe('mutual scope', () => {
    let aliceKr: ReturnType<typeof createSagaKeyRing>
    let bobKr: ReturnType<typeof createSagaKeyRing>

    beforeEach(async () => {
      aliceKr = createSagaKeyRing()
      await aliceKr.unlockWallet(walletKey)
      bobKr = createSagaKeyRing()
      await bobKr.unlockWallet(walletKey2)
    })

    it('Alice encrypts, Bob decrypts', () => {
      const plaintext = new TextEncoder().encode('task result for Bob')
      const encrypted = aliceKr.encryptMutual(plaintext, bobKr.getPublicKey())
      const decrypted = bobKr.decryptMutual(encrypted, aliceKr.getPublicKey())
      expect(decrypted).toEqual(plaintext)
    })

    it('Bob encrypts, Alice decrypts', () => {
      const plaintext = new TextEncoder().encode('task request from Bob')
      const encrypted = bobKr.encryptMutual(plaintext, aliceKr.getPublicKey())
      const decrypted = aliceKr.decryptMutual(encrypted, bobKr.getPublicKey())
      expect(decrypted).toEqual(plaintext)
    })

    it('third party cannot decrypt', () => {
      const eveKr = createSagaKeyRing()
      const eveKey = nacl.randomBytes(32)

      const plaintext = new TextEncoder().encode('mutual secret')
      const encrypted = aliceKr.encryptMutual(plaintext, bobKr.getPublicKey())

      // Eve doesn't have Alice's or Bob's key — direct NaCl will fail
      expect(() => {
        const evePair = nacl.box.keyPair()
        nacl.box.open(
          encrypted.ciphertext,
          encrypted.nonce,
          aliceKr.getPublicKey(),
          evePair.secretKey
        )
      }).not.toThrow() // box.open returns null, doesn't throw
      // But our wrapper throws on null
      expect(() => {
        const evePair = nacl.box.keyPair()
        bobKr.decryptMutual(encrypted, evePair.publicKey)
      }).toThrow('decryption failed')
    })
  })

  describe('storage encryption', () => {
    let kr: ReturnType<typeof createSagaKeyRing>

    beforeEach(async () => {
      kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey)
    })

    it('encrypts and decrypts round-trip', async () => {
      const data = new TextEncoder().encode('stored value')
      const encrypted = await kr.encryptStorage(data)
      const decrypted = await kr.decryptStorage(encrypted)
      expect(decrypted).toEqual(data)
    })

    it('different wallet cannot decrypt', async () => {
      const data = new TextEncoder().encode('stored value')
      const encrypted = await kr.encryptStorage(data)

      const otherKr = createSagaKeyRing()
      await otherKr.unlockWallet(walletKey2)
      await expect(otherKr.decryptStorage(encrypted)).rejects.toThrow()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/saga-crypto && pnpm test -- src/keyring.test.ts`
Expected: FAIL — `Cannot find module './keyring'`

- [ ] **Step 3: Implement SagaKeyRing (lifecycle, private, mutual, storage)**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { aesGcmEncrypt, aesGcmDecrypt, generateDEK } from '@epicdm/flowstate-crypto'
import { deriveX25519KeyPair, deriveStorageKey } from './key-derivation'
import { mutualEncrypt, mutualDecrypt, sealedBoxEncrypt, sealedBoxDecrypt } from './nacl'
import type {
  AesGcmResult,
  GroupEncryptionResult,
  MutualEncryptionResult,
  PrivateEncryptionResult,
  SagaKeyRing,
} from './types'

/**
 * Create a SagaKeyRing instance.
 *
 * The KeyRing is an opaque crypto oracle — it holds wallet-derived keys
 * internally and never exposes raw private keys or symmetric keys through
 * its public interface. Callers pass data in and get encrypted/decrypted
 * data out.
 */
export function createSagaKeyRing(): SagaKeyRing {
  // Internal mutable state — never exposed
  let _x25519SecretKey: Uint8Array | null = null
  let _x25519PublicKey: Uint8Array | null = null
  let _storageKey: Uint8Array | null = null
  let _unlocked = false

  // Group keys: groupKeyId → raw AES-256 key bytes
  const _groupKeys = new Map<string, Uint8Array>()

  function assertUnlocked(): void {
    if (!_unlocked) {
      throw new Error('SagaKeyRing is locked. Call unlockWallet() first.')
    }
  }

  function clearKeys(): void {
    if (_x25519SecretKey) {
      _x25519SecretKey.fill(0)
      _x25519SecretKey = null
    }
    _x25519PublicKey = null
    if (_storageKey) {
      _storageKey.fill(0)
      _storageKey = null
    }
    for (const [, key] of _groupKeys) {
      key.fill(0)
    }
    _groupKeys.clear()
    _unlocked = false
  }

  const keyRing: SagaKeyRing = {
    get isUnlocked() {
      return _unlocked
    },

    async unlockWallet(walletPrivateKey: Uint8Array): Promise<void> {
      const kp = await deriveX25519KeyPair(walletPrivateKey)
      _x25519SecretKey = kp.secretKey
      _x25519PublicKey = kp.publicKey
      _storageKey = await deriveStorageKey(walletPrivateKey)
      _unlocked = true
    },

    lock(): void {
      clearKeys()
    },

    // ── Private scope ──

    async encryptPrivate(plaintext: Uint8Array): Promise<PrivateEncryptionResult> {
      assertUnlocked()
      // Generate random DEK, encrypt payload with AES-GCM
      const dek = generateDEK()
      const encrypted = await aesGcmEncrypt(dek, plaintext)
      // Wrap DEK with sealedbox (ephemeral sender → own x25519 public key)
      const wrappedDek = sealedBoxEncrypt(dek, _x25519PublicKey!)
      // Zero DEK
      dek.fill(0)
      return {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        wrappedDek,
      }
    },

    async decryptPrivate(encrypted: PrivateEncryptionResult): Promise<Uint8Array> {
      assertUnlocked()
      // Unwrap DEK from sealedbox
      const dek = sealedBoxDecrypt(encrypted.wrappedDek, _x25519SecretKey!)
      // Decrypt payload with AES-GCM
      const plaintext = await aesGcmDecrypt(dek, {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      })
      dek.fill(0)
      return plaintext
    },

    // ── Mutual scope ──

    encryptMutual(plaintext: Uint8Array, recipientPublicKey: Uint8Array): MutualEncryptionResult {
      assertUnlocked()
      return mutualEncrypt(plaintext, recipientPublicKey, _x25519SecretKey!)
    },

    decryptMutual(encrypted: MutualEncryptionResult, senderPublicKey: Uint8Array): Uint8Array {
      assertUnlocked()
      return mutualDecrypt(encrypted, senderPublicKey, _x25519SecretKey!)
    },

    // ── Group scope ──

    async encryptGroup(plaintext: Uint8Array, groupKeyId: string): Promise<GroupEncryptionResult> {
      assertUnlocked()
      const groupKey = _groupKeys.get(groupKeyId)
      if (!groupKey) {
        throw new Error(`No group key found for groupKeyId: ${groupKeyId}`)
      }
      // Random DEK, encrypt payload
      const dek = generateDEK()
      const encrypted = await aesGcmEncrypt(dek, plaintext)
      // Wrap DEK under group key (AES-GCM)
      const wrappedDek = await aesGcmEncrypt(groupKey, dek)
      dek.fill(0)
      return {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        wrappedDek,
      }
    },

    async decryptGroup(encrypted: GroupEncryptionResult, groupKeyId: string): Promise<Uint8Array> {
      assertUnlocked()
      const groupKey = _groupKeys.get(groupKeyId)
      if (!groupKey) {
        throw new Error(`No group key found for groupKeyId: ${groupKeyId}`)
      }
      // Unwrap DEK
      const dek = await aesGcmDecrypt(groupKey, encrypted.wrappedDek)
      // Decrypt payload
      const plaintext = await aesGcmDecrypt(dek, {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      })
      dek.fill(0)
      return plaintext
    },

    // ── Group key management ──

    addGroupKey(
      groupKeyId: string,
      wrappedKey: MutualEncryptionResult,
      senderPublicKey: Uint8Array
    ): void {
      assertUnlocked()
      const rawKey = mutualDecrypt(wrappedKey, senderPublicKey, _x25519SecretKey!)
      _groupKeys.set(groupKeyId, new Uint8Array(rawKey))
    },

    wrapGroupKeyFor(groupKeyId: string, recipientPublicKey: Uint8Array): MutualEncryptionResult {
      assertUnlocked()
      const groupKey = _groupKeys.get(groupKeyId)
      if (!groupKey) {
        throw new Error(`No group key found for groupKeyId: ${groupKeyId}`)
      }
      return mutualEncrypt(groupKey, recipientPublicKey, _x25519SecretKey!)
    },

    injectGroupKey(groupKeyId: string, rawKey: Uint8Array): void {
      assertUnlocked()
      _groupKeys.set(groupKeyId, new Uint8Array(rawKey))
    },

    hasGroupKey(groupKeyId: string): boolean {
      return _groupKeys.has(groupKeyId)
    },

    // ── Storage encryption ──

    async encryptStorage(plaintext: Uint8Array): Promise<AesGcmResult> {
      assertUnlocked()
      return aesGcmEncrypt(_storageKey!, plaintext)
    },

    async decryptStorage(encrypted: AesGcmResult): Promise<Uint8Array> {
      assertUnlocked()
      return aesGcmDecrypt(_storageKey!, {
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      })
    },

    // ── Identity ──

    getPublicKey(): Uint8Array {
      assertUnlocked()
      return new Uint8Array(_x25519PublicKey!)
    },
  }

  return keyRing
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/saga-crypto && pnpm test -- src/keyring.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/saga-crypto/src/keyring.ts packages/saga-crypto/src/keyring.test.ts
git commit -m "feat(saga-crypto): SagaKeyRing with private, mutual, and storage encryption"
```

---

### Task 5: SagaKeyRing — Group Scope

**Files:**

- Modify: `packages/saga-crypto/src/keyring.test.ts` (add group scope tests)

**Context:** Group scope uses AES-256-GCM with a shared group key. The group key lifecycle:

1. Creator generates a random 32-byte AES key → `injectGroupKey()`
2. Creator wraps it for each member → `wrapGroupKeyFor()` (NaCl box to member's x25519)
3. Members receive and unwrap → `addGroupKey()` (NaCl box.open)
4. All members encrypt/decrypt with the shared key → `encryptGroup()` / `decryptGroup()`

This is the same pattern as FlowState's vault key distribution, but using NaCl box (x25519) instead of RSA-4096 for key wrapping.

- [ ] **Step 1: Add group scope tests to keyring.test.ts**

Add the following `describe` block inside the existing `describe('SagaKeyRing')`:

```typescript
describe('group scope', () => {
  let aliceKr: ReturnType<typeof createSagaKeyRing>
  let bobKr: ReturnType<typeof createSagaKeyRing>
  const groupKeyId = 'org-acme-key-1'

  beforeEach(async () => {
    aliceKr = createSagaKeyRing()
    await aliceKr.unlockWallet(walletKey)
    bobKr = createSagaKeyRing()
    await bobKr.unlockWallet(walletKey2)

    // Alice creates a group key
    const rawGroupKey = nacl.randomBytes(32)
    aliceKr.injectGroupKey(groupKeyId, rawGroupKey)
    // Alice wraps group key for Bob
    const wrappedForBob = aliceKr.wrapGroupKeyFor(groupKeyId, bobKr.getPublicKey())
    // Bob unwraps it
    bobKr.addGroupKey(groupKeyId, wrappedForBob, aliceKr.getPublicKey())
    // Zero the raw key since KeyRing owns it now
    rawGroupKey.fill(0)
  })

  it('Alice encrypts, Bob decrypts', async () => {
    const plaintext = new TextEncoder().encode('org broadcast')
    const encrypted = await aliceKr.encryptGroup(plaintext, groupKeyId)
    const decrypted = await bobKr.decryptGroup(encrypted, groupKeyId)
    expect(decrypted).toEqual(plaintext)
  })

  it('Bob encrypts, Alice decrypts', async () => {
    const plaintext = new TextEncoder().encode('Bob reply')
    const encrypted = await bobKr.encryptGroup(plaintext, groupKeyId)
    const decrypted = await aliceKr.decryptGroup(encrypted, groupKeyId)
    expect(decrypted).toEqual(plaintext)
  })

  it('non-member cannot decrypt', async () => {
    const eveKr = createSagaKeyRing()
    await eveKr.unlockWallet(nacl.randomBytes(32))

    const plaintext = new TextEncoder().encode('confidential')
    const encrypted = await aliceKr.encryptGroup(plaintext, groupKeyId)
    await expect(eveKr.decryptGroup(encrypted, groupKeyId)).rejects.toThrow('No group key')
  })

  it('hasGroupKey returns true after injection', () => {
    expect(aliceKr.hasGroupKey(groupKeyId)).toBe(true)
    expect(aliceKr.hasGroupKey('nonexistent')).toBe(false)
  })

  it('encryptGroup throws for unknown groupKeyId', async () => {
    await expect(aliceKr.encryptGroup(new Uint8Array(1), 'unknown')).rejects.toThrow('No group key')
  })

  it('lock clears group keys', async () => {
    aliceKr.lock()
    expect(aliceKr.hasGroupKey(groupKeyId)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd packages/saga-crypto && pnpm test -- src/keyring.test.ts`
Expected: All tests PASS (group scope was already implemented in Task 4's keyring.ts)

- [ ] **Step 3: Commit**

```bash
git add packages/saga-crypto/src/keyring.test.ts
git commit -m "test(saga-crypto): group scope encryption and key distribution tests"
```

---

### Task 6: SagaEncryptedEnvelope — seal / open

**Files:**

- Create: `packages/saga-crypto/src/envelope.ts`
- Create: `packages/saga-crypto/src/envelope.test.ts`

**Context:** The `SagaEncryptedEnvelope` is the wire format for all messages through the SAGA relay. `seal()` encrypts a payload and packages it into an envelope. `open()` extracts and decrypts. The hub relay sees only the routing fields (`from`, `to`, `type`, `ts`, `id`) — the `ct` field is opaque.

Three scope-specific serialization patterns:

- **Mutual:** `ct` = base64(NaCl box ciphertext), `nonce` = base64(nonce)
- **Private:** `ct` = base64(AES-GCM ciphertext), `iv`/`authTag` = base64, `wrappedDek` = base64(ephemeralPub ‖ nonce ‖ sealedbox ciphertext)
- **Group:** `ct` = base64(AES-GCM ciphertext), `iv`/`authTag` = base64, `wrappedDek` = `base64(dekIv):base64(dekCt):base64(dekAuthTag)`, `groupKeyId` = ID

- [ ] **Step 1: Write failing tests**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it, expect, beforeEach } from 'vitest'
import nacl from 'tweetnacl'
import { createSagaKeyRing } from './keyring'
import { seal, open } from './envelope'
import type { SagaEncryptedEnvelope } from './types'

describe('envelope', () => {
  const walletKey1 = nacl.randomBytes(32)
  const walletKey2 = nacl.randomBytes(32)

  describe('mutual scope', () => {
    it('seal + open round-trips', async () => {
      const aliceKr = createSagaKeyRing()
      await aliceKr.unlockWallet(walletKey1)
      const bobKr = createSagaKeyRing()
      await bobKr.unlockWallet(walletKey2)

      const plaintext = new TextEncoder().encode('hello bob')
      const envelope = seal(
        {
          type: 'direct-message',
          scope: 'mutual',
          from: 'alice@epicflow',
          to: 'bob@epicflow',
          plaintext,
          recipientPublicKey: bobKr.getPublicKey(),
        },
        aliceKr
      )

      expect(envelope.v).toBe(1)
      expect(envelope.type).toBe('direct-message')
      expect(envelope.scope).toBe('mutual')
      expect(envelope.from).toBe('alice@epicflow')
      expect(envelope.to).toBe('bob@epicflow')
      expect(envelope.nonce).toBeDefined()
      expect(envelope.ct).toBeDefined()
      expect(envelope.iv).toBeUndefined()
      expect(envelope.wrappedDek).toBeUndefined()

      const decrypted = open(envelope, bobKr, aliceKr.getPublicKey())
      expect(decrypted).toEqual(plaintext)
    })
  })

  describe('private scope', () => {
    it('seal + open round-trips', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey1)

      const plaintext = new TextEncoder().encode('private memory')
      const envelope = await seal(
        {
          type: 'memory-sync',
          scope: 'private',
          from: 'alice@epicflow',
          to: 'alice@epicflow',
          plaintext,
        },
        kr
      )

      expect(envelope.scope).toBe('private')
      expect(envelope.iv).toBeDefined()
      expect(envelope.authTag).toBeDefined()
      expect(envelope.wrappedDek).toBeDefined()
      expect(envelope.nonce).toBeUndefined()

      const decrypted = await open(envelope, kr)
      expect(decrypted).toEqual(plaintext)
    })

    it('different wallet cannot open', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey1)

      const envelope = await seal(
        {
          type: 'memory-sync',
          scope: 'private',
          from: 'alice@epicflow',
          to: 'alice@epicflow',
          plaintext: new TextEncoder().encode('secret'),
        },
        kr
      )

      const otherKr = createSagaKeyRing()
      await otherKr.unlockWallet(walletKey2)
      await expect(open(envelope, otherKr)).rejects.toThrow()
    })
  })

  describe('group scope', () => {
    it('seal + open round-trips', async () => {
      const aliceKr = createSagaKeyRing()
      await aliceKr.unlockWallet(walletKey1)
      const bobKr = createSagaKeyRing()
      await bobKr.unlockWallet(walletKey2)

      // Set up group key
      const groupKey = nacl.randomBytes(32)
      const groupKeyId = 'org-123'
      aliceKr.injectGroupKey(groupKeyId, groupKey)
      const wrapped = aliceKr.wrapGroupKeyFor(groupKeyId, bobKr.getPublicKey())
      bobKr.addGroupKey(groupKeyId, wrapped, aliceKr.getPublicKey())

      const plaintext = new TextEncoder().encode('org broadcast')
      const envelope = await seal(
        {
          type: 'group-message',
          scope: 'group',
          from: 'alice@epicflow',
          to: ['bob@epicflow', 'carol@epicflow'],
          plaintext,
          groupKeyId,
        },
        aliceKr
      )

      expect(envelope.scope).toBe('group')
      expect(envelope.groupKeyId).toBe(groupKeyId)
      expect(envelope.wrappedDek).toBeDefined()
      expect(envelope.iv).toBeDefined()
      expect(envelope.authTag).toBeDefined()

      const decrypted = await open(envelope, bobKr)
      expect(decrypted).toEqual(plaintext)
    })
  })

  describe('envelope metadata', () => {
    it('has valid UUID id', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey1)

      const envelope = seal(
        {
          type: 'direct-message',
          scope: 'mutual',
          from: 'alice@epicflow',
          to: 'bob@epicflow',
          plaintext: new Uint8Array(1),
          recipientPublicKey: kr.getPublicKey(),
        },
        kr
      )

      expect(envelope.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })

    it('has ISO 8601 timestamp', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey1)

      const envelope = seal(
        {
          type: 'direct-message',
          scope: 'mutual',
          from: 'a@d',
          to: 'b@d',
          plaintext: new Uint8Array(1),
          recipientPublicKey: kr.getPublicKey(),
        },
        kr
      )

      expect(() => new Date(envelope.ts).toISOString()).not.toThrow()
    })

    it('rejects unrecognized version on open', async () => {
      const kr = createSagaKeyRing()
      await kr.unlockWallet(walletKey1)

      const envelope = seal(
        {
          type: 'direct-message',
          scope: 'mutual',
          from: 'a@d',
          to: 'b@d',
          plaintext: new Uint8Array(1),
          recipientPublicKey: kr.getPublicKey(),
        },
        kr
      )

      const tampered = { ...envelope, v: 99 } as unknown as SagaEncryptedEnvelope
      expect(() => open(tampered, kr, kr.getPublicKey())).toThrow('Unsupported envelope version')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/saga-crypto && pnpm test -- src/envelope.test.ts`
Expected: FAIL — `Cannot find module './envelope'`

- [ ] **Step 3: Implement seal and open**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { toBase64, fromBase64 } from '@epicdm/flowstate-crypto'
import type { SagaEncryptedEnvelope, SagaKeyRing, SealPayload } from './types'

/**
 * Seal a payload into an encrypted envelope.
 *
 * Returns a SagaEncryptedEnvelope ready for relay transmission.
 * The function is sync for mutual scope and async for private/group scope
 * (due to AES-GCM). Callers should always await the result.
 *
 * @param payload - What to encrypt and how
 * @param keyRing - Unlocked SagaKeyRing for the sender
 */
export function seal(
  payload: SealPayload,
  keyRing: SagaKeyRing
): SagaEncryptedEnvelope | Promise<SagaEncryptedEnvelope> {
  const base: Pick<SagaEncryptedEnvelope, 'v' | 'type' | 'from' | 'to' | 'ts' | 'id' | 'scope'> = {
    v: 1,
    type: payload.type,
    scope: payload.scope,
    from: payload.from,
    to: payload.to,
    ts: new Date().toISOString(),
    id: crypto.randomUUID(),
  }

  switch (payload.scope) {
    case 'mutual': {
      if (!payload.recipientPublicKey) {
        throw new Error('recipientPublicKey required for mutual scope')
      }
      const encrypted = keyRing.encryptMutual(payload.plaintext, payload.recipientPublicKey)
      return {
        ...base,
        ct: toBase64(encrypted.ciphertext),
        nonce: toBase64(encrypted.nonce),
      }
    }

    case 'private':
      return (async () => {
        const encrypted = await keyRing.encryptPrivate(payload.plaintext)
        // Pack wrappedDek: ephemeralPubKey(32) + nonce(24) + ciphertext
        const wd = encrypted.wrappedDek
        const packed = new Uint8Array(
          wd.ephemeralPublicKey.length + wd.nonce.length + wd.ciphertext.length
        )
        packed.set(wd.ephemeralPublicKey, 0)
        packed.set(wd.nonce, wd.ephemeralPublicKey.length)
        packed.set(wd.ciphertext, wd.ephemeralPublicKey.length + wd.nonce.length)

        return {
          ...base,
          ct: toBase64(encrypted.ciphertext),
          iv: toBase64(encrypted.iv),
          authTag: toBase64(encrypted.authTag),
          wrappedDek: toBase64(packed),
        }
      })()

    case 'group':
      return (async () => {
        if (!payload.groupKeyId) {
          throw new Error('groupKeyId required for group scope')
        }
        const encrypted = await keyRing.encryptGroup(payload.plaintext, payload.groupKeyId)
        // Pack wrappedDek as colon-delimited base64 (matches FlowState pattern)
        const wrappedDek = [
          toBase64(encrypted.wrappedDek.iv),
          toBase64(encrypted.wrappedDek.ciphertext),
          toBase64(encrypted.wrappedDek.authTag),
        ].join(':')

        return {
          ...base,
          ct: toBase64(encrypted.ciphertext),
          iv: toBase64(encrypted.iv),
          authTag: toBase64(encrypted.authTag),
          wrappedDek,
          groupKeyId: payload.groupKeyId,
        }
      })()

    default:
      throw new Error(`Unknown scope: ${payload.scope}`)
  }
}

/**
 * Open an encrypted envelope and return the plaintext.
 *
 * @param envelope - The SagaEncryptedEnvelope to decrypt
 * @param keyRing - Unlocked SagaKeyRing for the recipient
 * @param senderPublicKey - Sender's x25519 public key (required for mutual scope)
 */
export function open(
  envelope: SagaEncryptedEnvelope,
  keyRing: SagaKeyRing,
  senderPublicKey?: Uint8Array
): Uint8Array | Promise<Uint8Array> {
  if (envelope.v !== 1) {
    throw new Error(`Unsupported envelope version: ${envelope.v}`)
  }

  switch (envelope.scope) {
    case 'mutual': {
      if (!senderPublicKey) {
        throw new Error('senderPublicKey required for mutual scope')
      }
      if (!envelope.nonce) {
        throw new Error('Envelope missing nonce for mutual scope')
      }
      return keyRing.decryptMutual(
        {
          ciphertext: fromBase64(envelope.ct),
          nonce: fromBase64(envelope.nonce),
        },
        senderPublicKey
      )
    }

    case 'private':
      return (async () => {
        if (!envelope.iv || !envelope.authTag || !envelope.wrappedDek) {
          throw new Error('Envelope missing iv/authTag/wrappedDek for private scope')
        }
        // Unpack wrappedDek: ephemeralPubKey(32) + nonce(24) + ciphertext
        const packed = fromBase64(envelope.wrappedDek)
        const ephemeralPublicKey = packed.slice(0, 32)
        const nonce = packed.slice(32, 56)
        const wrappedCiphertext = packed.slice(56)

        return keyRing.decryptPrivate({
          ciphertext: fromBase64(envelope.ct),
          iv: fromBase64(envelope.iv),
          authTag: fromBase64(envelope.authTag),
          wrappedDek: { ciphertext: wrappedCiphertext, nonce, ephemeralPublicKey },
        })
      })()

    case 'group':
      return (async () => {
        if (!envelope.iv || !envelope.authTag || !envelope.wrappedDek || !envelope.groupKeyId) {
          throw new Error('Envelope missing iv/authTag/wrappedDek/groupKeyId for group scope')
        }
        // Unpack wrappedDek from colon-delimited base64
        const parts = envelope.wrappedDek.split(':')
        if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
          throw new Error('Invalid wrappedDek format for group scope')
        }

        return keyRing.decryptGroup(
          {
            ciphertext: fromBase64(envelope.ct),
            iv: fromBase64(envelope.iv),
            authTag: fromBase64(envelope.authTag),
            wrappedDek: {
              iv: fromBase64(parts[0]),
              ciphertext: fromBase64(parts[1]),
              authTag: fromBase64(parts[2]),
            },
          },
          envelope.groupKeyId
        )
      })()

    default:
      throw new Error(`Unknown scope: ${envelope.scope}`)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/saga-crypto && pnpm test -- src/envelope.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/saga-crypto/src/envelope.ts packages/saga-crypto/src/envelope.test.ts
git commit -m "feat(saga-crypto): SagaEncryptedEnvelope seal and open"
```

---

### Task 7: Encrypted Local Store

**Files:**

- Create: `packages/saga-crypto/src/store.ts`
- Create: `packages/saga-crypto/src/store.test.ts`

**Context:** The Encrypted Store provides an AES-256-GCM encrypted key-value store on top of a pluggable `StorageBackend`. Values are JSON-serialized, encrypted with the wallet-derived storage key (via `SagaKeyRing.encryptStorage`/`decryptStorage`), and persisted to the backend.

The `MemoryBackend` is an in-memory implementation for testing. Real backends (filesystem for Docker DERPs, KV for Worker DERPs) will be implemented in later phases.

Each stored entry is prefixed with a 1-byte version marker for future format evolution.

- [ ] **Step 1: Write failing tests**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it, expect, beforeEach } from 'vitest'
import nacl from 'tweetnacl'
import { createSagaKeyRing } from './keyring'
import { MemoryBackend, createEncryptedStore } from './store'
import type { StorageBackend } from './types'

describe('MemoryBackend', () => {
  let backend: StorageBackend

  beforeEach(() => {
    backend = new MemoryBackend()
  })

  it('put + get round-trips', async () => {
    const data = new Uint8Array([1, 2, 3])
    await backend.put('key1', data)
    const result = await backend.get('key1')
    expect(result).toEqual(data)
  })

  it('get returns null for missing key', async () => {
    expect(await backend.get('missing')).toBeNull()
  })

  it('delete removes key', async () => {
    await backend.put('key1', new Uint8Array([1]))
    await backend.delete('key1')
    expect(await backend.get('key1')).toBeNull()
  })

  it('list returns all keys', async () => {
    await backend.put('a:1', new Uint8Array([1]))
    await backend.put('a:2', new Uint8Array([2]))
    await backend.put('b:1', new Uint8Array([3]))
    const all = await backend.list()
    expect(all.sort()).toEqual(['a:1', 'a:2', 'b:1'])
  })

  it('list with prefix filters keys', async () => {
    await backend.put('mem:1', new Uint8Array([1]))
    await backend.put('mem:2', new Uint8Array([2]))
    await backend.put('msg:1', new Uint8Array([3]))
    const filtered = await backend.list('mem:')
    expect(filtered.sort()).toEqual(['mem:1', 'mem:2'])
  })
})

describe('EncryptedStore', () => {
  const walletKey = nacl.randomBytes(32)

  async function createStore() {
    const kr = createSagaKeyRing()
    await kr.unlockWallet(walletKey)
    const backend = new MemoryBackend()
    return { store: createEncryptedStore(kr, backend), backend, kr }
  }

  it('put + get round-trips JSON values', async () => {
    const { store } = await createStore()
    await store.put('agent:mem:1', { type: 'episodic', content: 'learned TypeScript' })
    const result = await store.get('agent:mem:1')
    expect(result).toEqual({ type: 'episodic', content: 'learned TypeScript' })
  })

  it('get returns null for missing key', async () => {
    const { store } = await createStore()
    expect(await store.get('missing')).toBeNull()
  })

  it('stored data is encrypted in backend', async () => {
    const { store, backend } = await createStore()
    await store.put('key1', { secret: 'plaintext' })
    const raw = await backend.get('key1')
    expect(raw).not.toBeNull()
    // Raw bytes should not contain the plaintext string
    const rawStr = new TextDecoder().decode(raw!)
    expect(rawStr).not.toContain('plaintext')
  })

  it('delete removes from backend', async () => {
    const { store, backend } = await createStore()
    await store.put('key1', { data: 1 })
    await store.delete('key1')
    expect(await backend.get('key1')).toBeNull()
    expect(await store.get('key1')).toBeNull()
  })

  it('query returns matching entries', async () => {
    const { store } = await createStore()
    await store.put('mem:1', { id: 1 })
    await store.put('mem:2', { id: 2 })
    await store.put('msg:1', { id: 3 })
    const results = await store.query({ prefix: 'mem:' })
    expect(results).toHaveLength(2)
    expect(results.map(r => r.value)).toEqual(expect.arrayContaining([{ id: 1 }, { id: 2 }]))
  })

  it('different wallet cannot read stored data', async () => {
    const { store, backend } = await createStore()
    await store.put('key1', { secret: 'data' })

    const otherKr = createSagaKeyRing()
    await otherKr.unlockWallet(nacl.randomBytes(32))
    const otherStore = createEncryptedStore(otherKr, backend)

    await expect(otherStore.get('key1')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/saga-crypto && pnpm test -- src/store.test.ts`
Expected: FAIL — `Cannot find module './store'`

- [ ] **Step 3: Implement MemoryBackend and EncryptedStore**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { AesGcmResult, SagaKeyRing, StorageBackend } from './types'

/** Current storage format version */
const STORE_FORMAT_VERSION = 1

// ── MemoryBackend ────────────────────────────────────────────────

/**
 * In-memory StorageBackend implementation for testing.
 * Data lives only for the lifetime of the process.
 */
export class MemoryBackend implements StorageBackend {
  private _data = new Map<string, Uint8Array>()

  async get(key: string): Promise<Uint8Array | null> {
    const value = this._data.get(key)
    return value ? new Uint8Array(value) : null
  }

  async put(key: string, value: Uint8Array): Promise<void> {
    this._data.set(key, new Uint8Array(value))
  }

  async delete(key: string): Promise<void> {
    this._data.delete(key)
  }

  async list(prefix?: string): Promise<string[]> {
    const keys: string[] = []
    for (const key of this._data.keys()) {
      if (!prefix || key.startsWith(prefix)) {
        keys.push(key)
      }
    }
    return keys
  }
}

// ── EncryptedStore ───────────────────────────────────────────────

export interface EncryptedStore {
  put(key: string, value: unknown): Promise<void>
  get<T = unknown>(key: string): Promise<T | null>
  delete(key: string): Promise<void>
  query(filter: { prefix?: string }): Promise<Array<{ key: string; value: unknown }>>
}

/**
 * Serialize an AES-GCM result into a single byte buffer.
 * Format: [version(1)] [ivLen(1)] [authTagLen(1)] [iv] [authTag] [ciphertext]
 */
function packEncrypted(result: AesGcmResult): Uint8Array {
  const totalLen = 3 + result.iv.length + result.authTag.length + result.ciphertext.length
  const buf = new Uint8Array(totalLen)
  buf[0] = STORE_FORMAT_VERSION
  buf[1] = result.iv.length
  buf[2] = result.authTag.length
  let offset = 3
  buf.set(result.iv, offset)
  offset += result.iv.length
  buf.set(result.authTag, offset)
  offset += result.authTag.length
  buf.set(result.ciphertext, offset)
  return buf
}

/** Deserialize a packed encrypted buffer back to AES-GCM components. */
function unpackEncrypted(buf: Uint8Array): AesGcmResult {
  if (buf[0] !== STORE_FORMAT_VERSION) {
    throw new Error(`Unsupported store format version: ${buf[0]}`)
  }
  const ivLen = buf[1]
  const authTagLen = buf[2]
  let offset = 3
  const iv = buf.slice(offset, offset + ivLen)
  offset += ivLen
  const authTag = buf.slice(offset, offset + authTagLen)
  offset += authTagLen
  const ciphertext = buf.slice(offset)
  return { ciphertext, iv, authTag }
}

/**
 * Create an encrypted key-value store.
 *
 * Values are JSON-serialized, encrypted with the SagaKeyRing's wallet-derived
 * AES-256 storage key, and persisted to the StorageBackend.
 *
 * @param keyRing - Unlocked SagaKeyRing (provides encryptStorage/decryptStorage)
 * @param backend - Pluggable storage backend (MemoryBackend for tests, FS/KV for prod)
 */
export function createEncryptedStore(
  keyRing: SagaKeyRing,
  backend: StorageBackend
): EncryptedStore {
  return {
    async put(key: string, value: unknown): Promise<void> {
      const json = JSON.stringify(value)
      const plaintext = new TextEncoder().encode(json)
      const encrypted = await keyRing.encryptStorage(plaintext)
      const packed = packEncrypted(encrypted)
      await backend.put(key, packed)
    },

    async get<T = unknown>(key: string): Promise<T | null> {
      const raw = await backend.get(key)
      if (!raw) return null
      const encrypted = unpackEncrypted(raw)
      const plaintext = await keyRing.decryptStorage(encrypted)
      const json = new TextDecoder().decode(plaintext)
      return JSON.parse(json) as T
    },

    async delete(key: string): Promise<void> {
      await backend.delete(key)
    },

    async query(filter: { prefix?: string }): Promise<Array<{ key: string; value: unknown }>> {
      const keys = await backend.list(filter.prefix)
      const results: Array<{ key: string; value: unknown }> = []
      for (const key of keys) {
        const value = await this.get(key)
        if (value !== null) {
          results.push({ key, value })
        }
      }
      return results
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/saga-crypto && pnpm test -- src/store.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/saga-crypto/src/store.ts packages/saga-crypto/src/store.test.ts
git commit -m "feat(saga-crypto): encrypted local store with pluggable backend"
```

---

### Task 8: Integration Tests, Package Exports & Build

**Files:**

- Create: `packages/saga-crypto/src/integration.test.ts`
- Modify: `packages/saga-crypto/src/index.ts` (add all exports)

**Context:** End-to-end tests exercise the full SAGA crypto flow: two agents derive keys, exchange public keys, encrypt/decrypt across all three scopes, use the encrypted store, and seal/open envelopes. This validates that all components work together correctly.

- [ ] **Step 1: Write integration tests**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, it, expect } from 'vitest'
import nacl from 'tweetnacl'
import { createSagaKeyRing } from './keyring'
import { seal, open } from './envelope'
import { MemoryBackend, createEncryptedStore } from './store'
import type { SagaEncryptedEnvelope } from './types'

describe('integration: two-agent encrypted replication', () => {
  // Simulate two agents with different wallets
  const agentAliceWallet = nacl.randomBytes(32)
  const companyAcmeWallet = nacl.randomBytes(32)

  it('full flow: agent↔company mutual messaging via envelope', async () => {
    // 1. Both parties derive keys
    const aliceKr = createSagaKeyRing()
    await aliceKr.unlockWallet(agentAliceWallet)
    const acmeKr = createSagaKeyRing()
    await acmeKr.unlockWallet(companyAcmeWallet)

    // 2. Alice sends a task result to Acme (mutual scope)
    const taskResult = new TextEncoder().encode(
      JSON.stringify({
        taskId: 'task-001',
        result: 'Analysis complete. Revenue up 15%.',
      })
    )

    const envelope = seal(
      {
        type: 'direct-message',
        scope: 'mutual',
        from: 'alice@epicflow',
        to: 'acme-corp@epicflow',
        plaintext: taskResult,
        recipientPublicKey: acmeKr.getPublicKey(),
      },
      aliceKr
    ) as SagaEncryptedEnvelope

    // 3. Verify envelope is opaque to the hub
    expect(envelope.ct).not.toContain('Revenue')

    // 4. Acme decrypts
    const decrypted = open(envelope, acmeKr, aliceKr.getPublicKey()) as Uint8Array
    const parsed = JSON.parse(new TextDecoder().decode(decrypted))
    expect(parsed.taskId).toBe('task-001')
    expect(parsed.result).toContain('Revenue up 15%')
  })

  it('full flow: agent-private memory stored and synced', async () => {
    const aliceKr = createSagaKeyRing()
    await aliceKr.unlockWallet(agentAliceWallet)

    // 1. Alice stores private memory locally
    const backend = new MemoryBackend()
    const store = createEncryptedStore(aliceKr, backend)

    const memory = {
      id: 'mem-001',
      type: 'semantic',
      content: 'TypeScript generics are covariant by default',
      createdAt: new Date().toISOString(),
    }
    await store.put(`mem:${memory.id}`, memory)

    // 2. Alice seals memory for sync (private scope)
    const envelope = (await seal(
      {
        type: 'memory-sync',
        scope: 'private',
        from: 'alice@epicflow',
        to: 'alice@epicflow',
        plaintext: new TextEncoder().encode(JSON.stringify(memory)),
      },
      aliceKr
    )) as SagaEncryptedEnvelope

    // 3. Envelope is opaque
    expect(envelope.ct).not.toContain('TypeScript')

    // 4. Alice opens it on another DERP (same wallet)
    const aliceKr2 = createSagaKeyRing()
    await aliceKr2.unlockWallet(agentAliceWallet)
    const decrypted = await open(envelope, aliceKr2)
    const parsed = JSON.parse(new TextDecoder().decode(decrypted as Uint8Array))
    expect(parsed.content).toContain('TypeScript generics')

    // 5. Acme cannot open it
    const acmeKr = createSagaKeyRing()
    await acmeKr.unlockWallet(companyAcmeWallet)
    await expect(open(envelope, acmeKr)).rejects.toThrow()
  })

  it('full flow: org group key distribution and group messaging', async () => {
    const aliceKr = createSagaKeyRing()
    await aliceKr.unlockWallet(agentAliceWallet)
    const acmeKr = createSagaKeyRing()
    await acmeKr.unlockWallet(companyAcmeWallet)

    // 1. Acme creates an org group key
    const groupKeyId = 'acme-org-key-v1'
    const rawGroupKey = nacl.randomBytes(32)
    acmeKr.injectGroupKey(groupKeyId, rawGroupKey)
    rawGroupKey.fill(0)

    // 2. Acme distributes group key to Alice (NaCl box wrapped)
    const wrappedForAlice = acmeKr.wrapGroupKeyFor(groupKeyId, aliceKr.getPublicKey())
    aliceKr.addGroupKey(groupKeyId, wrappedForAlice, acmeKr.getPublicKey())

    // 3. Acme sends group broadcast
    const announcement = new TextEncoder().encode(
      JSON.stringify({
        messageType: 'notification',
        payload: 'All-hands meeting at 3pm',
      })
    )

    const envelope = await seal(
      {
        type: 'group-message',
        scope: 'group',
        from: 'acme-corp@epicflow',
        to: ['alice@epicflow', 'bob@epicflow'],
        plaintext: announcement,
        groupKeyId,
      },
      acmeKr
    )

    // 4. Alice decrypts
    const decrypted = await open(envelope as SagaEncryptedEnvelope, aliceKr)
    const parsed = JSON.parse(new TextDecoder().decode(decrypted as Uint8Array))
    expect(parsed.payload).toContain('All-hands meeting')
  })

  it('encrypted store: data survives lock/unlock cycle', async () => {
    const backend = new MemoryBackend()

    // Session 1: store data
    const kr1 = createSagaKeyRing()
    await kr1.unlockWallet(agentAliceWallet)
    const store1 = createEncryptedStore(kr1, backend)
    await store1.put('config', { theme: 'dark', lang: 'en' })
    kr1.lock()

    // Session 2: read data (same wallet, new KeyRing instance)
    const kr2 = createSagaKeyRing()
    await kr2.unlockWallet(agentAliceWallet)
    const store2 = createEncryptedStore(kr2, backend)
    const config = await store2.get<{ theme: string; lang: string }>('config')
    expect(config).toEqual({ theme: 'dark', lang: 'en' })
  })
})
```

- [ ] **Step 2: Run integration tests**

Run: `cd packages/saga-crypto && pnpm test -- src/integration.test.ts`
Expected: All 4 integration tests PASS

- [ ] **Step 3: Update src/index.ts with all exports**

```typescript
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

// ── Types ──
export type {
  AesGcmResult,
  MutualEncryptionResult,
  SealedBoxResult,
  PrivateEncryptionResult,
  GroupEncryptionResult,
  DerivedKeyPair,
  SagaKeyRing,
  SagaMessageType,
  SagaEncryptionScope,
  SagaEncryptedEnvelope,
  SealPayload,
  StorageBackend,
} from './types'

// ── Key derivation ──
export { deriveX25519KeyPair, deriveStorageKey } from './key-derivation'

// ── NaCl primitives ──
export { mutualEncrypt, mutualDecrypt, sealedBoxEncrypt, sealedBoxDecrypt } from './nacl'

// ── KeyRing ──
export { createSagaKeyRing } from './keyring'

// ── Envelope ──
export { seal, open } from './envelope'

// ── Encrypted Store ──
export { MemoryBackend, createEncryptedStore } from './store'
export type { EncryptedStore } from './store'
```

- [ ] **Step 4: Run all tests**

Run: `cd packages/saga-crypto && pnpm test`
Expected: All tests PASS across all test files

- [ ] **Step 5: Build the package**

Run: `cd packages/saga-crypto && pnpm build`
Expected: Build succeeds, outputs `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`

- [ ] **Step 6: Run typecheck**

Run: `cd packages/saga-crypto && pnpm typecheck`
Expected: No TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add packages/saga-crypto/src/integration.test.ts packages/saga-crypto/src/index.ts
git commit -m "feat(saga-crypto): integration tests and package exports"
```

---

## Success Criteria Checklist

Per the Phase 1 spec:

- [ ] KeyRing encrypts/decrypts across all three scopes (private, mutual, group)
- [ ] Agent A encrypts with NaCl box → Agent B decrypts with their key → plaintext matches
- [ ] Group key wrapped to member → member unwraps → can decrypt group messages
- [ ] Encrypted store round-trips data correctly
- [ ] No raw key material exposed through any public interface
- [ ] Web Crypto API only (no Node.js `crypto` module — edge compatible)
  - `@epicdm/flowstate-crypto` uses `crypto.subtle` (Web Crypto)
  - `tweetnacl` is pure JavaScript (no Node.js dependencies)
  - No `node:crypto` imports anywhere in `saga-crypto`
