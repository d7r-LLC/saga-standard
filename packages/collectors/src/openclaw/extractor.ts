// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { PartialSagaDocument } from '@d7r/saga-sdk'
import type { CollectorDetection, CollectorScan, ExtractOptions, SagaCollector } from '../types'
import { detectOpenClaw, resolveOpenClawStateDir, resolveOpenClawWorkspaceDir } from './detector'
import { scanOpenClaw } from './scanner'
import {
  parseAgentsMd,
  parseBootstrapMd,
  parseIdentityMd,
  parseSoulMd,
  parseToolsMd,
  parseWorkspaceMemory,
} from './parsers/workspace-files'
import { parseOpenClawSkills } from './parsers/skills'
import { parseOpenClawSessions } from './parsers/sessions'
import { exportMemoryFromSqlite } from './parsers/memory-db'

/**
 * OpenClaw collector — extracts agent state from ~/.openclaw/ into a
 * PartialSagaDocument that can be assembled with other collector outputs.
 *
 * Layers populated:
 *  - persona: IDENTITY.md (name, creature, vibe, avatar)
 *  - cognitive: SOUL.md + AGENTS.md + BOOTSTRAP.md (system prompt, behavior)
 *  - memory: MEMORY.md + memory/*.md (semantic), index.sqlite chunks (text only, for re-embedding)
 *  - skills: skills/ directory SKILL.md frontmatter
 *  - taskHistory: session JSONL files
 *  - environment: TOOLS.md (tool configuration)
 */
export class OpenClawCollector implements SagaCollector {
  readonly source = 'openclaw'

  async detect(homeDir?: string): Promise<CollectorDetection> {
    return detectOpenClaw(homeDir)
  }

  async scan(homeDir?: string): Promise<CollectorScan> {
    return scanOpenClaw(homeDir)
  }

