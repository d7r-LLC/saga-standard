// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export const SAGA_VERSION = '1.0'
export const SAGA_SCHEMA_URL = 'https://saga-standard.dev/schema/v1'

// Types
export type * from './types'

// Validation
export { validateSchema, validateSagaDocument } from './validate'
export { validateSemantics } from './validate'
export type { SagaValidationError, ValidationSeverity, ValidationResult } from './validate'

// Assembly
export { assembleSagaDocument } from './assemble'
export type { AssembleOptions, AssembleResult } from './assemble'

// Signing
export { canonicalize } from './sign'
export { createPrivateKeySigner, createRemoteSigner } from './sign'
export type { SagaSigner } from './sign'

// Encryption
export {
  encryptLayer,
  decryptLayer,
  applyDefaultEncryption,
  generateBoxKeyPair,
  boxKeyPairFromSecretKey,
  deriveVaultMasterKey,
  encryptVaultItem,
  decryptVaultItem,
} from './encrypt'
export type { EncryptedLayerData, EncryptedPayload, EncryptedVaultItemResult } from './encrypt'

// Container
export { packSagaContainer, extractSagaContainer } from './container'
export type { PackOptions, MetaFile, SagaContainerContents } from './container'

// IDs
export { generateDocumentId, isValidDocumentId, createStorageRef } from './id'
