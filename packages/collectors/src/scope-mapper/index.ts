// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export type {
  FlowstateScope,
  ClaudeMdReference,
  FlowstateConfig,
  ScopeMappingResult,
  ScopeMapperOptions,
} from './types'

export { readFlowstateConfig, resolveNearestFlowstateConfig } from './config-reader'
export { extractObservationIds, scanForClaudeMdReferences } from './claude-md-scanner'
export { buildProjectPathMap, getDistinctProjects, resolveProjectScope } from './project-resolver'
export { FlowstateScopeMapper } from './scope-mapper'
