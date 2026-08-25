> **FlowState Document:** `docu_TLF3Yg684z`

# SAGA Collectors & Memory Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three new SAGA collectors (claude-mem, flowstate-memory, project-claude), a .saga/config.json schema, and register them in the collector pipeline so `saga collect` extracts memory from all local sources inside a DERP.

**Architecture:** Each collector follows the established detect/scan/extract pattern in `@d7r/saga-collectors`. New collectors are registered in the package index alongside existing claude-code and openclaw collectors. The .saga/config.json schema lives in `@d7r/saga-sdk` for cross-package use.

**Tech Stack:** TypeScript, vitest, better-sqlite3 (claude-mem), node:fs (project-claude), native fetch (flowstate-memory), tsup build

**Spec:** `docs/superpowers/specs/2026-03-28-saga-collectors-design.md`

---

## Phase 1: claude-mem Collector

The claude-mem collector reads `~/.claude-mem/claude-mem.db` (SQLite) via better-sqlite3 and maps observations, sessions, and concepts to SAGA memory and taskHistory layers.

### File Structure

```
packages/collectors/src/
  claude-mem/
    index.ts                           -- Barrel exports
    detector.ts                        -- Check DB file exists
    scanner.ts                         -- Query table counts
    extractor.ts                       -- ClaudeMemCollector class
    parsers/
      observations.ts                  -- Query + categorize observations
      sessions.ts                      -- Query sessions with summaries
      knowledge.ts                     -- Aggregate concepts into semantic domains
    __tests__/
      detector.test.ts                 -- Detection tests
      extractor.test.ts                -- Full extraction tests
      parsers/
        observations.test.ts           -- Observation parsing tests
        sessions.test.ts               -- Session parsing tests
        knowledge.test.ts              -- Knowledge aggregation tests
  index.ts                             -- Modified: register claude-mem
```

---

### Task 1: claude-mem Detector

**Files:**

- Create: `packages/collectors/src/claude-mem/detector.ts`
- Test: `packages/collectors/src/claude-mem/__tests__/detector.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/collectors/src/claude-mem/__tests__/detector.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectClaudeMem } from '../detector'

let homeDir: string

beforeEach(() => {
  homeDir = join(tmpdir(), `saga-test-claudemem-${Date.now()}`)
  mkdirSync(homeDir, { recursive: true })
})

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true })
})

describe('detectClaudeMem', () => {
  it('returns found when claude-mem.db exists', () => {
    const dbDir = join(homeDir, '.claude-mem')
    mkdirSync(dbDir, { recursive: true })
    writeFileSync(join(dbDir, 'claude-mem.db'), '')

    const result = detectClaudeMem(homeDir)
    expect(result.source).toBe('claude-mem')
    expect(result.found).toBe(true)
    expect(result.locations).toContain(join(dbDir, 'claude-mem.db'))
  })

  it('returns not found when directory missing', () => {
    const result = detectClaudeMem(homeDir)
    expect(result.source).toBe('claude-mem')
    expect(result.found).toBe(false)
    expect(result.locations).toEqual([])
  })

  it('returns not found when directory exists but no db file', () => {
    mkdirSync(join(homeDir, '.claude-mem'), { recursive: true })
    const result = detectClaudeMem(homeDir)
    expect(result.found).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/claude-mem/__tests__/detector.test.ts`
Expected: FAIL with "Cannot find module '../detector'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/collectors/src/claude-mem/detector.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { CollectorDetection } from '../types'

/**
 * Detect claude-mem SQLite database on disk.
 * Looks for ~/.claude-mem/claude-mem.db.
 */
export function detectClaudeMem(homeDir?: string): CollectorDetection {
  const home = homeDir ?? homedir()
  const dbPath = join(home, '.claude-mem', 'claude-mem.db')

  if (!existsSync(dbPath)) {
    return { source: 'claude-mem', found: false, locations: [] }
  }

  return {
    source: 'claude-mem',
    found: true,
    locations: [dbPath],
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/claude-mem/__tests__/detector.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/collectors/src/claude-mem/detector.ts packages/collectors/src/claude-mem/__tests__/detector.test.ts
git commit -m "$(cat <<'EOF'
feat(collectors): add claude-mem detector

Detects ~/.claude-mem/claude-mem.db on disk. Follows the same
detect pattern as the existing claude-code and openclaw collectors.

Built with d7r FlowState
EOF
)"
```

---

### Task 2: claude-mem Observation Parser

**Files:**

- Create: `packages/collectors/src/claude-mem/parsers/observations.ts`
- Test: `packages/collectors/src/claude-mem/__tests__/parsers/observations.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/collectors/src/claude-mem/__tests__/parsers/observations.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseObservations } from '../../parsers/observations'

