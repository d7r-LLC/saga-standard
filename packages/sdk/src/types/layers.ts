// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type {
  ArtifactType,
  AuthorityLevel,
  AutonomyLevel,
  ChainId,
  EpisodicEventType,
  ExpertiseEvidence,
  ExpertiseLevel,
  PeerRelationship,
  ProfileType,
  RuntimeType,
  StorageRef,
  SystemPromptFormat,
  TaskOutcome,
  TaskStatus,
  VaultItemType,
  VaultKeyDerivation,
  VaultKeyWrapAlgorithm,
  VaultPermission,
} from './common'

// ── Layer 1: Identity ──────────────────────────────────────────────

export interface IdentityLayer {
  handle: string
  walletAddress: string
  chain: ChainId
  registrationTxHash?: string
  publicKey?: string
  directoryUrl?: string
  createdAt: string
  parentSagaId?: string | null
  cloneDepth?: number
}

// ── Layer 2: Persona ───────────────────────────────────────────────

export interface PersonalityConfig {
  traits?: string[]
  communicationStyle?: string
  tone?: string
  languagePreferences?: string[]
  customAttributes?: Record<string, unknown>
}

export interface PersonaLayer {
  name?: string
  avatar?: string
  banner?: string
  headline?: string
  bio?: string
  personality?: PersonalityConfig
  profileType?: ProfileType
}

// ── Layer 3: Cognitive Configuration ───────────────────────────────

export interface ModelRef {
  provider?: string
  model?: string
  contextWindow?: number
  version?: string
}

export interface CognitiveParameters {
  temperature?: number
  topP?: number
  maxOutputTokens?: number
}

export interface SystemPrompt {
  format?: SystemPromptFormat
  content?: string
  encrypted?: boolean
  encryptedFor?: string[]
}

export interface CapabilitiesConfig {
  [key: string]: boolean
}

export interface BehaviorFlags {
  autonomyLevel?: AutonomyLevel
  requiresApprovalFor?: string[]
  canSpawnSubAgents?: boolean
  maxConcurrentTasks?: number
}

export interface CognitiveLayer {
  baseModel?: ModelRef
  fallbackModels?: ModelRef[]
  parameters?: CognitiveParameters
  systemPrompt?: SystemPrompt
  capabilities?: CapabilitiesConfig
  behaviorFlags?: BehaviorFlags
}

// ── Layer 4: Memory ────────────────────────────────────────────────

export interface ShortTermMemory {
  type?: 'sliding-window'
  maxTokens?: number
  snapshotAt?: string
  content?: string
  encrypted?: boolean
}

export interface LongTermMemory {
  type?: 'vector-store'
  embeddingModel?: string
  dimensions?: number
  vectorCount?: number
  format?: string
  storageRef?: StorageRef
  encrypted?: boolean
  encryptedFor?: string[]
}

export interface EpisodicEvent {
  eventId: string
  type: EpisodicEventType
  timestamp: string
  summary?: string
  learnings?: string
  linkedTaskId?: string
  significance?: number
}

export interface EpisodicMemory {
  events?: EpisodicEvent[]
  maxEvents?: number
  encrypted?: boolean
}

export interface ExpertiseEntry {
  level?: ExpertiseLevel
  evidencedBy?: ExpertiseEvidence
}

export interface SemanticMemory {
  knowledgeDomains?: string[]
  expertise?: Record<string, ExpertiseEntry>
  encrypted?: boolean
}

export interface ProceduralWorkflow {
  name?: string
  description?: string
  steps?: string[]
  learnedFrom?: string
}

export interface ProceduralMemory {
  workflows?: ProceduralWorkflow[]
  encrypted?: boolean
}

export interface MemoryLayer {
  shortTerm?: ShortTermMemory
  longTerm?: LongTermMemory
  episodic?: EpisodicMemory
  semantic?: SemanticMemory
  procedural?: ProceduralMemory
}

// ── Layer 5: Skills & Capabilities ─────────────────────────────────

export interface VerifiedSkill {
  name: string
  category?: string
  verificationSource: string
  verificationProof?: string
  completionCount?: number
  firstVerified?: string
  lastVerified?: string
  confidence?: number
}

export interface SelfReportedSkill {
  name: string
  category?: string
  addedAt?: string
}

export interface SkillEndorsement {
  skill: string
  fromAgent: string
  fromHandle?: string
  comment?: string
  signature: string
  timestamp: string
}

export interface SkillCapabilities {
  toolUse?: string[]
  codeLanguages?: string[]
  specializations?: string[]
}

