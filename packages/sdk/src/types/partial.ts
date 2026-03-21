// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type {
  CognitiveLayer,
  EnvironmentLayer,
  IdentityLayer,
  MemoryLayer,
  PersonaLayer,
  RelationshipsLayer,
  SkillsLayer,
  TaskHistoryLayer,
} from './layers'

/**
 * A partial SAGA document returned by collectors.
 * All layers are optional. The assembler merges multiple partials
 * into a complete SagaDocument.
 */
export interface PartialSagaDocument {
  /** Collector source identifier (e.g. 'claude-code', 'openclaw', 'flowstate') */
  source: string

  /** Partial layers — only populated layers are included */
  layers: {
    identity?: Partial<IdentityLayer>
    persona?: Partial<PersonaLayer>
    cognitive?: Partial<CognitiveLayer>
    memory?: Partial<MemoryLayer>
    skills?: Partial<SkillsLayer>
    taskHistory?: Partial<TaskHistoryLayer>
    relationships?: Partial<RelationshipsLayer>
    environment?: Partial<EnvironmentLayer>
  }

  /** Binary data to include in .saga container */
  binaries?: {
    longtermMemory?: Buffer
    episodicJsonl?: Buffer
    artifacts?: Array<{ name: string; data: Buffer }>
  }
}
