// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PersonaLayer, RelationshipsLayer } from '@epicdm/saga-sdk'

export interface AgentProfileResult {
  persona?: Partial<PersonaLayer>
  relationships?: Partial<RelationshipsLayer>
}

/**
 * Parse agent profile markdown files from .claude/agents/*.md.
 * Extracts name, role, bio, and team membership.
 */
export function parseAgentProfiles(claudeDir: string): AgentProfileResult {
  const agentsDir = join(claudeDir, 'agents')
  if (!existsSync(agentsDir)) return {}

  try {
    const files = readdirSync(agentsDir).filter(f => f.endsWith('.md')).sort()
    if (files.length === 0) return {}

    // Parse the first agent profile as the primary identity
    const content = readFileSync(join(agentsDir, files[0]), 'utf-8')
    return parseAgentMarkdown(content)
  } catch {
    return {}
  }
}

function parseAgentMarkdown(content: string): AgentProfileResult {
  const lines = content.split('\n')
  const result: AgentProfileResult = {}

  // Extract name from first heading
  const nameMatch = lines.find(l => l.startsWith('# '))
  const name = nameMatch?.replace(/^#\s+/, '').trim()

  // Extract role
  const roleLine = lines.find(l => /^Role:\s*/i.test(l))
  const role = roleLine?.replace(/^Role:\s*/i, '').trim()

  // Extract team member ID
  const teamIdLine = lines.find(l => /Team Member ID:\s*/i.test(l))
  const teamMemberId = teamIdLine?.replace(/.*Team Member ID:\s*/i, '').trim()

  // Build bio from non-metadata lines
  const metadataPatterns = [/^#/, /^Role:/i, /^Team Member ID:/i, /^\s*$/]
  const bioLines = lines.filter(l => !metadataPatterns.some(p => p.test(l)))
  const bio = bioLines.join(' ').trim() || undefined

  if (name || bio) {
    result.persona = {
      ...(name ? { name } : {}),
      ...(bio ? { bio } : {}),
    }
  }

  if (role) {
    result.relationships = {
      organization: {
        role,
        ...(teamMemberId ? { companyId: teamMemberId } : {}),
      },
    }
  }

  return result
}
