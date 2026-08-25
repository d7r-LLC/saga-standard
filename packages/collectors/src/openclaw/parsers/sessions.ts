// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { EpisodicEvent, RecentTask, TaskHistorySummary } from '@d7r/saga-sdk'

/**
 * Parse OpenClaw session JSONL files into task history.
 * Sessions are stored as JSONL files in:
 *   ~/.openclaw/sessions/
 *   ~/.openclaw/agents/{agentId}/sessions/
 */
export function parseOpenClawSessions(
  stateDir: string,
  options?: { since?: Date; maxTasks?: number }
): {
  summary: TaskHistorySummary
  recentTasks: RecentTask[]
  episodicEvents: EpisodicEvent[]
} {
  const tasks: RecentTask[] = []
  const events: EpisodicEvent[] = []
  let totalCompleted = 0
  let totalFailed = 0
  const limit = options?.maxTasks ?? 100

  // Collect session dirs
  const sessionDirs: string[] = []

  // Global sessions
  const globalSessionsDir = join(stateDir, 'sessions')
  if (existsSync(globalSessionsDir)) {
    sessionDirs.push(globalSessionsDir)
  }

  // Agent-specific sessions
  const agentsDir = join(stateDir, 'agents')
  if (existsSync(agentsDir)) {
    try {
      const agents = readdirSync(agentsDir).filter(d => {
        try {
          return statSync(join(agentsDir, d)).isDirectory()
        } catch {
          return false
        }
      })
      for (const agent of agents) {
        const agentSessionsDir = join(agentsDir, agent, 'sessions')
        if (existsSync(agentSessionsDir)) {
          sessionDirs.push(agentSessionsDir)
        }
      }
    } catch {
      // skip
    }
  }

  for (const dir of sessionDirs) {
    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'))

      for (const file of files) {
        try {
          const filePath = join(dir, file)
          const content = readFileSync(filePath, 'utf-8')
          const lines = content.split('\n').filter(l => l.trim().length > 0)

          if (lines.length === 0) continue

          // Parse session metadata from the first and last messages
          const sessionId = basename(file, '.jsonl')
          let firstTimestamp: string | undefined
          let lastTimestamp: string | undefined
          let summary: string | undefined
          let hasError = false

          for (const line of lines) {
            try {
              const entry = JSON.parse(line)
              const ts = entry.timestamp ?? entry.ts ?? entry.created_at
              if (ts) {
                if (!firstTimestamp) firstTimestamp = ts
                lastTimestamp = ts
              }
              // Capture summary from assistant messages
              if (entry.role === 'assistant' && entry.content) {
                const text =
                  typeof entry.content === 'string'
                    ? entry.content
                    : Array.isArray(entry.content)
                      ? entry.content
                          .filter((b: { type: string }) => b.type === 'text')
                          .map((b: { text: string }) => b.text)
                          .join(' ')
                      : ''
                if (text.length > 0) {
                  summary = text.slice(0, 200)
                }
              }
              if (entry.error || entry.result === 'error') {
                hasError = true
              }
            } catch {
              // skip malformed lines
            }
          }

          // Apply since filter
          if (options?.since && firstTimestamp) {
            if (new Date(firstTimestamp) < options.since) continue
          }

          const status = hasError ? 'failed' : 'completed'
          if (status === 'completed') totalCompleted++
          else totalFailed++

          tasks.push({
            taskId: `oc_${sessionId}`,
            title: summary ?? `OpenClaw session ${sessionId}`,
            status: status as 'completed' | 'failed',
            outcome: status === 'completed' ? 'success' : 'failure',
            completedAt: lastTimestamp ?? firstTimestamp,
            summary,
          })

          // Create episodic event for significant sessions
          if (firstTimestamp) {
            events.push({
              eventId: `oc_session_${sessionId}`,
              type: 'interaction',
              timestamp: firstTimestamp,
              summary: summary ?? `OpenClaw session`,
            })
          }
        } catch {
          // skip malformed session files
        }
      }
    } catch {
      // skip
    }
  }

  // Sort by most recent first
  tasks.sort((a, b) => {
    const at = a.completedAt ? new Date(a.completedAt).getTime() : 0
    const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0
    return bt - at
  })

  const timestamps = tasks
    .filter((t): t is typeof t & { completedAt: string } => Boolean(t.completedAt))
    .map(t => t.completedAt)

  return {
    summary: {
      totalCompleted,
      totalFailed,
      ...(timestamps.length > 0
        ? {
            firstTaskAt: timestamps[timestamps.length - 1],
            lastTaskAt: timestamps[0],
          }
        : {}),
    },
    recentTasks: tasks.slice(0, limit),
    episodicEvents: events,
  }
}