let dbPath: string
let tempDir: string

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-obs-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
  dbPath = join(tempDir, 'claude-mem.db')

  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE observations (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT,
      narrative TEXT,
      facts TEXT,
      concepts TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      project TEXT,
      session_id TEXT
    )
  `)
  db.prepare(
    `
    INSERT INTO observations (id, type, title, narrative, facts, concepts, created_at, project)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    1,
    'discovery',
    'Found caching pattern',
    'Discovered Redis caching approach',
    '["Redis is fast","TTL is 60s"]',
    '["redis","caching"]',
    '2026-03-01T00:00:00Z',
    'my-project'
  )

  db.prepare(
    `
    INSERT INTO observations (id, type, title, narrative, facts, concepts, created_at, project)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    2,
    'bugfix',
    'Fixed auth timeout',
    'Token refresh was failing',
    '["Token expiry was wrong"]',
    '["auth"]',
    '2026-03-02T00:00:00Z',
    'my-project'
  )

  db.prepare(
    `
    INSERT INTO observations (id, type, title, narrative, facts, concepts, created_at, project)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    3,
    'pattern',
    'TDD workflow',
    'Write test first then implement',
    '["Red-green-refactor"]',
    '["testing","tdd"]',
    '2026-03-03T00:00:00Z',
    'my-project'
  )

  db.close()
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('parseObservations', () => {
  it('categorizes observations into episodic, semantic, and procedural', () => {
    const result = parseObservations(dbPath)
    expect(result.episodic.length).toBe(2) // discovery + bugfix
    expect(result.procedural.length).toBe(1) // pattern
  })

  it('maps discovery observations to episodic events', () => {
    const result = parseObservations(dbPath)
    const discovery = result.episodic.find(e => e.summary === 'Found caching pattern')
    expect(discovery).toBeDefined()
    expect(discovery!.type).toBe('learning')
    expect(discovery!.timestamp).toBe('2026-03-01T00:00:00Z')
  })

  it('maps pattern observations to procedural workflows', () => {
    const result = parseObservations(dbPath)
    expect(result.procedural[0].name).toBe('TDD workflow')
    expect(result.procedural[0].description).toBe('Write test first then implement')
  })

  it('extracts concepts for semantic aggregation', () => {
    const result = parseObservations(dbPath)
    expect(result.concepts).toContain('redis')
    expect(result.concepts).toContain('caching')
    expect(result.concepts).toContain('testing')
  })

  it('filters by since date', () => {
    const result = parseObservations(dbPath, { since: new Date('2026-03-02') })
    // Only bugfix and pattern (on or after March 2)
    expect(result.episodic.length).toBe(1) // bugfix only
    expect(result.procedural.length).toBe(1) // pattern
  })

  it('limits results with maxEntries', () => {
    const result = parseObservations(dbPath, { maxEntries: 1 })
    const total = result.episodic.length + result.procedural.length
    expect(total).toBeLessThanOrEqual(1)
  })

  it('returns empty results for missing db', () => {
    const result = parseObservations('/nonexistent/path.db')
    expect(result.episodic).toEqual([])
    expect(result.procedural).toEqual([])
    expect(result.concepts).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/claude-mem/__tests__/parsers/observations.test.ts`
Expected: FAIL with "Cannot find module '../../parsers/observations'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/collectors/src/claude-mem/parsers/observations.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import type { EpisodicEvent, ProceduralWorkflow } from '@d7r/saga-sdk'

/** Observation row from claude-mem.db */
interface ObservationRow {
  id: number
  type: string
  title: string | null
  narrative: string | null
  facts: string | null
  concepts: string | null
  created_at: string
  project: string | null
  session_id: string | null
}

export interface ParsedObservations {
  episodic: EpisodicEvent[]
  procedural: ProceduralWorkflow[]
  concepts: string[]
}

interface ParseOptions {
  since?: Date
  maxEntries?: number
}

/** Map claude-mem observation types to SAGA episodic event types */
function toEpisodicType(obsType: string): EpisodicEvent['type'] {
  switch (obsType) {
    case 'discovery':
    case 'refactor':
      return 'learning'
    case 'bugfix':
      return 'error-recovery'
    case 'feature':
      return 'task-completion'
    case 'decision':
      return 'milestone'
    default:
      return 'observation'
  }
}

/** Classify observation sync scope */
function classifyScope(obsType: string): 'agent-portable' | 'org-internal' {
  if (obsType === 'discovery' || obsType === 'pattern') return 'agent-portable'
  return 'org-internal'
}

/**
 * Parse observations from claude-mem.db into SAGA layer data.
 * Categorizes by observation type:
 *   - discovery, bugfix, feature, decision, refactor -> episodic events
 *   - pattern -> procedural workflows
 *   - all concepts aggregated for semantic layer
 */
export function parseObservations(dbPath: string, options?: ParseOptions): ParsedObservations {
  if (!existsSync(dbPath)) {
    return { episodic: [], procedural: [], concepts: [] }
  }

  let db: Database.Database | null = null
  try {
    db = new Database(dbPath, { readonly: true })

    let query =
      'SELECT id, type, title, narrative, facts, concepts, created_at, project, session_id FROM observations'
    const params: unknown[] = []

    if (options?.since) {
      query += ' WHERE created_at >= ?'
      params.push(options.since.toISOString())
    }

    query += ' ORDER BY created_at DESC'

    if (options?.maxEntries) {
      query += ' LIMIT ?'
      params.push(options.maxEntries)
    }

    const rows = db.prepare(query).all(...params) as ObservationRow[]

    const episodic: EpisodicEvent[] = []
    const procedural: ProceduralWorkflow[] = []
    const allConcepts: string[] = []

    for (const row of rows) {
      // Collect concepts from all observations
      if (row.concepts) {
        try {
          const parsed = JSON.parse(row.concepts) as string[]
          allConcepts.push(...parsed)
        } catch {
          // skip malformed concepts
        }
      }

      if (row.type === 'pattern') {
        procedural.push({
          name: row.title ?? `pattern-${row.id}`,
          description: row.narrative ?? undefined,
          steps: row.facts ? tryParseArray(row.facts) : undefined,
          classification: classifyScope(row.type) === 'agent-portable' ? 'public' : 'org-internal',
        })
      } else {
        episodic.push({
          eventId: `claude-mem-${row.id}`,
          type: toEpisodicType(row.type),
          timestamp: row.created_at,
          summary: row.title ?? undefined,
          learnings: row.narrative ?? undefined,
          classification: classifyScope(row.type) === 'agent-portable' ? 'public' : 'org-internal',
        })
      }
    }

    const uniqueConcepts = [...new Set(allConcepts)]

    return { episodic, procedural, concepts: uniqueConcepts }
  } catch {
    return { episodic: [], procedural: [], concepts: [] }
  } finally {
    db?.close()
  }
}

function tryParseArray(json: string): string[] | undefined {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/claude-mem/__tests__/parsers/observations.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/collectors/src/claude-mem/parsers/observations.ts packages/collectors/src/claude-mem/__tests__/parsers/observations.test.ts
git commit -m "$(cat <<'EOF'
feat(collectors): add claude-mem observation parser

Reads observations table from claude-mem.db and categorizes into
SAGA episodic events (discovery, bugfix, feature, decision) and
procedural workflows (pattern). Extracts concepts for semantic layer.

Built with d7r FlowState
EOF
)"
```

---

### Task 3: claude-mem Session Parser

**Files:**

- Create: `packages/collectors/src/claude-mem/parsers/sessions.ts`
- Test: `packages/collectors/src/claude-mem/__tests__/parsers/sessions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/collectors/src/claude-mem/__tests__/parsers/sessions.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseSessions } from '../../parsers/sessions'

let dbPath: string
let tempDir: string

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-sessions-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
  dbPath = join(tempDir, 'claude-mem.db')

  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE sdk_sessions (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      project TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      model TEXT
    );
    CREATE TABLE session_summaries (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      summary TEXT,
      created_at TEXT NOT NULL
    )
  `)

  db.prepare(
    `INSERT INTO sdk_sessions (session_id, project, started_at, ended_at, model) VALUES (?, ?, ?, ?, ?)`
  ).run(
    's1',
    'saga-standard',
    '2026-03-01T09:00:00Z',
    '2026-03-01T10:00:00Z',
    'claude-sonnet-4-5-20250514'
  )
  db.prepare(
    `INSERT INTO sdk_sessions (session_id, project, started_at, ended_at, model) VALUES (?, ?, ?, ?, ?)`
  ).run('s2', 'saga-standard', '2026-03-02T09:00:00Z', null, 'claude-sonnet-4-5-20250514')

  db.prepare(
    `INSERT INTO session_summaries (session_id, summary, created_at) VALUES (?, ?, ?)`
  ).run('s1', 'Implemented auth flow', '2026-03-01T10:00:00Z')

  db.close()
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('parseSessions', () => {
  it('returns recent tasks from sessions', () => {
    const result = parseSessions(dbPath)
    expect(result.recentTasks.length).toBe(2)
  })

  it('maps completed sessions to completed tasks', () => {
    const result = parseSessions(dbPath)
    const s1 = result.recentTasks.find(t => t.taskId === 'claude-mem-s1')
    expect(s1).toBeDefined()
    expect(s1!.status).toBe('completed')
    expect(s1!.title).toBe('Implemented auth flow')
  })

  it('maps ongoing sessions to in-progress tasks', () => {
    const result = parseSessions(dbPath)
    const s2 = result.recentTasks.find(t => t.taskId === 'claude-mem-s2')
    expect(s2).toBeDefined()
    expect(s2!.status).toBe('in-progress')
  })

  it('computes summary counts', () => {
    const result = parseSessions(dbPath)
    expect(result.summary.totalCompleted).toBe(1)
    expect(result.summary.totalInProgress).toBe(1)
  })

  it('returns empty results for missing db', () => {
    const result = parseSessions('/nonexistent/path.db')
    expect(result.recentTasks).toEqual([])
    expect(result.summary.totalCompleted).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/claude-mem/__tests__/parsers/sessions.test.ts`
Expected: FAIL with "Cannot find module '../../parsers/sessions'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/collectors/src/claude-mem/parsers/sessions.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import type { RecentTask, TaskHistorySummary } from '@d7r/saga-sdk'

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

/**
 * Parse sdk_sessions and session_summaries from claude-mem.db
 * into SAGA task history entries.
 */
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

    // Build summary lookup
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/claude-mem/__tests__/parsers/sessions.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/collectors/src/claude-mem/parsers/sessions.ts packages/collectors/src/claude-mem/__tests__/parsers/sessions.test.ts
git commit -m "$(cat <<'EOF'
feat(collectors): add claude-mem session parser

Maps sdk_sessions and session_summaries from claude-mem.db into
SAGA task history entries with completion status tracking.

Built with d7r FlowState
EOF
)"
```

---

### Task 4: claude-mem Knowledge Aggregator

**Files:**

- Create: `packages/collectors/src/claude-mem/parsers/knowledge.ts`
- Test: `packages/collectors/src/claude-mem/__tests__/parsers/knowledge.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/collectors/src/claude-mem/__tests__/parsers/knowledge.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { aggregateKnowledge } from '../../parsers/knowledge'

describe('aggregateKnowledge', () => {
  it('builds knowledge domains from concept frequencies', () => {
    const concepts = ['redis', 'caching', 'redis', 'auth', 'redis', 'caching', 'testing']
    const result = aggregateKnowledge(concepts)
    expect(result.knowledgeDomains).toContain('redis')
    expect(result.knowledgeDomains).toContain('caching')
  })

  it('ranks domains by frequency', () => {
    const concepts = ['redis', 'redis', 'redis', 'auth', 'auth', 'testing']
    const result = aggregateKnowledge(concepts)
    // redis appears 3 times, should be first
    expect(result.knowledgeDomains![0]).toBe('redis')
  })

  it('builds expertise entries with frequency-based level', () => {
    const concepts = Array(10).fill('typescript').concat(Array(3).fill('rust'))
    const result = aggregateKnowledge(concepts)
    expect(result.expertise!['typescript'].level).toBe('proficient')
    expect(result.expertise!['rust'].level).toBe('familiar')
  })

  it('returns empty for no concepts', () => {
    const result = aggregateKnowledge([])
    expect(result.knowledgeDomains).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/claude-mem/__tests__/parsers/knowledge.test.ts`
Expected: FAIL with "Cannot find module '../../parsers/knowledge'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/collectors/src/claude-mem/parsers/knowledge.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { ExpertiseLevel, SemanticMemory } from '@d7r/saga-sdk'

/**
 * Aggregate concept strings from claude-mem observations into
 * SAGA semantic memory with frequency-weighted expertise levels.
 */
export function aggregateKnowledge(concepts: string[]): Partial<SemanticMemory> {
  if (concepts.length === 0) {
    return { knowledgeDomains: [] }
  }

  // Count frequencies
  const freq = new Map<string, number>()
  for (const c of concepts) {
    const normalized = c.toLowerCase().trim()
    if (normalized) freq.set(normalized, (freq.get(normalized) ?? 0) + 1)
  }

  // Sort by frequency descending
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1])

  const knowledgeDomains = sorted.map(([domain]) => domain)

  const expertise: Record<string, { level: ExpertiseLevel }> = {}
  for (const [domain, count] of sorted) {
    expertise[domain] = {
      level: frequencyToLevel(count),
    }
  }

  return { knowledgeDomains, expertise }
}

function frequencyToLevel(count: number): ExpertiseLevel {
  if (count >= 8) return 'proficient'
  if (count >= 4) return 'intermediate'
  return 'familiar'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/claude-mem/__tests__/parsers/knowledge.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/collectors/src/claude-mem/parsers/knowledge.ts packages/collectors/src/claude-mem/__tests__/parsers/knowledge.test.ts
git commit -m "$(cat <<'EOF'
feat(collectors): add claude-mem knowledge aggregator

Aggregates observation concepts into SAGA semantic memory with
frequency-weighted expertise levels (familiar/intermediate/proficient).

Built with d7r FlowState
EOF
)"
```

---

### Task 5: claude-mem Scanner

**Files:**

- Create: `packages/collectors/src/claude-mem/scanner.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// packages/collectors/src/claude-mem/scanner.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import Database from 'better-sqlite3'
import type { SagaLayerName } from '@d7r/saga-sdk'
import type { CollectorScan } from '../types'

/**
 * Scan claude-mem database and report available data counts.
 */
export function scanClaudeMem(homeDir?: string): CollectorScan {
  const home = homeDir ?? homedir()
  const dbPath = join(home, '.claude-mem', 'claude-mem.db')

  const empty: CollectorScan = {
    sessionCount: 0,
    projectCount: 0,
    memoryEntries: 0,
    skillCount: 0,
    estimatedExportSizeBytes: 0,
    layers: [],
  }

  if (!existsSync(dbPath)) return empty

  let db: Database.Database | null = null
  try {
    db = new Database(dbPath, { readonly: true })

    const obsCount = (
      db.prepare('SELECT COUNT(*) as count FROM observations').get() as { count: number }
    ).count
    const sessionCount = (
      db.prepare('SELECT COUNT(*) as count FROM sdk_sessions').get() as { count: number }
    ).count
    const projectCount = (
      db
        .prepare(
          'SELECT COUNT(DISTINCT project) as count FROM observations WHERE project IS NOT NULL'
        )
        .get() as { count: number }
    ).count

    const layers: SagaLayerName[] = []
    if (obsCount > 0) layers.push('memory')
    if (sessionCount > 0) layers.push('taskHistory')

    const fileSize = statSync(dbPath).size

    return {
      sessionCount,
      projectCount,
      memoryEntries: obsCount,
      skillCount: 0,
      estimatedExportSizeBytes: fileSize,
      layers,
    }
  } catch {
    return empty
  } finally {
    db?.close()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/collectors/src/claude-mem/scanner.ts
git commit -m "$(cat <<'EOF'
feat(collectors): add claude-mem scanner

Queries observation and session counts from claude-mem.db for
the scan report.

Built with d7r FlowState
EOF
)"
```

---

### Task 6: claude-mem Extractor + Index + Registration

**Files:**

- Create: `packages/collectors/src/claude-mem/extractor.ts`
- Create: `packages/collectors/src/claude-mem/index.ts`
- Modify: `packages/collectors/src/index.ts:44-50` (add registration)
- Test: `packages/collectors/src/claude-mem/__tests__/extractor.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/collectors/src/claude-mem/__tests__/extractor.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ClaudeMemCollector } from '../extractor'

let homeDir: string
let dbPath: string
let collector: ClaudeMemCollector

beforeEach(() => {
  homeDir = join(tmpdir(), `saga-test-cm-extract-${Date.now()}`)
  const dbDir = join(homeDir, '.claude-mem')
  mkdirSync(dbDir, { recursive: true })
  dbPath = join(dbDir, 'claude-mem.db')

  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE observations (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT,
      narrative TEXT,
      facts TEXT,
      concepts TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      project TEXT,
      session_id TEXT
    );
    CREATE TABLE sdk_sessions (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      project TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      model TEXT
    );
    CREATE TABLE session_summaries (
      id INTEGER PRIMARY KEY,
      session_id TEXT NOT NULL,
      summary TEXT,
      created_at TEXT NOT NULL
    )
  `)

  db.prepare(
    `INSERT INTO observations (id, type, title, narrative, facts, concepts, created_at, project) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    1,
    'discovery',
    'Redis caching',
    'Found caching approach',
    '["Fast cache"]',
    '["redis","caching"]',
    '2026-03-01T00:00:00Z',
    'proj'
  )
  db.prepare(
    `INSERT INTO observations (id, type, title, narrative, facts, concepts, created_at, project) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    2,
    'pattern',
    'TDD workflow',
    'Red-green-refactor',
    '["Write test first"]',
    '["testing"]',
    '2026-03-02T00:00:00Z',
    'proj'
  )
  db.prepare(
    `INSERT INTO sdk_sessions (session_id, project, started_at, ended_at, model) VALUES (?, ?, ?, ?, ?)`
  ).run('s1', 'proj', '2026-03-01T09:00:00Z', '2026-03-01T10:00:00Z', 'claude-sonnet-4-5-20250514')
  db.prepare(
    `INSERT INTO session_summaries (session_id, summary, created_at) VALUES (?, ?, ?)`
  ).run('s1', 'Built auth flow', '2026-03-01T10:00:00Z')

  db.close()
  collector = new ClaudeMemCollector()
})

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true })
})

describe('ClaudeMemCollector', () => {
  it('has source "claude-mem"', () => {
    expect(collector.source).toBe('claude-mem')
  })

  it('detects when db exists', async () => {
    const result = await collector.detect(homeDir)
    expect(result.found).toBe(true)
  })

  it('extracts memory layer with episodic and procedural', async () => {
    const result = await collector.extract({ homeDir })
    expect(result.source).toBe('claude-mem')
    expect(result.layers.memory?.episodic?.events?.length).toBe(1) // discovery
    expect(result.layers.memory?.procedural?.workflows?.length).toBe(1) // pattern
  })

  it('extracts semantic memory from concepts', async () => {
    const result = await collector.extract({ homeDir })
    expect(result.layers.memory?.semantic?.knowledgeDomains).toContain('redis')
    expect(result.layers.memory?.semantic?.knowledgeDomains).toContain('testing')
  })

  it('extracts task history from sessions', async () => {
    const result = await collector.extract({ homeDir })
    expect(result.layers.taskHistory?.recentTasks?.length).toBe(1)
    expect(result.layers.taskHistory?.recentTasks?.[0].title).toBe('Built auth flow')
  })

  it('filters by requested layers', async () => {
    const result = await collector.extract({ homeDir, layers: ['memory'] })
    expect(result.layers.memory).toBeDefined()
    expect(result.layers.taskHistory).toBeUndefined()
  })

  it('returns empty layers when db missing', async () => {
    const emptyHome = join(tmpdir(), `saga-empty-cm-${Date.now()}`)
    mkdirSync(emptyHome, { recursive: true })
    try {
      const result = await collector.extract({ homeDir: emptyHome })
      expect(result.layers).toEqual({})
    } finally {
      rmSync(emptyHome, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/claude-mem/__tests__/extractor.test.ts`
Expected: FAIL with "Cannot find module '../extractor'"

- [ ] **Step 3: Write the extractor**

```typescript
// packages/collectors/src/claude-mem/extractor.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { join } from 'node:path'
import { homedir } from 'node:os'
import type { PartialSagaDocument } from '@d7r/saga-sdk'
import type { CollectorDetection, CollectorScan, ExtractOptions, SagaCollector } from '../types'
import { detectClaudeMem } from './detector'
import { scanClaudeMem } from './scanner'
import { parseObservations } from './parsers/observations'
import { parseSessions } from './parsers/sessions'
import { aggregateKnowledge } from './parsers/knowledge'

/**
 * claude-mem collector — extracts agent state from ~/.claude-mem/claude-mem.db
 * into a PartialSagaDocument.
 *
 * Layers populated:
 *  - memory: episodic (observations), procedural (patterns),
 *            semantic (concepts aggregated into knowledge domains)
 *  - taskHistory: sessions as task entries
 */
export class ClaudeMemCollector implements SagaCollector {
  readonly source = 'claude-mem'

  async detect(homeDir?: string): Promise<CollectorDetection> {
    return detectClaudeMem(homeDir)
  }

  async scan(homeDir?: string): Promise<CollectorScan> {
    return scanClaudeMem(homeDir)
  }

  async extract(options?: ExtractOptions): Promise<PartialSagaDocument> {
    const home = options?.homeDir ?? homedir()
    const dbPath = join(home, '.claude-mem', 'claude-mem.db')

    const detection = detectClaudeMem(home)
    if (!detection.found) {
      return { source: this.source, layers: {} }
    }

    const requestedLayers = options?.layers
    const shouldInclude = (layer: string) =>
      !requestedLayers || requestedLayers.includes(layer as never)

    const partial: PartialSagaDocument = {
      source: this.source,
      layers: {},
    }

    // Memory layer
    if (shouldInclude('memory')) {
      const obs = parseObservations(dbPath, {
        since: options?.since,
        maxEntries: options?.maxMemoryEntries,
      })

      const hasEpisodic = obs.episodic.length > 0
      const hasProcedural = obs.procedural.length > 0
      const hasConcepts = obs.concepts.length > 0

      if (hasEpisodic || hasProcedural || hasConcepts) {
        const semantic = hasConcepts ? aggregateKnowledge(obs.concepts) : undefined

        partial.layers.memory = {
          ...(hasEpisodic ? { episodic: { events: obs.episodic } } : {}),
          ...(hasProcedural ? { procedural: { workflows: obs.procedural } } : {}),
          ...(semantic ? { semantic } : {}),
        }
      }
    }

    // Task history layer
    if (shouldInclude('taskHistory')) {
      const sessions = parseSessions(dbPath)
      if (sessions.recentTasks.length > 0) {
        const limit = options?.maxMemoryEntries ?? 100
        partial.layers.taskHistory = {
          summary: sessions.summary,
          recentTasks: sessions.recentTasks.slice(0, limit),
          recentTasksLimit: limit,
        }
      }
    }

    return partial
  }
}
```

- [ ] **Step 4: Write barrel export**

```typescript
// packages/collectors/src/claude-mem/index.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export { ClaudeMemCollector } from './extractor'
export { detectClaudeMem } from './detector'
export { scanClaudeMem } from './scanner'
export { parseObservations } from './parsers/observations'
export { parseSessions } from './parsers/sessions'
export { aggregateKnowledge } from './parsers/knowledge'
```

- [ ] **Step 5: Register in package index**

Add to `packages/collectors/src/index.ts` after the openclaw registration block:

```typescript
// claude-mem collector
export { ClaudeMemCollector } from './claude-mem'
export {
  detectClaudeMem,
  scanClaudeMem,
  parseObservations,
  parseSessions,
  aggregateKnowledge,
} from './claude-mem'

// (at the bottom, after the other registerCollector calls)
import { ClaudeMemCollector } from './claude-mem'
registerCollector('claude-mem', () => new ClaudeMemCollector())
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/claude-mem/__tests__/extractor.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 7: Run full test suite**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test`
Expected: All existing + new tests pass

- [ ] **Step 8: Commit**

```bash
git add packages/collectors/src/claude-mem/extractor.ts packages/collectors/src/claude-mem/index.ts packages/collectors/src/claude-mem/__tests__/extractor.test.ts packages/collectors/src/index.ts
git commit -m "$(cat <<'EOF'
feat(collectors): add ClaudeMemCollector with full extraction

Complete claude-mem collector with detect/scan/extract pipeline.
Reads observations, sessions, and concepts from claude-mem.db
and maps to SAGA memory + taskHistory layers.

Registered as 'claude-mem' in the collector registry.

Built with d7r FlowState
EOF
)"
```

---

## Phase 2: flowstate-memory Collector

The flowstate-memory collector talks to the flowstate-agent-memory HTTP API at `localhost:7090` to extract observations, sessions, and embeddings.

### File Structure

```
packages/collectors/src/
  flowstate-memory/
    index.ts                           -- Barrel exports
    detector.ts                        -- HTTP health check
    scanner.ts                         -- Count via search API
    extractor.ts                       -- FlowstateMemoryCollector class
    client.ts                          -- HTTP client wrapper
    __tests__/
      detector.test.ts                 -- Detection tests (mocked fetch)
      client.test.ts                   -- Client tests (mocked fetch)
      extractor.test.ts                -- Full extraction tests (mocked)
```

---

### Task 7: flowstate-memory HTTP Client

**Files:**

- Create: `packages/collectors/src/flowstate-memory/client.ts`
- Test: `packages/collectors/src/flowstate-memory/__tests__/client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/collectors/src/flowstate-memory/__tests__/client.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FlowstateMemoryClient } from '../client'

let client: FlowstateMemoryClient

beforeEach(() => {
  client = new FlowstateMemoryClient('http://localhost:7090')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FlowstateMemoryClient', () => {
  it('health check returns true on 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('OK', { status: 200 }))
    const result = await client.healthCheck()
    expect(result).toBe(true)
  })

  it('health check returns false on error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const result = await client.healthCheck()
    expect(result).toBe(false)
  })

  it('search returns observations', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 1,
              type: 'discovery',
              title: 'Found pattern',
              narrative: 'Details',
              facts: ['fact1'],
              concepts: ['ts'],
              created_at: '2026-03-01T00:00:00Z',
            },
          ],
          total: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const result = await client.search({ limit: 10 })
    expect(result.results).toHaveLength(1)
    expect(result.results[0].type).toBe('discovery')
  })

  it('search passes query parameters', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await client.search({ limit: 5, offset: 10, type: 'bugfix' })
    const calledUrl = fetchSpy.mock.calls[0][0] as string
    expect(calledUrl).toContain('/api/memory/search')
  })

  it('getObservations fetches by ids', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          observations: [
            { id: 1, type: 'discovery', title: 'Test', created_at: '2026-03-01T00:00:00Z' },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const result = await client.getObservations([1])
    expect(result).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/flowstate-memory/__tests__/client.test.ts`
Expected: FAIL with "Cannot find module '../client'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/collectors/src/flowstate-memory/client.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export interface MemoryObservation {
  id: number
  type: string
  title: string
  narrative?: string
  facts?: string[]
  concepts?: string[]
  created_at: string
  updated_at?: string
  project?: string
  session_id?: string
  embedding?: number[]
  sagaScope?: {
    syncPolicy: string
    originOrgId?: string
  }
}

export interface SearchResult {
  results: MemoryObservation[]
  total: number
}

export interface SearchParams {
  limit?: number
  offset?: number
  type?: string
  since?: string
}

/**
 * HTTP client for the flowstate-agent-memory API.
 */
export class FlowstateMemoryClient {
  constructor(private baseUrl: string) {}

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`)
      return res.ok
    } catch {
      return false
    }
  }

  async search(params: SearchParams): Promise<SearchResult> {
    const body = {
      query: '*',
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
      ...(params.type ? { type: params.type } : {}),
      ...(params.since ? { since: params.since } : {}),
    }

    const res = await fetch(`${this.baseUrl}/api/memory/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) throw new Error(`Search failed: ${res.status}`)
    return res.json() as Promise<SearchResult>
  }

  async getObservations(ids: number[]): Promise<MemoryObservation[]> {
    const res = await fetch(`${this.baseUrl}/api/memory/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })

    if (!res.ok) throw new Error(`Get observations failed: ${res.status}`)
    const data = (await res.json()) as { observations: MemoryObservation[] }
    return data.observations
  }

  async getSessionTimeline(): Promise<MemoryObservation[]> {
    const res = await fetch(`${this.baseUrl}/api/memory/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depth_before: 50, depth_after: 0 }),
    })

    if (!res.ok) throw new Error(`Timeline failed: ${res.status}`)
    const data = (await res.json()) as { observations: MemoryObservation[] }
    return data.observations
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/flowstate-memory/__tests__/client.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/collectors/src/flowstate-memory/client.ts packages/collectors/src/flowstate-memory/__tests__/client.test.ts
git commit -m "$(cat <<'EOF'
feat(collectors): add flowstate-memory HTTP client

HTTP client for the flowstate-agent-memory API with health check,
search, get, and timeline methods.

Built with d7r FlowState
EOF
)"
```

---

### Task 8: flowstate-memory Detector

**Files:**

- Create: `packages/collectors/src/flowstate-memory/detector.ts`
- Test: `packages/collectors/src/flowstate-memory/__tests__/detector.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/collectors/src/flowstate-memory/__tests__/detector.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectFlowstateMemory } from '../detector'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('detectFlowstateMemory', () => {
  it('returns found when health check succeeds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('OK', { status: 200 }))

    const result = await detectFlowstateMemory('http://localhost:7090')
    expect(result.source).toBe('flowstate-memory')
    expect(result.found).toBe(true)
    expect(result.locations).toContain('http://localhost:7090')
  })

  it('returns not found when health check fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const result = await detectFlowstateMemory('http://localhost:7090')
    expect(result.found).toBe(false)
    expect(result.locations).toEqual([])
  })

  it('uses default URL when none provided', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('OK', { status: 200 }))

    await detectFlowstateMemory()
    expect(fetchSpy.mock.calls[0][0]).toContain('localhost:7090')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/flowstate-memory/__tests__/detector.test.ts`
Expected: FAIL with "Cannot find module '../detector'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/collectors/src/flowstate-memory/detector.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { CollectorDetection } from '../types'

const DEFAULT_URL = 'http://localhost:7090'

/**
 * Detect flowstate-agent-memory service availability via HTTP health check.
 */
export async function detectFlowstateMemory(url?: string): Promise<CollectorDetection> {
  const baseUrl = url ?? DEFAULT_URL

  try {
    const res = await fetch(`${baseUrl}/api/health`)
    if (res.ok) {
      return {
        source: 'flowstate-memory',
        found: true,
        locations: [baseUrl],
      }
    }
  } catch {
    // Service not reachable
  }

  return {
    source: 'flowstate-memory',
    found: false,
    locations: [],
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/flowstate-memory/__tests__/detector.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/collectors/src/flowstate-memory/detector.ts packages/collectors/src/flowstate-memory/__tests__/detector.test.ts
git commit -m "$(cat <<'EOF'
feat(collectors): add flowstate-memory detector

Detects flowstate-agent-memory service via HTTP health check at
localhost:7090.

Built with d7r FlowState
EOF
)"
```

---

### Task 9: flowstate-memory Extractor + Index + Registration

**Files:**

- Create: `packages/collectors/src/flowstate-memory/extractor.ts`
- Create: `packages/collectors/src/flowstate-memory/scanner.ts`
- Create: `packages/collectors/src/flowstate-memory/index.ts`
- Modify: `packages/collectors/src/index.ts` (add registration)
- Test: `packages/collectors/src/flowstate-memory/__tests__/extractor.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/collectors/src/flowstate-memory/__tests__/extractor.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FlowstateMemoryCollector } from '../extractor'

let collector: FlowstateMemoryCollector

beforeEach(() => {
  collector = new FlowstateMemoryCollector('http://localhost:7090')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function mockSearchResponse(observations: unknown[]) {
  return new Response(JSON.stringify({ results: observations, total: observations.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockHealthOk() {
  return new Response('OK', { status: 200 })
}

describe('FlowstateMemoryCollector', () => {
  it('has source "flowstate-memory"', () => {
    expect(collector.source).toBe('flowstate-memory')
  })

  it('extracts memory layer from observations', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockHealthOk()) // detect health check
      .mockResolvedValueOnce(
        mockSearchResponse([
          {
            id: 1,
            type: 'discovery',
            title: 'Redis pattern',
            narrative: 'Found caching',
            facts: ['cache works'],
            concepts: ['redis'],
            created_at: '2026-03-01T00:00:00Z',
          },
          {
            id: 2,
            type: 'pattern',
            title: 'TDD flow',
            narrative: 'Test first',
            facts: ['Red green refactor'],
            concepts: ['testing'],
            created_at: '2026-03-02T00:00:00Z',
          },
        ])
      )

    const result = await collector.extract({})
    expect(result.source).toBe('flowstate-memory')
    expect(result.layers.memory?.episodic?.events?.length).toBe(1) // discovery
    expect(result.layers.memory?.procedural?.workflows?.length).toBe(1) // pattern
    expect(result.layers.memory?.semantic?.knowledgeDomains).toContain('redis')
  })

  it('returns empty layers when service unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await collector.extract({})
    expect(result.layers).toEqual({})
  })

  it('filters by requested layers', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockHealthOk())
      .mockResolvedValueOnce(
        mockSearchResponse([
          {
            id: 1,
            type: 'discovery',
            title: 'Test',
            narrative: 'Details',
            facts: [],
            concepts: ['ts'],
            created_at: '2026-03-01T00:00:00Z',
          },
        ])
      )

    const result = await collector.extract({ layers: ['memory'] })
    expect(result.layers.memory).toBeDefined()
    expect(result.layers.taskHistory).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/flowstate-memory/__tests__/extractor.test.ts`
Expected: FAIL with "Cannot find module '../extractor'"

- [ ] **Step 3: Write the scanner**

```typescript
// packages/collectors/src/flowstate-memory/scanner.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { SagaLayerName } from '@d7r/saga-sdk'
import type { CollectorScan } from '../types'
import { FlowstateMemoryClient } from './client'

/**
 * Scan flowstate-agent-memory API for available data counts.
 */
export async function scanFlowstateMemory(url?: string): Promise<CollectorScan> {
  const client = new FlowstateMemoryClient(url ?? 'http://localhost:7090')

  const empty: CollectorScan = {
    sessionCount: 0,
    projectCount: 0,
    memoryEntries: 0,
    skillCount: 0,
    estimatedExportSizeBytes: 0,
    layers: [],
  }

  try {
    const result = await client.search({ limit: 0 })
    const layers: SagaLayerName[] = []
    if (result.total > 0) layers.push('memory', 'taskHistory')

    return {
      ...empty,
      memoryEntries: result.total,
      layers,
    }
  } catch {
    return empty
  }
}
```

- [ ] **Step 4: Write the extractor**

```typescript
// packages/collectors/src/flowstate-memory/extractor.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { EpisodicEvent, PartialSagaDocument, ProceduralWorkflow } from '@d7r/saga-sdk'
import type { CollectorDetection, CollectorScan, ExtractOptions, SagaCollector } from '../types'
import { detectFlowstateMemory } from './detector'
import { scanFlowstateMemory } from './scanner'
import { FlowstateMemoryClient, type MemoryObservation } from './client'
import { aggregateKnowledge } from '../claude-mem/parsers/knowledge'

const DEFAULT_URL = 'http://localhost:7090'

/** Map flowstate observation types to SAGA episodic event types */
function toEpisodicType(obsType: string): EpisodicEvent['type'] {
  switch (obsType) {
    case 'discovery':
    case 'refactor':
      return 'learning'
    case 'bugfix':
      return 'error-recovery'
    case 'feature':
      return 'task-completion'
    case 'decision':
      return 'milestone'
    default:
      return 'observation'
  }
}

/**
 * FlowState agent memory collector — extracts agent state from
 * the flowstate-agent-memory HTTP API into a PartialSagaDocument.
 *
 * Layers populated:
 *  - memory: episodic, procedural, semantic (from observations)
 *  - taskHistory: session-based (future, when session API available)
 */
export class FlowstateMemoryCollector implements SagaCollector {
  readonly source = 'flowstate-memory'
  private client: FlowstateMemoryClient

  constructor(url?: string) {
    this.client = new FlowstateMemoryClient(url ?? DEFAULT_URL)
  }

  async detect(homeDir?: string): Promise<CollectorDetection> {
    // homeDir unused for HTTP-based collector, but required by interface
    return detectFlowstateMemory(this.client['baseUrl'])
  }

  async scan(homeDir?: string): Promise<CollectorScan> {
    return scanFlowstateMemory(this.client['baseUrl'])
  }

  async extract(options?: ExtractOptions): Promise<PartialSagaDocument> {
    const detection = await this.detect()
    if (!detection.found) {
      return { source: this.source, layers: {} }
    }

    const requestedLayers = options?.layers
    const shouldInclude = (layer: string) =>
      !requestedLayers || requestedLayers.includes(layer as never)

    const partial: PartialSagaDocument = {
      source: this.source,
      layers: {},
    }

    if (shouldInclude('memory')) {
      try {
        const limit = options?.maxMemoryEntries ?? 500
        const searchResult = await this.client.search({
          limit,
          ...(options?.since ? { since: options.since.toISOString() } : {}),
        })

        const observations = searchResult.results
        const { episodic, procedural, concepts } = categorizeObservations(observations)

        const hasEpisodic = episodic.length > 0
        const hasProcedural = procedural.length > 0
        const hasConcepts = concepts.length > 0

        if (hasEpisodic || hasProcedural || hasConcepts) {
          const semantic = hasConcepts ? aggregateKnowledge(concepts) : undefined

          partial.layers.memory = {
            ...(hasEpisodic ? { episodic: { events: episodic } } : {}),
            ...(hasProcedural ? { procedural: { workflows: procedural } } : {}),
            ...(semantic ? { semantic } : {}),
          }
        }
      } catch {
        // API failure — return what we have
      }
    }

    return partial
  }
}

function categorizeObservations(observations: MemoryObservation[]) {
  const episodic: EpisodicEvent[] = []
  const procedural: ProceduralWorkflow[] = []
  const concepts: string[] = []

  for (const obs of observations) {
    if (obs.concepts) concepts.push(...obs.concepts)

    if (obs.type === 'pattern') {
      procedural.push({
        name: obs.title,
        description: obs.narrative,
        steps: obs.facts,
      })
    } else {
      episodic.push({
        eventId: `flowstate-mem-${obs.id}`,
        type: toEpisodicType(obs.type),
        timestamp: obs.created_at,
        summary: obs.title,
        learnings: obs.narrative,
      })
    }
  }

  return { episodic, procedural, concepts }
}
```

- [ ] **Step 5: Write barrel export**

```typescript
// packages/collectors/src/flowstate-memory/index.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export { FlowstateMemoryCollector } from './extractor'
export { detectFlowstateMemory } from './detector'
export { scanFlowstateMemory } from './scanner'
export { FlowstateMemoryClient } from './client'
```

- [ ] **Step 6: Register in package index**

Add to `packages/collectors/src/index.ts`:

```typescript
// FlowState memory collector
export { FlowstateMemoryCollector } from './flowstate-memory'
export {
  detectFlowstateMemory,
  scanFlowstateMemory,
  FlowstateMemoryClient,
} from './flowstate-memory'

import { FlowstateMemoryCollector } from './flowstate-memory'
registerCollector('flowstate-memory', () => new FlowstateMemoryCollector())
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/flowstate-memory/__tests__/extractor.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 8: Run full test suite**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test`
Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add packages/collectors/src/flowstate-memory/ packages/collectors/src/index.ts
git commit -m "$(cat <<'EOF'
feat(collectors): add FlowstateMemoryCollector

Complete flowstate-memory collector with HTTP-based detect/scan/extract.
Talks to flowstate-agent-memory API at localhost:7090, maps observations
to SAGA memory layers. Reuses aggregateKnowledge from claude-mem.

Registered as 'flowstate-memory' in the collector registry.

Built with d7r FlowState
EOF
)"
```

---

## Phase 3: project-claude Collector

The project-claude collector reads `.claude/` directories from project repos and the global `~/.claude/` directory, extracting agent profiles, rules, settings, and custom commands into SAGA persona, cognitive, relationships, and skills layers.

### File Structure

```
packages/collectors/src/
  project-claude/
    index.ts                           -- Barrel exports
    detector.ts                        -- Scan for .claude/ directories
    scanner.ts                         -- Count profiles, rules, settings
    extractor.ts                       -- ProjectClaudeCollector class
    parsers/
      agents.ts                        -- Parse agent role markdown files
      rules.ts                         -- Parse rules markdown files
      settings.ts                      -- Parse settings JSON
      commands.ts                      -- Parse custom command definitions
    __tests__/
      detector.test.ts                 -- Detection tests
      extractor.test.ts                -- Full extraction tests
      parsers/
        agents.test.ts                 -- Agent profile parsing tests
        rules.test.ts                  -- Rules parsing tests
