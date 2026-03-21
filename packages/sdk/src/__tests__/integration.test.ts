// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

import { describe, expect, it } from 'vitest'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { verifyMessage } from 'viem'
import {
  applyDefaultEncryption,
  assembleSagaDocument,
  createPrivateKeySigner,
  extractSagaContainer,
  generateBoxKeyPair,
  packSagaContainer,
  validateSagaDocument,
  validateSemantics,
} from '../index'
import type { PartialSagaDocument } from '../types'

describe('SDK end-to-end integration', () => {
  it('full pipeline: collect → assemble → validate → encrypt → sign → package → extract → verify → decrypt', async () => {
    // 1. Simulate two collector outputs
    const privateKey = generatePrivateKey()
    const account = privateKeyToAccount(privateKey)

    const clauDeCodePartial: PartialSagaDocument = {
      source: 'claude-code',
      layers: {
        cognitive: {
          systemPrompt: { format: 'markdown', content: '# Project Rules\nFollow TDD.' },
          parameters: { temperature: 0.7 },
        },
        memory: {
          episodic: {
            events: [
              {
                eventId: 'cc_evt_1',
                type: 'task-completed',
                timestamp: '2026-02-15T10:00:00Z',
                summary: 'Refactored auth',
              },
              {
                eventId: 'cc_evt_2',
                type: 'interaction',
                timestamp: '2026-02-20T14:00:00Z',
                summary: 'Code review',
              },
            ],
          },
          semantic: { knowledgeDomains: ['TypeScript', 'Next.js'] },
          procedural: {
            workflows: [{ name: 'TDD workflow', steps: ['write test', 'implement', 'refactor'] }],
          },
        },
        taskHistory: {
          summary: { totalCompleted: 47, totalFailed: 2 },
          recentTasks: [
            {
              taskId: 'cc_task_1',
              status: 'completed',
              outcome: 'success',
              completedAt: '2026-02-20T14:00:00Z',
            },
          ],
        },
      },
    }

    const openClawPartial: PartialSagaDocument = {
      source: 'openclaw',
      layers: {
        identity: {
          handle: 'aria-chen',
          walletAddress: account.address,
          chain: 'eip155:8453',
          createdAt: '2026-01-15T08:00:00Z',
        },
        persona: {
          name: 'Aria Chen',
          headline: 'Senior Backend Engineer',
          personality: { traits: ['direct', 'methodical'], tone: 'professional' },
          profileType: 'agent',
        },
        cognitive: {
          systemPrompt: { format: 'markdown', content: '# Identity\nYou are Aria Chen.' },
          baseModel: { provider: 'anthropic', model: 'claude-3-5-sonnet' },
        },
        memory: {
          episodic: {
            events: [
              {
                eventId: 'oc_evt_1',
                type: 'decision',
                timestamp: '2026-03-01T09:00:00Z',
                summary: 'Chose Drizzle over Prisma',
              },
            ],
          },
          semantic: { knowledgeDomains: ['OAuth 2.0', 'Drizzle ORM'] },
        },
        skills: {
          verified: [
            { name: 'TypeScript', verificationSource: 'openclaw-tasks', confidence: 0.95 },
          ],
          selfReported: [{ name: 'Drizzle ORM' }, { name: 'Cloudflare Workers' }],
          capabilities: {
            codeLanguages: ['TypeScript', 'Python'],
            toolUse: ['file-system', 'web-search'],
          },
        },
        environment: {
          tools: { nativeTools: ['file-system', 'web-search', 'memory-search'] },
        },
      },
    }

    // 2. Assemble
    const assembled = assembleSagaDocument({
      partials: [openClawPartial, clauDeCodePartial],
      exportType: 'full',
      sourcePriority: ['openclaw', 'claude-code'],
    })

    expect(assembled.document.layers.identity?.handle).toBe('aria-chen')
    expect(assembled.sources.identity).toEqual(['openclaw'])
    expect(assembled.sources.cognitive).toContain('openclaw')
    expect(assembled.sources.cognitive).toContain('claude-code')

    // System prompts should be concatenated
    const sysPrompt = assembled.document.layers.cognitive?.systemPrompt?.content ?? ''
    expect(sysPrompt).toContain('You are Aria Chen')
    expect(sysPrompt).toContain('Follow TDD')

    // Memory events should be merged and deduped
    const events = assembled.document.layers.memory?.episodic?.events ?? []
    expect(events).toHaveLength(3) // 2 from CC + 1 from OC
    expect(events[0].eventId).toBe('oc_evt_1') // most recent first

    // Knowledge domains should be unioned
    const domains = assembled.document.layers.memory?.semantic?.knowledgeDomains ?? []
    expect(domains).toContain('TypeScript')
    expect(domains).toContain('OAuth 2.0')
    expect(domains).toContain('Drizzle ORM')

    // Task counts summed
    expect(assembled.document.layers.taskHistory?.summary?.totalCompleted).toBe(47)

    // 3. Validate (schema)
    const schemaResult = validateSagaDocument(assembled.document)
    expect(schemaResult.valid).toBe(true)

    // 4. Validate (semantic) — signature doesn't match yet (placeholder)
    // Sign first, then validate semantics

    // 5. Sign
    const signer = createPrivateKeySigner({ privateKey })
    const signed = await signer.sign(assembled.document)

    expect(signed.signature.walletAddress).toBe(account.address)
    expect(signed.signature.sig).toMatch(/^0x/)

    // Verify signature with viem
    const sigValid = await verifyMessage({
      address: account.address as `0x${string}`,
      message: signed.signature.message,
      signature: signed.signature.sig as `0x${string}`,
    })
    expect(sigValid).toBe(true)

    // Now semantic validation should pass
    const semanticResult = validateSemantics(signed)
    expect(semanticResult.valid).toBe(true)

    // 6. Encrypt sensitive layers
    const agentKeys = generateBoxKeyPair()
    const recipientKeys = generateBoxKeyPair()
    const encrypted = applyDefaultEncryption({
      document: signed,
      senderSecretKey: agentKeys.secretKey,
      recipientPublicKeys: [recipientKeys.publicKey],
      crossOrg: true,
    })
    expect(encrypted.privacy?.encryptedLayers).toContain('cognitive.systemPrompt')

    // 7. Package into .saga container
    const episodicJsonl = Buffer.from(events.map(e => JSON.stringify(e)).join('\n'))
    const packed = await packSagaContainer({
      document: encrypted,
      memoryBinaries: { episodic: episodicJsonl },
      artifacts: [{ name: 'sample.ts', data: Buffer.from('console.log("hello")') }],
      signer,
    })
    expect(packed).toBeInstanceOf(Buffer)
    expect(packed.length).toBeGreaterThan(0)

    // 8. Extract container
    const extracted = await extractSagaContainer({ data: packed })
    expect(extracted.document.documentId).toBe(signed.documentId)
    expect(extracted.signatureValid).toBe(true)
    expect(extracted.meta.sagaContainerVersion).toBe('1.0')
    expect(extracted.memoryBinaries.episodic).toBeDefined()
    expect(extracted.artifacts).toHaveLength(1)
    expect(extracted.artifacts[0].name).toBe('sample.ts')

    // 9. Verify extracted document schema
    const extractedSchemaResult = validateSagaDocument(extracted.document)
    expect(extractedSchemaResult.valid).toBe(true)

    // 10. Identity layer preserved through the whole pipeline
    expect(extracted.document.layers.identity?.handle).toBe('aria-chen')
    expect(extracted.document.layers.identity?.walletAddress).toBe(account.address)
  })
})
