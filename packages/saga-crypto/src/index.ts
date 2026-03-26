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
