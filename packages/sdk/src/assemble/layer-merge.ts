// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type {
  EpisodicEvent,
  ProceduralWorkflow,
  RecentTask,
  SelfReportedSkill,
  SkillEndorsement,
  TaskArtifact,
  TaskHistorySummary,
  VerifiedSkill,
} from '../types'

/**
 * Deep merge two objects, preferring the first non-nullish value.
 * Arrays are NOT merged — first non-empty wins.
 */
export function deepMergeFirstWins(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (result[key] === undefined || result[key] === null) {
      result[key] = source[key]
    } else if (
      typeof result[key] === 'object' &&
      !Array.isArray(result[key]) &&
      result[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      source[key] !== null
    ) {
      result[key] = deepMergeFirstWins(
        result[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      )
    }
  }
  return result
}

/** Dedupe episodic events by eventId, sort by timestamp desc */
export function mergeEpisodicEvents(...sources: (EpisodicEvent[] | undefined)[]): EpisodicEvent[] {
  const seen = new Map<string, EpisodicEvent>()
  for (const events of sources) {
    if (!events) continue
    for (const evt of events) {
      if (!seen.has(evt.eventId)) {
        seen.set(evt.eventId, evt)
      }
    }
  }
  return [...seen.values()].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
}

/** Dedupe verified skills by name, keep highest confidence */
export function mergeVerifiedSkills(...sources: (VerifiedSkill[] | undefined)[]): VerifiedSkill[] {
  const byName = new Map<string, VerifiedSkill>()
  for (const skills of sources) {
    if (!skills) continue
    for (const skill of skills) {
      const existing = byName.get(skill.name)
      if (!existing || (skill.confidence ?? 0) > (existing.confidence ?? 0)) {
        byName.set(skill.name, skill)
      }
    }
  }
  return [...byName.values()]
}

/** Dedupe self-reported skills by name */
export function mergeSelfReportedSkills(
  ...sources: (SelfReportedSkill[] | undefined)[]
): SelfReportedSkill[] {
  const byName = new Map<string, SelfReportedSkill>()
  for (const skills of sources) {
    if (!skills) continue
    for (const skill of skills) {
      if (!byName.has(skill.name)) {
        byName.set(skill.name, skill)
      }
    }
  }
  return [...byName.values()]
}

/** Dedupe endorsements by skill+fromAgent+timestamp */
export function mergeEndorsements(
  ...sources: (SkillEndorsement[] | undefined)[]
): SkillEndorsement[] {
  const seen = new Set<string>()
  const result: SkillEndorsement[] = []
  for (const endorsements of sources) {
    if (!endorsements) continue
    for (const e of endorsements) {
      const key = `${e.skill}|${e.fromAgent}|${e.timestamp}`
      if (!seen.has(key)) {
        seen.add(key)
        result.push(e)
      }
    }
  }
  return result
}

/** Dedupe recent tasks by taskId, sort by completedAt desc, cap at limit */
export function mergeRecentTasks(
  limit: number,
  ...sources: (RecentTask[] | undefined)[]
): RecentTask[] {
  const byId = new Map<string, RecentTask>()
  for (const tasks of sources) {
    if (!tasks) continue
    for (const task of tasks) {
      if (!byId.has(task.taskId)) {
        byId.set(task.taskId, task)
      }
    }
  }
  return [...byId.values()]
    .sort((a, b) => {
      const at = a.completedAt ? new Date(a.completedAt).getTime() : 0
      const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0
      return bt - at
    })
    .slice(0, limit)
}

/** Dedupe artifacts by artifactId */
export function mergeArtifacts(...sources: (TaskArtifact[] | undefined)[]): TaskArtifact[] {
  const byId = new Map<string, TaskArtifact>()
  for (const artifacts of sources) {
    if (!artifacts) continue
    for (const a of artifacts) {
      if (!byId.has(a.artifactId)) {
        byId.set(a.artifactId, a)
      }
    }
  }
  return [...byId.values()]
}

/** Dedupe procedural workflows by name */
export function mergeWorkflows(
  ...sources: (ProceduralWorkflow[] | undefined)[]
): ProceduralWorkflow[] {
  const byName = new Map<string, ProceduralWorkflow>()
  for (const workflows of sources) {
    if (!workflows) continue
    for (const w of workflows) {
      if (w.name && !byName.has(w.name)) {
        byName.set(w.name, w)
      }
    }
  }
  return [...byName.values()]
}

/** Merge task history summaries: sum counts, use earliest/latest dates */
export function mergeTaskSummaries(
  ...sources: (TaskHistorySummary | undefined)[]
): TaskHistorySummary {
  let totalCompleted = 0
  let totalFailed = 0
  let totalInProgress = 0
  let firstTaskAt: string | undefined
  let lastTaskAt: string | undefined
  const bySkill: Record<string, number> = {}
  const byOrg: Record<string, number> = {}

  for (const s of sources) {
    if (!s) continue
    totalCompleted += s.totalCompleted ?? 0
    totalFailed += s.totalFailed ?? 0
    totalInProgress += s.totalInProgress ?? 0
    if (s.firstTaskAt && (!firstTaskAt || s.firstTaskAt < firstTaskAt)) {
      firstTaskAt = s.firstTaskAt
    }
    if (s.lastTaskAt && (!lastTaskAt || s.lastTaskAt > lastTaskAt)) {
      lastTaskAt = s.lastTaskAt
    }
    if (s.bySkill) {
      for (const [k, v] of Object.entries(s.bySkill)) {
        bySkill[k] = (bySkill[k] ?? 0) + v
      }
    }
    if (s.byOrganization) {
      for (const [k, v] of Object.entries(s.byOrganization)) {
        byOrg[k] = (byOrg[k] ?? 0) + v
      }
    }
  }

  return {
    totalCompleted,
    totalFailed,
    totalInProgress,
    ...(firstTaskAt ? { firstTaskAt } : {}),
    ...(lastTaskAt ? { lastTaskAt } : {}),
    ...(Object.keys(bySkill).length > 0 ? { bySkill } : {}),
    ...(Object.keys(byOrg).length > 0 ? { byOrganization: byOrg } : {}),
  }
}

/** Union string arrays */
export function unionArrays(...sources: (string[] | undefined)[]): string[] {
  const set = new Set<string>()
  for (const arr of sources) {
    if (!arr) continue
    for (const item of arr) set.add(item)
  }
  return [...set]
}
