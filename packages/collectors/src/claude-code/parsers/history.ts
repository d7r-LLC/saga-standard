// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync } from 'node:fs'
import type { RecentTask, TaskHistorySummary } from '@d7r/saga-sdk'

interface HistoryEntry {
  sessionId?: string
  timestamp?: string
  project?: string
  duration?: number
  result?: string
  summary?: string
}

/**
 * Parse Claude Code history.jsonl into task history.
 * Each line is a JSON object representing a session.
 */
export function parseHistory(
  historyPath: string,
  since?: Date
): {
  summary: TaskHistorySummary
  recentTasks: RecentTask[]
} {
  if (!existsSync(historyPath)) {
    return { summary: { totalCompleted: 0, totalFailed: 0 }, recentTasks: [] }
  }

  const content = readFileSync(historyPath, 'utf-8')
  const lines = content.split('\n').filter(l => l.trim().length > 0)

  const entries: HistoryEntry[] = []
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line))
    } catch {
      // Skip malformed lines
    }
  }

  const filtered = since
    ? entries.filter(e => e.timestamp && new Date(e.timestamp) >= since)
    : entries

  let totalCompleted = 0
  let totalFailed = 0
  const recentTasks: RecentTask[] = []

  for (const entry of filtered) {
    const status = entry.result === 'error' ? 'failed' : 'completed'
    if (status === 'completed') totalCompleted++
    else totalFailed++

    recentTasks.push({
      taskId: `cc_${entry.sessionId ?? crypto.randomUUID().slice(0, 8)}`,
      title: entry.summary ?? entry.project ?? 'Claude Code session',
      status: status as 'completed' | 'failed',
      outcome: status === 'completed' ? 'success' : 'failure',
      completedAt: entry.timestamp,
      durationSeconds: entry.duration,
      summary: entry.summary,
    })
  }

  const timestamps = filtered
    .filter((e): e is typeof e & { timestamp: string } => Boolean(e.timestamp))
    .map(e => e.timestamp)
  const summary: TaskHistorySummary = {
    totalCompleted,
    totalFailed,
    ...(timestamps.length > 0
      ? {
          firstTaskAt: timestamps.sort()[0],
          lastTaskAt: timestamps.sort().reverse()[0],
        }
      : {}),
  }

  return {
    summary,
    recentTasks: recentTasks
      .sort((a, b) => {
        const at = a.completedAt ? new Date(a.completedAt).getTime() : 0
        const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0
        return bt - at
      })
      .slice(0, 100),
  }
}
