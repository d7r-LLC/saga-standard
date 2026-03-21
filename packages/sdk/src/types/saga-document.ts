// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { ConsentRecord } from './compliance'
import type { ExportType, PrivacyConfig, SignatureEnvelope } from './common'
import type { RedactionManifest, SagaLayers } from './layers'

/** A complete SAGA document per the v1.0 specification */
export interface SagaDocument {
  $schema: string
  sagaVersion: string
  documentId: string
  createdAt?: string
  exportedAt: string
  exportType: ExportType
  privacy?: PrivacyConfig
  signature: SignatureEnvelope
  layers: SagaLayers
  /** Redaction manifest for exit/transfer exports (Section 13.5.4) */
  redactionManifest?: RedactionManifest
  /** Consent record for data transfers between organizations (Section 15.8) */
  consent?: ConsentRecord
}

/** A signed SAGA document (signature field is populated and verified) */
export type SignedSagaDocument = SagaDocument & {
  signature: SignatureEnvelope
}

/** Consent message for transfer/clone operations per Section 15.2 */
export interface ConsentMessage {
  operationType: 'transfer' | 'clone'
  documentId: string
  destinationUrl: string
  timestamp: string
}
