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
}

/** Names of all SAGA layers */
export type SagaLayerName = keyof SagaLayers