  async extract(options?: ExtractOptions): Promise<PartialSagaDocument> {
    const home = options?.homeDir ?? homedir()
    const stateDir = resolveOpenClawStateDir(home)

    if (!stateDir) {
      return { source: this.source, layers: {} }
    }

    const wsDir = resolveOpenClawWorkspaceDir(stateDir)
    const requestedLayers = options?.layers
    const shouldInclude = (layer: string) =>
      !requestedLayers || requestedLayers.includes(layer as never)

    const partial: PartialSagaDocument = {
      source: this.source,
      layers: {},
    }

    // ── Persona layer (IDENTITY.md) ────────────────────────────────
    if (shouldInclude('persona') && wsDir) {
      const identityPath = join(wsDir, 'IDENTITY.md')
      const persona = parseIdentityMd(identityPath)
      if (persona) {
        partial.layers.persona = persona
      }
    }

    // ── Cognitive layer (SOUL.md + AGENTS.md + BOOTSTRAP.md) ───────
    if (shouldInclude('cognitive') && wsDir) {
      const promptParts: string[] = []

      // SOUL.md — core personality/system prompt
      const soul = parseSoulMd(join(wsDir, 'SOUL.md'))
      if (soul?.systemPrompt?.content) {
        promptParts.push(soul.systemPrompt.content)
      }

      // AGENTS.md — agent behavior rules
      const agents = parseAgentsMd(join(wsDir, 'AGENTS.md'))
      if (agents?.systemPrompt?.content) {
        promptParts.push(agents.systemPrompt.content)
      }

      // BOOTSTRAP.md — startup context
      const bootstrap = parseBootstrapMd(join(wsDir, 'BOOTSTRAP.md'))
      if (bootstrap) {
        promptParts.push(`## Bootstrap Context\n\n${bootstrap}`)
      }

      // OpenClaw config for model settings
      let configModel: Record<string, unknown> | undefined
      try {
        const configPath = join(stateDir, 'openclaw.json')
        if (existsSync(configPath)) {
          const config = JSON.parse(readFileSync(configPath, 'utf-8'))
          if (config.model || config.models) {
            configModel = config
          }
        }
      } catch {
        // skip
      }

      if (promptParts.length > 0 || configModel) {
        partial.layers.cognitive = {
          ...(promptParts.length > 0
            ? {
                systemPrompt: {
                  format: 'markdown' as const,
                  content: promptParts.join('\n\n---\n\n'),
                },
              }
            : {}),
          ...(configModel?.model
            ? {
                baseModel: {
                  provider: extractProvider(configModel.model as string),
                  model: extractModelName(configModel.model as string),
                },
              }
            : {}),
        }
      }
    }

    // ── Memory layer ───────────────────────────────────────────────
    if (shouldInclude('memory') && wsDir) {
      const workspaceMemory = parseWorkspaceMemory(wsDir)

      // SQLite memory index — text chunks only (embeddings discarded for re-embedding)
      const indexPath = join(wsDir, 'index.sqlite')
      const dbExport = exportMemoryFromSqlite(indexPath, {
        maxChunks: options?.maxMemoryEntries ?? 1000,
      })

      const semanticDomains = [
        ...(workspaceMemory?.semantic?.knowledgeDomains ?? []),
        ...(dbExport?.knowledgeDomains ?? []),
      ]
      const uniqueDomains = [...new Set(semanticDomains)]

      // Combine workspace markdown memory with SQLite text chunks
      const hasMemory = uniqueDomains.length > 0 || (dbExport?.chunkCount ?? 0) > 0

      if (hasMemory) {
        partial.layers.memory = {
          ...(uniqueDomains.length > 0
            ? {
                semantic: {
                  knowledgeDomains: uniqueDomains,
                },
              }
            : {}),
          ...(dbExport && dbExport.chunkCount > 0
            ? {
                longTerm: {
                  type: 'vector-store' as const,
                  vectorCount: dbExport.chunkCount,
                  format: 'text-chunks-for-reembedding',
                },
              }
            : {}),
        }

        // Store chunk text as binary data for the .saga container
        if (dbExport && dbExport.chunks.length > 0) {
          const chunkData = dbExport.chunks.map(c => ({
            id: c.id,
            path: c.path,
            source: c.source,
            text: c.text,
          }))
          partial.binaries = {
            longtermMemory: Buffer.from(JSON.stringify(chunkData), 'utf-8'),
          }
        }
      }
    }

    // ── Skills layer ───────────────────────────────────────────────
    if (shouldInclude('skills')) {
      // Check both global skills and workspace skills
      const globalSkillsDir = join(stateDir, 'skills')
      const wsSkillsDir = wsDir ? join(wsDir, 'skills') : null

      const globalSkills = parseOpenClawSkills(globalSkillsDir)
      const wsSkills = wsSkillsDir ? parseOpenClawSkills(wsSkillsDir) : null

      const allSelfReported = [...globalSkills.selfReported, ...(wsSkills?.selfReported ?? [])]
      const allSpecializations = [
        ...(globalSkills.capabilities.specializations ?? []),
        ...(wsSkills?.capabilities.specializations ?? []),
      ]

      if (allSelfReported.length > 0) {
        partial.layers.skills = {
          selfReported: allSelfReported,
          capabilities: {
            ...(allSpecializations.length > 0
              ? { specializations: [...new Set(allSpecializations)] }
              : {}),
          },
        }
      }
    }

    // ── Task history layer ─────────────────────────────────────────
    if (shouldInclude('taskHistory')) {
      const sessions = parseOpenClawSessions(stateDir, {
        since: options?.since,
        maxTasks: options?.maxMemoryEntries ?? 100,
      })

      if (
        sessions.recentTasks.length > 0 ||
        sessions.summary.totalCompleted ||
        sessions.summary.totalFailed
      ) {
        partial.layers.taskHistory = {
          summary: sessions.summary,
          recentTasks: sessions.recentTasks,
        }
      }

      // Add episodic events to memory if it exists
      if (sessions.episodicEvents.length > 0 && partial.layers.memory) {
        partial.layers.memory.episodic = {
          events: sessions.episodicEvents,
        }
      }
    }

    // ── Environment layer (TOOLS.md) ───────────────────────────────
    if (shouldInclude('environment') && wsDir) {
      const toolsConfig = parseToolsMd(join(wsDir, 'TOOLS.md'))
      if (toolsConfig) {
        partial.layers.environment = toolsConfig
      }
    }

    return partial
  }
}

function extractProvider(modelString: string): string {
  const parts = modelString.split('/')
  return parts.length > 1 ? parts[0] : 'unknown'
}

function extractModelName(modelString: string): string {
  const parts = modelString.split('/')
  return parts.length > 1 ? parts.slice(1).join('/') : parts[0]
}