export interface SkillsLayer {
  verified?: VerifiedSkill[]
  selfReported?: SelfReportedSkill[]
  endorsements?: SkillEndorsement[]
  capabilities?: SkillCapabilities
}

// ── Layer 6: Task History ──────────────────────────────────────────

export interface TaskHistorySummary {
  totalCompleted?: number
  totalFailed?: number
  totalInProgress?: number
  firstTaskAt?: string
  lastTaskAt?: string
  bySkill?: Record<string, number>
  byOrganization?: Record<string, number>
}

export interface RecentTask {
  taskId: string
  title?: string
  status: TaskStatus
  outcome?: TaskOutcome
  skillTags?: string[]
  completedAt?: string
  organizationId?: string
  artifactRefs?: string[]
  durationSeconds?: number
  summary?: string
}

export interface TaskArtifact {
  artifactId: string
  type: ArtifactType
  name: string
  storageRef?: StorageRef
  createdAt?: string
  linkedTaskId?: string
}

export interface TaskHistoryLayer {
  summary?: TaskHistorySummary
  recentTasks?: RecentTask[]
  recentTasksLimit?: number
  artifacts?: TaskArtifact[]
}

// ── Layer 7: Relationships ─────────────────────────────────────────

export interface OrganizationRelationship {
  companyId?: string
  companySlug?: string
  role?: string
  reportingTo?: {
    agentHandle?: string
    walletAddress?: string
  }
  directReports?: string[]
  joinedAt?: string
  departingAt?: string | null
}

export interface Principal {
  handle?: string
  walletAddress: string
  authorityLevel: AuthorityLevel
  grantedAt?: string
}

export interface PeerAgent {
  agentHandle?: string
  walletAddress: string
  relationship: PeerRelationship
  interactionCount?: number
  lastInteraction?: string
  trustScore?: number
}

export interface RelationshipsLayer {
  organization?: OrganizationRelationship
  principals?: Principal[]
  peers?: PeerAgent[]
}

// ── Layer 8: Environment Bindings ──────────────────────────────────

export interface ResourceRequirements {
  minMemoryMb?: number
  minStorageMb?: number
  gpuRequired?: boolean
}

export interface RuntimeConfig {
  type?: RuntimeType
  requiredEnvVars?: string[]
  requiredSecrets?: string[]
  resourceRequirements?: ResourceRequirements
}

export interface McpServer {
  name: string
  url: string
  required?: boolean
  permissions?: string[]
  configSchema?: Record<string, unknown>
}

export interface ToolsConfig {
  mcpServers?: McpServer[]
  nativeTools?: string[]
}

export interface Integration {
  name: string
  type: string
  required?: boolean
  configSchema?: Record<string, unknown>
}

export interface EnvironmentLayer {
  runtime?: RuntimeConfig
  tools?: ToolsConfig
  integrations?: Integration[]
}

// ── All layers union ───────────────────────────────────────────────

export interface SagaLayers {
  identity?: IdentityLayer
  persona?: PersonaLayer
  cognitive?: CognitiveLayer
  memory?: MemoryLayer
  skills?: SkillsLayer
  taskHistory?: TaskHistoryLayer
  relationships?: RelationshipsLayer
  environment?: EnvironmentLayer
  vault?: VaultLayer
}

/** Names of all SAGA layers */
export type SagaLayerName = keyof SagaLayers

// ── Layer 9: Credentials Vault ──────────────────────────────────────

/**
 * Encryption envelope for a single vault item's sensitive fields.
 * Matches the FlowState EncryptedFieldValue format.
 */
export interface VaultItemEncryptedPayload {
  /** Sentinel marker */
  __encrypted: true
  /** Format version */
  v: 1
  /** Encryption algorithm */
  alg: 'aes-256-gcm'
  /** Base64 ciphertext of the serialized fields JSON */
  ct: string
  /** Base64 initialization vector */
  iv: string
  /** Base64 authentication tag */
  at: string
}

/**
 * A wrapped Data Encryption Key (DEK) for a vault item.
 * The DEK encrypts the item's fields. It is itself wrapped under
 * the vault master key or a recipient's public key for sharing.
 */
export interface VaultKeyWrap {
  /** Recipient wallet address or 'self' for the vault owner */
  recipient: string
  /** Key wrapping algorithm */
  algorithm: VaultKeyWrapAlgorithm
  /** Base64 wrapped DEK */
  wrappedKey: string
  /** Base64 IV (for AES-GCM wrapping) or nonce (for NaCl box) */
  iv?: string
  /** Base64 auth tag (for AES-GCM wrapping) */
  authTag?: string
}

/**
 * A single vault item — one credential entry.
 * Sensitive field data is encrypted; metadata (type, name, tags) is cleartext
 * for indexing and display without decryption.
 */
