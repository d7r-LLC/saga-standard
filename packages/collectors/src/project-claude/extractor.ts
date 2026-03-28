// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { join } from 'node:path'
import { homedir } from 'node:os'
import type { PartialSagaDocument } from '@epicdm/saga-sdk'
import type { CollectorDetection, CollectorScan, ExtractOptions, SagaCollector } from '../types'
import { detectProjectClaude } from './detector'
import { scanProjectClaude } from './scanner'
import { parseAgentProfiles } from './parsers/agents'
import { parseRules } from './parsers/rules'
import { parseProjectSettings } from './parsers/settings'
import { parseCommands } from './parsers/commands'

/**
 * Project Claude collector: extracts agent configuration from .claude/
 * directories into a PartialSagaDocument.
 *
 * Layers populated:
 *  - persona: from .claude/agents/*.md
 *  - cognitive: from .claude/rules/*.md, CLAUDE.md, .claude/settings.json
 *  - relationships: from agent role definitions
 *  - skills: from .claude/commands/*.md
 */
export class ProjectClaudeCollector implements SagaCollector {
  readonly source = 'project-claude'
  private paths: string[]

  constructor(paths?: string[]) {
    this.paths = paths ?? [homedir()]
  }

  async detect(homeDir?: string): Promise<CollectorDetection> {
    return detectProjectClaude(this.paths, homeDir)
  }

  async scan(homeDir?: string): Promise<CollectorScan> {
    return scanProjectClaude(this.paths)
  }

  async extract(options?: ExtractOptions): Promise<PartialSagaDocument> {
    const detection = detectProjectClaude(this.paths)
    if (!detection.found) {
      return { source: this.source, layers: {} }
    }

    const requestedLayers = options?.layers
    const shouldInclude = (layer: string) =>
      !requestedLayers || requestedLayers.includes(layer as never)

    const partial: PartialSagaDocument = {
      source: this.source,
      layers: {},
    }

    // Process each detected .claude/ directory
    for (const claudeDir of detection.locations) {
      // Persona + Relationships from agent profiles
      if (shouldInclude('persona') || shouldInclude('relationships')) {
        const profiles = parseAgentProfiles(claudeDir)
        if (shouldInclude('persona') && profiles.persona) {
          partial.layers.persona = { ...partial.layers.persona, ...profiles.persona }
        }
        if (shouldInclude('relationships') && profiles.relationships) {
          partial.layers.relationships = { ...partial.layers.relationships, ...profiles.relationships }
        }
      }

      // Cognitive from rules + settings
      if (shouldInclude('cognitive')) {
        // Derive project root from .claude/ parent
        const projectRoot = join(claudeDir, '..')
        const rules = parseRules(claudeDir, projectRoot)
        const settings = parseProjectSettings(claudeDir)

        if (rules || settings) {
          partial.layers.cognitive = {
            ...partial.layers.cognitive,
            ...(settings ?? {}),
            ...(rules
              ? {
                  systemPrompt: {
                    format: 'markdown' as const,
                    content: [
                      partial.layers.cognitive?.systemPrompt?.content,
                      rules,
                    ]
                      .filter(Boolean)
                      .join('\n\n---\n\n'),
                  },
                }
              : {}),
          }
        }
      }

      // Skills from commands
      if (shouldInclude('skills')) {
        const commands = parseCommands(claudeDir)
        if (commands.length > 0) {
          const existing = partial.layers.skills?.selfReported ?? []
          partial.layers.skills = {
            ...partial.layers.skills,
            selfReported: [...existing, ...commands],
          }
        }
      }
    }

    return partial
  }
}
