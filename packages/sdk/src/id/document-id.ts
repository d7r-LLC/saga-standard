// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { createHash, randomBytes } from 'node:crypto'
import type { StorageRef } from '../types/common'

const ID_PREFIX = 'saga_'
const ID_LENGTH = 20
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * Generate a unique SAGA document ID.
 * Format: saga_ followed by 20 alphanumeric characters.
 * Uses crypto.randomBytes for uniqueness.
 */
export function generateDocumentId(): string {
  const bytes = randomBytes(ID_LENGTH)
  let id = ID_PREFIX
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return id
}

/**
 * Validate that a string matches the SAGA document ID pattern.
 */
export function isValidDocumentId(id: string): boolean {
  return /^saga_[A-Za-z0-9]+$/.test(id) && id.length >= 6
}

/**
 * Create a StorageRef with optional SHA-256 checksum.
 */
export function createStorageRef(options: {
  type: 'ipfs' | 'arweave' | 'url' | 'inline'
  ref: string
  data?: Buffer
}): StorageRef {
  const ref: StorageRef = {
    type: options.type,
    ref: options.ref,
  }

  if (options.data) {
    const hash = createHash('sha256').update(options.data).digest('hex')
    ref.checksum = `sha256:${hash}`
  }

  return ref
}
