// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 d7r LLC

/* eslint-disable no-console */

/**
 * End-to-end smoke test for the full SAGA stack.
 *
 * Flow:
 *   1. Generate wallet (viem)
 *   2. Authenticate with local server (challenge-response)
 *   3. Register agent
 *   4. Assemble a SAGA profile document (SDK)
 *   5. Sign the document (SDK)
 *   6. Upload document to server
 *   7. Retrieve agent + document back
 *   8. Validate retrieved document (SDK)
 *   9. List all agents
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { SagaServerClient } from '@epicdm/saga-client'
import type { WalletSigner } from '@epicdm/saga-client'
import type { ChainId } from '@epicdm/saga-sdk'
import { assembleSagaDocument, createPrivateKeySigner, validateSemantics } from '@epicdm/saga-sdk'

const SERVER_URL = process.env.SAGA_SERVER_URL ?? 'http://localhost:8787'
const CHAIN: ChainId = 'eip155:8453'

function ok(label: string) {
  console.log(`  ✓ ${label}`)
}

function fail(label: string, err: unknown) {
  console.error(`  ✗ ${label}: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}

async function main() {
  console.log('SAGA Smoke Test')
  console.log(`Server: ${SERVER_URL}\n`)

  // ── Step 1: Generate wallet ────────────────────────────────────────
  console.log('1. Generate wallet')
  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)
  ok(`Address: ${account.address}`)

  // ── Step 2: Create client + authenticate ───────────────────────────
  console.log('\n2. Authenticate with server')
  const client = new SagaServerClient({ serverUrl: SERVER_URL })

  const walletSigner: WalletSigner = {
    async signMessage(message: string) {
      return account.signMessage({ message })
    },
    async getAddress() {
      return account.address
    },
    getChain() {
      return CHAIN
    },
  }

  try {
    const session = await client.authenticate(walletSigner)
    ok(`Session token: ${session.token.slice(0, 20)}...`)
    ok(`Expires: ${session.expiresAt.toISOString()}`)
  } catch (err) {
    fail('Auth', err)
  }

  // ── Step 3: Register agent ─────────────────────────────────────────
  console.log('\n3. Register agent')
  const handle = `smoke-test-${Date.now().toString(36)}`

  try {
    const agent = await client.registerAgent({
      handle,
      walletAddress: account.address,
      chain: CHAIN,
    })
    ok(`Agent ID: ${agent.agentId}`)
    ok(`Handle: ${agent.handle}`)
    ok(`Registered: ${agent.registeredAt}`)
  } catch (err) {
    fail('Register', err)
  }

  // ── Step 4: Assemble SAGA profile document ─────────────────────────
  console.log('\n4. Assemble SAGA document')

  const { document, warnings, sources } = assembleSagaDocument({
    exportType: 'profile',
    partials: [
      {
        source: 'smoke-test',
        layers: {
          identity: {
            handle,
            walletAddress: account.address,
            chain: CHAIN,
            createdAt: new Date().toISOString(),
            cloneDepth: 0,
          },
          persona: {
            name: 'Smoke Test Agent',
            headline: 'A test agent created by the SAGA smoke test',
            bio: 'Verifies the full SAGA stack works end-to-end: SDK assembly, signing, server upload, retrieval, and validation.',
            profileType: 'agent',
          },
          skills: {
            selfReported: [
              { name: 'TypeScript', category: 'programming', addedAt: new Date().toISOString() },
              { name: 'Code Review', category: 'workflow', addedAt: new Date().toISOString() },
              { name: 'Testing', category: 'quality', addedAt: new Date().toISOString() },
            ],
            capabilities: {
              codeLanguages: ['typescript', 'python', 'rust'],
              toolUse: ['file-editor', 'terminal', 'web-search'],
              specializations: ['full-stack', 'devops'],
            },
          },
          cognitive: {
            baseModel: {
              provider: 'anthropic',
              model: 'claude-sonnet-4-20250514',
              contextWindow: 200000,
            },
            parameters: {
              temperature: 0.7,
              topP: 0.95,
              maxOutputTokens: 8192,
            },
            behaviorFlags: {
              autonomyLevel: 'semi-autonomous',
              canSpawnSubAgents: false,
              maxConcurrentTasks: 3,
            },
          },
          taskHistory: {
            summary: {
              totalCompleted: 42,
              totalFailed: 2,
              totalInProgress: 1,
              firstTaskAt: '2026-01-15T10:00:00Z',
              lastTaskAt: new Date().toISOString(),
            },
          },
          relationships: {
            organization: {
              companySlug: 'd7r-llc',
              role: 'Smoke Test Runner',
              joinedAt: new Date().toISOString(),
            },
          },
        },
      },
    ],
  })

  ok(`Document ID: ${document.documentId}`)
  ok(`Export type: ${document.exportType}`)
  ok(`Layers: ${Object.keys(document.layers).join(', ')}`)
  ok(`Sources: ${JSON.stringify(sources)}`)
  if (warnings.length > 0) {
    console.log(`  ⚠ Warnings: ${warnings.join(', ')}`)
  }

  // ── Step 5: Sign the document ──────────────────────────────────────
  console.log('\n5. Sign document')

  const signer = createPrivateKeySigner({ privateKey, chain: CHAIN })
  const signed = await signer.sign(document)

  ok(`Signature: ${signed.signature.sig.slice(0, 30)}...`)
  ok(`Signer: ${signed.signature.walletAddress}`)

  // ── Step 6: Validate before upload ─────────────────────────────────
  console.log('\n6. Validate document (semantic)')

  const semanticResult = validateSemantics(signed)
  if (semanticResult.valid) {
    ok('Semantic validation passed')
  } else {
    fail('Semantic validation', semanticResult.errors?.map(e => e.message).join('; '))
  }
  if (semanticResult.warnings.length > 0) {
    for (const w of semanticResult.warnings) {
      console.log(`  ⚠ ${w.path}: ${w.message}`)
    }
  }

  // ── Step 7: Upload document to server ──────────────────────────────
  console.log('\n7. Upload document to server')

  try {
    const docRecord = await client.uploadDocumentJson(handle, signed)
    ok(`Uploaded: ${docRecord.documentId}`)
    ok(`Size: ${docRecord.sizeBytes} bytes`)
    ok(`Checksum: ${docRecord.checksum}`)
  } catch (err) {
    fail('Upload', err)
  }

  // ── Step 8: Retrieve agent from server ─────────────────────────────
  console.log('\n8. Retrieve agent')

  try {
    const detail = await client.getAgent(handle)
    ok(`Agent: ${detail.agent.handle} (${detail.agent.agentId})`)
    ok(`Wallet: ${detail.agent.walletAddress}`)
    ok(`Has document: ${detail.latestDocument ? 'yes' : 'no'}`)
    if (detail.latestDocument) {
      ok(`Latest doc: ${detail.latestDocument.documentId} (${detail.latestDocument.exportType})`)
    }
  } catch (err) {
    fail('Get agent', err)
  }

  // ── Step 9: List documents ─────────────────────────────────────────
  console.log('\n9. List documents')

  try {
    const docs = await client.listDocuments(handle)
    ok(`Documents: ${docs.documents.length}`)
    for (const d of docs.documents) {
      ok(`  ${d.documentId} — ${d.exportType} — ${d.sizeBytes} bytes`)
    }
  } catch (err) {
    fail('List docs', err)
  }

  // ── Step 10: Retrieve document content ─────────────────────────────
  console.log('\n10. Retrieve document content')

  try {
    const docs = await client.listDocuments(handle)
    if (docs.documents.length > 0) {
      const retrieved = await client.getDocument(handle, docs.documents[0].documentId)
      const doc = retrieved as Record<string, unknown>
      ok(`Retrieved: sagaVersion=${doc.sagaVersion}, exportType=${doc.exportType}`)
      const layers = doc.layers as Record<string, unknown>
      ok(`Layers present: ${Object.keys(layers).join(', ')}`)
      const identity = layers.identity as Record<string, unknown>
      ok(`Identity handle: ${identity?.handle}`)
      const persona = layers.persona as Record<string, unknown>
      ok(`Persona name: ${persona?.name}`)
    }
  } catch (err) {
    fail('Get document', err)
  }

  // ── Step 11: List all agents ───────────────────────────────────────
  console.log('\n11. List agents')

  try {
    const list = await client.listAgents()
    ok(`Total agents: ${list.total}`)
    for (const a of list.agents) {
      ok(`  ${a.handle} — ${a.walletAddress.slice(0, 10)}...`)
    }
  } catch (err) {
    fail('List agents', err)
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✓ All smoke tests passed.')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main().catch(err => {
  console.error('\nFatal:', err)
  process.exit(1)
})
