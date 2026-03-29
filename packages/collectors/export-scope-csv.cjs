// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/* eslint-disable no-console */
// Export FlowState scope mappings as CSV
// Usage: node export-scope-csv.cjs [scan-root...] [--db path/to/claude-mem.db] [--out output.csv]
const { FlowstateScopeMapper } = require('./dist/index.cjs')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { homedir } = require('node:os')

function escapeCsv(value) {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function main() {
  const args = process.argv.slice(2)
  const scanRoots = []
  let dbPath = join(homedir(), '.claude-mem', 'claude-mem.db')
  let outPath = join(__dirname, 'exports', 'scope-mapping.csv')

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db' && args[i + 1]) {
      dbPath = args[++i]
    } else if (args[i] === '--out' && args[i + 1]) {
      outPath = args[++i]
    } else {
      scanRoots.push(args[i])
    }
  }

  // Default scan roots: common code directories
  if (scanRoots.length === 0) {
    scanRoots.push(join(homedir(), 'code'))
    scanRoots.push(join(homedir(), 'code', 'epic'))
  }

  console.log('Scan roots:', scanRoots)
  console.log('DB path:', dbPath)
  console.log()

  const mapper = new FlowstateScopeMapper({ scanRoots, dbPath })
  const result = mapper.buildMapping()

  const headers = [
    'observationId',
    'orgId',
    'workspaceId',
    'codebaseId',
    'projectId',
    'projectName',
    'source',
  ]
  const rows = []

  // Observation-level mappings (from CLAUDE.md scanning)
  for (const [obsId, scope] of result.observationScopes) {
    rows.push({
      observationId: obsId,
      orgId: scope.orgId,
      workspaceId: scope.workspaceId,
      codebaseId: scope.codebaseId || '',
      projectId: scope.projectId || '',
      projectName: scope.projectName || '',
      source: 'claude-md',
    })
  }

  // Project-level mappings (from project name resolution)
  for (const [projectName, scope] of result.projectScopes) {
    rows.push({
      observationId: '',
      orgId: scope.orgId,
      workspaceId: scope.workspaceId,
      codebaseId: scope.codebaseId || '',
      projectId: scope.projectId || '',
      projectName,
      source: 'project-name',
    })
  }

  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map(h => escapeCsv(row[h])).join(','))
  }

  writeFileSync(outPath, `${lines.join('\n')}\n`)

  console.log(`Observation scopes: ${result.observationScopes.size}`)
  console.log(`Project scopes: ${result.projectScopes.size}`)
  console.log(`Unmapped observation IDs: ${result.unmappedObservationIds.length}`)
  console.log(`Unmapped projects: ${result.unmappedProjects.length}`)
  if (result.unmappedProjects.length > 0) {
    console.log('  ', result.unmappedProjects.join(', '))
  }
  console.log(`\nWritten to ${outPath} (${rows.length} rows)`)
}

main()
