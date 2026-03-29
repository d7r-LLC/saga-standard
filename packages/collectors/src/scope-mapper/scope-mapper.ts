// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { dirname } from 'node:path'
import { scanForClaudeMdReferences } from './claude-md-scanner'
import { resolveNearestFlowstateConfig } from './config-reader'
import { buildProjectPathMap, getDistinctProjects, resolveProjectScope } from './project-resolver'
import type { FlowstateScope, ScopeMapperOptions, ScopeMappingResult } from './types'

/**
 * Orchestrates both mapping strategies to build a complete observation-to-scope mapping.
 *
 * Strategy 1 (CLAUDE.md scanning): Fine-grained per-observation mapping.
 * Strategy 2 (project name resolution): Bulk fallback for unmapped projects.
 */
export class FlowstateScopeMapper {
  private options: ScopeMapperOptions

  constructor(options: ScopeMapperOptions) {
    this.options = options
  }

  buildMapping(): ScopeMappingResult {
    const observationScopes = new Map<number, FlowstateScope>()
    const projectScopes = new Map<string, FlowstateScope>()
    const unmappedObservationIds: number[] = []
    const unmappedProjects: string[] = []

    // Strategy 1: Scan CLAUDE.md files for observation ID references
    for (const root of this.options.scanRoots) {
      const refs = scanForClaudeMdReferences(root, this.options.maxDepth)

      for (const ref of refs) {
        const resolved = resolveNearestFlowstateConfig(dirname(ref.filePath))
        if (!resolved || !resolved.config.orgId || !resolved.config.workspaceId) {
          unmappedObservationIds.push(...ref.observationIds)
          continue
        }

        const scope: FlowstateScope = {
          orgId: resolved.config.orgId,
          workspaceId: resolved.config.workspaceId,
          codebaseId: resolved.config.codebaseId,
          projectId: resolved.config.projectId,
          projectName: resolved.config.projectName,
        }

        for (const id of ref.observationIds) {
          // Most-specific wins: if already mapped by a more specific config, keep it
          if (!observationScopes.has(id)) {
            observationScopes.set(id, scope)
          }
        }
      }
    }

    // Strategy 2: Map project names from DB to filesystem scopes
    if (this.options.dbPath) {
      const projects = getDistinctProjects(this.options.dbPath)
      const pathMap = buildProjectPathMap(this.options.scanRoots)

      for (const projectName of projects) {
        const result = resolveProjectScope(projectName, pathMap)
        if (result) {
          projectScopes.set(projectName, result.scope)
        } else {
          unmappedProjects.push(projectName)
        }
      }
    }

    return {
      observationScopes,
      projectScopes,
      unmappedObservationIds,
      unmappedProjects,
    }
  }
}
