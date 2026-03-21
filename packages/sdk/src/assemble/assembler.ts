// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import type { ExportType } from '../types/common'
import type {
  CognitiveLayer,
  EnvironmentLayer,
  MemoryLayer,
  SagaLayers,
  SkillsLayer,
  TaskHistoryLayer,
} from '../types/layers'
import type { PartialSagaDocument } from '../types/partial'
import type { SagaDocument } from '../types/saga-document'
import { generateDocumentId } from '../id/document-id'
import {
  deepMergeFirstWins,
  mergeArtifacts,
  mergeEndorsements,
  mergeEpisodicEvents,
  mergeRecentTasks,
  mergeSelfReportedSkills,
  mergeTaskSummaries,
  mergeVerifiedSkills,
  mergeWorkflows,
  unionArrays,
} from './layer-merge'

export interface AssembleOptions {
  partials: PartialSagaDocument[]
  exportType: ExportType
  documentId?: string
  sourcePriority?: string[]
}

export interface AssembleResult {
  /** Assembled document (unsigned — signature is a placeholder) */
  document: SagaDocument
  warnings: string[]
  /** Which collector source populated which layers */
  sources: Record<string, string[]>
}

const RECENT_TASKS_LIMIT = 100

/**
 * Merge multiple PartialSagaDocuments from collectors into a single SagaDocument.
 *
 * The document is returned unsigned. Call a SagaSigner to attach a real signature.
 */
