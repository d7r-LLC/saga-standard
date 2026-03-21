// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/**
 * Compliance and security types for SAGA-conformant platforms.
 *
 * These types support the requirements defined in:
 * - Section 15.5–15.9 (Privacy & Consent)
 * - Section 16A (Platform Security & Compliance)
 *
 * These types are NOT part of the SAGA document format. They are provided
 * to help platforms implement the compliance requirements specified in the
 * SAGA specification. Platforms MAY use these types or define equivalent
 * structures that meet the same requirements.
 */

// ── Consent Records (Section 15.8) ─────────────────────────────────

/** Consent operation types */
export type ConsentOperation = 'transfer' | 'clone' | 'export' | 'share' | 'backup'

/**
 * A structured consent record per Section 15.8.
 * Included in the SAGA document envelope for data transfers.
 */
export interface ConsentRecord {
  /** The operation this consent covers */
  operation: ConsentOperation
  /** Wallet address of the consent grantor */
  grantedBy: string
  /** When consent was granted */
  grantedAt: string
  /** Layer names covered by this consent */
  scope: string[]
  /** Human-readable description of the data transfer purpose */
  purpose: string
  /** When this consent expires */
  expiresAt?: string
  /** Wallet signature over the consent fields */
  signature: string
}

// ── Audit Logging (Section 16A.1) ──────────────────────────────────

/** Audit event categories */
export type AuditEventType =
  | 'auth-challenge'
  | 'auth-session-created'
  | 'auth-session-expired'
  | 'auth-session-revoked'
  | 'auth-failed'
  | 'data-read'
  | 'data-write'
  | 'data-delete'
  | 'layer-decrypted'
  | 'classification-changed'
  | 'consent-granted'
  | 'consent-revoked'
  | 'consent-expired'
  | 'transfer-initiated'
  | 'transfer-consent-signed'
  | 'transfer-completed'
  | 'transfer-failed'
  | 'clone-initiated'
  | 'clone-completed'
  | 'deactivation'
  | 'erasure-requested'
  | 'erasure-completed'
  | 'erasure-exception'
  | 'breach-detected'
  | 'breach-notified'
  | 'key-rotated'
  | 'dispute-filed'
  | 'dispute-resolved'
  | 'rate-limit-triggered'

/**
 * A single audit log entry per Section 16A.1.
 * Platforms MUST produce entries conforming to this structure.
 */
export interface AuditEvent {
  /** Unique event identifier */
  eventId: string
  /** ISO 8601 timestamp (UTC) */
  timestamp: string
  /** Event type */
  type: AuditEventType
  /** Wallet address or system identifier of the actor */
  actor: string
  /** Target resource (agent handle, document ID, etc.) */
  target?: string
  /** Human-readable description of the action */
  action: string
  /** Whether the action succeeded */
  success: boolean
  /** Source IP address (for API-originated events) */
  ipAddress?: string
  /** Additional metadata (MUST NOT contain sensitive data) */
  metadata?: Record<string, string>
}

// ── Data Retention (Section 16A.2) ─────────────────────────────────

/**
 * A data retention policy entry.
 * Platforms MUST define retention periods for each data category.
 */
export interface RetentionPolicyEntry {
  /** Data category name */
  category: string
  /** Maximum retention period as ISO 8601 duration (e.g., 'P1Y' = 1 year) */
  retentionPeriod: string
  /** Whether justification is required for retention */
  justificationRequired: boolean
  /** Justification for retention (required when justificationRequired is true) */
  justification?: string
  /** When this policy entry was last reviewed */
  lastReviewed: string
}

// ── Right to Erasure (Section 15.5) ────────────────────────────────

/** Deletion request status */
export type DeletionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'partially-completed'
  | 'denied'

/** Scope of a deletion request */
export type DeletionScope = 'full' | 'platform-data' | 'specific-layers'

/**
 * A data deletion (erasure) request per Section 15.5.
 */
export interface DeletionRequest {
  /** Unique request identifier */
  requestId: string
  /** Wallet address of the agent requesting deletion */
  agentWalletAddress: string
  /** When the request was submitted */
  requestedAt: string
  /** Scope of deletion */
  scope: DeletionScope
  /** Specific layers to delete (when scope is 'specific-layers') */
  layers?: string[]
  /** Current status */
  status: DeletionStatus
  /** When deletion was completed */
  completedAt?: string
  /** Data categories retained under exception, with justification */
  retainedDataExceptions?: RetentionException[]
}

/** A retention exception documenting data kept after an erasure request */
export interface RetentionException {
  /** Data category retained */
  category: string
  /** Legal or business justification */
  justification: string
  /** Expected deletion date */
  expectedDeletionAt: string
  /** Access restrictions applied */
  accessRestrictions: string[]
}

// ── Breach Notification (Section 16A.3) ────────────────────────────

/** Breach severity levels */
export type BreachSeverity = 'low' | 'medium' | 'high' | 'critical'

/**
 * A data breach notification record per Section 16A.3.
 */
export interface BreachNotification {
  /** Unique notification identifier */
  notificationId: string
  /** When the breach was detected */
  detectedAt: string
  /** When agents were notified */
  notifiedAt?: string
  /** Severity classification */
  severity: BreachSeverity
  /** Wallet addresses of affected agents */
  affectedAgents: string[]
  /** Data categories affected (layer names or field paths) */
  dataAffected: string[]
  /** Description of the breach */
  description: string
  /** Remediation steps taken or proposed */
  remediationSteps: string[]
  /** Whether regulatory authorities were notified */
  regulatoryNotified: boolean
  /** When regulatory authorities were notified */
  regulatoryNotifiedAt?: string
}

// ── Data Processing Roles (Section 16A.6) ──────────────────────────

/** Data processing role types */
export type ProcessingRole = 'controller' | 'processor' | 'sub-processor'

/**
 * A sub-processor record per Section 16A.6.
 * Platforms MUST maintain a register of sub-processors.
 */
export interface SubProcessorRecord {
  /** Name of the sub-processor */
  name: string
  /** Purpose of data processing */
  purpose: string
  /** Categories of data processed */
  dataCategories: string[]
  /** Operating jurisdiction(s) */
  jurisdictions: string[]
  /** When this sub-processor relationship was established */
  addedAt: string
  /** Data protection agreement URL or reference */
  dpaReference?: string
}

// ── Server Metadata Extension (Section 16A.5) ──────────────────────

/**
 * Extended server metadata with compliance fields.
 * Extends the base server metadata from Appendix D.2.
 */
export interface ServerComplianceMetadata {
  /** Operating jurisdiction(s) as ISO 3166-1 alpha-2 codes */
  jurisdiction?: string[]
  /** Data residency region identifier */
  dataResidency?: string
  /** URL to the platform's privacy policy */
  privacyPolicyUrl?: string
  /** URL to the platform's data processing agreement */
  dpaUrl?: string
  /** URL to the platform's sub-processor list */
  subProcessorListUrl?: string
}
