// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { fromBase64, toBase64 } from '@epicdm/flowstate-crypto'
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