```

---

### Task 10: project-claude Agent Profile Parser

**Files:**

- Create: `packages/collectors/src/project-claude/parsers/agents.ts`
- Test: `packages/collectors/src/project-claude/__tests__/parsers/agents.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/collectors/src/project-claude/__tests__/parsers/agents.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseAgentProfiles } from '../../parsers/agents'

let tempDir: string

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-agents-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('parseAgentProfiles', () => {
  it('parses agent markdown files into persona data', () => {
    const agentsDir = join(tempDir, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(
      join(agentsDir, 'ceo.md'),
      [
        '# Marcus Chen',
        '',
        'Role: CEO',
        '',
        'Marcus is the CEO of d7r LLC. He provides strategic direction.',
        '',
        'Team Member ID: team_UfL4H7z2R6',
      ].join('\n')
    )

    const result = parseAgentProfiles(join(tempDir, '.claude'))
    expect(result.persona?.name).toBe('Marcus Chen')
    expect(result.persona?.bio).toContain('CEO of d7r LLC')
  })

  it('extracts team member relationships', () => {
    const agentsDir = join(tempDir, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(
      join(agentsDir, 'ceo.md'),
      ['# Marcus Chen', '', 'Role: CEO', 'Team Member ID: team_UfL4H7z2R6'].join('\n')
    )

    const result = parseAgentProfiles(join(tempDir, '.claude'))
    expect(result.relationships?.organization?.role).toBe('CEO')
  })

  it('returns null for missing agents directory', () => {
    const result = parseAgentProfiles(join(tempDir, '.claude'))
    expect(result.persona).toBeUndefined()
  })

  it('handles multiple agent files', () => {
    const agentsDir = join(tempDir, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'ceo.md'), '# Marcus Chen\n\nRole: CEO')
    writeFileSync(join(agentsDir, 'cto.md'), '# Sarah Dev\n\nRole: CTO')

    const result = parseAgentProfiles(join(tempDir, '.claude'))
    // Should parse the first profile found (alphabetically)
    expect(result.persona?.name).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/project-claude/__tests__/parsers/agents.test.ts`
Expected: FAIL with "Cannot find module '../../parsers/agents'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/collectors/src/project-claude/parsers/agents.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PersonaLayer, RelationshipsLayer } from '@d7r/saga-sdk'

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
    const files = readdirSync(agentsDir)
      .filter(f => f.endsWith('.md'))
      .sort()
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/project-claude/__tests__/parsers/agents.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/collectors/src/project-claude/parsers/agents.ts packages/collectors/src/project-claude/__tests__/parsers/agents.test.ts
git commit -m "$(cat <<'EOF'
feat(collectors): add project-claude agent profile parser

Parses .claude/agents/*.md files into SAGA persona and
relationships layers. Extracts name, role, bio, and team member ID.

Built with d7r FlowState
EOF
)"
```

---

### Task 11: project-claude Rules Parser

**Files:**

- Create: `packages/collectors/src/project-claude/parsers/rules.ts`
- Test: `packages/collectors/src/project-claude/__tests__/parsers/rules.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/collectors/src/project-claude/__tests__/parsers/rules.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseRules } from '../../parsers/rules'

let tempDir: string

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-rules-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('parseRules', () => {
  it('combines rules files into cognitive system prompt', () => {
    const rulesDir = join(tempDir, '.claude', 'rules')
    mkdirSync(rulesDir, { recursive: true })
    writeFileSync(join(rulesDir, 'git-workflow.md'), '# Git Workflow\n\nUse conventional commits.')
    writeFileSync(join(rulesDir, 'writing-voice.md'), '# Writing Voice\n\nBe concise.')

    const result = parseRules(join(tempDir, '.claude'))
    expect(result).toContain('conventional commits')
    expect(result).toContain('Be concise')
  })

  it('includes CLAUDE.md from project root', () => {
    const claudeDir = join(tempDir, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(
      join(tempDir, 'CLAUDE.md'),
      '# Project Instructions\n\nUse TypeScript strict mode.'
    )

    const result = parseRules(claudeDir, tempDir)
    expect(result).toContain('TypeScript strict mode')
  })

  it('returns null when no rules exist', () => {
    const claudeDir = join(tempDir, '.claude')
    mkdirSync(claudeDir, { recursive: true })

    const result = parseRules(claudeDir)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/project-claude/__tests__/parsers/rules.test.ts`
Expected: FAIL with "Cannot find module '../../parsers/rules'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/collectors/src/project-claude/parsers/rules.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Parse rules from .claude/rules/*.md and optionally CLAUDE.md
 * into a combined system prompt string.
 */
export function parseRules(claudeDir: string, projectRoot?: string): string | null {
  const parts: string[] = []

  // Project root CLAUDE.md
  if (projectRoot) {
    const claudeMdPath = join(projectRoot, 'CLAUDE.md')
    if (existsSync(claudeMdPath)) {
      try {
        const content = readFileSync(claudeMdPath, 'utf-8').trim()
        if (content) parts.push(content)
      } catch {
        // skip
      }
    }
  }

  // .claude/rules/*.md
  const rulesDir = join(claudeDir, 'rules')
  if (existsSync(rulesDir)) {
    try {
      const files = readdirSync(rulesDir)
        .filter(f => f.endsWith('.md'))
        .sort()
      for (const file of files) {
        try {
          const content = readFileSync(join(rulesDir, file), 'utf-8').trim()
          if (content) parts.push(content)
        } catch {
          // skip individual files that fail
        }
      }
    } catch {
      // skip
    }
  }

  return parts.length > 0 ? parts.join('\n\n---\n\n') : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/project-claude/__tests__/parsers/rules.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/collectors/src/project-claude/parsers/rules.ts packages/collectors/src/project-claude/__tests__/parsers/rules.test.ts
git commit -m "$(cat <<'EOF'
feat(collectors): add project-claude rules parser

Combines .claude/rules/*.md files and project CLAUDE.md into a
single system prompt string for the SAGA cognitive layer.

Built with d7r FlowState
EOF
)"
```

---

### Task 12: project-claude Settings + Commands Parsers

**Files:**

- Create: `packages/collectors/src/project-claude/parsers/settings.ts`
- Create: `packages/collectors/src/project-claude/parsers/commands.ts`

- [ ] **Step 1: Write settings parser**

```typescript
// packages/collectors/src/project-claude/parsers/settings.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CognitiveLayer } from '@d7r/saga-sdk'

/**
 * Parse .claude/settings.json into cognitive parameters.
 */
export function parseProjectSettings(claudeDir: string): Partial<CognitiveLayer> | null {
  const settingsPath = join(claudeDir, 'settings.json')
  if (!existsSync(settingsPath)) return null

  try {
    const content = readFileSync(settingsPath, 'utf-8')
    const settings = JSON.parse(content) as Record<string, unknown>

    const result: Partial<CognitiveLayer> = {}

    // Extract allowed/denied tools as capabilities
    const allowedTools = settings.allowedTools as string[] | undefined
    const deniedTools = settings.deniedTools as string[] | undefined

    if (allowedTools || deniedTools) {
      const capabilities: Record<string, boolean> = {}
      if (allowedTools) {
        for (const tool of allowedTools) capabilities[tool] = true
      }
      if (deniedTools) {
        for (const tool of deniedTools) capabilities[tool] = false
      }
      result.capabilities = capabilities
    }

    return Object.keys(result).length > 0 ? result : null
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Write commands parser**

```typescript
// packages/collectors/src/project-claude/parsers/commands.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import type { SelfReportedSkill } from '@d7r/saga-sdk'

/**
 * Parse .claude/commands/ directory into SAGA skills.
 * Each command file becomes a self-reported skill.
 */
export function parseCommands(claudeDir: string): SelfReportedSkill[] {
  const commandsDir = join(claudeDir, 'commands')
  if (!existsSync(commandsDir)) return []

  try {
    const files = readdirSync(commandsDir).filter(f => f.endsWith('.md'))
    return files.map(f => ({
      name: basename(f, '.md'),
      category: 'custom-command',
      addedAt: new Date().toISOString(),
    }))
  } catch {
    return []
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/collectors/src/project-claude/parsers/settings.ts packages/collectors/src/project-claude/parsers/commands.ts
git commit -m "$(cat <<'EOF'
feat(collectors): add project-claude settings and commands parsers

Settings parser extracts allowed/denied tools as cognitive capabilities.
Commands parser maps .claude/commands/*.md to SAGA self-reported skills.

Built with d7r FlowState
EOF
)"
```

---

### Task 13: project-claude Detector + Scanner + Extractor + Registration

**Files:**

- Create: `packages/collectors/src/project-claude/detector.ts`
- Create: `packages/collectors/src/project-claude/scanner.ts`
- Create: `packages/collectors/src/project-claude/extractor.ts`
- Create: `packages/collectors/src/project-claude/index.ts`
- Modify: `packages/collectors/src/index.ts` (add registration)
- Test: `packages/collectors/src/project-claude/__tests__/detector.test.ts`
- Test: `packages/collectors/src/project-claude/__tests__/extractor.test.ts`

- [ ] **Step 1: Write the detector test**

```typescript
// packages/collectors/src/project-claude/__tests__/detector.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectProjectClaude } from '../detector'

let tempDir: string

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-projclaude-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('detectProjectClaude', () => {
  it('detects .claude directory with agents or rules', () => {
    const claudeDir = join(tempDir, '.claude', 'agents')
    mkdirSync(claudeDir, { recursive: true })

    const result = detectProjectClaude([tempDir])
    expect(result.source).toBe('project-claude')
    expect(result.found).toBe(true)
    expect(result.locations).toContain(join(tempDir, '.claude'))
  })

  it('detects across multiple paths', () => {
    const path1 = join(tempDir, 'project1')
    const path2 = join(tempDir, 'project2')
    mkdirSync(join(path1, '.claude', 'rules'), { recursive: true })
    mkdirSync(join(path2, '.claude', 'agents'), { recursive: true })

    const result = detectProjectClaude([path1, path2])
    expect(result.found).toBe(true)
    expect(result.locations).toHaveLength(2)
  })

  it('returns not found when no .claude dirs exist', () => {
    const result = detectProjectClaude([tempDir])
    expect(result.found).toBe(false)
  })
})
```

- [ ] **Step 2: Write the detector**

```typescript
// packages/collectors/src/project-claude/detector.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { CollectorDetection } from '../types'

/**
 * Detect .claude/ directories in project paths and global ~/.claude/.
 */
export function detectProjectClaude(paths?: string[], homeDir?: string): CollectorDetection {
  const searchPaths = paths ?? [homeDir ?? homedir()]
  const locations: string[] = []

  for (const p of searchPaths) {
    const claudeDir = join(p, '.claude')
    if (existsSync(claudeDir)) {
      locations.push(claudeDir)
    }
  }

  return {
    source: 'project-claude',
    found: locations.length > 0,
    locations,
  }
}
```

- [ ] **Step 3: Write the extractor test**

```typescript
// packages/collectors/src/project-claude/__tests__/extractor.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProjectClaudeCollector } from '../extractor'

let tempDir: string
let collector: ProjectClaudeCollector

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-projclaude-ext-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
  collector = new ProjectClaudeCollector([tempDir])
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('ProjectClaudeCollector', () => {
  it('has source "project-claude"', () => {
    expect(collector.source).toBe('project-claude')
  })

  it('extracts persona from agent profiles', async () => {
    const agentsDir = join(tempDir, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'ceo.md'), '# Marcus Chen\n\nRole: CEO\n\nStrategic leader.')

    const result = await collector.extract({})
    expect(result.layers.persona?.name).toBe('Marcus Chen')
  })

  it('extracts cognitive layer from rules', async () => {
    const rulesDir = join(tempDir, '.claude', 'rules')
    mkdirSync(rulesDir, { recursive: true })
    writeFileSync(join(rulesDir, 'voice.md'), '# Voice\n\nBe direct and concise.')

    const result = await collector.extract({})
    expect(result.layers.cognitive?.systemPrompt?.content).toContain('Be direct and concise')
  })

  it('extracts skills from commands', async () => {
    const commandsDir = join(tempDir, '.claude', 'commands')
    mkdirSync(commandsDir, { recursive: true })
    writeFileSync(join(commandsDir, 'review-pr.md'), 'Review a pull request')
    writeFileSync(join(commandsDir, 'deploy.md'), 'Deploy to production')

    const result = await collector.extract({})
    expect(result.layers.skills?.selfReported?.length).toBe(2)
    expect(result.layers.skills?.selfReported?.map(s => s.name)).toContain('review-pr')
  })

  it('extracts relationships from agent role', async () => {
    const agentsDir = join(tempDir, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'ceo.md'), '# Marcus\n\nRole: CEO')

    const result = await collector.extract({})
    expect(result.layers.relationships?.organization?.role).toBe('CEO')
  })

  it('returns empty layers when .claude missing', async () => {
    const emptyDir = join(tmpdir(), `saga-empty-proj-${Date.now()}`)
    mkdirSync(emptyDir, { recursive: true })
    const emptyCollector = new ProjectClaudeCollector([emptyDir])
    try {
      const result = await emptyCollector.extract({})
      expect(result.layers).toEqual({})
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })

  it('filters by requested layers', async () => {
    const agentsDir = join(tempDir, '.claude', 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'ceo.md'), '# Marcus\n\nRole: CEO')
    const rulesDir = join(tempDir, '.claude', 'rules')
    mkdirSync(rulesDir, { recursive: true })
    writeFileSync(join(rulesDir, 'voice.md'), '# Voice\n\nBe concise.')

    const result = await collector.extract({ layers: ['persona'] })
    expect(result.layers.persona).toBeDefined()
    expect(result.layers.cognitive).toBeUndefined()
  })
})
```

- [ ] **Step 4: Write the scanner**

```typescript
// packages/collectors/src/project-claude/scanner.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SagaLayerName } from '@d7r/saga-sdk'
import type { CollectorScan } from '../types'

/**
 * Scan .claude/ directories and count available resources.
 */
export function scanProjectClaude(paths: string[]): CollectorScan {
  const layers: SagaLayerName[] = []
  let projectCount = 0
  let skillCount = 0

  for (const p of paths) {
    const claudeDir = join(p, '.claude')
    if (!existsSync(claudeDir)) continue
    projectCount++

    const agentsDir = join(claudeDir, 'agents')
    if (existsSync(agentsDir)) {
      layers.push('persona', 'relationships')
    }

    const rulesDir = join(claudeDir, 'rules')
    if (existsSync(rulesDir)) {
      layers.push('cognitive')
    }

    const commandsDir = join(claudeDir, 'commands')
    if (existsSync(commandsDir)) {
      try {
        skillCount += readdirSync(commandsDir).filter(f => f.endsWith('.md')).length
      } catch {
        // skip
      }
      if (skillCount > 0) layers.push('skills')
    }
  }

  return {
    sessionCount: 0,
    projectCount,
    memoryEntries: 0,
    skillCount,
    estimatedExportSizeBytes: 0,
    layers: [...new Set(layers)],
  }
}
```

- [ ] **Step 5: Write the extractor**

```typescript
// packages/collectors/src/project-claude/extractor.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { join } from 'node:path'
import { homedir } from 'node:os'
import type { PartialSagaDocument } from '@d7r/saga-sdk'
import type { CollectorDetection, CollectorScan, ExtractOptions, SagaCollector } from '../types'
import { detectProjectClaude } from './detector'
import { scanProjectClaude } from './scanner'
import { parseAgentProfiles } from './parsers/agents'
import { parseRules } from './parsers/rules'
import { parseProjectSettings } from './parsers/settings'
import { parseCommands } from './parsers/commands'

/**
 * Project Claude collector — extracts agent configuration from .claude/
 * directories into a PartialSagaDocument.
 *
 * Layers populated:
 *  - persona: from .claude/agents/*.md
 *  - cognitive: from .claude/rules/*.md, CLAUDE.md, .claude/settings.json
 *  - relationships: from agent role definitions
 *  - skills: from .claude/commands/*.md
 */
export class ProjectClaudeCollector implements SagaCollector {
  readonly source = 'project-claude'
  private paths: string[]

  constructor(paths?: string[]) {
    this.paths = paths ?? [homedir()]
  }

  async detect(homeDir?: string): Promise<CollectorDetection> {
    return detectProjectClaude(this.paths, homeDir)
  }

  async scan(homeDir?: string): Promise<CollectorScan> {
    return scanProjectClaude(this.paths)
  }

  async extract(options?: ExtractOptions): Promise<PartialSagaDocument> {
    const detection = detectProjectClaude(this.paths)
    if (!detection.found) {
      return { source: this.source, layers: {} }
    }

    const requestedLayers = options?.layers
    const shouldInclude = (layer: string) =>
      !requestedLayers || requestedLayers.includes(layer as never)

    const partial: PartialSagaDocument = {
      source: this.source,
      layers: {},
    }

    // Process each detected .claude/ directory
    for (const claudeDir of detection.locations) {
      // Persona + Relationships from agent profiles
      if (shouldInclude('persona') || shouldInclude('relationships')) {
        const profiles = parseAgentProfiles(claudeDir)
        if (shouldInclude('persona') && profiles.persona) {
          partial.layers.persona = { ...partial.layers.persona, ...profiles.persona }
        }
        if (shouldInclude('relationships') && profiles.relationships) {
          partial.layers.relationships = {
            ...partial.layers.relationships,
            ...profiles.relationships,
          }
        }
      }

      // Cognitive from rules + settings
      if (shouldInclude('cognitive')) {
        // Derive project root from .claude/ parent
        const projectRoot = join(claudeDir, '..')
        const rules = parseRules(claudeDir, projectRoot)
        const settings = parseProjectSettings(claudeDir)

        if (rules || settings) {
          partial.layers.cognitive = {
            ...partial.layers.cognitive,
            ...(settings ?? {}),
            ...(rules
              ? {
                  systemPrompt: {
                    format: 'markdown' as const,
                    content: [partial.layers.cognitive?.systemPrompt?.content, rules]
                      .filter(Boolean)
                      .join('\n\n---\n\n'),
                  },
                }
              : {}),
          }
        }
      }

      // Skills from commands
      if (shouldInclude('skills')) {
        const commands = parseCommands(claudeDir)
        if (commands.length > 0) {
          const existing = partial.layers.skills?.selfReported ?? []
          partial.layers.skills = {
            ...partial.layers.skills,
            selfReported: [...existing, ...commands],
          }
        }
      }
    }

    return partial
  }
}
```

- [ ] **Step 6: Write barrel export**

```typescript
// packages/collectors/src/project-claude/index.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

export { ProjectClaudeCollector } from './extractor'
export { detectProjectClaude } from './detector'
export { scanProjectClaude } from './scanner'
export { parseAgentProfiles } from './parsers/agents'
export { parseRules } from './parsers/rules'
export { parseProjectSettings } from './parsers/settings'
export { parseCommands } from './parsers/commands'
```

- [ ] **Step 7: Register in package index**

Add to `packages/collectors/src/index.ts`:

```typescript
// Project Claude collector
export { ProjectClaudeCollector } from './project-claude'
export {
  detectProjectClaude,
  scanProjectClaude,
  parseAgentProfiles,
  parseRules,
  parseProjectSettings,
  parseCommands,
} from './project-claude'

import { ProjectClaudeCollector } from './project-claude'
registerCollector('project-claude', () => new ProjectClaudeCollector())
```

- [ ] **Step 8: Run detector tests**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/project-claude/__tests__/detector.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 9: Run extractor tests**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/project-claude/__tests__/extractor.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 10: Run full test suite**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test`
Expected: All tests pass

- [ ] **Step 11: Commit**

```bash
git add packages/collectors/src/project-claude/ packages/collectors/src/index.ts
git commit -m "$(cat <<'EOF'
feat(collectors): add ProjectClaudeCollector

Complete project-claude collector with detect/scan/extract pipeline.
Reads .claude/ directories for agent profiles, rules, settings, and
commands. Maps to SAGA persona, cognitive, relationships, and skills.

Registered as 'project-claude' in the collector registry.

Built with d7r FlowState
EOF
)"
```

---

## Phase 4: .saga/config.json Schema

Define the config schema in `@d7r/saga-sdk` for cross-package use.

### File Structure

```
packages/sdk/src/
  types/
    saga-config.ts                     -- Config type definitions
  index.ts                             -- Modified: export config types
```

---

### Task 14: .saga/config.json Type Definition

**Files:**

- Create: `packages/sdk/src/types/saga-config.ts`
- Modify: `packages/sdk/src/types/index.ts` (export new types)

- [ ] **Step 1: Check existing SDK exports**

Read: `packages/sdk/src/types/index.ts` and `packages/sdk/src/index.ts` to understand the export pattern.

- [ ] **Step 2: Write the config type**

```typescript
// packages/sdk/src/types/saga-config.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { ChainId } from './common'

/** SAGA agent identity configuration */
export interface SagaConfigAgent {
  /** SAGA handle (e.g. "marcus-chen") */
  sagaHandle: string
  /** Agent wallet address */
  sagaWallet: string
  /** Blockchain identifier (e.g. "eip155:8453") */
  chain: ChainId
  /** Organization handle */
  orgHandle?: string
}

/** SAGA hub connection configuration */
export interface SagaConfigHub {
  /** Hub URL (e.g. "https://agents.d7r.io") */
  url: string
  /** Unique system identifier for this DERP */
  systemId: string
  /** Public URL of this spoke system */
  systemUrl?: string
}

/** SAGA sync service configuration */
export interface SagaConfigSync {
  /** Milliseconds to debounce push operations (default: 2000) */
  pushDebounceMs?: number
  /** Milliseconds between pull polls (default: 300000) */
  pullIntervalMs?: number
  /** Enable real-time sync (default: false) */
  realtimeEnabled?: boolean
  /** Real-time sync mode (default: "sse") */
  realtimeMode?: 'sse' | 'websocket' | 'polling'
}

/** FlowState-specific identity bridge */
export interface SagaConfigIdentity {
  /** FlowState team member ID (e.g. "team_UfL4H7z2R6") */
  flowstateTeamMemberId?: string
  /** FlowState org ID */
  flowstateOrgId?: string
  /** FlowState workspace ID */
  flowstateWorkspaceId?: string
}

/** Per-collector configuration */
export interface SagaConfigCollectors {
  'claude-mem'?: {
    /** Path to claude-mem.db (default: ~/.claude-mem/claude-mem.db) */
    dbPath?: string
  }
  'flowstate-memory'?: {
    /** Base URL of flowstate-agent-memory API (default: http://localhost:7090) */
    url?: string
  }
  'project-claude'?: {
    /** Paths to scan for .claude/ directories */
    paths?: string[]
  }
  [key: string]: Record<string, unknown> | undefined
}

/** Root .saga/config.json schema */
export interface SagaConfig {
  agent: SagaConfigAgent
  hub?: SagaConfigHub
  sync?: SagaConfigSync
  identity?: SagaConfigIdentity
  collectors?: SagaConfigCollectors
}
```

- [ ] **Step 3: Export from types index**

Add to `packages/sdk/src/types/index.ts` (or wherever the barrel export is):

```typescript
export type {
  SagaConfig,
  SagaConfigAgent,
  SagaConfigHub,
  SagaConfigSync,
  SagaConfigIdentity,
  SagaConfigCollectors,
} from './saga-config'
```

- [ ] **Step 4: Verify typecheck**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-sdk typecheck`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/types/saga-config.ts packages/sdk/src/types/index.ts
git commit -m "$(cat <<'EOF'
feat(sdk): add SagaConfig type for .saga/config.json

Defines the schema for agent identity, hub connection, sync settings,
FlowState identity bridge, and per-collector configuration.

Built with d7r FlowState
EOF
)"
```

---

### Task 15: Config Loader Utility

**Files:**

- Create: `packages/collectors/src/config.ts`
- Test: `packages/collectors/src/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/collectors/src/__tests__/config.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadSagaConfig } from '../config'

let tempDir: string

beforeEach(() => {
  tempDir = join(tmpdir(), `saga-test-config-${Date.now()}`)
  mkdirSync(tempDir, { recursive: true })
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

describe('loadSagaConfig', () => {
  it('loads config from .saga/config.json', () => {
    const sagaDir = join(tempDir, '.saga')
    mkdirSync(sagaDir, { recursive: true })
    writeFileSync(
      join(sagaDir, 'config.json'),
      JSON.stringify({
        agent: {
          sagaHandle: 'marcus-chen',
          sagaWallet: '0xabc123',
          chain: 'eip155:8453',
          orgHandle: 'd7r',
        },
        hub: {
          url: 'https://agents.d7r.io',
          systemId: 'flowstate-derp-marcus-01',
        },
      })
    )

    const config = loadSagaConfig(tempDir)
    expect(config).not.toBeNull()
    expect(config!.agent.sagaHandle).toBe('marcus-chen')
    expect(config!.hub?.url).toBe('https://agents.d7r.io')
  })

  it('returns null when config missing', () => {
    const config = loadSagaConfig(tempDir)
    expect(config).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    const sagaDir = join(tempDir, '.saga')
    mkdirSync(sagaDir, { recursive: true })
    writeFileSync(join(sagaDir, 'config.json'), 'not json')

    const config = loadSagaConfig(tempDir)
    expect(config).toBeNull()
  })

  it('returns null when agent section missing', () => {
    const sagaDir = join(tempDir, '.saga')
    mkdirSync(sagaDir, { recursive: true })
    writeFileSync(join(sagaDir, 'config.json'), JSON.stringify({ hub: {} }))

    const config = loadSagaConfig(tempDir)
    expect(config).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/__tests__/config.test.ts`
Expected: FAIL with "Cannot find module '../config'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/collectors/src/config.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SagaConfig } from '@d7r/saga-sdk'

/**
 * Load .saga/config.json from a workspace directory.
 * Returns null if the file doesn't exist or is invalid.
 */
export function loadSagaConfig(workspaceDir: string): SagaConfig | null {
  const configPath = join(workspaceDir, '.saga', 'config.json')
  if (!existsSync(configPath)) return null

  try {
    const content = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(content) as Record<string, unknown>

    // Validate required agent section
    if (!parsed.agent || typeof parsed.agent !== 'object') return null

    const agent = parsed.agent as Record<string, unknown>
    if (!agent.sagaHandle || !agent.sagaWallet || !agent.chain) return null

    return parsed as unknown as SagaConfig
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Export from package index**

Add to `packages/collectors/src/index.ts`:

```typescript
export { loadSagaConfig } from './config'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/__tests__/config.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Run full test suite**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test`
Expected: All tests pass

- [ ] **Step 7: Typecheck**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors typecheck`
Expected: No type errors

- [ ] **Step 8: Commit**

```bash
git add packages/collectors/src/config.ts packages/collectors/src/__tests__/config.test.ts packages/collectors/src/index.ts
git commit -m "$(cat <<'EOF'
feat(collectors): add .saga/config.json loader

Loads and validates SagaConfig from workspace .saga/config.json.
Validates required agent section with sagaHandle, sagaWallet, and chain.

Built with d7r FlowState
EOF
)"
```

---

## Phase 5: Integration Testing

### Task 16: Full Pipeline Integration Test

**Files:**

- Create: `packages/collectors/src/__tests__/all-collectors.test.ts`

- [ ] **Step 1: Write the integration test**

```typescript
// packages/collectors/src/__tests__/all-collectors.test.ts
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectCollectors, listCollectorSources, createCollector } from '../registry'

// Force imports to trigger auto-registration
import '../index'

let homeDir: string

beforeEach(() => {
  homeDir = join(tmpdir(), `saga-integration-${Date.now()}`)
  mkdirSync(homeDir, { recursive: true })
})

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('Collector Registry Integration', () => {
  it('registers all 5 collector sources', () => {
    const sources = listCollectorSources()
    expect(sources).toContain('claude-code')
    expect(sources).toContain('openclaw')
    expect(sources).toContain('claude-mem')
    expect(sources).toContain('flowstate-memory')
    expect(sources).toContain('project-claude')
  })

  it('creates each collector by name', () => {
    expect(createCollector('claude-mem').source).toBe('claude-mem')
    expect(createCollector('flowstate-memory').source).toBe('flowstate-memory')
    expect(createCollector('project-claude').source).toBe('project-claude')
  })
})

describe('claude-mem full pipeline', () => {
  it('detects, scans, and extracts from test database', async () => {
    // Set up test database
    const dbDir = join(homeDir, '.claude-mem')
    mkdirSync(dbDir, { recursive: true })
    const dbPath = join(dbDir, 'claude-mem.db')

    const db = new Database(dbPath)
    db.exec(`
      CREATE TABLE observations (
        id INTEGER PRIMARY KEY, type TEXT NOT NULL, title TEXT,
        narrative TEXT, facts TEXT, concepts TEXT,
        created_at TEXT NOT NULL, updated_at TEXT, project TEXT, session_id TEXT
      );
      CREATE TABLE sdk_sessions (
        id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, project TEXT,
        started_at TEXT NOT NULL, ended_at TEXT, model TEXT
      );
      CREATE TABLE session_summaries (
        id INTEGER PRIMARY KEY, session_id TEXT NOT NULL,
        summary TEXT, created_at TEXT NOT NULL
      )
    `)
    db.prepare(
      `INSERT INTO observations (id, type, title, narrative, facts, concepts, created_at, project) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      1,
      'discovery',
      'Test discovery',
      'Found something',
      '["fact1"]',
      '["typescript"]',
      '2026-03-01T00:00:00Z',
      'proj'
    )
    db.close()

    const collector = createCollector('claude-mem')

    const detection = await collector.detect(homeDir)
    expect(detection.found).toBe(true)

    const scan = await collector.scan(homeDir)
    expect(scan.memoryEntries).toBe(1)

    const result = await collector.extract({ homeDir })
    expect(result.layers.memory?.episodic?.events?.length).toBe(1)
    expect(result.layers.memory?.semantic?.knowledgeDomains).toContain('typescript')
  })
})

describe('project-claude full pipeline', () => {
  it('detects, scans, and extracts from test .claude directory', async () => {
    const claudeDir = join(homeDir, '.claude')
    const agentsDir = join(claudeDir, 'agents')
    const rulesDir = join(claudeDir, 'rules')
    const commandsDir = join(claudeDir, 'commands')
    mkdirSync(agentsDir, { recursive: true })
    mkdirSync(rulesDir, { recursive: true })
    mkdirSync(commandsDir, { recursive: true })

    writeFileSync(join(agentsDir, 'bot.md'), '# TestBot\n\nRole: Assistant')
    writeFileSync(join(rulesDir, 'style.md'), '# Style\n\nBe helpful.')
    writeFileSync(join(commandsDir, 'deploy.md'), 'Deploy command')

    // project-claude uses paths, not homeDir, so we need to create with paths
    const { ProjectClaudeCollector } = await import('../project-claude')
    const collector = new ProjectClaudeCollector([homeDir])

    const detection = await collector.detect()
    expect(detection.found).toBe(true)

    const result = await collector.extract({})
    expect(result.layers.persona?.name).toBe('TestBot')
    expect(result.layers.cognitive?.systemPrompt?.content).toContain('Be helpful')
    expect(result.layers.skills?.selfReported?.length).toBe(1)
    expect(result.layers.relationships?.organization?.role).toBe('Assistant')
  })
})
```

- [ ] **Step 2: Run integration tests**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test -- src/__tests__/all-collectors.test.ts`
Expected: PASS

- [ ] **Step 3: Run complete test suite**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors test`
Expected: All tests pass (existing + new)

- [ ] **Step 4: Build check**

Run: `cd /Users/sthornock/code/epic/saga-standard && pnpm --filter @d7r/saga-collectors build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add packages/collectors/src/__tests__/all-collectors.test.ts
git commit -m "$(cat <<'EOF'
test(collectors): add integration tests for all collectors

Verifies registry registration, detection, scanning, and extraction
for claude-mem and project-claude collectors end-to-end.
flowstate-memory tested via mocked HTTP in its own test suite.

Built with d7r FlowState
EOF
)"
```

---

## Summary

| Phase | Tasks       | What It Builds                                                         |
| ----- | ----------- | ---------------------------------------------------------------------- |
| 1     | Tasks 1-6   | claude-mem collector (SQLite -> SAGA memory/taskHistory)               |
| 2     | Tasks 7-9   | flowstate-memory collector (HTTP -> SAGA memory)                       |
| 3     | Tasks 10-13 | project-claude collector (filesystem -> SAGA persona/cognitive/skills) |
| 4     | Tasks 14-15 | .saga/config.json schema + loader                                      |
| 5     | Task 16     | Integration tests for full pipeline                                    |

Total: 16 tasks, ~40-50 steps.

After completion, `saga collect` will extract memory from all five sources (claude-code, openclaw, claude-mem, flowstate-memory, project-claude) and the collector registry will have all five collectors available for the sync service (future phase).
