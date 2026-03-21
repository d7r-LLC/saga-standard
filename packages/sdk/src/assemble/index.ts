// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export { assembleSagaDocument } from './assembler'
export type { AssembleOptions, AssembleResult } from './assembler'
export {
  deepMergeFirstWins,
  mergeEpisodicEvents,
  mergeVerifiedSkills,
  mergeSelfReportedSkills,
  mergeEndorsements,
  mergeRecentTasks,
  mergeArtifacts,
  mergeWorkflows,
  mergeTaskSummaries,
  unionArrays,
} from './layer-merge'
