// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import type { RecentTask, TaskHistorySummary } from '@epicdm/saga-sdk'

interface SessionRow {
  session_id: string
  project: string | null
  started_at: string
  ended_at: string | null
  model: string | null
}

interface SummaryRow {
  session_id: string
  summary: string | null
}

export interface ParsedSessions {
  recentTasks: RecentTask[]
  summary: TaskHistorySummary
}

export function parseSessions(dbPath: string): ParsedSessions {
  const empty: ParsedSessions = {
    recentTasks: [],
    summary: { totalCompleted: 0, totalFailed: 0, totalInProgress: 0 },
  }

  if (!existsSync(dbPath)) return empty

  let db: Database.Database | null = null
  try {
    db = new Database(dbPath, { readonly: true })

    const sessions = db
      .prepare(
        'SELECT session_id, project, started_at, ended_at, model FROM sdk_sessions ORDER BY started_at DESC'
      )
      .all() as SessionRow[]

    const summaryMap = new Map<string, string>()
    const summaries = db
      .prepare('SELECT session_id, summary FROM session_summaries')
      .all() as SummaryRow[]
    for (const s of summaries) {
      if (s.summary) summaryMap.set(s.session_id, s.summary)
    }

    let totalCompleted = 0
    let totalInProgress = 0
    let firstTaskAt: string | undefined
    let lastTaskAt: string | undefined

    const recentTasks: RecentTask[] = sessions.map(session => {
      const isComplete = session.ended_at !== null
      if (isComplete) totalCompleted++
      else totalInProgress++

      if (!firstTaskAt || session.started_at < firstTaskAt) firstTaskAt = session.started_at
      if (!lastTaskAt || session.started_at > lastTaskAt) lastTaskAt = session.started_at

      return {
        taskId: `claude-mem-${session.session_id}`,
        title: summaryMap.get(session.session_id) ?? `Session ${session.session_id}`,
        status: isComplete ? 'completed' : 'in-progress',
        completedAt: session.ended_at ?? undefined,
        organizationId: session.project ?? undefined,
      }
    })

    return {
      recentTasks,
      summary: {
        totalCompleted,
        totalFailed: 0,
        totalInProgress,
        firstTaskAt,
        lastTaskAt,
      },
    }
  } catch {
    return empty
  } finally {
    db?.close()
  }
}
