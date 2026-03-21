// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/**
 * Validate that a SAGA document JSON meets encryption requirements
 * per spec Sections 12 and 14.1.
 *
 * Returns null if valid, or an error message string if invalid.
 */
export function validateDocumentEncryption(doc: Record<string, unknown>): string | null {
  const layers = doc.layers as Record<string, unknown> | undefined
  if (!layers) return null

  // Check vault layer: MUST be encrypted (spec Section 12)
  const vault = layers.vault as Record<string, unknown> | undefined
  if (vault) {
    const items = vault.items as Array<Record<string, unknown>> | undefined
    if (items && items.length > 0) {
      for (const item of items) {
        const fields = item.fields as Record<string, unknown> | undefined
        if (fields && fields.__encrypted !== true) {
          return 'Vault layer items MUST be encrypted. Item fields.__encrypted is not true.'
        }
        const keyWraps = item.keyWraps as unknown[] | undefined
        if (!keyWraps || keyWraps.length === 0) {
          return 'Vault layer items MUST have at least one keyWrap entry.'
        }
      }
    }

    // Vault must be declared in privacy.encryptedLayers
    const privacy = doc.privacy as Record<string, unknown> | undefined
    const encryptedLayers = (privacy?.encryptedLayers ?? []) as string[]
    if (!encryptedLayers.includes('vault')) {
      return 'Vault layer is present but not listed in privacy.encryptedLayers.'
    }
  }

  return null
}
