// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/* eslint-disable no-console */
// Smoke test: run collectors against real local data
const { detectCollectors, listCollectorSources, createCollector } = require('./dist/index.cjs')

async function main() {
  console.log('=== Registered Collectors ===')
  const sources = listCollectorSources()
  console.log('Sources:', sources)

  console.log('\n=== Detection ===')
  const detections = await detectCollectors()
  for (const d of detections) {
    console.log(`  ${d.source}: found=${d.found}, locations=${d.locations?.length ?? 0}`)
  }

  // Test claude-mem collector against real DB
  console.log('\n=== claude-mem Collector ===')
  const cmCollector = createCollector('claude-mem')
  const cmDetect = await cmCollector.detect()
  console.log('Detect:', JSON.stringify(cmDetect, null, 2))

  const cmScan = await cmCollector.scan()
  console.log('Scan:', JSON.stringify(cmScan, null, 2))

  console.log('\n=== claude-mem Extract (memory layer) ===')
  const cmDoc = await cmCollector.extract({ layers: ['memory'] })
  console.log('Doc keys:', Object.keys(cmDoc))
  console.log('Layers keys:', Object.keys(cmDoc.layers ?? {}))
  const mem = cmDoc.layers?.memory
  if (mem) {
    console.log('Episodic events:', mem.episodic?.events?.length ?? 0)
    console.log('Procedural workflows:', mem.procedural?.workflows?.length ?? 0)
    console.log('Semantic domains:', mem.semantic?.knowledgeDomains?.length ?? 0)
    if (mem.episodic?.events?.length > 0) {
      console.log('First episodic:', JSON.stringify(mem.episodic.events[0], null, 2))
    }
    if (mem.procedural?.workflows?.length > 0) {
      console.log('First procedural:', JSON.stringify(mem.procedural.workflows[0], null, 2))
    }
    if (mem.semantic?.knowledgeDomains?.length > 0) {
      console.log('Top 10 domains:', mem.semantic.knowledgeDomains.slice(0, 10))
    }
  } else {
    console.log('No memory layer in doc.layers')
    console.log('Full doc:', JSON.stringify(cmDoc, null, 2).slice(0, 500))
  }

  // Test taskHistory layer
  console.log('\n=== claude-mem Extract (taskHistory layer) ===')
  const thDoc = await cmCollector.extract({ layers: ['taskHistory'] })
  const th = thDoc.layers?.taskHistory
  if (th) {
    console.log('Recent tasks:', th.recentTasks?.length ?? 0)
    console.log('Summary:', JSON.stringify(th.summary, null, 2))
    if (th.recentTasks?.length > 0) {
      console.log('Most recent task:', JSON.stringify(th.recentTasks[0], null, 2))
    }
  } else {
    console.log('No taskHistory layer in doc.layers')
    console.log('Full doc:', JSON.stringify(thDoc, null, 2).slice(0, 500))
  }

  // Test claude-code collector
  console.log('\n=== claude-code Collector ===')
  const ccCollector = createCollector('claude-code')
  const ccDetect = await ccCollector.detect()
  console.log('Detect:', JSON.stringify(ccDetect, null, 2))
  const ccScan = await ccCollector.scan()
  console.log('Scan:', JSON.stringify(ccScan, null, 2))

  console.log('\n=== claude-code Extract (cognitive) ===')
  const ccDoc = await ccCollector.extract({ layers: ['cognitive'] })
  const cog = ccDoc.layers?.cognitive ?? ccDoc.cognitive
  if (cog) {
    console.log('System prompt length:', cog.systemPrompt?.length ?? 0)
    console.log(
      'Parameters:',
      cog.parameters ? JSON.stringify(cog.parameters).slice(0, 200) : 'none'
    )
  } else {
    console.log('Keys:', Object.keys(ccDoc))
    console.log('Doc preview:', JSON.stringify(ccDoc, null, 2).slice(0, 300))
  }

  // Test project-claude collector
  console.log('\n=== project-claude Collector ===')
  const pcCollector = createCollector('project-claude')
  const pcDetect = await pcCollector.detect('~/code/epic/saga-standard')
  console.log('Detect:', JSON.stringify(pcDetect, null, 2))

  if (pcDetect.found) {
    const pcScan = await pcCollector.scan('~/code/epic/saga-standard')
    console.log('Scan:', JSON.stringify(pcScan, null, 2))

    const pcDoc = await pcCollector.extract({ paths: ['~/code/epic/saga-standard'] })
    const pcLayers = pcDoc.layers ?? pcDoc
    console.log('Layers:', Object.keys(pcLayers))
    if (pcLayers.cognitive) {
      console.log('Cognitive systemPrompt length:', pcLayers.cognitive.systemPrompt?.length ?? 0)
      console.log('Cognitive rules count:', pcLayers.cognitive.rules?.length ?? 0)
    }
    if (pcLayers.skills) {
      console.log('Skills selfReported:', pcLayers.skills.selfReported?.length ?? 0)
    }
    if (pcLayers.persona) {
      console.log('Persona:', JSON.stringify(pcLayers.persona, null, 2).slice(0, 200))
    }
  }

  console.log('\n=== Done ===')
}

main().catch(console.error)
