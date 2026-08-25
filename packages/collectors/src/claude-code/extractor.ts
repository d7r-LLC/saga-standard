// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { PartialSagaDocument } from '@d7r/saga-sdk'
import type { CollectorDetection, CollectorScan, ExtractOptions, SagaCollector } from '../types'
import { detectClaudeCode } from './detector'
import { scanClaudeCode } from './scanner'
import { parseHistory } from './parsers/history'
import { parseClaudeMd } from './parsers/claude-md'
import { parseSettings } from './parsers/settings'
import { parseProjectMemory } from './parsers/memory'
import { parsePlans } from './parsers/plans'
import { parseTodos } from './parsers/todos'

/**
 * Claude Code collector — extracts agent state from ~/.claude/ into a
 * PartialSagaDocument that can be assembled with other collector outputs.
 *
 * Layers populated:
 *  - cognitive: CLAUDE.md system prompt + settings.json model/params
 *  - memory: semantic (project memory), episodic (memory dated entries),
 *            procedural (plans)
 *  - taskHistory: history.jsonl sessions + todos as in-progress tasks
 */
export class ClaudeCodeCollector implements SagaCollector {
  readonly source = 'claude-code'

  async detect(homeDir?: string): Promise<CollectorDetection> {
    return detectClaudeCode(homeDir)
  }

  async scan(homeDir?: string): Promise<CollectorScan> {
    return scanClaudeCode(homeDir)
  }

  async extract(options?: ExtractOptions): Promise<PartialSagaDocument> {
    const home = options?.homeDir ?? homedir()
    const claudeDir = join(home, '.claude')

    if (!existsSync(claudeDir)) {
      return { source: this.source, layers: {} }
    }

    const requestedLayers = options?.layers
    const shouldInclude = (layer: string) =>
      !requestedLayers || requestedLayers.includes(layer as never)

    const partial: PartialSagaDocument = {
      source: this.source,
      layers: {},
    }

    // ── Cognitive layer ────────────────────────────────────────────
    if (shouldInclude('cognitive')) {
      const systemPrompts: string[] = []

      // Root CLAUDE.md
      const rootClaudeMd = parseClaudeMd(join(claudeDir, 'CLAUDE.md'))
      if (rootClaudeMd?.systemPrompt?.content) {
        systemPrompts.push(rootClaudeMd.systemPrompt.content)
      }

      // Project-specific CLAUDE.md files
      const projectsDir = join(claudeDir, 'projects')
      if (existsSync(projectsDir) && !options?.projects) {
        // If no project filter, scan all projects for CLAUDE.md
        try {
          const { readdirSync, statSync } = await import('node:fs')
          const projects = readdirSync(projectsDir).filter(d => {
            try {
              return statSync(join(projectsDir, d)).isDirectory()
            } catch {
              return false
            }
          })
          for (const project of projects) {
            const projectClaudeMd = parseClaudeMd(join(projectsDir, project, 'CLAUDE.md'))
            if (projectClaudeMd?.systemPrompt?.content) {
              systemPrompts.push(
                `## Project: ${project}\n\n${projectClaudeMd.systemPrompt.content}`
              )
            }
          }
        } catch {
          // skip
        }
      } else if (existsSync(projectsDir) && options?.projects) {
        for (const project of options.projects) {
          const projectClaudeMd = parseClaudeMd(join(projectsDir, project, 'CLAUDE.md'))
          if (projectClaudeMd?.systemPrompt?.content) {
            systemPrompts.push(`## Project: ${project}\n\n${projectClaudeMd.systemPrompt.content}`)
          }
        }
      }

      // Settings
      const settings = parseSettings(join(claudeDir, 'settings.json'))

      if (systemPrompts.length > 0 || settings) {
        partial.layers.cognitive = {
          ...(settings ?? {}),
          ...(systemPrompts.length > 0
            ? {
                systemPrompt: {
                  format: 'markdown' as const,
                  content: systemPrompts.join('\n\n---\n\n'),
                },
              }
            : {}),
        }
      }
    }

    // ── Memory layer ───────────────────────────────────────────────
    if (shouldInclude('memory')) {
      const projectsDir = join(claudeDir, 'projects')
      const plansDir = join(claudeDir, 'plans')

      // Semantic + episodic from project memory files
      const projectMemory = parseProjectMemory(projectsDir)

      // Procedural from plans
      const workflows = parsePlans(plansDir)

      const hasMemory =
        Object.keys(projectMemory.semantic).length > 0 ||
        projectMemory.episodicEvents.length > 0 ||
        workflows.length > 0

      if (hasMemory) {
        partial.layers.memory = {
          ...(Object.keys(projectMemory.semantic).length > 0
            ? { semantic: projectMemory.semantic }
            : {}),
          ...(projectMemory.episodicEvents.length > 0
            ? { episodic: { events: projectMemory.episodicEvents } }
            : {}),
          ...(workflows.length > 0 ? { procedural: { workflows } } : {}),
        }
      }
    }

    // ── Task history layer ─────────────────────────────────────────
    if (shouldInclude('taskHistory')) {
      const historyPath = join(claudeDir, 'history.jsonl')
      const todosDir = join(claudeDir, 'todos')

      const history = parseHistory(historyPath, options?.since)
      const todos = parseTodos(todosDir)

      const allTasks = [...history.recentTasks, ...todos]
      const limit = options?.maxMemoryEntries ?? 100

      if (allTasks.length > 0 || history.summary.totalCompleted || history.summary.totalFailed) {
        partial.layers.taskHistory = {
          summary: {
            ...history.summary,
            ...(todos.length > 0
              ? { totalInProgress: todos.filter(t => t.status === 'in-progress').length }
              : {}),
          },
          recentTasks: allTasks.slice(0, limit),
          recentTasksLimit: limit,
        }
      }
    }

    return partial
  }
}
