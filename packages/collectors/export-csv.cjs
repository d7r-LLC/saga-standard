// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/* eslint-disable no-console */
// Export all collected SAGA data as CSV files
// Usage: node export-csv.cjs [output-dir]
const { createCollector } = require('./dist/index.cjs')
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const outDir = process.argv[2] || join(__dirname, 'exports')

function escapeCsv(value) {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function writeCsv(filename, headers, rows) {
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map(h => escapeCsv(row[h])).join(','))
  }
  const path = join(outDir, filename)
  writeFileSync(path, `${lines.join('\n')}\n`)
  console.log(`  ${filename}: ${rows.length} rows`)
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  console.log(`Exporting to ${outDir}\n`)

  // --- claude-mem ---
  const cm = createCollector('claude-mem')
  const cmDetect = await cm.detect()
  if (cmDetect.found) {
    console.log('claude-mem:')
    const memDoc = await cm.extract({ layers: ['memory'] })
    const mem = memDoc.layers?.memory

    if (mem?.episodic?.events?.length) {
      writeCsv(
        'claude-mem-episodic.csv',
        ['eventId', 'type', 'timestamp', 'summary', 'learnings', 'classification'],
        mem.episodic.events
      )
    }

    if (mem?.procedural?.workflows?.length) {
      writeCsv(
        'claude-mem-procedural.csv',
        ['name', 'description', 'steps', 'classification'],
        mem.procedural.workflows.map(w => ({
          ...w,
          steps: w.steps ? JSON.stringify(w.steps) : '',
        }))
      )
    }

    if (mem?.semantic?.knowledgeDomains?.length) {
      writeCsv(
        'claude-mem-semantic-domains.csv',
        ['domain'],
        mem.semantic.knowledgeDomains.map(d => ({ domain: d }))
      )
    }

    const thDoc = await cm.extract({ layers: ['taskHistory'] })
    const th = thDoc.layers?.taskHistory
    if (th?.recentTasks?.length) {
      writeCsv(
        'claude-mem-tasks.csv',
        ['taskId', 'title', 'status', 'completedAt', 'organizationId'],
        th.recentTasks
      )
    }
    if (th?.summary) {
      writeCsv(
        'claude-mem-task-summary.csv',
        ['totalCompleted', 'totalFailed', 'totalInProgress', 'firstTaskAt', 'lastTaskAt'],
        [th.summary]
      )
    }
  } else {
    console.log('claude-mem: not found, skipping')
  }

  // --- claude-code ---
  const cc = createCollector('claude-code')
  const ccDetect = await cc.detect()
  if (ccDetect.found) {
    console.log('\nclaude-code:')
    const ccDoc = await cc.extract({ layers: ['taskHistory', 'memory', 'cognitive'] })

    const ccTh = ccDoc.layers?.taskHistory
    if (ccTh?.recentTasks?.length) {
      writeCsv(
        'claude-code-tasks.csv',
        ['taskId', 'title', 'status', 'completedAt', 'organizationId'],
        ccTh.recentTasks
      )
    }

    const ccMem = ccDoc.layers?.memory
    if (ccMem?.episodic?.events?.length) {
      writeCsv(
        'claude-code-episodic.csv',
        ['eventId', 'type', 'timestamp', 'summary', 'learnings', 'classification'],
        ccMem.episodic.events
      )
    }

    const ccCog = ccDoc.layers?.cognitive
    if (ccCog?.systemPrompt) {
      writeCsv(
        'claude-code-cognitive.csv',
        ['field', 'value'],
        [
          {
            field: 'systemPrompt',
            value:
              typeof ccCog.systemPrompt === 'string'
                ? ccCog.systemPrompt
                : ccCog.systemPrompt?.content,
          },
          { field: 'parameters', value: ccCog.parameters ? JSON.stringify(ccCog.parameters) : '' },
        ].filter(r => r.value)
      )
    }
  } else {
    console.log('\nclaude-code: not found, skipping')
  }

  // --- project-claude ---
  const pc = createCollector('project-claude')
  const pcDetect = await pc.detect(process.cwd())
  if (pcDetect.found) {
    console.log('\nproject-claude:')
    const pcDoc = await pc.extract({ paths: [process.cwd()] })
    const layers = pcDoc.layers ?? {}

    if (layers.cognitive?.rules?.length) {
      writeCsv(
        'project-claude-rules.csv',
        ['source', 'content'],
        layers.cognitive.rules.map(r => ({
          source: typeof r === 'string' ? '' : (r.source ?? ''),
          content: typeof r === 'string' ? r : (r.content ?? ''),
        }))
      )
    }

    if (layers.skills?.selfReported?.length) {
      writeCsv(
        'project-claude-skills.csv',
        ['name', 'description'],
        layers.skills.selfReported.map(s => ({
          name: typeof s === 'string' ? s : (s.name ?? ''),
          description: typeof s === 'string' ? '' : (s.description ?? ''),
        }))
      )
    }

    if (layers.persona) {
      writeCsv(
        'project-claude-persona.csv',
        ['field', 'value'],
        Object.entries(layers.persona)
          .filter(([, v]) => v != null)
          .map(([k, v]) => ({ field: k, value: typeof v === 'object' ? JSON.stringify(v) : v }))
      )
    }
  } else {
    console.log('\nproject-claude: not found, skipping')
  }

  console.log(`\nDone. Files written to ${outDir}`)
}

main().catch(err => {
  console.error('Export failed:', err)
  process.exit(1)
})
