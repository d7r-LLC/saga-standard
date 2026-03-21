// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { RecentTask } from '@epicdm/saga-sdk'

/**
 * Parse Claude Code todos/ directory into in-progress task history.
 */
export function parseTodos(todosDir: string): RecentTask[] {
  if (!existsSync(todosDir)) return []

  const tasks: RecentTask[] = []

  try {
    const files = readdirSync(todosDir).filter(f => f.endsWith('.json') || f.endsWith('.md'))

    for (const file of files) {
      try {
        const content = readFileSync(join(todosDir, file), 'utf-8')

        if (file.endsWith('.json')) {
          const todo = JSON.parse(content)
          const items = Array.isArray(todo) ? todo : (todo.items ?? todo.todos ?? [todo])
          for (const item of items) {
            tasks.push({
              taskId: `cc_todo_${item.id ?? crypto.randomUUID().slice(0, 8)}`,
              title: item.title ?? item.content ?? item.text ?? 'Untitled todo',
              status: item.done || item.completed ? 'completed' : 'in-progress',
              outcome: item.done || item.completed ? 'success' : undefined,
            })
          }
        }
      } catch {
        // skip malformed files
      }
    }
  } catch {
    // skip
  }

  return tasks
}