export function assembleSagaDocument(options: AssembleOptions): AssembleResult {
  const { exportType, sourcePriority } = options
  const documentId = options.documentId ?? generateDocumentId()
  const warnings: string[] = []
  const sources: Record<string, string[]> = {}

  // Sort partials by source priority
  const partials = orderPartials(options.partials, sourcePriority)

  // Track which source populated each layer
  function trackSource(layer: string, source: string) {
    if (!sources[layer]) sources[layer] = []
    if (!sources[layer].includes(source)) sources[layer].push(source)
  }

  // Merge layers
  const layers: SagaLayers = {}

  // Identity: first source wins
  for (const p of partials) {
    if (p.layers.identity && !layers.identity) {
      layers.identity = p.layers.identity as SagaLayers['identity']
      trackSource('identity', p.source)
    }
  }

  // Persona: deep merge, first non-null wins
  const personaPartials = partials.filter(p => p.layers.persona)
  if (personaPartials.length > 0) {
    let merged: Record<string, unknown> = {}
    for (const p of personaPartials) {
      merged = deepMergeFirstWins(merged, p.layers.persona as Record<string, unknown>)
      trackSource('persona', p.source)
    }
    layers.persona = merged as SagaLayers['persona']
  }

  // Cognitive: deep merge, systemPrompt.content concatenates
  const cognitivePartials = partials.filter(p => p.layers.cognitive)
  if (cognitivePartials.length > 0) {
    const contents: string[] = []
    let merged: Record<string, unknown> = {}
    for (const p of cognitivePartials) {
      const cog = p.layers.cognitive as CognitiveLayer
      if (cog.systemPrompt?.content) {
        contents.push(cog.systemPrompt.content)
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { systemPrompt: _sp, ...rest } = cog
      merged = deepMergeFirstWins(merged, rest as Record<string, unknown>)
      trackSource('cognitive', p.source)
    }
    if (contents.length > 0) {
      const first = cognitivePartials[0].layers.cognitive as CognitiveLayer
      ;(merged as Record<string, unknown>).systemPrompt = {
        ...first.systemPrompt,
        content: contents.join('\n\n---\n\n'),
      }
    }
    layers.cognitive = merged as CognitiveLayer
  }

  // Memory: merge sub-layers individually
  const memoryPartials = partials.filter(p => p.layers.memory)
  if (memoryPartials.length > 0) {
    const memory: MemoryLayer = {}

    // shortTerm: latest snapshotAt wins
    const shortTerms = memoryPartials
      .map(p => (p.layers.memory as MemoryLayer)?.shortTerm)
      .filter(Boolean)
    if (shortTerms.length > 0) {
      memory.shortTerm = shortTerms.sort((a, b) => {
        const at = a?.snapshotAt ? new Date(a.snapshotAt).getTime() : 0
        const bt = b?.snapshotAt ? new Date(b.snapshotAt).getTime() : 0
        return bt - at
      })[0]
    }

    // longTerm: last wins
    for (const p of memoryPartials) {
      const lt = (p.layers.memory as MemoryLayer)?.longTerm
      if (lt) memory.longTerm = lt
    }

    // episodic: merge events
    const episodicSources = memoryPartials.map(
      p => (p.layers.memory as MemoryLayer)?.episodic?.events
    )
    const mergedEvents = mergeEpisodicEvents(...episodicSources)
    if (mergedEvents.length > 0) {
      const firstEpisodic = memoryPartials.find(p => (p.layers.memory as MemoryLayer)?.episodic)
      memory.episodic = {
        ...(firstEpisodic?.layers.memory as MemoryLayer)?.episodic,
        events: mergedEvents,
      }
    }

    // semantic: merge knowledgeDomains + expertise
    const semanticPartials = memoryPartials.filter(p => (p.layers.memory as MemoryLayer)?.semantic)
    if (semanticPartials.length > 0) {
      const domains = unionArrays(
        ...semanticPartials.map(p => (p.layers.memory as MemoryLayer)?.semantic?.knowledgeDomains)
      )
      let expertise: Record<string, unknown> = {}
      for (const p of semanticPartials) {
        const exp = (p.layers.memory as MemoryLayer)?.semantic?.expertise
        if (exp) {
          expertise = deepMergeFirstWins(expertise, exp as Record<string, unknown>)
        }
      }
      memory.semantic = {
        ...(domains.length > 0 ? { knowledgeDomains: domains } : {}),
        ...(Object.keys(expertise).length > 0
          ? {
              expertise: expertise as MemoryLayer['semantic'] extends { expertise?: infer E }
                ? E
                : never,
            }
          : {}),
      }
    }

    // procedural: merge workflows
    const workflows = mergeWorkflows(
      ...memoryPartials.map(p => (p.layers.memory as MemoryLayer)?.procedural?.workflows)
    )
    if (workflows.length > 0) {
      memory.procedural = { workflows }
    }

    for (const p of memoryPartials) trackSource('memory', p.source)
    layers.memory = memory
  }

  // Skills: merge all sub-arrays
  const skillsPartials = partials.filter(p => p.layers.skills)
  if (skillsPartials.length > 0) {
    const skills: SkillsLayer = {}

    skills.verified = mergeVerifiedSkills(
      ...skillsPartials.map(p => (p.layers.skills as SkillsLayer)?.verified)
    )
    skills.selfReported = mergeSelfReportedSkills(
      ...skillsPartials.map(p => (p.layers.skills as SkillsLayer)?.selfReported)
    )
    skills.endorsements = mergeEndorsements(
      ...skillsPartials.map(p => (p.layers.skills as SkillsLayer)?.endorsements)
    )

    // Capabilities: union arrays
    const capPartials = skillsPartials.filter(p => (p.layers.skills as SkillsLayer)?.capabilities)
    if (capPartials.length > 0) {
      skills.capabilities = {
        toolUse: unionArrays(
          ...capPartials.map(p => (p.layers.skills as SkillsLayer)?.capabilities?.toolUse)
        ),
        codeLanguages: unionArrays(
          ...capPartials.map(p => (p.layers.skills as SkillsLayer)?.capabilities?.codeLanguages)
        ),
        specializations: unionArrays(
          ...capPartials.map(p => (p.layers.skills as SkillsLayer)?.capabilities?.specializations)
        ),
      }
    }

    for (const p of skillsPartials) trackSource('skills', p.source)
    layers.skills = skills
  }

  // TaskHistory: merge summary + recentTasks + artifacts
  const taskPartials = partials.filter(p => p.layers.taskHistory)
  if (taskPartials.length > 0) {
    const taskHistory: TaskHistoryLayer = {}

    taskHistory.summary = mergeTaskSummaries(
      ...taskPartials.map(p => (p.layers.taskHistory as TaskHistoryLayer)?.summary)
    )
    taskHistory.recentTasks = mergeRecentTasks(
      RECENT_TASKS_LIMIT,
      ...taskPartials.map(p => (p.layers.taskHistory as TaskHistoryLayer)?.recentTasks)
    )
    taskHistory.artifacts = mergeArtifacts(
      ...taskPartials.map(p => (p.layers.taskHistory as TaskHistoryLayer)?.artifacts)
    )

    for (const p of taskPartials) trackSource('taskHistory', p.source)
    layers.taskHistory = taskHistory
  }

  // Relationships: deep merge
  const relPartials = partials.filter(p => p.layers.relationships)
  if (relPartials.length > 0) {
    let merged: Record<string, unknown> = {}
    for (const p of relPartials) {
      merged = deepMergeFirstWins(merged, p.layers.relationships as Record<string, unknown>)
      trackSource('relationships', p.source)
    }
    layers.relationships = merged as SagaLayers['relationships']
  }

  // Environment: deep merge, union arrays
  const envPartials = partials.filter(p => p.layers.environment)
  if (envPartials.length > 0) {
    let merged: Record<string, unknown> = {}
    for (const p of envPartials) {
      merged = deepMergeFirstWins(merged, p.layers.environment as Record<string, unknown>)
      trackSource('environment', p.source)
    }
    // Merge native tools + integrations as arrays
    const nativeTools = unionArrays(
      ...envPartials.map(p => (p.layers.environment as EnvironmentLayer)?.tools?.nativeTools)
    )
    if (nativeTools.length > 0) {
      const tools = (merged.tools ?? {}) as Record<string, unknown>
      tools.nativeTools = nativeTools
      merged.tools = tools
    }
    layers.environment = merged as EnvironmentLayer
  }

  const now = new Date().toISOString()
  const document: SagaDocument = {
    $schema: 'https://saga-standard.dev/schema/v1',
    sagaVersion: '1.0',
    documentId,
    exportedAt: now,
    exportType,
    signature: {
      walletAddress: layers.identity?.walletAddress ?? '',
      chain: layers.identity?.chain ?? 'eip155:8453',
      message: `SAGA export ${documentId} at ${now}`,
      sig: '',
    },
    layers,
  }

  return { document, warnings, sources }
}

function orderPartials(
  partials: PartialSagaDocument[],
  priority?: string[]
): PartialSagaDocument[] {
  if (!priority || priority.length === 0) return partials
  return [...partials].sort((a, b) => {
    const ai = priority.indexOf(a.source)
    const bi = priority.indexOf(b.source)
    const aIdx = ai >= 0 ? ai : priority.length
    const bIdx = bi >= 0 ? bi : priority.length
    return aIdx - bIdx
  })
}
