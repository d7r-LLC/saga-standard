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
