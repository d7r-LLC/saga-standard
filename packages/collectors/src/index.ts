// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

// Core types and registry
export type { SagaCollector, CollectorDetection, CollectorScan, ExtractOptions } from './types'
export {
  registerCollector,
  createCollector,
  detectCollectors,
  listCollectorSources,
} from './registry'

// Claude Code collector
export { ClaudeCodeCollector } from './claude-code'
export {
  detectClaudeCode,
  scanClaudeCode,
  parseHistory,
  parseClaudeMd,
  parseSettings,
  parseProjectMemory,
  parsePlans,
  parseTodos,
} from './claude-code'

// OpenClaw collector
export { OpenClawCollector } from './openclaw'
export {
  detectOpenClaw,
  resolveOpenClawStateDir,
  resolveOpenClawWorkspaceDir,
  scanOpenClaw,
  parseIdentityMd,
  parseSoulMd,
  parseAgentsMd,
  parseBootstrapMd,
  parseToolsMd,
  parseWorkspaceMemory,
  parseOpenClawSkills,
  parseOpenClawSessions,
  exportMemoryFromSqlite,
} from './openclaw'

// Auto-register built-in collectors
import { registerCollector } from './registry'
import { ClaudeCodeCollector } from './claude-code'
import { OpenClawCollector } from './openclaw'

registerCollector('claude-code', () => new ClaudeCodeCollector())
registerCollector('openclaw', () => new OpenClawCollector())