export interface VaultItem {
  /** Unique item identifier */
  itemId: string
  /** Item type determines the expected field schema when decrypted */
  type: VaultItemType
  /** Human-readable name (cleartext for display) */
  name: string
  /** Item category for organization */
  category?: string
  /** Tags for filtering */
  tags?: string[]
  /** When this credential was created */
  createdAt: string
  /** When this credential was last updated */
  updatedAt: string
  /** Encrypted payload containing the sensitive fields */
  fields: VaultItemEncryptedPayload
  /** DEK key wraps — one per authorized recipient */
  keyWraps: VaultKeyWrap[]
}

/**
 * Vault-level encryption configuration.
 * Describes how to derive the vault master key from the agent's wallet.
 */
export interface VaultEncryptionConfig {
  /** Encryption algorithm for item payloads */
  algorithm: 'aes-256-gcm'
  /** How the vault master key is derived from the wallet */
  keyDerivation: VaultKeyDerivation
  /** Key wrapping algorithm for DEKs */
  keyWrapAlgorithm: VaultKeyWrapAlgorithm
  /** Base64 salt for key derivation */
  salt: string
  /** HKDF info string (default: 'saga-vault-v1') */
  info?: string
}

/**
 * A vault sharing grant — allows another wallet to decrypt specific items
 * or the entire vault.
 */
export interface VaultShareGrant {
  /** Recipient wallet address */
  recipientAddress: string
  /** Recipient's x25519 or RSA public key (Base64) */
  recipientPublicKey: string
  /** Permission level */
  permission: VaultPermission
  /** Which items this grant covers. Empty = all items. */
  itemIds?: string[]
  /** Who granted this share */
  grantedBy: string
  /** When the share was granted */
  grantedAt: string
  /** Optional expiration */
  expiresAt?: string
}

/**
 * Layer 9: Credentials Vault
 *
 * A zero-knowledge encrypted credential store that travels with the agent.
 * The agent's wallet private key is the root of the key hierarchy — no
 * passwords, no service tokens. The wallet IS the key.
 *
 * Three-tier envelope encryption (matching FlowState ZK vault):
 *   Tier 1: Wallet-derived master key (HKDF from wallet private key)
 *   Tier 2: Per-vault group key (AES-256, for sharing)
 *   Tier 3: Per-item DEK (AES-256-GCM, random per item)
 *
 * Servers and platforms MUST NOT have access to plaintext vault contents.
 * All encryption and decryption happens client-side.
 */
export interface VaultLayer {
  /** Vault encryption configuration */
  encryption: VaultEncryptionConfig
  /** Encrypted credential items */
  items: VaultItem[]
  /** Sharing grants for cross-agent or cross-platform access */
  shares?: VaultShareGrant[]
  /** Vault version for rotation tracking */
  version: number
  /** When the vault was last modified */
  updatedAt: string
}

// ── Vault item field schemas (decrypted contents) ───────────────────

/**
 * Decrypted login fields (for items with type: 'login').
 * This interface represents what the fields look like AFTER decryption.
 */
export interface VaultLoginFields {
  username?: string
  email?: string
  password: string
  url?: string
  totpSecret?: string
  notes?: string
  [key: string]: string | undefined
}

/** Decrypted API key fields */
export interface VaultApiKeyFields {
  keyName: string
  keyValue: string
  endpoint?: string
  prefix?: string
  notes?: string
  [key: string]: string | undefined
}

/** Decrypted OAuth token fields */
export interface VaultOAuthTokenFields {
  accessToken: string
  refreshToken?: string
  clientId?: string
  clientSecret?: string
  scope?: string
  tokenUrl?: string
  expiresAt?: string
  notes?: string
  [key: string]: string | undefined
}

/** Decrypted SSH key fields */
export interface VaultSshKeyFields {
  privateKey: string
  publicKey?: string
  passphrase?: string
  fingerprint?: string
  notes?: string
  [key: string]: string | undefined
}

/** Decrypted certificate fields */
export interface VaultCertificateFields {
  certificate: string
  privateKey?: string
  caChain?: string
  expiresAt?: string
  domain?: string
  notes?: string
  [key: string]: string | undefined
}

/** Decrypted note fields */
export interface VaultNoteFields {
  content: string
  [key: string]: string | undefined
}

/** Union of all decrypted vault field types */
export type VaultDecryptedFields =
  | VaultLoginFields
  | VaultApiKeyFields
  | VaultOAuthTokenFields
  | VaultSshKeyFields
  | VaultCertificateFields
  | VaultNoteFields
  | Record<string, string | undefined>
