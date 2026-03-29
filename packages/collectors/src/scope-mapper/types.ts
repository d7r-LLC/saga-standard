// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/** FlowState organizational scope for a project or package */
export interface FlowstateScope {
  orgId: string
  workspaceId: string
  codebaseId?: string
  projectId?: string
  projectName?: string
}

/** A CLAUDE.md file that references specific observation IDs */
export interface ClaudeMdReference {
  filePath: string
  observationIds: number[]
}

/** Parsed content of a .flowstate/config.json file */
export interface FlowstateConfig {
  version?: string
  projectName?: string
  projectId?: string
  codebaseId?: string
  orgId?: string
  workspaceId?: string
  packageName?: string
}

/** Result of mapping observations and projects to FlowState scopes */
export interface ScopeMappingResult {
  /** Individual observation ID -> scope (from CLAUDE.md scanning) */
  observationScopes: Map<number, FlowstateScope>
  /** Project name -> scope (from project name resolution) */
  projectScopes: Map<string, FlowstateScope>
  /** Observation IDs found in CLAUDE.md files but not resolvable to a scope */
  unmappedObservationIds: number[]
  /** Project names from the DB that could not be resolved to a scope */
  unmappedProjects: string[]
}

/** Options for the FlowstateScopeMapper */
export interface ScopeMapperOptions {
  /** Root directories to scan for CLAUDE.md and .flowstate/config.json files */
  scanRoots: string[]
  /** Path to claude-mem.db (optional, enables project-name resolution) */
  dbPath?: string
  /** Max directory depth for CLAUDE.md scanning (default 10) */
  maxDepth?: number
}
