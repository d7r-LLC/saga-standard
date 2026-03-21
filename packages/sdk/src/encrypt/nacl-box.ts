// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import nacl from 'tweetnacl'
import { decodeBase64, decodeUTF8, encodeBase64, encodeUTF8 } from 'tweetnacl-util'

export interface EncryptedPayload {
  nonce: string // base64
  ephemeralPublicKey: string // base64
  ciphertext: string // base64
}

/**
 * Encrypt data using NaCl box (x25519-xsalsa20-poly1305).
 * Generates an ephemeral keypair per encryption.
 */
export function boxEncrypt(plaintext: string, recipientPublicKey: Uint8Array): EncryptedPayload {
  const ephemeral = nacl.box.keyPair()
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const messageBytes = decodeUTF8(plaintext)

  const ciphertext = nacl.box(messageBytes, nonce, recipientPublicKey, ephemeral.secretKey)
  if (!ciphertext) {
    throw new Error('Encryption failed')
  }

  return {
    nonce: encodeBase64(nonce),
    ephemeralPublicKey: encodeBase64(ephemeral.publicKey),
    ciphertext: encodeBase64(ciphertext),
  }
}

/**
 * Decrypt data encrypted with boxEncrypt.
 */
export function boxDecrypt(encrypted: EncryptedPayload, recipientSecretKey: Uint8Array): string {
  const nonce = decodeBase64(encrypted.nonce)
  const ephemeralPublicKey = decodeBase64(encrypted.ephemeralPublicKey)
  const ciphertext = decodeBase64(encrypted.ciphertext)

  const plaintext = nacl.box.open(ciphertext, nonce, ephemeralPublicKey, recipientSecretKey)
  if (!plaintext) {
    throw new Error('Decryption failed: invalid key or corrupted data')
  }

  return encodeUTF8(plaintext)
}

/** Generate a NaCl box keypair */
export function generateBoxKeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
  return nacl.box.keyPair()
}
