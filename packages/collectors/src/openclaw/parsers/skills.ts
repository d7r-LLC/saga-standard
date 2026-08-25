// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { SelfReportedSkill, SkillCapabilities } from '@d7r/saga-sdk'
import matter from 'gray-matter'

/**
 * Parse OpenClaw skills directory into SAGA skill data.
 * Skills are directories under ~/.openclaw/skills/ or workspace skills,
 * each containing a SKILL.md with frontmatter metadata.
 */
export function parseOpenClawSkills(skillsDir: string): {
  selfReported: SelfReportedSkill[]
  capabilities: SkillCapabilities
} {
  const selfReported: SelfReportedSkill[] = []
  const specializations: string[] = []

  if (!existsSync(skillsDir)) {
    return { selfReported: [], capabilities: {} }
  }

  try {
    const entries = readdirSync(skillsDir)

    for (const entry of entries) {
      const entryPath = join(skillsDir, entry)

      try {
        const isDir = statSync(entryPath).isDirectory()

        if (isDir) {
          // Look for SKILL.md in the directory
          const skillMdPath = join(entryPath, 'SKILL.md')
          if (existsSync(skillMdPath)) {
            const skill = parseSkillMd(skillMdPath, entry)
            if (skill) {
              selfReported.push(skill.selfReported)
              if (skill.specialization) {
                specializations.push(skill.specialization)
              }
            }
          }
        } else if (entry.endsWith('.md') && entry !== 'README.md') {
          // Standalone skill file
          const skill = parseSkillMd(entryPath, basename(entry, '.md'))
          if (skill) {
            selfReported.push(skill.selfReported)
            if (skill.specialization) {
              specializations.push(skill.specialization)
            }
          }
        }
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }

  return {
    selfReported,
    capabilities: {
      ...(specializations.length > 0 ? { specializations } : {}),
    },
  }
}

function parseSkillMd(
  skillPath: string,
  fallbackName: string
): { selfReported: SelfReportedSkill; specialization?: string } | null {
  try {
    const content = readFileSync(skillPath, 'utf-8')
    const { data: frontmatter } = matter(content)

    const name = (frontmatter.name as string) ?? (frontmatter.title as string) ?? fallbackName

    const category =
      (frontmatter.category as string) ?? (frontmatter.primaryEnv as string) ?? undefined

    return {
      selfReported: {
        name,
        category,
        addedAt: frontmatter.addedAt ?? frontmatter.createdAt ?? undefined,
      },
      specialization: name,
    }
  } catch {
    return null
  }
}
