// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { SagaDocument } from '../types/saga-document'
import { type EncryptedPayload, boxDecrypt, boxEncrypt } from './nacl-box'
import { encodeBase64 } from 'tweetnacl-util'

export interface EncryptedLayerData {
  encrypted: true
  scheme: 'x25519-xsalsa20-poly1305'
  /** One encrypted payload per recipient (each can decrypt independently) */
  recipients: Array<{
    recipientPublicKey: string // base64
    payload: EncryptedPayload
  }>
}

/**
 * Encrypt a SAGA layer's JSON data for multiple recipients.
 */
export function encryptLayer(options: {
  layerData: unknown
  recipientPublicKeys: Uint8Array[]
  senderSecretKey: Uint8Array
}): EncryptedLayerData {
  const plaintext = JSON.stringify(options.layerData)

  const recipients = options.recipientPublicKeys.map(pubKey => ({
    recipientPublicKey: encodeBase64(pubKey),
    payload: boxEncrypt(plaintext, pubKey),
  }))

  return {
    encrypted: true,
    scheme: 'x25519-xsalsa20-poly1305',
    recipients,
  }
}

/**
 * Decrypt a layer encrypted with encryptLayer.
 */
export function decryptLayer(options: {
  encrypted: EncryptedLayerData
  recipientPublicKey: Uint8Array
  recipientSecretKey: Uint8Array
}): unknown {
  const myPubKey = encodeBase64(options.recipientPublicKey)

  const entry = options.encrypted.recipients.find(r => r.recipientPublicKey === myPubKey)
  if (!entry) {
    throw new Error('No encrypted payload found for this recipient')
  }

  const plaintext = boxDecrypt(entry.payload, options.recipientSecretKey)
  return JSON.parse(plaintext)
}

/**
 * Default encryption layers per SAGA Section 14.1.
 * Returns a copy of the document with sensitive layers encrypted.
 *
 * Vault items use AES-256-GCM (not NaCl box), so this function validates
 * that vault items are already encrypted rather than encrypting them.
 * Use encryptVaultItem() at write time for vault encryption.
 */
export function applyDefaultEncryption(options: {
  document: SagaDocument
  senderSecretKey: Uint8Array
  recipientPublicKeys: Uint8Array[]
  crossOrg?: boolean
}): SagaDocument {
  const doc = structuredClone(options.document)
  const encryptedLayers: string[] = []

  // cognitive.systemPrompt: always encrypted on cross-org export
  if (options.crossOrg && doc.layers.cognitive?.systemPrompt?.content) {
    const encrypted = encryptLayer({
      layerData: doc.layers.cognitive.systemPrompt,
      recipientPublicKeys: options.recipientPublicKeys,
      senderSecretKey: options.senderSecretKey,
    })
    ;(doc.layers.cognitive as Record<string, unknown>).systemPrompt = encrypted
    encryptedLayers.push('cognitive.systemPrompt')
  }

  // memory.longTerm: encrypted by default
  if (doc.layers.memory?.longTerm) {
    const encrypted = encryptLayer({
      layerData: doc.layers.memory.longTerm,
      recipientPublicKeys: options.recipientPublicKeys,
      senderSecretKey: options.senderSecretKey,
    })
    ;(doc.layers.memory as Record<string, unknown>).longTerm = encrypted
    encryptedLayers.push('memory.longTerm')
  }

  // vault: MUST be encrypted (spec Section 12)
  // Vault items use AES-256-GCM (different scheme), so we validate rather than encrypt.
  // Vault encryption happens at item write time via vault-crypto.ts.
  if (doc.layers.vault) {
    const vault = doc.layers.vault
    if (vault.items && vault.items.length > 0) {
      for (const item of vault.items) {
        if (!item.fields.__encrypted) {
          throw new Error(
            'Vault items must be encrypted before export. Use encryptVaultItem() first.'
          )
        }
      }
    }
    encryptedLayers.push('vault')
  }

  if (encryptedLayers.length > 0) {
    doc.privacy = {
      ...doc.privacy,
      encryptedLayers,
      encryptionScheme: 'x25519-xsalsa20-poly1305',
    }
  }

  return doc
}
