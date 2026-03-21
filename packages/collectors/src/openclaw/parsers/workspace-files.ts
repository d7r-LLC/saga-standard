// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { CognitiveLayer, EnvironmentLayer, MemoryLayer, PersonaLayer } from '@epicdm/saga-sdk'

/**
 * Parse IDENTITY.md into a PersonaLayer.
 * OpenClaw IDENTITY.md uses key:value markdown lines for name, emoji, creature, vibe, theme, avatar.
 */
export function parseIdentityMd(identityPath: string): Partial<PersonaLayer> | null {
  if (!existsSync(identityPath)) return null

  try {
    const content = readFileSync(identityPath, 'utf-8').trim()
    if (!content) return null

    const persona: Partial<PersonaLayer> = {}
    const personality: Record<string, unknown> = {}
    const lines = content.split(/\r?\n/)

    for (const line of lines) {
      const cleaned = line.trim().replace(/^\s*-\s*/, '')
      const colonIndex = cleaned.indexOf(':')
      if (colonIndex === -1) continue

      const label = cleaned.slice(0, colonIndex).replace(/[*_]/g, '').trim().toLowerCase()
      const value = cleaned
        .slice(colonIndex + 1)
        .replace(/^[*_]+|[*_]+$/g, '')
        .trim()
      if (!value) continue

      // Skip placeholder values
      if (isPlaceholder(value)) continue

      switch (label) {
        case 'name':
          persona.name = value
          break
        case 'emoji':
          // Map emoji to personality trait
          personality.emoji = value
          break
        case 'creature':
          personality.creature = value
          break
        case 'vibe':
          personality.communicationStyle = value
          break
        case 'theme':
          personality.theme = value
          break
        case 'avatar':
          persona.avatar = value
          break
      }
    }

    if (Object.keys(personality).length > 0) {
      persona.personality = {
        traits: Object.entries(personality)
          .filter(([k]) => k !== 'emoji' && k !== 'communicationStyle')
          .map(([k, v]) => `${k}: ${v}`),
        ...(typeof personality.communicationStyle === 'string'
          ? { communicationStyle: personality.communicationStyle }
          : {}),
        customAttributes: personality,
      }
    }

    return Object.keys(persona).length > 0 ? persona : null
  } catch {
    return null
  }
}

const PLACEHOLDER_VALUES = new Set([
  'pick something you like',
  'ai? robot? familiar? ghost in the machine? something weirder?',
  'how do you come across? sharp? warm? chaotic? calm?',
  'your signature - pick one that feels right',
  'workspace-relative path, http(s) url, or data uri',
])

function isPlaceholder(value: string): boolean {
  const normalized = value
    .trim()
    .replace(/^[*_]+|[*_]+$/g, '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/^\(|\)$/g, '')
    .trim()
  return PLACEHOLDER_VALUES.has(normalized)
}

/**
 * Parse SOUL.md into cognitive layer system prompt.
 * SOUL.md defines the agent's core personality and behavioral guidelines.
 */
export function parseSoulMd(soulPath: string): Partial<CognitiveLayer> | null {
  if (!existsSync(soulPath)) return null

  try {
    const content = readFileSync(soulPath, 'utf-8').trim()
    if (!content) return null

    return {
      systemPrompt: {
        format: 'markdown',
        content,
      },
    }
  } catch {
    return null
  }
}

/**
 * Parse AGENTS.md into cognitive behavioral flags.
 * AGENTS.md defines agent behavior rules and constraints.
 */
export function parseAgentsMd(agentsPath: string): Partial<CognitiveLayer> | null {
  if (!existsSync(agentsPath)) return null

  try {
    const content = readFileSync(agentsPath, 'utf-8').trim()
    if (!content) return null

    return {
      systemPrompt: {
        format: 'markdown',
        content: `## Agent Rules\n\n${content}`,
      },
    }
  } catch {
    return null
  }
}

/**
 * Parse BOOTSTRAP.md into cognitive context.
 * BOOTSTRAP.md provides startup context files and initialization data.
 */
export function parseBootstrapMd(bootstrapPath: string): string | null {
  if (!existsSync(bootstrapPath)) return null

  try {
    const content = readFileSync(bootstrapPath, 'utf-8').trim()
    return content || null
  } catch {
    return null
  }
}

/**
 * Parse TOOLS.md into environment layer tool configuration.
 */
export function parseToolsMd(toolsPath: string): Partial<EnvironmentLayer> | null {
  if (!existsSync(toolsPath)) return null

  try {
    const content = readFileSync(toolsPath, 'utf-8').trim()
    if (!content) return null

    // Extract tool names from markdown lists and headers
    const nativeTools: string[] = []
    const lines = content.split('\n')
    for (const line of lines) {
      // Match lines like "- tool_name: description" or "## tool_name"
      const listMatch = line.match(/^[-*]\s+(\w+)(?:\s*[:—-]\s*(.*))?/)
      const headerMatch = line.match(/^#{1,3}\s+(\w+)/)
      const toolName = listMatch?.[1] ?? headerMatch?.[1]
      if (toolName && !nativeTools.includes(toolName)) {
        nativeTools.push(toolName)
      }
    }

    return nativeTools.length > 0 ? { tools: { nativeTools } } : null
  } catch {
    return null
  }
}

/**
 * Parse MEMORY.md + memory/*.md into semantic/episodic memory data.
 * Returns the text content for re-embedding by the standard model.
 */
export function parseWorkspaceMemory(workspaceDir: string): Partial<MemoryLayer> | null {
  const memoryMdPath = join(workspaceDir, 'MEMORY.md')
  const memoryDir = join(workspaceDir, 'memory')

  const knowledgeDomains: string[] = []

  // Main MEMORY.md
  if (existsSync(memoryMdPath)) {
    try {
      const content = readFileSync(memoryMdPath, 'utf-8').trim()
      if (content) {
        knowledgeDomains.push('workspace-memory')
      }
    } catch {
      // skip
    }
  }

  // memory/*.md files
  if (existsSync(memoryDir)) {
    try {
      const files = readdirSync(memoryDir).filter(f => f.endsWith('.md'))
      for (const file of files) {
        try {
          const content = readFileSync(join(memoryDir, file), 'utf-8').trim()
          if (!content) continue
          const domain = basename(file, '.md').replace(/[-_]/g, ' ')
          knowledgeDomains.push(domain)
        } catch {
          // skip
        }
      }
    } catch {
      // skip
    }
  }

  if (knowledgeDomains.length === 0) return null

  return {
    semantic: {
      knowledgeDomains,
    },
  }
}
