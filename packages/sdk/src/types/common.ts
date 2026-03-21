// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/** SAGA export types per Section 3.2 */
export type ExportType = 'identity' | 'profile' | 'transfer' | 'clone' | 'backup' | 'full'

/** CAIP-2 chain identifiers per Appendix B */
export type ChainId =
  | 'eip155:8453' // Base
  | 'eip155:1' // Ethereum
  | 'eip155:137' // Polygon
  | 'solana:mainnet' // Solana
  | (string & {}) // allow custom chains

/** Content-addressed storage reference */
export interface StorageRef {
  type: 'ipfs' | 'arweave' | 'url' | 'inline'
  ref: string
  checksum?: string // sha256:hex
}

/** Document privacy configuration */
export interface PrivacyConfig {
  encryptedLayers?: string[]
  redactedFields?: string[]
  encryptionScheme?: 'x25519-xsalsa20-poly1305'
}

/** Wallet signature envelope */
export interface SignatureEnvelope {
  walletAddress: string
  chain: ChainId
  message: string
  sig: string
}

/** Autonomy levels for behavior flags */
export type AutonomyLevel = 'supervised' | 'semi-autonomous' | 'autonomous'

/** Profile types */
export type ProfileType = 'agent' | 'human' | 'hybrid'

/** Task status */
export type TaskStatus = 'completed' | 'failed' | 'in-progress' | 'cancelled'

/** Task outcome */
export type TaskOutcome = 'success' | 'failure' | 'partial'

/** Artifact type */
export type ArtifactType = 'file' | 'code' | 'document' | 'data'

/** Episodic event type */
export type EpisodicEventType = 'task-completed' | 'interaction' | 'decision' | 'milestone'

/** Expertise level */
export type ExpertiseLevel = 'familiar' | 'proficient' | 'expert'

/** Expertise evidence source */
export type ExpertiseEvidence = 'verified-tasks' | 'self-reported' | 'endorsement'

/** Authority level for principals */
export type AuthorityLevel = 'owner' | 'supervisor' | 'collaborator'

/** Peer relationship type */
export type PeerRelationship = 'collaborator' | 'reports-to' | 'manages' | 'peer'

/** Runtime type */
export type RuntimeType = 'cloudflare-worker' | 'docker' | 'local' | 'kubernetes' | 'lambda'

/** System prompt format */
export type SystemPromptFormat = 'plaintext' | 'markdown' | 'jinja2'
